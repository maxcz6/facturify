import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CompanySunatConfigService } from '../sunat/company-sunat-config.service';
import { SecretsEncryptionService } from '../security/secrets-encryption.service';
import { SaveSunatCredentialsDto } from './dto/save-sunat-credentials.dto';
import {
  DeleteSunatCredentialsResponseDto,
  SunatCredentialsStatusResponseDto,
} from './dto/sunat-credentials-response.dto';
import { maskSolUsername } from './sunat-credentials.util';
import { AuditEventBuilderService } from '../audit-events/audit-events.service';
import { AuditEventWriterService } from '../audit-events/audit-events-writer.service';

@Injectable()
export class SunatCredentialsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly companySunatConfig: CompanySunatConfigService,
    private readonly _secrets?: SecretsEncryptionService,
    private readonly auditBuilder?: AuditEventBuilderService,
    private readonly auditWriter?: AuditEventWriterService,
  ) {}

  /**
   * Configures or updates SUNAT SOL credentials for a company.
   * Reuses CompanySunatConfigService (which uses SecretsEncryptionService AES-256-GCM).
   * Verifies company existence, isolates by companyId, and strictly never exposes passwords or secrets.
   */
  async upsert(
    companyId: string,
    dto: SaveSunatCredentialsDto,
    actorId?: string,
    requestId?: string,
  ): Promise<SunatCredentialsStatusResponseDto> {
    if (!companyId || typeof companyId !== 'string' || companyId.trim() === '') {
      throw new BadRequestException('Company ID is required.');
    }

    if (!dto || typeof dto !== 'object') {
      throw new BadRequestException('Credentials payload is required.');
    }

    if (!dto.username || typeof dto.username !== 'string' || dto.username.trim() === '') {
      throw new BadRequestException('Username is required.');
    }

    if (!dto.password || typeof dto.password !== 'string' || dto.password.trim() === '') {
      throw new BadRequestException('Password is required.');
    }

    const trimmedUsername = dto.username.trim();
    if (!/^[A-Za-z0-9]{1,20}$/.test(trimmedUsername)) {
      throw new ConflictException('Invalid SOL username format.');
    }

    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
    });
    if (!company) {
      throw new NotFoundException(`Company with ID '${companyId}' not found.`);
    }

    // Reuses CompanySunatConfigService for encryption via AES-256-GCM and persistence
    await this.companySunatConfig.saveSolCredential({
      companyId,
      username: trimmedUsername,
      password: dto.password,
    });

    const record = await this.prisma.sunatCredential.findUnique({
      where: { companyId },
    });
    await this.appendAudit('sunat_credentials.updated', actorId, companyId, requestId);

    return {
      configured: true,
      usernameMasked: maskSolUsername(trimmedUsername),
      createdAt: record?.createdAt ?? new Date(),
      updatedAt: record?.updatedAt ?? new Date(),
    };
  }

  /**
   * Retrieves the configuration status of SUNAT SOL credentials for a company.
   * Checks company existence and company isolation.
   * Only returns { configured, usernameMasked, createdAt, updatedAt }.
   */
  async getStatus(companyId: string): Promise<SunatCredentialsStatusResponseDto> {
    if (!companyId || typeof companyId !== 'string' || companyId.trim() === '') {
      throw new BadRequestException('Company ID is required.');
    }

    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
    });
    if (!company) {
      throw new NotFoundException(`Company with ID '${companyId}' not found.`);
    }

    const credential = await this.prisma.sunatCredential.findUnique({
      where: { companyId },
    });

    if (!credential) {
      return {
        configured: false,
        usernameMasked: null,
        createdAt: null,
        updatedAt: null,
      };
    }

    return {
      configured: true,
      usernameMasked: maskSolUsername(credential.solUsername),
      createdAt: credential.createdAt,
      updatedAt: credential.updatedAt,
    };
  }

  /**
   * Deletes the SUNAT SOL credentials for the specified company.
   * Checks company existence and company isolation.
   * Responds with { configured: false }.
   */
  async delete(companyId: string, actorId?: string, requestId?: string): Promise<DeleteSunatCredentialsResponseDto> {
    if (!companyId || typeof companyId !== 'string' || companyId.trim() === '') {
      throw new BadRequestException('Company ID is required.');
    }

    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
    });
    if (!company) {
      throw new NotFoundException(`Company with ID '${companyId}' not found.`);
    }

    const credential = await this.prisma.sunatCredential.findUnique({
      where: { companyId },
    });
    if (!credential) {
      throw new NotFoundException(
        `SUNAT credentials not found for company '${companyId}'.`,
      );
    }

    await this.prisma.sunatCredential.delete({
      where: { companyId },
    });
    await this.appendAudit('sunat_credentials.deleted', actorId, companyId, requestId);

    return {
      configured: false,
    };
  }

  private async appendAudit(
    action: 'sunat_credentials.updated' | 'sunat_credentials.deleted',
    actorId: string | undefined,
    companyId: string,
    requestId?: string,
  ): Promise<void> {
    if (!actorId || !this.auditBuilder || !this.auditWriter) return;
    await this.auditWriter.append(this.auditBuilder.buildSunatCredentialsAction({
      action, actorId, companyId, requestId,
    }));
  }
}
