import {
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
  HttpException,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AdminRole, AdminUser, Prisma } from '@prisma/client';
import * as crypto from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import {
  BootstrapAdminDto,
  CreateAdminDto,
} from './dto/register-admin.dto';
import { JwtPayload } from './interfaces/jwt-payload.interface';
import { AuthThrottleService } from '../auth-throttle/auth-throttle.service';
import { AUTH_ACTIONS, AuthAction } from '../auth-throttle/auth-throttle.constants';
import { AuthRateLimitedException } from '../auth-throttle/auth-throttle.interface';
import { PasswordPolicyService } from '../password-policy/password-policy.service';
import { PasswordPolicyException } from '../password-policy/password-policy.interface';
import { AuditEventBuilderService } from '../audit-events/audit-events.service';
import { AuditEventWriterService } from '../audit-events/audit-events-writer.service';
import { PasswordHashingService } from '../password-hashing/password-hashing.service';
import { AdminTokenPolicyService } from '../admin-token-policy/admin-token-policy.service';
import { ADMIN_TOKEN_AUDIENCE, ADMIN_TOKEN_ISSUER } from '../admin-token-policy/admin-token-policy.constants';

export type PublicAdminUser = Omit<AdminUser, 'passwordHash' | 'passwordSalt'>;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService?: ConfigService,
    private readonly throttle?: AuthThrottleService,
    private readonly passwordPolicy?: PasswordPolicyService,
    private readonly auditBuilder?: AuditEventBuilderService,
    private readonly auditWriter?: AuditEventWriterService,
    private readonly injectedPasswordHasher?: PasswordHashingService,
    private readonly tokenPolicy?: AdminTokenPolicyService,
  ) {}

  private get passwordHasher(): PasswordHashingService {
    return this.injectedPasswordHasher ?? new PasswordHashingService();
  }

  async hasAdmins(): Promise<boolean> {
    const count = await this.prisma.adminUser.count({
      where: { active: true },
    });
    return count > 0;
  }

  async bootstrapInitialAdmin(
    dto: BootstrapAdminDto,
    requestId?: string,
  ): Promise<PublicAdminUser> {
    const throttleIdentifier = dto.email;
    this.assertThrottleAllowed(AUTH_ACTIONS.BOOTSTRAP, throttleIdentifier);

    const expectedToken =
      this.configService?.get<string>('BOOTSTRAP_ADMIN_TOKEN') ||
      process.env.BOOTSTRAP_ADMIN_TOKEN ||
      'facturify_bootstrap_secret_token';

    const tokenMatches =
      dto.bootstrapToken.length === expectedToken.length &&
      crypto.timingSafeEqual(
        Buffer.from(dto.bootstrapToken, 'utf8'),
        Buffer.from(expectedToken, 'utf8'),
      );

    if (!tokenMatches) {
      this.throttle?.recordFailure(AUTH_ACTIONS.BOOTSTRAP, throttleIdentifier);
      await this.appendAudit(this.auditBuilder?.buildAdminBootstrap({
        result: 'FAILURE', publicCode: 'INVALID_BOOTSTRAP_TOKEN', requestId,
      }));
      throw new UnauthorizedException('Invalid bootstrap secret token.');
    }
    const createInitial = async (database: Prisma.TransactionClient | PrismaService) => {
      const adminCount = await database.adminUser.count();
      if (adminCount > 0) {
        throw new ForbiddenException(
          'Initial administrator bootstrap has already been completed. Additional administrators must be created by an authenticated SUPERADMIN.',
        );
      }
      return this.internalCreateUser({
        email: dto.email, name: dto.name, password: dto.password, role: AdminRole.SUPERADMIN,
      }, database);
    };
    let created: PublicAdminUser;
    try {
      created = typeof this.prisma.$transaction === 'function'
        ? await this.prisma.$transaction(createInitial, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
        : await createInitial(this.prisma);
    } catch (error) {
      if (this.isPrismaCode(error, 'P2034')) {
        throw new ForbiddenException('Initial administrator bootstrap has already been completed.');
      }
      throw error;
    }
    this.throttle?.recordSuccess(AUTH_ACTIONS.BOOTSTRAP, throttleIdentifier);
    await this.appendAudit(this.auditBuilder?.buildAdminBootstrap({
      result: 'SUCCESS', adminId: created.id, requestId,
    }));
    return created;
  }

  async createAdmin(
    creator: JwtPayload,
    dto: CreateAdminDto,
    requestId?: string,
  ): Promise<PublicAdminUser> {
    if (creator.role !== AdminRole.SUPERADMIN) {
      throw new ForbiddenException('Only a SUPERADMIN can create new administrators.');
    }

    const created = await this.internalCreateUser({
      email: dto.email,
      name: dto.name,
      password: dto.password,
      role: dto.role === AdminRole.SUPERADMIN ? AdminRole.SUPERADMIN : AdminRole.ADMIN,
    });
    await this.appendAudit(this.auditBuilder?.build({
      event: 'admin.created', actorType: 'ADMIN', actorId: creator.sub,
      result: 'SUCCESS', requestId,
    }));
    return created;
  }

  private async internalCreateUser(data: {
    email: string;
    name: string;
    password: string;
    role: AdminRole;
  }, database: Prisma.TransactionClient | PrismaService = this.prisma): Promise<PublicAdminUser> {
    const normalizedEmail = data.email.toLowerCase().trim();
    try {
      this.passwordPolicy?.assertValid(data.password, { email: normalizedEmail, name: data.name });
    } catch (error) {
      if (!(error instanceof PasswordPolicyException)) throw error;
      throw new BadRequestException({ code: error.code, message: error.message });
    }

    const existing = await database.adminUser.findUnique({
      where: { email: normalizedEmail },
    });
    if (existing) {
      throw new ConflictException('An admin user with this email already exists.');
    }

    const passwordSalt = '';
    const passwordHash = await this.passwordHasher.hash(data.password);

    const user = await database.adminUser.create({
      data: {
        email: normalizedEmail,
        name: data.name,
        passwordHash,
        passwordSalt,
        role: data.role,
        active: true,
      },
    });

    const { passwordHash: _, passwordSalt: __, ...publicUser } = user;
    return publicUser;
  }

  async login(
    dto: LoginDto,
    requestId?: string,
  ): Promise<{ accessToken: string; user: PublicAdminUser }> {
    const normalizedEmail = dto.email.toLowerCase().trim();
    this.assertThrottleAllowed(AUTH_ACTIONS.LOGIN, normalizedEmail);
    const user = await this.prisma.adminUser.findUnique({
      where: { email: normalizedEmail },
    });

    if (!user || !user.active) {
      this.throttle?.recordFailure(AUTH_ACTIONS.LOGIN, normalizedEmail);
      await this.appendAudit(this.auditBuilder?.buildAdminLogin({
        result: 'FAILURE', publicCode: 'INVALID_CREDENTIALS', requestId,
      }));
      throw new UnauthorizedException('Invalid email or password.');
    }

    const isVersionedHash = user.passwordHash.startsWith('scrypt$');
    const hashMatches = isVersionedHash
      ? await this.passwordHasher.verify(dto.password, user.passwordHash)
      : await this.verifyLegacyPassword(dto.password, user.passwordSalt, user.passwordHash);

    if (!hashMatches) {
      this.throttle?.recordFailure(AUTH_ACTIONS.LOGIN, normalizedEmail);
      await this.appendAudit(this.auditBuilder?.buildAdminLogin({
        result: 'FAILURE', publicCode: 'INVALID_CREDENTIALS', requestId,
      }));
      throw new UnauthorizedException('Invalid email or password.');
    }

    const payload: JwtPayload = this.tokenPolicy
      ? this.tokenPolicy.buildClaims({
          sub: user.id,
          role: user.role as 'ADMIN' | 'SUPERADMIN',
          iss: ADMIN_TOKEN_ISSUER,
          aud: ADMIN_TOKEN_AUDIENCE,
        })
      : {
          sub: user.id,
          role: user.role as 'ADMIN' | 'SUPERADMIN',
          tokenType: 'admin_access',
          iss: ADMIN_TOKEN_ISSUER,
          aud: ADMIN_TOKEN_AUDIENCE,
          iat: Math.floor(Date.now() / 1000),
          exp: Math.floor(Date.now() / 1000) + 8 * 60 * 60,
        };

    const accessToken = await this.jwtService.signAsync(payload);
    if (!isVersionedHash || this.passwordHasher.needsRehash(user.passwordHash)) {
      const upgradedHash = await this.passwordHasher.hash(dto.password);
      await this.prisma.adminUser.update({
        where: { id: user.id },
        data: { passwordHash: upgradedHash, passwordSalt: '' },
      });
    }
    this.throttle?.recordSuccess(AUTH_ACTIONS.LOGIN, normalizedEmail);
    await this.appendAudit(this.auditBuilder?.buildAdminLogin({
      result: 'SUCCESS', adminId: user.id, requestId,
    }));

    const { passwordHash: _, passwordSalt: __, ...publicUser } = user;
    return {
      accessToken,
      user: publicUser,
    };
  }

  async getProfile(userId: string): Promise<PublicAdminUser> {
    const user = await this.prisma.adminUser.findUnique({
      where: { id: userId },
    });

    if (!user || !user.active) {
      throw new UnauthorizedException('Admin user not found.');
    }

    const { passwordHash: _, passwordSalt: __, ...publicUser } = user;
    return publicUser;
  }

  private async verifyLegacyPassword(password: string, salt: string, expectedHex: string): Promise<boolean> {
    if (!salt || !/^[0-9a-f]{128}$/i.test(expectedHex)) return false;
    const derived = await new Promise<Buffer>((resolve, reject) => {
      crypto.scrypt(password, salt, 64, (error, key) => error ? reject(error) : resolve(key));
    }).catch(() => null);
    if (!derived) return false;
    const expected = Buffer.from(expectedHex, 'hex');
    return derived.length === expected.length && crypto.timingSafeEqual(derived, expected);
  }

  private assertThrottleAllowed(action: AuthAction, identifier: string): void {
    try {
      this.throttle?.assertAllowed(action, identifier);
    } catch (error) {
      if (!(error instanceof AuthRateLimitedException)) throw error;
      throw new HttpException({
        code: error.code,
        message: 'Authentication rate limit exceeded.',
        retryAfterSeconds: error.retryAfterSeconds,
      }, HttpStatus.TOO_MANY_REQUESTS);
    }
  }

  private async appendAudit(event: ReturnType<AuditEventBuilderService['build']> | undefined): Promise<void> {
    if (event && this.auditWriter) await this.auditWriter.append(event);
  }

  private isPrismaCode(error: unknown, code: string): boolean {
    return typeof error === 'object' && error !== null && 'code' in error && error.code === code;
  }
}
