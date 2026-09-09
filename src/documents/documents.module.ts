import { Module } from '@nestjs/common';
import { DocumentsService } from './documents.service';
import { PeruValidationModule } from '../peru-validation/peru-validation.module';
import { TaxCalculationModule } from '../tax-calculation/tax-calculation.module';
import { OutboxModule } from '../outbox/outbox.module';
import { SunatCatalogsModule } from '../sunat-catalogs/sunat-catalogs.module';

@Module({
  imports: [PeruValidationModule, TaxCalculationModule, OutboxModule, SunatCatalogsModule],
  providers: [DocumentsService],
  exports: [DocumentsService],
})
export class DocumentsModule {}
