import { Module } from '@nestjs/common';
import { AuthThrottleService } from './auth-throttle.service';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { createHmac } from 'node:crypto';

@Module({
  imports: [ConfigModule],
  providers: [{
    provide: AuthThrottleService,
    inject: [ConfigService],
    useFactory: (config: ConfigService) => {
      const rootSecret = config.getOrThrow<string>('JWT_SECRET');
      const derivedSecret = createHmac('sha256', rootSecret).update('facturify-auth-throttle-v1').digest('hex');
      return new AuthThrottleService({ hmacSecret: derivedSecret });
    },
  }],
  exports: [AuthThrottleService],
})
export class AuthThrottleModule {}
