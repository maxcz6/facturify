import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { ApiKeysService } from '../api-keys.service';
import { ApiKeyRecord } from '../interfaces/api-key.interface';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private readonly apiKeysService: ApiKeysService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<
      Request & { apiKey?: ApiKeyRecord; companyId?: string }
    >();

    const authHeader = request.headers.authorization;
    if (!authHeader) {
      throw new UnauthorizedException(
        'Missing Authorization header. Provide a valid Bearer fact_live_... API Key.',
      );
    }

    const [scheme, token] = authHeader.split(' ');
    if (scheme !== 'Bearer' || !token) {
      throw new UnauthorizedException(
        'Invalid Authorization format. Expected Bearer <api_key>.',
      );
    }

    if (!token.startsWith('fact_live_') && !token.startsWith('fact_test_')) {
      throw new UnauthorizedException(
        'Invalid API Key format. API Keys must start with fact_live_ or fact_test_.',
      );
    }

    const keyRecord = await this.apiKeysService.validateKey(token);
    if (!keyRecord) {
      throw new UnauthorizedException('API Key is invalid, expired, or has been revoked.');
    }

    // Attach contextual information for downstream controllers and services
    request.apiKey = keyRecord;
    request.companyId = keyRecord.companyId;

    return true;
  }
}
