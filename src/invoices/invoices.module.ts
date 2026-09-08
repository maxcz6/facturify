import { Module } from '@nestjs/common';
import { ApiKeysModule } from '../api-keys/api-keys.module';
import { DocumentsModule } from '../documents/documents.module';
import { InvoicesController } from './invoices.controller';
import { InvoicesService } from './invoices.service';
import { IdempotencyModule } from '../idempotency/idempotency.module';

@Module({
  imports: [DocumentsModule, ApiKeysModule, IdempotencyModule],
  controllers: [InvoicesController],
  providers: [InvoicesService],
  exports: [InvoicesService],
})
export class InvoicesModule {}
