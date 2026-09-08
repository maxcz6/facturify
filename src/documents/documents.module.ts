import { Module } from '@nestjs/common';
import { DocumentsService } from './documents.service';
import { PeruValidationModule } from '../peru-validation/peru-validation.module';
import { TaxCalculationModule } from '../tax-calculation/tax-calculation.module';
import { OutboxModule } from '../outbox/outbox.module';

@Module({
  imports: [PeruValidationModule, TaxCalculationModule, OutboxModule],
  providers: [DocumentsService],
  exports: [DocumentsService],
})
export class DocumentsModule {}
