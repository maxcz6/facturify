import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ApiKeysModule } from './api-keys/api-keys.module';
import { ArtifactsModule } from './artifacts/artifacts.module';
import { AdjustmentNotesModule } from './adjustment-notes/adjustment-notes.module';
import { AuthModule } from './auth/auth.module';
import { CompaniesModule } from './companies/companies.module';
import { CertificatesModule } from './certificates/certificates.module';
import { CdrModule } from './cdr/cdr.module';
import { DocumentsModule } from './documents/documents.module';
import { DocumentQueriesModule } from './document-queries/document-queries.module';
import { HealthModule } from './health/health.module';
import { HttpSafetyModule } from './http-safety/http-safety.module';
import { InvoicesModule } from './invoices/invoices.module';
import { PrismaModule } from './prisma/prisma.module';
import { ProcessingModule } from './processing/processing.module';
import { ReceiptsModule } from './receipts/receipts.module';
import { SecurityModule } from './security/security.module';
import { WebhooksModule } from './webhooks/webhooks.module';
import { XmlModule } from './xml/xml.module';
import { SunatModule } from './sunat/sunat.module';
import { SunatCredentialsModule } from './sunat-credentials/sunat-credentials.module';
import { StorageModule } from './storage/storage.module';
import { ApplicationConfigValidationService } from './config-validation/config-validation.service';
import { AuditQueriesModule } from './audit-queries/audit-queries.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: (environment) => ({ ...new ApplicationConfigValidationService().validate(environment) }),
    }),
    PrismaModule,
    ProcessingModule,
    SecurityModule,
    HealthModule,
    HttpSafetyModule,
    CompaniesModule,
    CertificatesModule,
    CdrModule,
    DocumentsModule,
    DocumentQueriesModule,
    InvoicesModule,
    ReceiptsModule,
    AuthModule,
    ApiKeysModule,
    ArtifactsModule,
    AdjustmentNotesModule,
    WebhooksModule,
    XmlModule,
    SunatModule,
    SunatCredentialsModule,
    StorageModule,
    AuditQueriesModule,
  ],
})
export class AppModule {}
