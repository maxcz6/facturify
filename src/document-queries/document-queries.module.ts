import { Module } from '@nestjs/common';
import { ApiKeysModule } from '../api-keys/api-keys.module';
import { DocumentQueriesController } from './document-queries.controller';
import { DocumentQueriesService } from './document-queries.service';

@Module({
  imports: [ApiKeysModule],
  controllers: [DocumentQueriesController],
  providers: [DocumentQueriesService],
  exports: [DocumentQueriesService],
})
export class DocumentQueriesModule {}
