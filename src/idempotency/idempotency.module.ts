import { Module } from '@nestjs/common';
import { IdempotencyService } from './idempotency.service';
import { PrismaModule } from '../prisma/prisma.module';
import { IdempotencyPersistenceService } from './idempotency-persistence.service';
import { IdempotencyInterceptor } from './idempotency.interceptor';

@Module({
  imports: [PrismaModule],
  providers: [IdempotencyService, IdempotencyPersistenceService, IdempotencyInterceptor],
  exports: [IdempotencyService, IdempotencyPersistenceService, IdempotencyInterceptor],
})
export class IdempotencyModule {}
