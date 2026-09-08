import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ApiKey, ApiKeyEnvironment, ApiKeyStatus } from '@prisma/client';
import { ApiKeysController } from '../src/api-keys/api-keys.controller';
import { ApiKeysService } from '../src/api-keys/api-keys.service';
import { ApiKeyGuard } from '../src/api-keys/guards/api-key.guard';
import { AdminRole } from '../src/auth/dto/register-admin.dto';
import { JwtAuthGuard } from '../src/auth/guards/jwt-auth.guard';
import { PrismaService } from '../src/prisma/prisma.service';

describe('ApiKeysModule (with Prisma Mock)', () => {
  let service: ApiKeysService;
  let guard: ApiKeyGuard;
  let controller: ApiKeysController;
  let jwtService: JwtService;
  let jwtGuard: JwtAuthGuard;
  let mockPrisma: any;
  let apiKeysDb: Map<string, ApiKey>;

  beforeEach(() => {
    apiKeysDb = new Map<string, ApiKey>();

    mockPrisma = {
      company: {
        findUnique: jest.fn().mockImplementation(async ({ where }: any) => {
          return { id: where.id, ruc: '20123456789', businessName: 'Test Corp' };
        }),
      },
      apiKey: {
        create: jest.fn().mockImplementation(async ({ data }: any) => {
          const record: ApiKey = {
            id: `key_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            companyId: data.companyId,
            name: data.name,
            keyHash: data.keyHash,
            prefix: data.prefix,
            lastFour: data.lastFour,
            environment: data.environment || ApiKeyEnvironment.LIVE,
            status: data.status || ApiKeyStatus.ACTIVE,
            lastUsedAt: null,
            revokedAt: null,
            expiresAt: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          apiKeysDb.set(record.id, record);
          return record;
        }),
        findUnique: jest.fn().mockImplementation(async ({ where }: any) => {
          if (where.keyHash) {
            for (const key of apiKeysDb.values()) {
              if (key.keyHash === where.keyHash) return key;
            }
          }
          if (where.id) {
            return apiKeysDb.get(where.id) ?? null;
          }
          return null;
        }),
        findMany: jest.fn().mockImplementation(async ({ where }: any) => {
          const list = [...apiKeysDb.values()];
          if (where?.companyId) {
            return list.filter((k) => k.companyId === where.companyId);
          }
          return list;
        }),
        update: jest.fn().mockImplementation(async ({ where, data }: any) => {
          const existing = apiKeysDb.get(where.id);
          if (!existing) throw new Error('Not found in mock');
          const updated = { ...existing, ...data };
          apiKeysDb.set(where.id, updated);
          return updated;
        }),
      },
    } as unknown as PrismaService;

    service = new ApiKeysService(mockPrisma as any);
    guard = new ApiKeyGuard(service);
    controller = new ApiKeysController(service);
    jwtService = new JwtService({ secret: 'admin-secret', signOptions: { expiresIn: '1h' } });
    jwtGuard = new JwtAuthGuard(jwtService);
  });

  describe('ApiKeysService', () => {
    it('should create an API Key with fact_live_ prefix and sha256 hash', async () => {
      const created = await service.create({
        companyId: 'cmp_test_123',
        name: 'POS Terminal 1',
        environment: 'live',
      });

      expect(created.id).toMatch(/^key_/);
      expect(created.apiKey).toMatch(/^fact_live_/);
      expect(created.companyId).toBe('cmp_test_123');
      expect(created.status).toBe('ACTIVE');
      expect(created.lastFour.length).toBe(4);
    });

    it('should validate an active API Key', async () => {
      const created = await service.create({
        companyId: 'cmp_test_123',
        name: 'Backend Integration',
      });

      const validated = await service.validateKey(created.apiKey);
      expect(validated).not.toBeNull();
      expect(validated?.id).toBe(created.id);
      expect(validated?.companyId).toBe('cmp_test_123');
      expect(validated?.lastUsedAt).toBeDefined();
    });

    it('should return null for non-existent or tampered API Key', async () => {
      const result = await service.validateKey('fact_live_invalidkey1234567890abcdef');
      expect(result).toBeNull();
    });

    it('should rotate an API Key, revoking the old one and returning a new active one', async () => {
      const original = await service.create({
        companyId: 'cmp_test_123',
        name: 'Web Store',
      });

      const rotated = await service.rotate(original.id);

      expect(rotated.id).not.toBe(original.id);
      expect(rotated.apiKey).not.toBe(original.apiKey);
      expect(rotated.companyId).toBe('cmp_test_123');
      expect(rotated.status).toBe('ACTIVE');

      // Old key must be revoked
      expect(await service.validateKey(original.apiKey)).toBeNull();

      // New key must be valid
      expect(await service.validateKey(rotated.apiKey)).not.toBeNull();
    });

    it('should revoke an API Key', async () => {
      const created = await service.create({
        companyId: 'cmp_test_123',
        name: 'Temporary Integration',
      });

      const revoked = await service.revoke(created.id);
      expect(revoked.status).toBe('REVOKED');
      expect(revoked.revokedAt).toBeDefined();

      expect(await service.validateKey(created.apiKey)).toBeNull();
    });

    it('should list keys for a company without revealing raw secret', async () => {
      await service.create({ companyId: 'cmp_company_A', name: 'Key 1' });
      await service.create({ companyId: 'cmp_company_A', name: 'Key 2' });
      await service.create({ companyId: 'cmp_company_B', name: 'Key 3' });

      const keysA = await service.findByCompany('cmp_company_A');
      expect(keysA.length).toBe(2);
      expect((keysA[0] as any).apiKey).toBeUndefined();
    });
  });

  describe('ApiKeyGuard (Authorization: Bearer fact_live_...)', () => {
    it('should allow valid Bearer fact_live_ key and attach company context', async () => {
      const created = await service.create({
        companyId: 'cmp_abc',
        name: 'Public API Client',
      });

      const mockRequest: any = {
        headers: {
          authorization: `Bearer ${created.apiKey}`,
        },
      };

      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => mockRequest,
        }),
      } as unknown as ExecutionContext;

      const allowed = await guard.canActivate(mockContext);
      expect(allowed).toBe(true);
      expect(mockRequest.companyId).toBe('cmp_abc');
      expect(mockRequest.apiKey.id).toBe(created.id);
    });

    it('should reject missing Authorization header', async () => {
      const mockRequest: any = { headers: {} };
      const mockContext = {
        switchToHttp: () => ({ getRequest: () => mockRequest }),
      } as unknown as ExecutionContext;

      await expect(guard.canActivate(mockContext)).rejects.toThrow(UnauthorizedException);
    });

    it('should reject non-Bearer authorization', async () => {
      const mockRequest: any = {
        headers: { authorization: 'Basic somebase64credentials' },
      };
      const mockContext = {
        switchToHttp: () => ({ getRequest: () => mockRequest }),
      } as unknown as ExecutionContext;

      await expect(guard.canActivate(mockContext)).rejects.toThrow(
        'Invalid Authorization format. Expected Bearer <api_key>.',
      );
    });

    it('should reject Bearer tokens that do not start with fact_live_ or fact_test_', async () => {
      const mockRequest: any = {
        headers: { authorization: 'Bearer eyJhbGciOiJIUzI1NiIsIn...' },
      };
      const mockContext = {
        switchToHttp: () => ({ getRequest: () => mockRequest }),
      } as unknown as ExecutionContext;

      await expect(guard.canActivate(mockContext)).rejects.toThrow(
        'Invalid API Key format. API Keys must start with fact_live_ or fact_test_.',
      );
    });
  });

  describe('Admin JWT Protection on API Key Management Endpoints', () => {
    it('should block API Key creation if no JWT is provided', async () => {
      const mockRequest: any = { headers: {} };
      const mockContext = {
        switchToHttp: () => ({ getRequest: () => mockRequest }),
      } as unknown as ExecutionContext;

      await expect(jwtGuard.canActivate(mockContext)).rejects.toThrow(
        'Authorization header is missing.',
      );
    });

    it('should block API Key creation if a client Bearer API Key is presented instead of an Admin JWT', async () => {
      const mockRequest: any = {
        headers: { authorization: 'Bearer fact_live_attempt_bypass123' },
      };
      const mockContext = {
        switchToHttp: () => ({ getRequest: () => mockRequest }),
      } as unknown as ExecutionContext;

      await expect(jwtGuard.canActivate(mockContext)).rejects.toThrow(
        'API Keys cannot be used for administrative endpoints. Use an Admin JWT token.',
      );
    });

    it('should allow API Key creation with a valid Admin JWT', async () => {
      const adminToken = await jwtService.signAsync({
        sub: 'adm_admin_1',
        email: 'security@facturify.pe',
        role: AdminRole.ADMIN,
      });

      const mockRequest: any = {
        headers: { authorization: `Bearer ${adminToken}` },
      };
      const mockContext = {
        switchToHttp: () => ({ getRequest: () => mockRequest }),
      } as unknown as ExecutionContext;

      const canActivate = await jwtGuard.canActivate(mockContext);
      expect(canActivate).toBe(true);

      const created = await controller.create({
        companyId: 'cmp_acme',
        name: 'ACME Production ERP',
      });
      expect(created.apiKey).toMatch(/^fact_live_/);
    });
  });
});
