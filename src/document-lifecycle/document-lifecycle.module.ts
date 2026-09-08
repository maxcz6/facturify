import { Module } from '@nestjs/common';
import { DocumentLifecycleService } from './document-lifecycle.service';

@Module({
  providers: [DocumentLifecycleService],
  exports: [DocumentLifecycleService],
})
export class DocumentLifecycleModule {}
