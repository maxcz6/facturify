import { Module } from '@nestjs/common';
import { ApiKeysModule } from '../api-keys/api-keys.module';
import { DocumentsModule } from '../documents/documents.module';
import { AdjustmentNotesService } from './adjustment-notes.service';
import { CreditNotesController } from './credit-notes.controller';
import { DebitNotesController } from './debit-notes.controller';
import { IdempotencyModule } from '../idempotency/idempotency.module';

@Module({
  imports: [DocumentsModule, ApiKeysModule, IdempotencyModule],
  controllers: [CreditNotesController, DebitNotesController],
  providers: [AdjustmentNotesService],
})
export class AdjustmentNotesModule {}
