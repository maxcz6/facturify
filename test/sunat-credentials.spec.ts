import {
  BadRequestException,
  ConflictException,
  ExecutionContext,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { AdminRole, SunatCredential } from '@prisma/client';
import { JwtAuthGuard } from '../src/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../src/auth/guards/roles.guard';
import { SecretsEncryptionService } from '../src/security/secrets-encryption.service';
import { CompanySunatConfigService } from '../src/sunat/company-sunat-config.service';
import { SunatCredentialsController } from '../src/sunat-credentials/sunat-credentials.controller';
import { SunatCredentialsModule } from '../src/sunat-credentials/sunat-credentials.module';
import { SunatCredentialsService } from '../src/sunat-credentials/sunat-credentials.service';
import { maskSolUsername } from '../src/sunat-credentials/sunat-credentials.util';

describe('SunatCredentialsModule (SOL Credentials Administration)', () => {
  let sunatCredentialsService: SunatCredentialsService;
  let sunatCredentialsController: SunatCredentialsController;
  let companySunatConfig: CompanySunatConfigService;
  let encryptionService: SecretsEncryptionService;
  let jwtService: JwtService;
  let jwtGuard: JwtAuthGuard;
  let rolesGuard: RolesGuard;
  let reflector: Reflector;

  let mockPrisma: any;
  let credentialsDb: Map<string, SunatCredential>;
  let companiesDb: Map<string, { id: string; ruc: string; businessName: string; environment: string }>;

  const companyA = 'cmp_alpha_111';
  const companyB = 'cmp_beta_222';
  const nonExistentCompany = 'cmp_non_existent';

  const testUsernameA = 'MODDATOS';
  const testPasswordA = 'SuperSecretSolPassword2026!';

  const testUsernameB = 'FACTURADOR1';
  const testPasswordB = 'BetaPassword456!';

  beforeEach(() => {
    credentialsDb = new Map<string, SunatCredential>();
    companiesDb = new Map();

    companiesDb.set(companyA, {
      id: companyA,
      ruc: '20100000001',
      businessName: 'Alpha Corp S.A.C.',
      environment: 'BETA',
    });
    companiesDb.set(companyB, {
      id: companyB,
      ruc: '20200000002',
      businessName: 'Beta Logistics S.A.',
      environment: 'PRODUCTION',
    });

    // Mock ConfigService with 32-byte AES key
    const test32ByteKey = Buffer.from('01234567890123456789012345678901').toString('base64');
    const mockConfig = {
      get: jest.fn().mockImplementation((key: string) => {
        if (key === 'SECRETS_ENCRYPTION_KEY') return test32ByteKey;
        return undefined;
      }),
    } as unknown as ConfigService;

    encryptionService = new SecretsEncryptionService(mockConfig);

    mockPrisma = {
      company: {
        findUnique: jest.fn().mockImplementation(async ({ where }: any) => {
          return companiesDb.get(where.id) ?? null;
        }),
      },
      sunatCredential: {
        findUnique: jest.fn().mockImplementation(async ({ where, include }: any) => {
          const cred = credentialsDb.get(where.companyId) ?? null;
          if (!cred) return null;
          if (include?.company) {
            return {
              ...cred,
              company: companiesDb.get(cred.companyId) ?? null,
            };
          }
          return cred;
        }),
        upsert: jest.fn().mockImplementation(async ({ where, create, update }: any) => {
          const existing = credentialsDb.get(where.companyId);
          if (existing) {
            const updated: SunatCredential = {
              ...existing,
              solUsername: update.solUsername,
              encryptedPassword: update.encryptedPassword,
              passwordIv: update.passwordIv,
              passwordAuthTag: update.passwordAuthTag,
              updatedAt: new Date(),
            };
            credentialsDb.set(where.companyId, updated);
            return updated;
          }
          const created: SunatCredential = {
            id: `cred_${credentialsDb.size + 1}`,
            companyId: create.companyId,
            solUsername: create.solUsername,
            encryptedPassword: create.encryptedPassword,
            passwordIv: create.passwordIv,
            passwordAuthTag: create.passwordAuthTag,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          credentialsDb.set(where.companyId, created);
          return created;
        }),
        delete: jest.fn().mockImplementation(async ({ where }: any) => {
          const existing = credentialsDb.get(where.companyId);
          if (!existing) {
            throw new Error(`Record to delete does not exist.`);
          }
          credentialsDb.delete(where.companyId);
          return existing;
        }),
      },
    };

    companySunatConfig = new CompanySunatConfigService(mockPrisma, encryptionService);
    sunatCredentialsService = new SunatCredentialsService(
      mockPrisma,
      companySunatConfig,
    );
    sunatCredentialsController = new SunatCredentialsController(sunatCredentialsService);

    jwtService = new JwtService({ secret: 'test-jwt-admin-secret-for-sunat-credentials' });
    jwtGuard = new JwtAuthGuard(jwtService);
    reflector = new Reflector();
    rolesGuard = new RolesGuard(reflector);
  });

  describe('Module and Dependency Setup', () => {
    it('should be instantiable and export controller and service', () => {
      expect(sunatCredentialsService).toBeDefined();
      expect(sunatCredentialsController).toBeDefined();
      expect(new SunatCredentialsModule()).toBeDefined();
    });
  });

  describe('Enmascaramiento de Usuario SOL (maskSolUsername)', () => {
    it('should mask standard 8-character usernames (e.g., MODDATOS -> MO****OS)', () => {
      const masked = maskSolUsername('MODDATOS');
      expect(masked).toBe('MO****OS');
      expect(masked).not.toContain('MODDATOS');
    });

    it('should mask 11-character usernames (e.g., FACTURADOR1 -> FA*******R1)', () => {
      const masked = maskSolUsername('FACTURADOR1');
      expect(masked).toBe('FA*******R1');
      expect(masked).not.toContain('FACTURADOR1');
    });

    it('should mask 5-character usernames (e.g., ADMIN -> AD***IN)', () => {
      const masked = maskSolUsername('ADMIN');
      expect(masked).toBe('AD***IN');
      expect(masked).not.toContain('ADMIN');
    });

    it('should mask 4-character usernames (e.g., USER -> U**R)', () => {
      const masked = maskSolUsername('USER');
      expect(masked).toBe('U**R');
    });

    it('should mask short and boundary usernames safely', () => {
      expect(maskSolUsername('ABC')).toBe('A*C');
      expect(maskSolUsername('AB')).toBe('**');
      expect(maskSolUsername('A')).toBe('*');
      expect(maskSolUsername('')).toBe('***');
      expect(maskSolUsername(null)).toBe('***');
      expect(maskSolUsername(undefined)).toBe('***');
    });
  });

  describe('PUT /companies/:companyId/sunat-credentials (Configuración y Cifrado en Reposo)', () => {
    it('should store credentials encrypted at rest with AES-256-GCM', async () => {
      const response = await sunatCredentialsController.update(companyA, {
        username: testUsernameA,
        password: testPasswordA,
      });

      expect(response.configured).toBe(true);
      expect(response.usernameMasked).toBe('MO****OS');
      expect(response.createdAt).toBeInstanceOf(Date);
      expect(response.updatedAt).toBeInstanceOf(Date);

      // Verify record stored in database is encrypted
      const record = credentialsDb.get(companyA);
      expect(record).toBeDefined();
      expect(record!.solUsername).toBe('MODDATOS');
      expect(record!.encryptedPassword).not.toBe(testPasswordA);
      // SecretsEncryptionService stores AES-256-GCM ciphertext, IV (12 bytes), and authTag (16 bytes) in base64
      expect(record!.encryptedPassword).toMatch(/^[A-Za-z0-9+/=]+$/);
      expect(record!.passwordIv).toMatch(/^[A-Za-z0-9+/=]+$/);
      expect(record!.passwordAuthTag).toMatch(/^[A-Za-z0-9+/=]+$/);

      // Verify that decrypting recovers the original password
      const decrypted = encryptionService.decrypt({
        encrypted: record!.encryptedPassword,
        iv: record!.passwordIv,
        authTag: record!.passwordAuthTag,
      });
      expect(decrypted).toBe(testPasswordA);
    });

    it('should never expose plain password, ciphertext, IV, auth tag, or unmasked username in response', async () => {
      const response = await sunatCredentialsController.update(companyA, {
        username: testUsernameA,
        password: testPasswordA,
      });

      const json = JSON.stringify(response);
      expect(json).not.toContain(testPasswordA);
      expect(json).not.toContain(testUsernameA);
      expect((response as any).password).toBeUndefined();
      expect((response as any).encryptedPassword).toBeUndefined();
      expect((response as any).passwordIv).toBeUndefined();
      expect((response as any).passwordAuthTag).toBeUndefined();
      expect((response as any).username).toBeUndefined();
      expect(response.usernameMasked).toBe('MO****OS');
    });

    it('should update existing credentials on subsequent PUT calls', async () => {
      // First configuration
      await sunatCredentialsController.update(companyA, {
        username: 'INITIALUSER',
        password: 'InitialPassword1!',
      });

      // Update configuration
      const updatedResponse = await sunatCredentialsController.update(companyA, {
        username: 'NEWUSER123',
        password: 'UpdatedPassword2@',
      });

      expect(updatedResponse.configured).toBe(true);
      expect(updatedResponse.usernameMasked).toBe('NE******23');

      // Database check
      const record = credentialsDb.get(companyA);
      expect(record!.solUsername).toBe('NEWUSER123');

      const decrypted = encryptionService.decrypt({
        encrypted: record!.encryptedPassword,
        iv: record!.passwordIv,
        authTag: record!.passwordAuthTag,
      });
      expect(decrypted).toBe('UpdatedPassword2@');
    });

    it('should throw NotFoundException when company does not exist', async () => {
      await expect(
        sunatCredentialsController.update(nonExistentCompany, {
          username: testUsernameA,
          password: testPasswordA,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should reject invalid SOL username formats', async () => {
      // Usernames with symbols
      await expect(
        sunatCredentialsController.update(companyA, {
          username: 'USER@INV!',
          password: testPasswordA,
        }),
      ).rejects.toThrow(ConflictException);

      // Usernames with spaces
      await expect(
        sunatCredentialsController.update(companyA, {
          username: 'USER NAME',
          password: testPasswordA,
        }),
      ).rejects.toThrow(ConflictException);

      // Usernames exceeding 20 characters
      await expect(
        sunatCredentialsController.update(companyA, {
          username: 'A'.repeat(21),
          password: testPasswordA,
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('should reject empty or missing parameters', async () => {
      await expect(
        sunatCredentialsController.update('', {
          username: testUsernameA,
          password: testPasswordA,
        }),
      ).rejects.toThrow(BadRequestException);

      await expect(
        sunatCredentialsController.update(companyA, {
          username: '',
          password: testPasswordA,
        }),
      ).rejects.toThrow(BadRequestException);

      await expect(
        sunatCredentialsController.update(companyA, {
          username: testUsernameA,
          password: '',
        }),
      ).rejects.toThrow(BadRequestException);

      await expect(
        sunatCredentialsController.update(companyA, null as any),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('GET /companies/:companyId/sunat-credentials/status (Consulta de Estado y Aislamiento)', () => {
    it('should return configured: false when no credentials exist for the company', async () => {
      const status = await sunatCredentialsController.getStatus(companyA);

      expect(status).toEqual({
        configured: false,
        usernameMasked: null,
        createdAt: null,
        updatedAt: null,
      });
    });

    it('should return configured: true with safe metadata when credentials are configured', async () => {
      await sunatCredentialsController.update(companyA, {
        username: testUsernameA,
        password: testPasswordA,
      });

      const status = await sunatCredentialsController.getStatus(companyA);

      expect(status.configured).toBe(true);
      expect(status.usernameMasked).toBe('MO****OS');
      expect(status.createdAt).toBeInstanceOf(Date);
      expect(status.updatedAt).toBeInstanceOf(Date);

      // Verify no secrets in status response
      const json = JSON.stringify(status);
      expect(json).not.toContain(testPasswordA);
      expect(json).not.toContain(testUsernameA);
      expect((status as any).password).toBeUndefined();
      expect((status as any).encryptedPassword).toBeUndefined();
      expect((status as any).passwordIv).toBeUndefined();
      expect((status as any).passwordAuthTag).toBeUndefined();
    });

    it('should throw NotFoundException when company does not exist', async () => {
      await expect(
        sunatCredentialsController.getStatus(nonExistentCompany),
      ).rejects.toThrow(NotFoundException);
    });

    it('should reject empty companyId with BadRequestException', async () => {
      await expect(
        sunatCredentialsController.getStatus(''),
      ).rejects.toThrow(BadRequestException);
    });

    it('should maintain strict company isolation (Company A does not affect Company B)', async () => {
      // Configure Company A only
      await sunatCredentialsController.update(companyA, {
        username: testUsernameA,
        password: testPasswordA,
      });

      const statusA = await sunatCredentialsController.getStatus(companyA);
      const statusB = await sunatCredentialsController.getStatus(companyB);

      expect(statusA.configured).toBe(true);
      expect(statusA.usernameMasked).toBe('MO****OS');

      expect(statusB.configured).toBe(false);
      expect(statusB.usernameMasked).toBeNull();
    });
  });

  describe('DELETE /companies/:companyId/sunat-credentials (Eliminación Segura)', () => {
    it('should delete credentials and respond with { configured: false }', async () => {
      // First configure
      await sunatCredentialsController.update(companyA, {
        username: testUsernameA,
        password: testPasswordA,
      });
      expect(credentialsDb.has(companyA)).toBe(true);

      // Now delete
      const deleteResult = await sunatCredentialsController.delete(companyA);

      expect(deleteResult).toEqual({ configured: false });
      expect(credentialsDb.has(companyA)).toBe(false);

      // Verify subsequent GET status reflects unconfigured state
      const statusAfterDelete = await sunatCredentialsController.getStatus(companyA);
      expect(statusAfterDelete).toEqual({
        configured: false,
        usernameMasked: null,
        createdAt: null,
        updatedAt: null,
      });
    });

    it('should throw NotFoundException when attempting to delete non-existent credentials', async () => {
      // Company exists, but has no credentials configured
      await expect(
        sunatCredentialsController.delete(companyA),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException when company does not exist', async () => {
      await expect(
        sunatCredentialsController.delete(nonExistentCompany),
      ).rejects.toThrow(NotFoundException);
    });

    it('should reject empty companyId with BadRequestException', async () => {
      await expect(
        sunatCredentialsController.delete(''),
      ).rejects.toThrow(BadRequestException);
    });

    it('should isolate deletion so deleting Company A does not touch Company B', async () => {
      // Configure both
      await sunatCredentialsController.update(companyA, {
        username: testUsernameA,
        password: testPasswordA,
      });
      await sunatCredentialsController.update(companyB, {
        username: testUsernameB,
        password: testPasswordB,
      });

      // Delete only Company A
      await sunatCredentialsController.delete(companyA);

      const statusA = await sunatCredentialsController.getStatus(companyA);
      const statusB = await sunatCredentialsController.getStatus(companyB);

      expect(statusA.configured).toBe(false);
      expect(statusB.configured).toBe(true);
      expect(statusB.usernameMasked).toBe('FA*******R1');
      expect(credentialsDb.has(companyB)).toBe(true);
    });
  });

  describe('Seguridad y Control de Acceso (JwtAuthGuard & RolesGuard)', () => {
    function createMockContext(authHeader?: string, user?: any): ExecutionContext {
      const req: any = {
        headers: {
          authorization: authHeader,
        },
        user,
      };

      return {
        switchToHttp: () => ({
          getRequest: () => req,
        }),
        getHandler: () => {},
        getClass: () => SunatCredentialsController,
      } as unknown as ExecutionContext;
    }

    it('should reject requests without Authorization header with UnauthorizedException', async () => {
      const ctx = createMockContext(undefined);
      await expect(jwtGuard.canActivate(ctx)).rejects.toThrow(UnauthorizedException);
    });

    it('should reject malformed Authorization headers (not Bearer format)', async () => {
      const ctxBasic = createMockContext('Basic dXNlcjpwYXNz');
      await expect(jwtGuard.canActivate(ctxBasic)).rejects.toThrow(UnauthorizedException);

      const ctxMalformed = createMockContext('Bearer');
      await expect(jwtGuard.canActivate(ctxMalformed)).rejects.toThrow(UnauthorizedException);
    });

    it('should reject API keys with explicit message that admin JWT is required', async () => {
      const ctxApiKey = createMockContext('Bearer fact_live_abcdef1234567890');
      await expect(jwtGuard.canActivate(ctxApiKey)).rejects.toThrow(
        'API Keys cannot be used for administrative endpoints. Use an Admin JWT token.',
      );
    });

    it('should reject invalid or expired JWT tokens', async () => {
      const ctxBadToken = createMockContext('Bearer this.is.invalid');
      await expect(jwtGuard.canActivate(ctxBadToken)).rejects.toThrow(UnauthorizedException);
    });

    it('should allow valid admin JWT token in JwtAuthGuard and populate request.user', async () => {
      const validToken = await jwtService.signAsync({
        sub: 'admin_user_id_123',
        email: 'admin@facturify.pe',
        role: AdminRole.ADMIN,
      });

      const ctx = createMockContext(`Bearer ${validToken}`);
      const canActivate = await jwtGuard.canActivate(ctx);

      expect(canActivate).toBe(true);
      const req = ctx.switchToHttp().getRequest<any>();
      expect(req.user).toBeDefined();
      expect(req.user.role).toBe(AdminRole.ADMIN);
      expect(req.user.sub).toBe('admin_user_id_123');
    });

    it('should allow ADMIN role in RolesGuard', () => {
      const ctx = createMockContext(undefined, {
        sub: 'admin_1',
        role: AdminRole.ADMIN,
      });

      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([AdminRole.ADMIN, AdminRole.SUPERADMIN]);

      expect(rolesGuard.canActivate(ctx)).toBe(true);
    });

    it('should allow SUPERADMIN role in RolesGuard', () => {
      const ctx = createMockContext(undefined, {
        sub: 'superadmin_1',
        role: AdminRole.SUPERADMIN,
      });

      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([AdminRole.ADMIN, AdminRole.SUPERADMIN]);

      expect(rolesGuard.canActivate(ctx)).toBe(true);
    });

    it('should reject users with unauthorized roles with ForbiddenException', () => {
      const ctx = createMockContext(undefined, {
        sub: 'unauthorized_user',
        role: 'REGULAR_USER',
      });

      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([AdminRole.ADMIN, AdminRole.SUPERADMIN]);

      expect(() => rolesGuard.canActivate(ctx)).toThrow(ForbiddenException);
    });

    it('should reject requests without user payload in RolesGuard with ForbiddenException', () => {
      const ctx = createMockContext(undefined, undefined);

      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([AdminRole.ADMIN, AdminRole.SUPERADMIN]);

      expect(() => rolesGuard.canActivate(ctx)).toThrow(ForbiddenException);
    });

    it('should verify that SunatCredentialsController has JwtAuthGuard, RolesGuard and ADMIN/SUPERADMIN roles decorated', () => {
      const guards = Reflect.getMetadata('__guards__', SunatCredentialsController);
      expect(guards).toBeDefined();
      expect(guards).toContain(JwtAuthGuard);
      expect(guards).toContain(RolesGuard);

      const roles = Reflect.getMetadata('roles', SunatCredentialsController);
      expect(roles).toBeDefined();
      expect(roles).toContain(AdminRole.ADMIN);
      expect(roles).toContain(AdminRole.SUPERADMIN);
    });
  });
});
