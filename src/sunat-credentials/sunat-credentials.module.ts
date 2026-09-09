import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { SecurityModule } from '../security/security.module';
import { SunatModule } from '../sunat/sunat.module';
import { SunatCredentialsController } from './sunat-credentials.controller';
import { SunatCredentialsService } from './sunat-credentials.service';
import { AuthModule } from '../auth/auth.module';
import { AuditEventsModule } from '../audit-events/audit-events.module';

@Module({
  imports: [PrismaModule, SecurityModule, SunatModule, AuthModule, AuditEventsModule],
  controllers: [SunatCredentialsController],
  providers: [SunatCredentialsService],
  exports: [SunatCredentialsService],
})
export class SunatCredentialsModule {}
