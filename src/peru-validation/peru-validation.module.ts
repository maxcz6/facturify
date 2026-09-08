import { Module } from '@nestjs/common';
import { PeruValidationService } from './peru-validation.service';

@Module({
  providers: [PeruValidationService],
  exports: [PeruValidationService],
})
export class PeruValidationModule {}
