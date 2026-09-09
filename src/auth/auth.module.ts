import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { AuthThrottleModule } from '../auth-throttle/auth-throttle.module';
import { PasswordPolicyModule } from '../password-policy/password-policy.module';
import { AuditEventsModule } from '../audit-events/audit-events.module';
import { PasswordHashingModule } from '../password-hashing/password-hashing.module';
import { AdminTokenPolicyModule } from '../admin-token-policy/admin-token-policy.module';
import { ADMIN_TOKEN_AUDIENCE, ADMIN_TOKEN_ISSUER } from '../admin-token-policy/admin-token-policy.constants';

@Module({
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const secret = configService.get<string>('JWT_SECRET');
        if (!secret || secret === 'replace-with-a-long-random-secret-before-production') {
          throw new Error('JWT_SECRET must be configured with a strong unique value.');
        }
        return {
          secret,
          // AuthService builds the complete, policy-validated claims, including
          // iss/aud/iat/exp. Duplicating issuer or audience in signOptions makes
          // jsonwebtoken reject an otherwise valid payload at runtime.
          verifyOptions: { issuer: ADMIN_TOKEN_ISSUER, audience: ADMIN_TOKEN_AUDIENCE },
        };
      },
    }),
    AuthThrottleModule,
    PasswordPolicyModule,
    AuditEventsModule,
    PasswordHashingModule,
    AdminTokenPolicyModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtAuthGuard, RolesGuard],
  exports: [AuthService, JwtAuthGuard, RolesGuard, JwtModule, AdminTokenPolicyModule],
})
export class AuthModule {}
