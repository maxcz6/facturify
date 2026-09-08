import { Module } from '@nestjs/common';
import { CompaniesController } from './companies.controller';
import { CompaniesService } from './companies.service';
import { PeruValidationModule } from '../peru-validation/peru-validation.module';

@Module({ imports: [PeruValidationModule], controllers: [CompaniesController], providers: [CompaniesService] })
export class CompaniesModule {}
