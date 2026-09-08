import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DocumentStatus, DocumentType } from '@prisma/client';
import { CdrService } from '../cdr/cdr.service';
import { PrismaService } from '../prisma/prisma.service';
import { DocumentStorageService } from '../storage/document-storage.service';
import { CompanySunatConfigService } from '../sunat/company-sunat-config.service';
import { SUNAT_GATEWAY, SunatGateway } from '../sunat/sunat-gateway';
import { SunatErrorClassifierService } from '../sunat-errors/sunat-error-classifier.service';
import { DocumentEventOutboxService } from '../outbox/document-event-outbox.service';

const TYPE_CODES: Record<DocumentType, string> = {
  INVOICE: '01',
  RECEIPT: '03',
  CREDIT_NOTE: '07',
  DEBIT_NOTE: '08',
};

@Injectable()
export class DocumentSubmissionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: DocumentStorageService,
    private readonly credentials: CompanySunatConfigService,
    private readonly cdr: CdrService,
    @Inject(SUNAT_GATEWAY) private readonly gateway: SunatGateway,
    private readonly errorClassifier?: SunatErrorClassifierService,
    private readonly eventOutbox?: DocumentEventOutboxService,
  ) {}

  async submit(companyId: string, documentId: string) {
    const document = await this.prisma.document.findFirst({
      where: { id: documentId, companyId },
      include: { company: { select: { ruc: true, environment: true } } },
    });
    if (!document) throw new NotFoundException('Document not found.');
    if (document.type === DocumentType.RECEIPT) {
      throw new ConflictException('Receipts must be submitted through a SUNAT daily summary.');
    }
    if (document.status !== DocumentStatus.PROCESSING || !document.zipArtifactId) {
      throw new ConflictException('Document is not ready for SUNAT submission.');
    }

    const locked = await this.prisma.document.updateMany({
      where: { id: documentId, companyId, status: DocumentStatus.PROCESSING },
      data: { status: DocumentStatus.SENT },
    });
    if (locked.count !== 1) throw new ConflictException('Document is already being submitted.');

    let cdrArtifactId: string | undefined;
    try {
      const zip = await this.storage.get(companyId, document.zipArtifactId);
      if (zip.metadata.type !== 'ZIP') throw new ConflictException('Document ZIP artifact is invalid.');

      const sol = await this.credentials.getDecryptedSolCredential(companyId);
      const baseName = `${document.company.ruc}-${TYPE_CODES[document.type]}-${document.series}-${document.number}`;
      const response = await this.gateway.sendBill({
        fileName: `${baseName}.zip`,
        zipContent: zip.content,
        credentials: {
          ruc: sol.ruc,
          solUsername: sol.username,
          solPassword: sol.password,
        },
        environment: sol.environment,
      });
      const parsed = this.cdr.extractAndParse(response.cdrZip);
      const storedCdr = await this.storage.save(companyId, 'CDR', response.cdrZip);
      cdrArtifactId = storedCdr.id;

      const status = DocumentStatus[parsed.status];
      const resultData = {
          status,
          sunatCode: parsed.responseCode,
          sunatMessage: parsed.description,
          cdrArtifactId,
      };
      if (this.eventOutbox) {
        await this.prisma.$transaction(async (tx) => {
          const updated = await tx.document.update({ where: { id: documentId }, data: resultData });
          const event = status === DocumentStatus.ACCEPTED ? 'document.accepted'
            : status === DocumentStatus.OBSERVED ? 'document.observed' : 'document.rejected';
          await this.eventOutbox!.enqueue(event, updated, tx);
        });
      } else {
        await this.prisma.document.update({ where: { id: documentId }, data: resultData });
      }
      return { documentId, status, sunatCode: parsed.responseCode, sunatMessage: parsed.description };
    } catch (error) {
      if (cdrArtifactId) await this.storage.delete(companyId, cdrArtifactId).catch(() => false);
      const safeMessage = this.safeMessage(error);
      if (this.eventOutbox) {
        await this.prisma.$transaction(async (tx) => {
          const changed = await tx.document.updateMany({
            where: { id: documentId, companyId, status: DocumentStatus.SENT },
            data: { status: DocumentStatus.ERROR, sunatMessage: safeMessage },
          });
          if (changed.count === 1) {
            await this.eventOutbox!.enqueue('document.error', { ...document, status: DocumentStatus.ERROR, sunatMessage: safeMessage }, tx);
          }
        });
      } else {
        await this.prisma.document.updateMany({
          where: { id: documentId, companyId, status: DocumentStatus.SENT },
          data: { status: DocumentStatus.ERROR, sunatMessage: safeMessage },
        });
      }
      throw error;
    }
  }

  private safeMessage(error: unknown): string {
    return this.errorClassifier?.classify(error).publicMessage ?? 'SUNAT submission failed.';
  }
}
