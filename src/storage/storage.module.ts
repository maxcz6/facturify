import { Module } from '@nestjs/common';
import { DocumentStorageService } from './document-storage.service';
import { DOCUMENT_STORAGE } from './storage.interface';

@Module({
  providers: [
    DocumentStorageService,
    {
      provide: DOCUMENT_STORAGE,
      useExisting: DocumentStorageService,
    },
  ],
  exports: [DocumentStorageService, DOCUMENT_STORAGE],
})
export class StorageModule {}
