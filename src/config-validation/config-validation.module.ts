import { Module } from '@nestjs/common';
import { ApplicationConfigValidationService } from './config-validation.service';

@Module({
  providers: [ApplicationConfigValidationService],
  exports: [ApplicationConfigValidationService],
})
export class ConfigValidationModule {}
