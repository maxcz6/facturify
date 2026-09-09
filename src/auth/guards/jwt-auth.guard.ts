import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { JwtPayload } from '../interfaces/jwt-payload.interface';
import { AdminTokenPolicyService } from '../../admin-token-policy/admin-token-policy.service';
import { ADMIN_TOKEN_AUDIENCE, ADMIN_TOKEN_ISSUER } from '../../admin-token-policy/admin-token-policy.constants';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly tokenPolicy?: AdminTokenPolicyService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request & { user?: JwtPayload }>();
    const authHeader = request.headers.authorization;

    if (!authHeader) {
      throw new UnauthorizedException('Authorization header is missing.');
    }

    const [scheme, token] = authHeader.split(' ');
    if (scheme !== 'Bearer' || !token) {
      throw new UnauthorizedException('Invalid Authorization format. Expected Bearer <jwt_token>.');
    }

    // Explicitly reject API keys in Admin JWT endpoints
    if (token.startsWith('fact_live_') || token.startsWith('fact_test_')) {
      throw new UnauthorizedException(
        'API Keys cannot be used for administrative endpoints. Use an Admin JWT token.',
      );
    }

    try {
      const payload = await this.jwtService.verifyAsync<JwtPayload>(token);
      if (this.tokenPolicy) {
        const validation = this.tokenPolicy.validateClaims(payload, {
          expectedIss: ADMIN_TOKEN_ISSUER,
          expectedAud: ADMIN_TOKEN_AUDIENCE,
          clockToleranceSeconds: 30,
        });
        if (!validation.valid) throw new Error('Invalid token policy.');
        request.user = validation.claims;
      } else {
        request.user = payload;
      }
      return true;
    } catch {
      throw new UnauthorizedException('Invalid or expired admin token.');
    }
  }
}
