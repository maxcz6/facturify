import { Module } from '@nestjs/common';
import { StorageModule } from '../storage/storage.module';
import { CdrModule } from '../cdr/cdr.module';
import { SunatModule } from '../sunat/sunat.module';
import { CertificatesModule } from '../certificates/certificates.module';
import { XmlModule } from '../xml/xml.module';
import { DocumentPreparationService } from './document-preparation.service';
import { DocumentSubmissionService } from './document-submission.service';
import { DocumentIssuanceService } from './document-issuance.service';
import { ProcessingController } from './processing.controller';
import { DailySummaryService } from './daily-summary.service';
import { SunatErrorsModule } from '../sunat-errors/sunat-errors.module';
import { VoidCommunicationService } from './void-communication.service';
import { DocumentLifecycleModule } from '../document-lifecycle/document-lifecycle.module';
import { IdempotencyModule } from '../idempotency/idempotency.module';
import { OutboxModule } from '../outbox/outbox.module';

@Module({
  imports: [StorageModule, XmlModule, CdrModule, SunatModule, CertificatesModule, SunatErrorsModule, DocumentLifecycleModule, IdempotencyModule, OutboxModule],
  controllers: [ProcessingController],
  providers: [DocumentPreparationService, DocumentSubmissionService, DocumentIssuanceService, DailySummaryService, VoidCommunicationService],
  exports: [DocumentPreparationService, DocumentSubmissionService, DocumentIssuanceService, DailySummaryService, VoidCommunicationService],
})
export class ProcessingModule {}
