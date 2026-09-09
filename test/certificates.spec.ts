import {
  BadRequestException,
  ExecutionContext,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { AdminRole, DigitalCertificate } from '@prisma/client';
import { JwtAuthGuard } from '../src/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../src/auth/guards/roles.guard';
import { CertificateStorageService } from '../src/certificates/certificate-storage.service';
import { CertificatesController } from '../src/certificates/certificates.controller';
import { CertificatesService } from '../src/certificates/certificates.service';
import { SecretsEncryptionService } from '../src/security/secrets-encryption.service';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

describe('CertificatesModule (Digital Certificates Management)', () => {
  let certificatesService: CertificatesService;
  let certificatesController: CertificatesController;
  let storageService: CertificateStorageService;
  let encryptionService: SecretsEncryptionService;
  let jwtService: JwtService;
  let jwtGuard: JwtAuthGuard;
  let rolesGuard: RolesGuard;
  let reflector: Reflector;

  let mockPrisma: any;
  let certsDb: Map<string, DigitalCertificate>;
  let companiesDb: Map<string, { id: string; ruc: string; businessName: string }>;
  let testStorageRoot: string;

  const companyA = 'cmp_alpha_111';
  const companyB = 'cmp_beta_222';

  // Valid base64 payload for testing (represents binary PKCS#12 bundle)
  const validPfxContent = Buffer.from('FAKE-PKCS12-CERTIFICATE-PAYLOAD-BINARY', 'utf8');
  const validPfxBase64 = validPfxContent.toString('base64');
  const testPassword = 'SuperSecretCertificatePassword2026!';

  // Validity dates
  const tomorrow = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
  const nextYear = new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString();
  const yesterday = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const twoDaysAgo = new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString();

  beforeEach(() => {
    testStorageRoot = path.join(os.tmpdir(), `facturify-certificates-${crypto.randomUUID()}`);
    certsDb = new Map<string, DigitalCertificate>();
    companiesDb = new Map();

    companiesDb.set(companyA, { id: companyA, ruc: '20100000001', businessName: 'Alpha Corp' });
    companiesDb.set(companyB, { id: companyB, ruc: '20200000002', businessName: 'Beta S.A.C.' });

    // Mock ConfigService with 32-byte AES key
    const test32ByteKey = Buffer.from('01234567890123456789012345678901').toString('base64');
    const mockConfig = {
      get: jest.fn().mockImplementation((key: string) => {
        if (key === 'SECRETS_ENCRYPTION_KEY') return test32ByteKey;
        if (key === 'CERTIFICATE_MAX_SIZE_BYTES') return 100 * 1024; // 100 KB limit for test
        if (key === 'CERTIFICATES_STORAGE_PATH') return testStorageRoot;
        return undefined;
      }),
    } as unknown as ConfigService;

    encryptionService = new SecretsEncryptionService(mockConfig);
    storageService = new CertificateStorageService(mockConfig);

    mockPrisma = {
      company: {
        findUnique: jest.fn().mockImplementation(async ({ where }: any) => {
          return companiesDb.get(where.id) ?? null;
        }),
      },
      digitalCertificate: {
        create: jest.fn().mockImplementation(async ({ data }: any) => {
          const record: DigitalCertificate = {
            id: `cert_${certsDb.size + 1}`,
            companyId: data.companyId,
            pfxArtifactId: data.pfxArtifactId,
            encryptedPassword: data.encryptedPassword,
            passwordIv: data.passwordIv,
            passwordAuthTag: data.passwordAuthTag,
            serialNumber: data.serialNumber ?? null,
            subjectName: data.subjectName ?? null,
            validFrom: data.validFrom,
            validUntil: data.validUntil,
            active: data.active ?? true,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          certsDb.set(record.id, record);
          return record;
        }),
        updateMany: jest.fn().mockImplementation(async ({ where, data }: any) => {
          let count = 0;
          for (const cert of certsDb.values()) {
            if (
              cert.companyId === where.companyId &&
              (where.active === undefined || cert.active === where.active)
            ) {
              Object.assign(cert, data, { updatedAt: new Date() });
              count++;
            }
          }
          return { count };
        }),
        findMany: jest.fn().mockImplementation(async ({ where }: any) => {
          return [...certsDb.values()].filter((c) => {
            if (where.companyId && c.companyId !== where.companyId) return false;
            if (where.active !== undefined && c.active !== where.active) return false;
            return true;
          });
        }),
        findFirst: jest.fn().mockImplementation(async ({ where }: any) => {
          for (const cert of certsDb.values()) {
            if (where.id && cert.id !== where.id) continue;
            if (where.companyId && cert.companyId !== where.companyId) continue;
            if (where.active !== undefined && cert.active !== where.active) continue;
            return cert;
          }
          return null;
        }),
        update: jest.fn().mockImplementation(async ({ where, data }: any) => {
          const cert = certsDb.get(where.id);
          if (!cert) throw new NotFoundException(`Certificate ${where.id} not found.`);
          Object.assign(cert, data, { updatedAt: new Date() });
          return cert;
        }),
      },
      $transaction: jest.fn().mockImplementation(async (cb: any) => cb(mockPrisma)),
    };

    certificatesService = new CertificatesService(
      mockPrisma,
      encryptionService,
      storageService,
      mockConfig,
    );
    certificatesController = new CertificatesController(certificatesService);

    jwtService = new JwtService({ secret: 'test-jwt-secret-key-for-admin-tests' });
    jwtGuard = new JwtAuthGuard(jwtService);
    reflector = new Reflector();
    rolesGuard = new RolesGuard(reflector);
  });

  afterEach(async () => {
    await fs.rm(testStorageRoot, { recursive: true, force: true });
  });

  describe('Validation & Format Constraints', () => {
    it('should reject invalid base64 format with BadRequestException', async () => {
      await expect(
        certificatesService.register({
          companyId: companyA,
          pfxBase64: 'this-is-not-valid-base64!@@@',
          password: testPassword,
          validFrom: tomorrow,
          validUntil: nextYear,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject empty certificate payload', async () => {
      await expect(
        certificatesService.register({
          companyId: companyA,
          pfxBase64: '',
          password: testPassword,
          validFrom: tomorrow,
          validUntil: nextYear,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject payload exceeding maximum configured size', async () => {
      // Over 100 KB (our test limit is 100 KB)
      const hugeBuffer = Buffer.alloc(120 * 1024, 'A');
      const hugeBase64 = hugeBuffer.toString('base64');

      await expect(
        certificatesService.register({
          companyId: companyA,
          pfxBase64: hugeBase64,
          password: testPassword,
          validFrom: tomorrow,
          validUntil: nextYear,
        }),
      ).rejects.toThrow(/exceeds the maximum allowed limit/);
    });

    it('should reject empty password', async () => {
      await expect(
        certificatesService.register({
          companyId: companyA,
          pfxBase64: validPfxBase64,
          password: '',
          validFrom: tomorrow,
          validUntil: nextYear,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject invalid date strings', async () => {
      await expect(
        certificatesService.register({
          companyId: companyA,
          pfxBase64: validPfxBase64,
          password: testPassword,
          validFrom: 'not-a-date',
          validUntil: nextYear,
        }),
      ).rejects.toThrow(/Invalid date format/);
    });

    it('should reject if validFrom is after validUntil', async () => {
      await expect(
        certificatesService.register({
          companyId: companyA,
          pfxBase64: validPfxBase64,
          password: testPassword,
          validFrom: nextYear,
          validUntil: tomorrow,
        }),
      ).rejects.toThrow(/validFrom must be earlier than validUntil/);
    });

    it('should reject if certificate has already expired (validUntil in the past)', async () => {
      await expect(
        certificatesService.register({
          companyId: companyA,
          pfxBase64: validPfxBase64,
          password: testPassword,
          validFrom: twoDaysAgo,
          validUntil: yesterday,
        }),
      ).rejects.toThrow(/Certificate has already expired/);
    });

    it('should reject if company does not exist', async () => {
      await expect(
        certificatesService.register({
          companyId: 'cmp_non_existent',
          pfxBase64: validPfxBase64,
          password: testPassword,
          validFrom: tomorrow,
          validUntil: nextYear,
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('Cifrado en reposo (AES-256-GCM Encryption at Rest)', () => {
    it('should encrypt both password and PKCS#12 payload with AES-256-GCM before persisting', async () => {
      await certificatesService.register({
        companyId: companyA,
        pfxBase64: validPfxBase64,
        password: testPassword,
        serialNumber: 'SN-2026-ALPHA-01',
        subjectName: 'CN=Alpha Corp, C=PE',
        validFrom: tomorrow,
        validUntil: nextYear,
      });

      // Verify the record created in Prisma
      expect(mockPrisma.digitalCertificate.create).toHaveBeenCalledTimes(1);
      const createCall = mockPrisma.digitalCertificate.create.mock.calls[0][0];
      const data = createCall.data;

      // 1. Password must NOT be stored in plaintext
      expect(data.encryptedPassword).toBeDefined();
      expect(data.encryptedPassword).not.toBe(testPassword);
      expect(data.passwordIv).toBeDefined();
      expect(data.passwordAuthTag).toBeDefined();

      // 2. Decrypting the stored password must recover the exact original password
      const decryptedPassword = encryptionService.decrypt({
        encrypted: data.encryptedPassword,
        iv: data.passwordIv,
        authTag: data.passwordAuthTag,
      });
      expect(decryptedPassword).toBe(testPassword);

      // 3. PKCS#12 payload stored in storage must be encrypted
      const storedArtifact = await storageService.get(companyA, data.pfxArtifactId);
      expect(storedArtifact).toBeDefined();
      expect(storedArtifact.encrypted).not.toBe(validPfxBase64);

      // 4. Decrypting the stored artifact must recover the exact original PKCS#12 base64
      const decryptedPfx = encryptionService.decrypt(storedArtifact);
      expect(decryptedPfx).toBe(validPfxBase64);
      expect(Buffer.from(decryptedPfx, 'base64')).toEqual(validPfxContent);
    });
  });

  describe('Ausencia de secretos en respuestas (Zero Secrets in Responses)', () => {
    it('should never expose passwords, ciphertext, IVs, authTags or artifact IDs in response', async () => {
      const response = await certificatesService.register({
        companyId: companyA,
        pfxBase64: validPfxBase64,
        password: testPassword,
        serialNumber: 'SN-SAFE-METADATA',
        subjectName: 'CN=Safe Meta',
        validFrom: tomorrow,
        validUntil: nextYear,
      });

      // The returned response must ONLY contain safe metadata
      expect(response).toEqual({
        id: expect.any(String),
        companyId: companyA,
        serialNumber: 'SN-SAFE-METADATA',
        subjectName: 'CN=Safe Meta',
        validFrom: expect.any(Date),
        validUntil: expect.any(Date),
        active: true,
        createdAt: expect.any(Date),
        updatedAt: expect.any(Date),
      });

      // Explicitly assert that forbidden secret keys are NOT present
      const forbiddenKeys = [
        'password',
        'encryptedPassword',
        'passwordIv',
        'passwordAuthTag',
        'pfxBase64',
        'encryptedPfx',
        'pfxArtifactId',
      ];
      for (const key of forbiddenKeys) {
        expect(response).not.toHaveProperty(key);
      }
    });

    it('should only return safe metadata when listing certificates', async () => {
      await certificatesService.register({
        companyId: companyA,
        pfxBase64: validPfxBase64,
        password: testPassword,
        validFrom: tomorrow,
        validUntil: nextYear,
      });

      const list = await certificatesService.listByCompany(companyA);
      expect(list.length).toBe(1);

      const item = list[0];
      expect(item.id).toBeDefined();
      expect(item.companyId).toBe(companyA);
      expect(item).not.toHaveProperty('encryptedPassword');
      expect(item).not.toHaveProperty('passwordIv');
      expect(item).not.toHaveProperty('passwordAuthTag');
      expect(item).not.toHaveProperty('password');
      expect(item).not.toHaveProperty('pfxBase64');
      expect(item).not.toHaveProperty('pfxArtifactId');
    });
  });

  describe('Aislamiento multiempresa (Multi-tenant Isolation)', () => {
    it('should isolate certificates between companies during listing', async () => {
      await certificatesService.register({
        companyId: companyA,
        pfxBase64: validPfxBase64,
        password: testPassword,
        serialNumber: 'SN-COMPANY-A',
        validFrom: tomorrow,
        validUntil: nextYear,
      });

      await certificatesService.register({
        companyId: companyB,
        pfxBase64: validPfxBase64,
        password: testPassword,
        serialNumber: 'SN-COMPANY-B',
        validFrom: tomorrow,
        validUntil: nextYear,
      });

      const certsA = await certificatesService.listByCompany(companyA);
      const certsB = await certificatesService.listByCompany(companyB);

      expect(certsA.length).toBe(1);
      expect(certsA[0].serialNumber).toBe('SN-COMPANY-A');

      expect(certsB.length).toBe(1);
      expect(certsB[0].serialNumber).toBe('SN-COMPANY-B');
    });

    it('should prevent Company B from deactivating Company A certificate', async () => {
      const certA = await certificatesService.register({
        companyId: companyA,
        pfxBase64: validPfxBase64,
        password: testPassword,
        validFrom: tomorrow,
        validUntil: nextYear,
      });

      // Attempting to deactivate Company A's certificate specifying Company B must fail
      await expect(
        certificatesService.deactivate(certA.id, companyB),
      ).rejects.toThrow(NotFoundException);

      // Certificate A must remain active
      const refreshedA = await certificatesService.getActive(companyA);
      expect(refreshedA?.active).toBe(true);
    });
  });

  describe('Rotación & Garantía de como máximo un certificado activo por empresa', () => {
    it('should ensure at most one active certificate per company by automatically deactivating previous one atomically in transaction', async () => {
      // 1. Register first certificate for Company A
      const cert1 = await certificatesService.register({
        companyId: companyA,
        pfxBase64: validPfxBase64,
        password: testPassword,
        serialNumber: 'CERT-01',
        validFrom: tomorrow,
        validUntil: nextYear,
      });
      expect(cert1.active).toBe(true);

      // Verify transaction was used
      expect(mockPrisma.$transaction).toHaveBeenCalled();

      // 2. Register second certificate for Company A (rotation)
      const cert2 = await certificatesService.register({
        companyId: companyA,
        pfxBase64: validPfxBase64,
        password: testPassword,
        serialNumber: 'CERT-02',
        validFrom: tomorrow,
        validUntil: nextYear,
      });
      expect(cert2.active).toBe(true);

      // 3. Verify in database: cert1 is deactivated, cert2 is active
      const allCertsA = await certificatesService.listByCompany(companyA);
      expect(allCertsA.length).toBe(2);

      const cert1InDb = allCertsA.find((c) => c.id === cert1.id);
      const cert2InDb = allCertsA.find((c) => c.id === cert2.id);

      expect(cert1InDb?.active).toBe(false);
      expect(cert2InDb?.active).toBe(true);

      const activeCertsA = allCertsA.filter((c) => c.active);
      expect(activeCertsA.length).toBe(1);
    });

    it('should not deactivate active certificates of another company during rotation', async () => {
      // Company B has an active certificate
      const certB = await certificatesService.register({
        companyId: companyB,
        pfxBase64: validPfxBase64,
        password: testPassword,
        serialNumber: 'CERT-B',
        validFrom: tomorrow,
        validUntil: nextYear,
      });
      expect(certB.active).toBe(true);

      // Company A registers 2 certificates
      await certificatesService.register({
        companyId: companyA,
        pfxBase64: validPfxBase64,
        password: testPassword,
        serialNumber: 'CERT-A1',
        validFrom: tomorrow,
        validUntil: nextYear,
      });
      await certificatesService.register({
        companyId: companyA,
        pfxBase64: validPfxBase64,
        password: testPassword,
        serialNumber: 'CERT-A2',
        validFrom: tomorrow,
        validUntil: nextYear,
      });

      // Company B certificate must STILL be active
      const activeB = await certificatesService.getActive(companyB);
      expect(activeB?.active).toBe(true);
      expect(activeB?.serialNumber).toBe('CERT-B');
    });
  });

  describe('Desactivación (Deactivation)', () => {
    it('should deactivate an active certificate', async () => {
      const cert = await certificatesService.register({
        companyId: companyA,
        pfxBase64: validPfxBase64,
        password: testPassword,
        validFrom: tomorrow,
        validUntil: nextYear,
      });
      expect(cert.active).toBe(true);

      const deactivated = await certificatesService.deactivate(cert.id, companyA);
      expect(deactivated.active).toBe(false);

      const activeNow = await certificatesService.getActive(companyA);
      expect(activeNow).toBeNull();
    });

    it('should throw NotFoundException if deactivating non-existent certificate', async () => {
      await expect(
        certificatesService.deactivate('cert_non_existent', companyA),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('Autenticación y Autorización (JwtAuthGuard & RolesGuard)', () => {
    function createMockContext(headers: Record<string, string>, role?: AdminRole): ExecutionContext {
      const req: any = {
        headers,
        user: role ? { sub: 'admin_1', email: 'admin@facturify.pe', role } : undefined,
      };
      return {
        switchToHttp: () => ({ getRequest: () => req }),
        getHandler: () => CertificatesController.prototype.register,
        getClass: () => CertificatesController,
      } as unknown as ExecutionContext;
    }

    it('should reject requests without Authorization header with UnauthorizedException', async () => {
      const ctx = createMockContext({});
      await expect(jwtGuard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
    });

    it('should reject requests with API Key bearer format (fact_live_...)', async () => {
      const ctx = createMockContext({
        authorization: 'Bearer fact_live_abcdef1234567890',
      });
      await expect(jwtGuard.canActivate(ctx)).rejects.toThrow(
        /API Keys cannot be used for administrative endpoints/,
      );
    });

    it('should reject requests with invalid or expired JWT token', async () => {
      const ctx = createMockContext({
        authorization: 'Bearer invalid.jwt.signature',
      });
      await expect(jwtGuard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
    });

    it('should allow valid Admin JWT token in JwtAuthGuard', async () => {
      const token = jwtService.sign({ sub: 'admin_1', email: 'admin@facturify.pe', role: AdminRole.ADMIN });
      const ctx = createMockContext({
        authorization: `Bearer ${token}`,
      });

      const allowed = await jwtGuard.canActivate(ctx);
      expect(allowed).toBe(true);
    });

    it('should reject non-admin users in RolesGuard', () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([AdminRole.ADMIN, AdminRole.SUPERADMIN]);

      const ctx = createMockContext(
        { authorization: 'Bearer valid' },
        'USER' as any,
      );

      expect(() => rolesGuard.canActivate(ctx)).toThrow(ForbiddenException);
    });

    it('should allow ADMIN role in RolesGuard', () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([AdminRole.ADMIN, AdminRole.SUPERADMIN]);

      const ctx = createMockContext(
        { authorization: 'Bearer valid' },
        AdminRole.ADMIN,
      );

      expect(rolesGuard.canActivate(ctx)).toBe(true);
    });

    it('should allow SUPERADMIN role in RolesGuard', () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([AdminRole.ADMIN, AdminRole.SUPERADMIN]);

      const ctx = createMockContext(
        { authorization: 'Bearer valid' },
        AdminRole.SUPERADMIN,
      );

      expect(rolesGuard.canActivate(ctx)).toBe(true);
    });
  });

  describe('CertificatesController Endpoints Integration', () => {
    it('POST /certificates should call service and return safe response', async () => {
      const result = await certificatesController.register({
        companyId: companyA,
        pfxBase64: validPfxBase64,
        password: testPassword,
        serialNumber: 'CTRL-01',
        validFrom: tomorrow,
        validUntil: nextYear,
      });

      expect(result.id).toBeDefined();
      expect(result.companyId).toBe(companyA);
      expect(result.serialNumber).toBe('CTRL-01');
      expect(result).not.toHaveProperty('password');
      expect(result).not.toHaveProperty('encryptedPassword');
    });

    it('POST /certificates/company/:companyId should override companyId from route', async () => {
      const result = await certificatesController.registerForCompany(companyB, {
        companyId: 'ignored_company',
        pfxBase64: validPfxBase64,
        password: testPassword,
        serialNumber: 'CTRL-02',
        validFrom: tomorrow,
        validUntil: nextYear,
      });

      expect(result.companyId).toBe(companyB);
    });

    it('GET /certificates/company/:companyId should return safe certificates list', async () => {
      await certificatesController.register({
        companyId: companyA,
        pfxBase64: validPfxBase64,
        password: testPassword,
        serialNumber: 'LIST-01',
        validFrom: tomorrow,
        validUntil: nextYear,
      });

      const list = await certificatesController.listByCompany(companyA);
      expect(list.length).toBe(1);
      expect(list[0].serialNumber).toBe('LIST-01');
    });

    it('PATCH /certificates/:id/deactivate should deactivate certificate', async () => {
      const created = await certificatesController.register({
        companyId: companyA,
        pfxBase64: validPfxBase64,
        password: testPassword,
        validFrom: tomorrow,
        validUntil: nextYear,
      });

      const deactivated = await certificatesController.deactivate(created.id, companyA);
      expect(deactivated.active).toBe(false);
    });

    it('PATCH /certificates/company/:companyId/:id/deactivate should deactivate certificate for company', async () => {
      const created = await certificatesController.register({
        companyId: companyA,
        pfxBase64: validPfxBase64,
        password: testPassword,
        validFrom: tomorrow,
        validUntil: nextYear,
      });

      const deactivated = await certificatesController.deactivateWithCompany(companyA, created.id);
      expect(deactivated.active).toBe(false);
    });

    it('DELETE /certificates/:id should also deactivate certificate', async () => {
      const created = await certificatesController.register({
        companyId: companyA,
        pfxBase64: validPfxBase64,
        password: testPassword,
        validFrom: tomorrow,
        validUntil: nextYear,
      });

      const deactivated = await certificatesController.delete(created.id, companyA);
      expect(deactivated.active).toBe(false);
    });
  });
});
