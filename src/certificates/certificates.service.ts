import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DigitalCertificate } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SecretsEncryptionService } from '../security/secrets-encryption.service';
import { CertificateStorageService } from './certificate-storage.service';
import { CertificateResponseDto } from './dto/certificate-response.dto';
import { RegisterCertificateDto } from './dto/register-certificate.dto';
import { AuditEventBuilderService } from '../audit-events/audit-events.service';
import { AuditEventWriterService } from '../audit-events/audit-events-writer.service';
import { X509Certificate } from 'node:crypto';
import { Pkcs12ExtractorService } from './pkcs12-extractor.service';

const BASE64_REGEX =
  /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

const DEFAULT_MAX_CERTIFICATE_SIZE_BYTES = 500 * 1024; // 500 KB default

@Injectable()
export class CertificatesService {
  private readonly maxSizeBytes: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly secretsEncryption: SecretsEncryptionService,
    private readonly storage: CertificateStorageService,
    private readonly configService?: ConfigService,
    private readonly auditBuilder?: AuditEventBuilderService,
    private readonly auditWriter?: AuditEventWriterService,
    private readonly pkcs12Extractor?: Pkcs12ExtractorService,
  ) {
    const configuredLimit =
      this.configService?.get<string | number>('CERTIFICATE_MAX_SIZE_BYTES') ||
      process.env.CERTIFICATE_MAX_SIZE_BYTES;

    this.maxSizeBytes = configuredLimit
      ? Number(configuredLimit)
      : DEFAULT_MAX_CERTIFICATE_SIZE_BYTES;
  }

  async register(dto: RegisterCertificateDto, actorId?: string, requestId?: string): Promise<CertificateResponseDto> {
    this.assertValidCompanyId(dto.companyId);

    // 1. Validate Base64 format strictly
    const pfxBase64Clean = dto.pfxBase64 ? dto.pfxBase64.trim() : '';
    if (!pfxBase64Clean || !BASE64_REGEX.test(pfxBase64Clean)) {
      throw new BadRequestException(
        'Invalid base64 format for PKCS#12 certificate content.',
      );
    }

    const pfxBuffer = Buffer.from(pfxBase64Clean, 'base64');
    if (pfxBuffer.length === 0) {
      throw new BadRequestException('Certificate content cannot be empty.');
    }

    // 2. Validate maximum size
    if (pfxBuffer.length > this.maxSizeBytes) {
      throw new BadRequestException(
        `Certificate size (${pfxBuffer.length} bytes) exceeds the maximum allowed limit of ${this.maxSizeBytes} bytes.`,
      );
    }

    // 3. Validate password
    if (!dto.password || typeof dto.password !== 'string' || dto.password.length === 0) {
      throw new BadRequestException('Certificate password is required.');
    }

    // 4. In the runtime module, validate the PKCS#12 cryptographically and trust
    // only metadata extracted from its X.509 certificate. The DTO dates remain a
    // backwards-compatible fallback for isolated unit construction.
    let validFrom = new Date(dto.validFrom);
    let validUntil = new Date(dto.validUntil);
    let serialNumber = dto.serialNumber ?? null;
    let subjectName = dto.subjectName ?? null;
    if (this.pkcs12Extractor) {
      const material = await this.pkcs12Extractor.extract(pfxBuffer, dto.password);
      let certificate: X509Certificate;
      try {
        certificate = new X509Certificate(material.certificatePem);
      } catch {
        throw new BadRequestException('Invalid X.509 certificate in PKCS#12 bundle.');
      }
      validFrom = new Date(certificate.validFrom);
      validUntil = new Date(certificate.validTo);
      serialNumber = certificate.serialNumber || null;
      subjectName = certificate.subject || null;
    }

    if (isNaN(validFrom.getTime()) || isNaN(validUntil.getTime())) {
      throw new BadRequestException(
        'Invalid date format for validFrom or validUntil.',
      );
    }

    if (validFrom >= validUntil) {
      throw new BadRequestException(
        'validFrom must be earlier than validUntil date.',
      );
    }

    if (validUntil <= new Date()) {
      throw new BadRequestException(
        'Certificate has already expired (validUntil is in the past).',
      );
    }

    const company = await this.prisma.company.findUnique({ where: { id: dto.companyId } });
    if (!company) {
      throw new NotFoundException(`Company with ID '${dto.companyId}' not found.`);
    }

    // 5. Encrypt both PKCS#12 content and password with AES-256-GCM before persisting
    const encryptedPfx = this.secretsEncryption.encrypt(pfxBase64Clean);
    const encryptedPassword = this.secretsEncryption.encrypt(dto.password);

    // 6. Persist encrypted PKCS#12 artifact safely
    const pfxArtifactId = await this.storage.save(dto.companyId, encryptedPfx);

    // 7. Atomic transaction ensuring at most one active certificate per company
    let certificate: DigitalCertificate;
    try {
      certificate = await this.prisma.$transaction(async (tx) => {
      // Deactivate any currently active certificate for this company
      await tx.digitalCertificate.updateMany({
        where: {
          companyId: dto.companyId,
          active: true,
        },
        data: {
          active: false,
        },
      });

      // Insert new certificate as active
        return tx.digitalCertificate.create({
        data: {
          companyId: dto.companyId,
          pfxArtifactId,
          encryptedPassword: encryptedPassword.encrypted,
          passwordIv: encryptedPassword.iv,
          passwordAuthTag: encryptedPassword.authTag,
          serialNumber,
          subjectName,
          validFrom,
          validUntil,
          active: true,
        },
        });
      }, { isolationLevel: 'Serializable' });
    } catch (error) {
      await this.storage.delete(dto.companyId, pfxArtifactId).catch(() => false);
      throw error;
    }
    await this.appendAudit('certificate.registered', actorId, certificate.companyId, requestId);

    // 8. Return strictly safe metadata (no secrets, no IVs, no tags, no raw secrets)
    return this.mapToSafeResponse(certificate);
  }

  async listByCompany(companyId: string): Promise<CertificateResponseDto[]> {
    this.assertValidCompanyId(companyId);

    const certificates = await this.prisma.digitalCertificate.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
    });

    return certificates.map((cert) => this.mapToSafeResponse(cert));
  }

  async deactivate(
    certificateId: string,
    companyId?: string,
    actorId?: string,
    requestId?: string,
  ): Promise<CertificateResponseDto> {
    this.assertValidId(certificateId, 'certificateId');
    if (companyId) {
      this.assertValidCompanyId(companyId);
    }

    const whereClause = companyId
      ? { id: certificateId, companyId }
      : { id: certificateId };

    const existing = await this.prisma.digitalCertificate.findFirst({
      where: whereClause,
    });

    if (!existing) {
      throw new NotFoundException(
        `Certificate '${certificateId}' not found${companyId ? ` for company '${companyId}'` : ''}.`,
      );
    }

    const updated = await this.prisma.digitalCertificate.update({
      where: { id: certificateId },
      data: { active: false },
    });
    await this.appendAudit('certificate.deactivated', actorId, updated.companyId, requestId);

    return this.mapToSafeResponse(updated);
  }

  async getActive(companyId: string): Promise<DigitalCertificate | null> {
    this.assertValidCompanyId(companyId);
    return this.prisma.digitalCertificate.findFirst({
      where: { companyId, active: true },
    });
  }

  async getActiveSigningMaterial(companyId: string): Promise<{ pfx: Buffer; password: string }> {
    const certificate = await this.getActive(companyId);
    if (!certificate) throw new NotFoundException('Active digital certificate is not configured.');
    if (certificate.validUntil && certificate.validUntil <= new Date()) {
      throw new BadRequestException('Active digital certificate has expired.');
    }

    const encryptedPfx = await this.storage.get(companyId, certificate.pfxArtifactId);
    const pfxBase64 = this.secretsEncryption.decrypt(encryptedPfx);
    const password = this.secretsEncryption.decrypt({
      encrypted: certificate.encryptedPassword,
      iv: certificate.passwordIv,
      authTag: certificate.passwordAuthTag,
    });
    return { pfx: Buffer.from(pfxBase64, 'base64'), password };
  }

  private mapToSafeResponse(
    cert: DigitalCertificate,
  ): CertificateResponseDto {
    return {
      id: cert.id,
      companyId: cert.companyId,
      serialNumber: cert.serialNumber,
      subjectName: cert.subjectName,
      validFrom: cert.validFrom,
      validUntil: cert.validUntil,
      active: cert.active,
      createdAt: cert.createdAt,
      updatedAt: cert.updatedAt,
    };
  }

  private assertValidCompanyId(companyId: string): void {
    this.assertValidId(companyId, 'companyId');
  }

  private assertValidId(id: string, name: string): void {
    if (!id || typeof id !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(id)) {
      throw new BadRequestException(`Invalid ${name} format.`);
    }
  }

  private async appendAudit(
    action: 'certificate.registered' | 'certificate.deactivated',
    actorId: string | undefined,
    companyId: string,
    requestId?: string,
  ): Promise<void> {
    if (!actorId || !this.auditBuilder || !this.auditWriter) return;
    await this.auditWriter.append(this.auditBuilder.buildCertificateAction({
      action, actorId, companyId, requestId,
    }));
  }
}
