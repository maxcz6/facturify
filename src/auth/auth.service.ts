import {
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AdminRole, AdminUser } from '@prisma/client';
import * as crypto from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import {
  BootstrapAdminDto,
  CreateAdminDto,
} from './dto/register-admin.dto';
import { JwtPayload } from './interfaces/jwt-payload.interface';

export type PublicAdminUser = Omit<AdminUser, 'passwordHash' | 'passwordSalt'>;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService?: ConfigService,
  ) {}

  async hasAdmins(): Promise<boolean> {
    const count = await this.prisma.adminUser.count({
      where: { active: true },
    });
    return count > 0;
  }

  async bootstrapInitialAdmin(
    dto: BootstrapAdminDto,
  ): Promise<PublicAdminUser> {
    const adminCount = await this.prisma.adminUser.count();
    if (adminCount > 0) {
      throw new ForbiddenException(
        'Initial administrator bootstrap has already been completed. Additional administrators must be created by an authenticated SUPERADMIN.',
      );
    }

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
      throw new UnauthorizedException('Invalid bootstrap secret token.');
    }

    return this.internalCreateUser({
      email: dto.email,
      name: dto.name,
      password: dto.password,
      role: AdminRole.SUPERADMIN,
    });
  }

  async createAdmin(
    creator: JwtPayload,
    dto: CreateAdminDto,
  ): Promise<PublicAdminUser> {
    if (creator.role !== AdminRole.SUPERADMIN) {
      throw new ForbiddenException('Only a SUPERADMIN can create new administrators.');
    }

    return this.internalCreateUser({
      email: dto.email,
      name: dto.name,
      password: dto.password,
      role: dto.role === AdminRole.SUPERADMIN ? AdminRole.SUPERADMIN : AdminRole.ADMIN,
    });
  }

  private async internalCreateUser(data: {
    email: string;
    name: string;
    password: string;
    role: AdminRole;
  }): Promise<PublicAdminUser> {
    const normalizedEmail = data.email.toLowerCase().trim();

    const existing = await this.prisma.adminUser.findUnique({
      where: { email: normalizedEmail },
    });
    if (existing) {
      throw new ConflictException('An admin user with this email already exists.');
    }

    const passwordSalt = crypto.randomBytes(16).toString('hex');
    const passwordHash = this.hashPassword(data.password, passwordSalt);

    const user = await this.prisma.adminUser.create({
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
  ): Promise<{ accessToken: string; user: PublicAdminUser }> {
    const normalizedEmail = dto.email.toLowerCase().trim();
    const user = await this.prisma.adminUser.findUnique({
      where: { email: normalizedEmail },
    });

    if (!user || !user.active) {
      throw new UnauthorizedException('Invalid email or password.');
    }

    const computedHash = this.hashPassword(dto.password, user.passwordSalt);
    const hashMatches = crypto.timingSafeEqual(
      Buffer.from(computedHash, 'utf8'),
      Buffer.from(user.passwordHash, 'utf8'),
    );

    if (!hashMatches) {
      throw new UnauthorizedException('Invalid email or password.');
    }

    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role as 'ADMIN' | 'SUPERADMIN',
    };

    const accessToken = await this.jwtService.signAsync(payload);

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

  private hashPassword(password: string, salt: string): string {
    return crypto.scryptSync(password, salt, 64).toString('hex');
  }
}
