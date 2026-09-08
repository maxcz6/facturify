import { Module } from '@nestjs/common';
import { SunatErrorClassifierService } from './sunat-error-classifier.service';

@Module({
  providers: [SunatErrorClassifierService],
  exports: [SunatErrorClassifierService],
})
export class SunatErrorsModule {}
