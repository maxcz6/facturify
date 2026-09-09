import { Module } from '@nestjs/common';
import { AuditEventBuilderService } from './audit-events.service';
import { AuditEventWriterService } from './audit-events-writer.service';

@Module({
  providers: [AuditEventBuilderService, AuditEventWriterService],
  exports: [AuditEventBuilderService, AuditEventWriterService],
})
export class AuditEventsModule {}
