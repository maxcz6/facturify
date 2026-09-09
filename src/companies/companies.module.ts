import { Module } from '@nestjs/common';
import { CompaniesController } from './companies.controller';
import { CompaniesService } from './companies.service';
import { PeruValidationModule } from '../peru-validation/peru-validation.module';
import { AuthModule } from '../auth/auth.module';
import { AuditEventsModule } from '../audit-events/audit-events.module';

@Module({ imports: [PeruValidationModule, AuthModule, AuditEventsModule], controllers: [CompaniesController], providers: [CompaniesService] })
export class CompaniesModule {}
