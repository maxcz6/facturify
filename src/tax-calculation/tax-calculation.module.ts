import { Module } from '@nestjs/common';
import { TaxCalculationService } from './tax-calculation.service';

@Module({
  providers: [TaxCalculationService],
  exports: [TaxCalculationService],
})
export class TaxCalculationModule {}
