import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { SecurityModule } from '../security/security.module';
import { CertificateStorageService } from './certificate-storage.service';
import { CertificatesController } from './certificates.controller';
import { CertificatesService } from './certificates.service';
import { Pkcs12ExtractorService } from './pkcs12-extractor.service';
import { AuditEventsModule } from '../audit-events/audit-events.module';

@Module({
  imports: [AuthModule, SecurityModule, AuditEventsModule],
  controllers: [CertificatesController],
  providers: [CertificateStorageService, CertificatesService, Pkcs12ExtractorService],
  exports: [CertificatesService, CertificateStorageService, Pkcs12ExtractorService],
})
export class CertificatesModule {}
