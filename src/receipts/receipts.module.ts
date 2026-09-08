import { Module } from '@nestjs/common';
import { ApiKeysModule } from '../api-keys/api-keys.module';
import { DocumentsModule } from '../documents/documents.module';
import { ReceiptsController } from './receipts.controller';
import { ReceiptsService } from './receipts.service';
import { IdempotencyModule } from '../idempotency/idempotency.module';

@Module({
  imports: [DocumentsModule, ApiKeysModule, IdempotencyModule],
  controllers: [ReceiptsController],
  providers: [ReceiptsService],
  exports: [ReceiptsService],
})
export class ReceiptsModule {}
