import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AuditQueriesController } from './audit-queries.controller';
import { AuditQueriesService } from './audit-queries.service';

@Module({
  imports: [AuthModule],
  controllers: [AuditQueriesController],
  providers: [AuditQueriesService],
  exports: [AuditQueriesService],
})
export class AuditQueriesModule {}
