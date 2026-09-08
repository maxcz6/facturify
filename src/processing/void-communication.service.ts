import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DocumentStatus, DocumentType, Prisma, VoidCommunicationStatus } from '@prisma/client';
import { CertificatesService } from '../certificates/certificates.service';
import { Pkcs12ExtractorService } from '../certificates/pkcs12-extractor.service';
import { CdrService } from '../cdr/cdr.service';
import { PrismaService } from '../prisma/prisma.service';
import { DOCUMENT_STORAGE, DocumentStorage } from '../storage/storage.interface';
import { CompanySunatConfigService } from '../sunat/company-sunat-config.service';
import { SUNAT_GATEWAY, SunatGateway } from '../sunat/sunat-gateway';
import { SunatZipService } from '../xml/sunat-zip.service';
import { UblVoidedDocumentsService } from '../xml/ubl-voided-documents.service';
import { XmlSignatureService } from '../xml/xml-signature.service';
import { VoidDocumentDto } from './dto/create-void-communication.dto';
import { DocumentLifecycleService } from '../document-lifecycle/document-lifecycle.service';
import { DocumentEventOutboxService } from '../outbox/document-event-outbox.service';

const TYPE_CODES = { INVOICE: '01', CREDIT_NOTE: '07', DEBIT_NOTE: '08' } as const;

@Injectable()
export class VoidCommunicationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ubl: UblVoidedDocumentsService,
    private readonly signatures: XmlSignatureService,
    private readonly zip: SunatZipService,
    @Inject(DOCUMENT_STORAGE) private readonly storage: DocumentStorage,
    private readonly certificates: CertificatesService,
    private readonly extractor: Pkcs12ExtractorService,
    private readonly credentials: CompanySunatConfigService,
    @Inject(SUNAT_GATEWAY) private readonly gateway: SunatGateway,
    private readonly cdr: CdrService,
    private readonly lifecycle: DocumentLifecycleService,
    private readonly eventOutbox?: DocumentEventOutboxService,
  ) {}

  async createAndSend(companyId: string, referenceDateText: string, requests: VoidDocumentDto[]) {
    const referenceDate = this.parseDate(referenceDateText);
    if (!requests.length || requests.length > 500) throw new BadRequestException('A void communication requires between 1 and 500 documents.');
    const ids = requests.map((item) => item.documentId);
    if (new Set(ids).size !== ids.length) throw new BadRequestException('A document cannot be repeated in a void communication.');
    const company = await this.prisma.company.findUnique({ where: { id: companyId } });
    if (!company) throw new NotFoundException('Company not found.');
    const documents = await this.prisma.document.findMany({ where: { id: { in: ids }, companyId } });
    if (documents.length !== ids.length) throw new NotFoundException('One or more documents were not found.');
    for (const document of documents) {
      if (document.type === DocumentType.RECEIPT) throw new ConflictException('Receipts must be voided through a daily summary.');
      if (document.status !== DocumentStatus.ACCEPTED && document.status !== DocumentStatus.OBSERVED) {
        throw new ConflictException('Only accepted or observed documents can be voided.');
      }
      if (!document.issuedAt || document.issuedAt.toISOString().slice(0, 10) !== referenceDateText) {
        throw new ConflictException('All documents must belong to the communication reference date.');
      }
    }
    const reasonById = new Map(requests.map((item) => [item.documentId, item.reason.trim()]));
    const communication = await this.prisma.$transaction(async (tx) => {
      const aggregate = await tx.voidCommunication.aggregate({ where: { companyId, referenceDate }, _max: { sequence: true } });
      return tx.voidCommunication.create({ data: {
        companyId, referenceDate, sequence: (aggregate._max.sequence ?? 0) + 1,
        documents: { create: documents.map((document) => ({ documentId: document.id, reason: reasonById.get(document.id)! })) },
      } });
    }, { isolationLevel: 'Serializable' });

    let zipArtifactId: string | undefined;
    try {
      const communicationId = `RA-${referenceDateText.replaceAll('-', '')}-${communication.sequence}`;
      const unsigned = this.ubl.generateUnsigned({
        id: communicationId, referenceDate: referenceDateText, issueDate: new Date().toISOString().slice(0, 10),
        supplierRuc: company.ruc, supplierName: company.businessName,
        lines: documents.map((document, index) => ({
          lineId: index + 1,
          documentTypeCode: TYPE_CODES[document.type as keyof typeof TYPE_CODES],
          series: document.series, number: document.number, reason: reasonById.get(document.id)!,
        })),
      });
      const encrypted = await this.certificates.getActiveSigningMaterial(companyId);
      const material = await this.extractor.extract(encrypted.pfx, encrypted.password);
      const signed = this.signatures.sign(unsigned, { ...material, signatureId: `Signature-${communicationId}` });
      const packed = this.zip.packVoidXml(signed, company.ruc, communicationId);
      const artifact = await this.storage.save(companyId, 'ZIP', packed.content); zipArtifactId = artifact.id;
      const sol = await this.credentials.getDecryptedSolCredential(companyId);
      const sent = await this.gateway.sendSummary({ fileName: packed.zipFileName, zipContent: packed.content,
        credentials: { ruc: sol.ruc, solUsername: sol.username, solPassword: sol.password }, environment: sol.environment });
      await this.prisma.voidCommunication.update({ where: { id: communication.id }, data: { status: VoidCommunicationStatus.SENT, ticket: sent.ticket, zipArtifactId } });
      return { id: communication.id, status: VoidCommunicationStatus.SENT, ticket: sent.ticket, documentCount: documents.length };
    } catch (error) {
      if (zipArtifactId) await this.storage.delete(companyId, zipArtifactId).catch(() => false);
      await this.prisma.voidCommunication.update({ where: { id: communication.id }, data: { status: VoidCommunicationStatus.ERROR, sunatMessage: 'Void communication failed.' } });
      throw error;
    }
  }

  async refreshStatus(companyId: string, id: string) {
    const communication = await this.prisma.voidCommunication.findFirst({ where: { id, companyId }, include: { documents: true } });
    if (!communication) throw new NotFoundException('Void communication not found.');
    if (communication.status !== VoidCommunicationStatus.SENT || !communication.ticket) throw new ConflictException('Void communication has no pending ticket.');
    const sol = await this.credentials.getDecryptedSolCredential(companyId);
    const result = await this.gateway.getStatus({ ticket: communication.ticket,
      credentials: { ruc: sol.ruc, solUsername: sol.username, solPassword: sol.password }, environment: sol.environment });
    if (result.statusCode === '98') return { id, status: VoidCommunicationStatus.SENT, pending: true };
    if (!result.cdrZip) throw new ConflictException('SUNAT completed the void ticket without a CDR.');
    const parsed = this.cdr.extractAndParse(result.cdrZip);
    const artifact = await this.storage.save(companyId, 'CDR', result.cdrZip);
    const accepted = parsed.status === 'ACCEPTED' || parsed.status === 'OBSERVED';
    const documentIds = communication.documents.map((entry) => entry.documentId);
    if (accepted) {
      const currentDocuments = await this.prisma.document.findMany({
        where: { id: { in: documentIds }, companyId },
        select: { status: true },
      });
      if (currentDocuments.length !== documentIds.length) throw new ConflictException('Void communication documents changed while awaiting SUNAT.');
      for (const document of currentDocuments) {
        this.lifecycle.assertTransition(document.status, DocumentStatus.VOIDED, { hasVoidConfirmation: true });
      }
    }
    try {
      if (accepted && this.eventOutbox) {
        await this.prisma.$transaction(async (tx) => {
          await tx.voidCommunication.update({ where: { id }, data: { status: VoidCommunicationStatus.ACCEPTED,
            cdrArtifactId: artifact.id, sunatCode: parsed.responseCode, sunatMessage: parsed.description } });
          for (const documentId of documentIds) {
            const updated = await tx.document.update({ where: { id: documentId }, data: {
              status: DocumentStatus.VOIDED, sunatCode: parsed.responseCode, sunatMessage: parsed.description,
            } });
            await this.eventOutbox!.enqueue('document.voided', updated, tx);
          }
        });
      } else {
        const operations: Prisma.PrismaPromise<unknown>[] = [
          this.prisma.voidCommunication.update({ where: { id }, data: { status: accepted ? VoidCommunicationStatus.ACCEPTED : VoidCommunicationStatus.REJECTED,
            cdrArtifactId: artifact.id, sunatCode: parsed.responseCode, sunatMessage: parsed.description } }),
        ];
        if (accepted) operations.push(this.prisma.document.updateMany({
          where: { id: { in: documentIds }, companyId },
          data: { status: DocumentStatus.VOIDED, sunatCode: parsed.responseCode, sunatMessage: parsed.description },
        }));
        await this.prisma.$transaction(operations);
      }
    } catch (error) { await this.storage.delete(companyId, artifact.id).catch(() => false); throw error; }
    return { id, status: accepted ? VoidCommunicationStatus.ACCEPTED : VoidCommunicationStatus.REJECTED, pending: false };
  }

  private parseDate(value: string): Date {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new BadRequestException('referenceDate must use YYYY-MM-DD.');
    const date = new Date(`${value}T00:00:00.000Z`);
    if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new BadRequestException('Invalid referenceDate.');
    return date;
  }
}
