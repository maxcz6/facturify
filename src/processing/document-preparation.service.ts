import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { DocumentStatus, DocumentType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { DOCUMENT_STORAGE, DocumentStorage, StoredArtifactMetadata } from '../storage/storage.interface';
import { SunatZipService } from '../xml/sunat-zip.service';
import { UblInvoiceService } from '../xml/ubl-invoice.service';
import { XmlSigningMaterial, XmlSignatureService } from '../xml/xml-signature.service';
import { UblAdjustmentNoteService } from '../xml/ubl-adjustment-note.service';
import { DocumentEventOutboxService } from '../outbox/document-event-outbox.service';

export interface PreparedDocument {
  documentId: string;
  status: DocumentStatus;
  xml: StoredArtifactMetadata;
  zip: StoredArtifactMetadata;
  sunatFileName: string;
}

@Injectable()
export class DocumentPreparationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ubl: UblInvoiceService,
    private readonly signatures: XmlSignatureService,
    private readonly zip: SunatZipService,
    @Inject(DOCUMENT_STORAGE) private readonly storage: DocumentStorage,
    private readonly adjustments?: UblAdjustmentNoteService,
    private readonly eventOutbox?: DocumentEventOutboxService,
  ) {}

  async prepare(
    companyId: string,
    documentId: string,
    signingMaterial: XmlSigningMaterial,
  ): Promise<PreparedDocument> {
    const document = await this.prisma.document.findFirst({
      where: { id: documentId, companyId },
      include: { company: true, items: true, referenceDocument: true },
    });
    if (!document) throw new NotFoundException('Document not found for this company.');
    const preparableStatuses: DocumentStatus[] = [DocumentStatus.PENDING, DocumentStatus.ERROR];
    if (!preparableStatuses.includes(document.status)) {
      throw new ConflictException(`Document cannot be prepared from status ${document.status}.`);
    }
    if ((document.type === DocumentType.CREDIT_NOTE || document.type === DocumentType.DEBIT_NOTE) && !document.referenceDocument) {
      throw new BadRequestException('Adjustment note does not have a referenced document.');
    }

    const locked = this.eventOutbox
      ? await this.prisma.$transaction(async (tx) => {
          const result = await tx.document.updateMany({
            where: { id: document.id, companyId, status: document.status },
            data: { status: DocumentStatus.PROCESSING },
          });
          if (result.count === 1) {
            await this.eventOutbox!.enqueue('document.processing', { ...document, status: DocumentStatus.PROCESSING }, tx);
          }
          return result;
        })
      : await this.prisma.document.updateMany({
          where: { id: document.id, companyId, status: document.status },
          data: { status: DocumentStatus.PROCESSING },
        });
    if (locked.count !== 1) throw new ConflictException('Document is already being processed.');

    let xmlArtifact: StoredArtifactMetadata | undefined;
    let zipArtifact: StoredArtifactMetadata | undefined;
    try {
      const unsignedXml = document.type === DocumentType.INVOICE || document.type === DocumentType.RECEIPT
        ? this.ubl.generateUnsigned({
        documentId: `${document.series}-${document.number}`,
        issueDate: (document.issuedAt ?? document.createdAt).toISOString().slice(0, 10),
        invoiceTypeCode: document.type === DocumentType.INVOICE ? '01' : '03',
        currency: document.currency,
        supplier: {
          documentType: '6',
          documentNumber: document.company.ruc,
          legalName: document.company.businessName,
        },
        customer: {
          documentType: document.customerDocumentType ?? '0',
          documentNumber: document.customerDocumentNumber ?? '-',
          legalName: document.customerName ?? 'CLIENTES VARIOS',
        },
        subtotal: document.subtotal.toFixed(2),
        taxAmount: document.tax.toFixed(2),
        total: document.total.toFixed(2),
        lines: document.items.map((item, index) => ({
          id: index + 1,
          description: item.description,
          quantity: item.quantity.toFixed(4),
          unitValue: item.unitPrice.toFixed(2),
          lineExtensionAmount: item.subtotal.toFixed(2),
          taxAmount: item.tax.toFixed(2),
          totalAmount: new Prisma.Decimal(item.total).div(item.quantity).toFixed(2),
        })),
        })
        : this.generateAdjustment(document);
      const signedXml = this.signatures.sign(unsignedXml, signingMaterial);
      const packed = this.zip.packSignedXml(signedXml, {
        ruc: document.company.ruc,
        documentTypeCode: document.type === DocumentType.INVOICE ? '01'
          : document.type === DocumentType.RECEIPT ? '03'
            : document.type === DocumentType.CREDIT_NOTE ? '07' : '08',
        series: document.series,
        number: document.number,
      });

      xmlArtifact = await this.storage.save(companyId, 'XML', signedXml);
      zipArtifact = await this.storage.save(companyId, 'ZIP', packed.content);
      await this.prisma.document.update({
        where: { id: document.id },
        data: {
          xmlArtifactId: xmlArtifact.id,
          zipArtifactId: zipArtifact.id,
          status: DocumentStatus.PROCESSING,
          sunatMessage: null,
        },
      });

      return {
        documentId: document.id,
        status: DocumentStatus.PROCESSING,
        xml: xmlArtifact,
        zip: zipArtifact,
        sunatFileName: packed.zipFileName,
      };
    } catch (error) {
      if (zipArtifact) await this.storage.delete(companyId, zipArtifact.id).catch(() => false);
      if (xmlArtifact) await this.storage.delete(companyId, xmlArtifact.id).catch(() => false);
      const safeMessage = this.safeErrorMessage(error);
      if (this.eventOutbox) {
        await this.prisma.$transaction(async (tx) => {
          const failed = await tx.document.update({
            where: { id: document.id }, data: { status: DocumentStatus.ERROR, sunatMessage: safeMessage },
          });
          await this.eventOutbox!.enqueue('document.error', failed, tx);
        });
      } else {
        await this.prisma.document.update({
          where: { id: document.id }, data: { status: DocumentStatus.ERROR, sunatMessage: safeMessage },
        });
      }
      throw error;
    }
  }

  private safeErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message.slice(0, 500) : 'Document preparation failed.';
  }

  private generateAdjustment(document: any): string {
    if (!this.adjustments || !document.referenceDocument) {
      throw new BadRequestException('Adjustment note XML generator is unavailable.');
    }
    const referenceTypeCode = document.referenceDocument.type === DocumentType.INVOICE ? '01' : '03';
    return this.adjustments.generateUnsigned({
      kind: document.type,
      documentId: `${document.series}-${document.number}`,
      issueDate: (document.issuedAt ?? document.createdAt).toISOString().slice(0, 10),
      currency: document.currency,
      referenceId: `${document.referenceDocument.series}-${document.referenceDocument.number}`,
      referenceTypeCode,
      reasonCode: document.adjustmentReasonCode,
      reason: document.adjustmentReason,
      supplier: { ruc: document.company.ruc, name: document.company.businessName },
      customer: {
        documentType: document.customerDocumentType ?? '0',
        documentNumber: document.customerDocumentNumber ?? '-',
        name: document.customerName ?? 'CLIENTES VARIOS',
      },
      subtotal: document.subtotal.toFixed(2), taxAmount: document.tax.toFixed(2), total: document.total.toFixed(2),
      lines: document.items.map((item: any, index: number) => ({
        id: index + 1, description: item.description, quantity: item.quantity.toFixed(4),
        unitValue: item.unitPrice.toFixed(2), subtotal: item.subtotal.toFixed(2), taxAmount: item.tax.toFixed(2),
        unitPrice: item.total.div(item.quantity).toFixed(2),
      })),
    });
  }
}
