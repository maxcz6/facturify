import { Module } from '@nestjs/common';
import { DocumentEventsService } from './document-events.service';

@Module({
  providers: [DocumentEventsService],
  exports: [DocumentEventsService],
})
export class DocumentEventsModule {}
