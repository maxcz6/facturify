import { Injectable } from '@nestjs/common';
import { CertificatesService } from '../certificates/certificates.service';
import { Pkcs12ExtractorService } from '../certificates/pkcs12-extractor.service';
import { DocumentPreparationService } from './document-preparation.service';
import { DocumentSubmissionService } from './document-submission.service';

@Injectable()
export class DocumentIssuanceService {
  constructor(
    private readonly certificates: CertificatesService,
    private readonly extractor: Pkcs12ExtractorService,
    private readonly preparation: DocumentPreparationService,
    private readonly submission: DocumentSubmissionService,
  ) {}

  async issue(companyId: string, documentId: string) {
    const encryptedMaterial = await this.certificates.getActiveSigningMaterial(companyId);
    const material = await this.extractor.extract(encryptedMaterial.pfx, encryptedMaterial.password);
    await this.preparation.prepare(companyId, documentId, {
      ...material,
      signatureId: `Signature-${documentId}`,
    });
    return this.submission.submit(companyId, documentId);
  }
}
