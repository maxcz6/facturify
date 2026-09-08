import {
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { AdminRole, AdminUser } from '@prisma/client';
import { AuthService } from '../src/auth/auth.service';
import { JwtAuthGuard } from '../src/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../src/auth/guards/roles.guard';
import { PrismaService } from '../src/prisma/prisma.service';

describe('AuthModule (Admin JWT & RolesGuard & Bootstrap with Prisma Mock)', () => {
  let authService: AuthService;
  let jwtService: JwtService;
  let guard: JwtAuthGuard;
  let rolesGuard: RolesGuard;
  let reflector: Reflector;
  let mockPrisma: any;
  let adminDb: Map<string, AdminUser>;

  beforeEach(() => {
    adminDb = new Map<string, AdminUser>();

    mockPrisma = {
      adminUser: {
        count: jest.fn().mockImplementation(async (args?: any) => {
          if (args?.where?.active) {
            return [...adminDb.values()].filter((u) => u.active).length;
          }
          return adminDb.size;
        }),
        findUnique: jest.fn().mockImplementation(async ({ where }: any) => {
          if (where.email) {
            return adminDb.get(where.email.toLowerCase().trim()) ?? null;
          }
          if (where.id) {
            for (const user of adminDb.values()) {
              if (user.id === where.id) return user;
            }
          }
          return null;
        }),
        create: jest.fn().mockImplementation(async ({ data }: any) => {
          const user: AdminUser = {
            id: `adm_${Date.now()}`,
            email: data.email,
            name: data.name,
            passwordHash: data.passwordHash,
            passwordSalt: data.passwordSalt,
            role: data.role,
            active: data.active ?? true,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          adminDb.set(user.email, user);
          return user;
        }),
      },
    } as unknown as PrismaService;

    jwtService = new JwtService({ secret: 'test-secret', signOptions: { expiresIn: '1h' } });
    authService = new AuthService(mockPrisma as any, jwtService);
    guard = new JwtAuthGuard(jwtService);
    reflector = new Reflector();
    rolesGuard = new RolesGuard(reflector);
    delete process.env.BOOTSTRAP_ADMIN_TOKEN;
  });

  describe('Bootstrap Process (Initial SuperAdmin Creation)', () => {
    const validBootstrapToken = 'facturify_bootstrap_secret_token';

    it('should bootstrap the first user as SUPERADMIN using valid bootstrap token', async () => {
      const superadmin = await authService.bootstrapInitialAdmin({
        email: 'root@facturify.pe',
        name: 'Root Operator',
        password: 'SuperPassword123!',
        bootstrapToken: validBootstrapToken,
      });

      expect(superadmin.id).toMatch(/^adm_/);
      expect(superadmin.email).toBe('root@facturify.pe');
      expect(superadmin.role).toBe(AdminRole.SUPERADMIN);
      expect((superadmin as any).passwordHash).toBeUndefined();
      expect((superadmin as any).passwordSalt).toBeUndefined();
    });

    it('should reject bootstrap when an invalid token is provided', async () => {
      await expect(
        authService.bootstrapInitialAdmin({
          email: 'hacker@facturify.pe',
          name: 'Hacker',
          password: 'Password123!',
          bootstrapToken: 'wrong_secret_token',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should block bootstrap once an initial administrator already exists', async () => {
      await authService.bootstrapInitialAdmin({
        email: 'root@facturify.pe',
        name: 'Root Operator',
        password: 'SuperPassword123!',
        bootstrapToken: validBootstrapToken,
      });

      await expect(
        authService.bootstrapInitialAdmin({
          email: 'second@facturify.pe',
          name: 'Attacker Trying Bootstrap Again',
          password: 'Password123!',
          bootstrapToken: validBootstrapToken,
        }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('Subsequent Admin Creation (Restricted to SUPERADMIN)', () => {
    it('should allow an authenticated SUPERADMIN to create additional admins', async () => {
      const creatorSuperadmin = {
        sub: 'adm_super_1',
        email: 'super@facturify.pe',
        role: AdminRole.SUPERADMIN,
      };

      const newAdmin = await authService.createAdmin(creatorSuperadmin, {
        email: 'staff@facturify.pe',
        name: 'Staff Admin',
        password: 'StaffPassword123!',
        role: AdminRole.ADMIN,
      });

      expect(newAdmin.id).toMatch(/^adm_/);
      expect(newAdmin.role).toBe(AdminRole.ADMIN);
    });

    it('should block an ADMIN from creating other administrators', async () => {
      const regularAdmin = {
        sub: 'adm_regular_1',
        email: 'regular@facturify.pe',
        role: AdminRole.ADMIN,
      };

      await expect(
        authService.createAdmin(regularAdmin, {
          email: 'newbie@facturify.pe',
          name: 'Newbie',
          password: 'Password123!',
        }),
      ).rejects.toThrow('Only a SUPERADMIN can create new administrators.');
    });
  });

  describe('RolesGuard (Rigorous Role Verification)', () => {
    function createMockContext(userPayload?: any, requiredRoles?: string[]): ExecutionContext {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(requiredRoles);

      const mockRequest = { user: userPayload };
      return {
        switchToHttp: () => ({
          getRequest: () => mockRequest,
        }),
        getHandler: () => ({}),
        getClass: () => ({}),
      } as unknown as ExecutionContext;
    }

    it('should grant access if endpoint does not specify required roles', () => {
      const ctx = createMockContext({ role: 'ANY' }, undefined);
      expect(rolesGuard.canActivate(ctx)).toBe(true);
    });

    it('should throw ForbiddenException if user has no role object', () => {
      const ctx = createMockContext(undefined, [AdminRole.SUPERADMIN]);
      expect(() => rolesGuard.canActivate(ctx)).toThrow(
        'Access denied: no role assigned.',
      );
    });

    it('should deny ADMIN on endpoints strictly requiring SUPERADMIN', () => {
      const ctx = createMockContext({ role: AdminRole.ADMIN }, [AdminRole.SUPERADMIN]);
      expect(() => rolesGuard.canActivate(ctx)).toThrow(ForbiddenException);
    });

    it('should allow SUPERADMIN on endpoints strictly requiring SUPERADMIN', () => {
      const ctx = createMockContext({ role: AdminRole.SUPERADMIN }, [AdminRole.SUPERADMIN]);
      expect(rolesGuard.canActivate(ctx)).toBe(true);
    });

    it('should allow both ADMIN and SUPERADMIN on endpoints allowing either role', () => {
      const ctxAdmin = createMockContext({ role: AdminRole.ADMIN }, [
        AdminRole.ADMIN,
        AdminRole.SUPERADMIN,
      ]);
      const ctxSuper = createMockContext({ role: AdminRole.SUPERADMIN }, [
        AdminRole.ADMIN,
        AdminRole.SUPERADMIN,
      ]);

      expect(rolesGuard.canActivate(ctxAdmin)).toBe(true);
      expect(rolesGuard.canActivate(ctxSuper)).toBe(true);
    });

    it('should deny arbitrary or lower role on protected endpoint', () => {
      const ctx = createMockContext({ role: 'OPERATOR' }, [
        AdminRole.ADMIN,
        AdminRole.SUPERADMIN,
      ]);
      expect(() => rolesGuard.canActivate(ctx)).toThrow(
        'Access denied: requires one of [ADMIN, SUPERADMIN].',
      );
    });
  });

  describe('JwtAuthGuard', () => {
    it('should allow valid admin JWT', async () => {
      const token = await jwtService.signAsync({
        sub: 'adm_123',
        email: 'admin@facturify.pe',
        role: 'ADMIN',
      });

      const mockRequest: any = { headers: { authorization: `Bearer ${token}` } };
      const mockContext = {
        switchToHttp: () => ({ getRequest: () => mockRequest }),
      } as unknown as ExecutionContext;

      expect(await guard.canActivate(mockContext)).toBe(true);
      expect(mockRequest.user.sub).toBe('adm_123');
    });

    it('should explicitly reject API Keys in JWT endpoints', async () => {
      const mockRequest: any = {
        headers: { authorization: 'Bearer fact_live_abcdef123456' },
      };
      const mockContext = {
        switchToHttp: () => ({ getRequest: () => mockRequest }),
      } as unknown as ExecutionContext;

      await expect(guard.canActivate(mockContext)).rejects.toThrow(
        'API Keys cannot be used for administrative endpoints. Use an Admin JWT token.',
      );
    });
  });
});
