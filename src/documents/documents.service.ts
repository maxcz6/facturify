import { Injectable, NotFoundException } from '@nestjs/common';
import { Document, DocumentStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateDocumentDto } from './dto/create-document.dto';
import { PeruValidationService } from '../peru-validation/peru-validation.service';
import { TaxCalculationService } from '../tax-calculation/tax-calculation.service';
import { DocumentEventOutboxService } from '../outbox/document-event-outbox.service';
import { SunatCatalogsService } from '../sunat-catalogs/sunat-catalogs.service';

const SUNAT_DOCUMENT_CODE = {
  INVOICE: '01', RECEIPT: '03', CREDIT_NOTE: '07', DEBIT_NOTE: '08',
} as const;

@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly peruValidation?: PeruValidationService,
    private readonly taxCalculation?: TaxCalculationService,
    private readonly eventOutbox?: DocumentEventOutboxService,
    private readonly catalogs?: SunatCatalogsService,
  ) {}

  async create(
    input: CreateDocumentDto & Partial<{
      referenceDocumentId: string;
      adjustmentReasonCode: string;
      adjustmentReason: string;
    }>,
  ): Promise<Document> {
    this.peruValidation?.assertValidSeries(input.type, input.series);
    this.peruValidation?.assertValidCurrency(input.currency ?? 'PEN');
    this.catalogs?.assertValidDocumentType(SUNAT_DOCUMENT_CODE[input.type]);
    this.catalogs?.assertValidCurrency(input.currency ?? 'PEN');
    if (input.customerDocumentType || input.customerDocumentNumber) {
      this.catalogs?.assertValidIdentityType(input.customerDocumentType);
      this.peruValidation?.assertValidIdentityDocument(input.customerDocumentType, input.customerDocumentNumber);
    }
    if (input.type === 'CREDIT_NOTE') this.catalogs?.assertValidCreditNoteReason(input.adjustmentReasonCode);
    if (input.type === 'DEBIT_NOTE') this.catalogs?.assertValidDebitNoteReason(input.adjustmentReasonCode);
    const company = await this.prisma.company.findUnique({ where: { id: input.companyId } });
    if (!company) throw new NotFoundException('Company not found.');

    const calculation = this.taxCalculation?.calculateDocument(input.items.map((item) => ({
      description: item.description,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
    })));
    const calculatedItems = calculation?.items ?? input.items.map((item) => {
      const subtotal = new Prisma.Decimal(item.quantity).mul(item.unitPrice).toDecimalPlaces(2);
      const tax = subtotal.mul('0.18').toDecimalPlaces(2);
      return { ...item, quantity: new Prisma.Decimal(item.quantity), unitPrice: new Prisma.Decimal(item.unitPrice), subtotal, tax, total: subtotal.add(tax) };
    });
    const subtotal = calculation?.subtotal ?? calculatedItems.reduce((sum, item) => sum.add(item.subtotal), new Prisma.Decimal(0));
    const tax = calculation?.tax ?? calculatedItems.reduce((sum, item) => sum.add(item.tax), new Prisma.Decimal(0));
    const total = calculation?.total ?? subtotal.add(tax);

    const data: Prisma.DocumentUncheckedCreateInput = {
        companyId: input.companyId,
        type: input.type,
        series: input.series,
        number: input.number,
        customerDocumentType: input.customerDocumentType,
        customerDocumentNumber: input.customerDocumentNumber,
        customerName: input.customerName,
        currency: input.currency ?? 'PEN',
        subtotal,
        tax,
        total,
        status: DocumentStatus.PENDING,
        issuedAt: new Date(),
        referenceDocumentId: input.referenceDocumentId,
        adjustmentReasonCode: input.adjustmentReasonCode,
        adjustmentReason: input.adjustmentReason,
        items: { create: calculatedItems.map((item) => ({
          description: item.description ?? '',
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          subtotal: item.subtotal,
          tax: item.tax,
          total: item.total,
        })) },
    };

    if (!this.eventOutbox) return this.prisma.document.create({ data });
    return this.prisma.$transaction(async (tx) => {
      const document = await tx.document.create({ data });
      await this.eventOutbox!.enqueue('document.created', document, tx);
      return document;
    });
  }

  async createAdjustment(
    input: CreateDocumentDto & {
      referenceDocumentId: string;
      adjustmentReasonCode: string;
      adjustmentReason: string;
    },
  ): Promise<Document> {
    if (![input.type].some((type) => type === 'CREDIT_NOTE' || type === 'DEBIT_NOTE')) {
      throw new NotFoundException('Unsupported adjustment document type.');
    }

    const reference = await this.prisma.document.findFirst({
      where: { id: input.referenceDocumentId, companyId: input.companyId },
    });
    if (!reference) throw new NotFoundException('Referenced document not found for this company.');
    if (reference.type !== 'INVOICE' && reference.type !== 'RECEIPT') {
      throw new NotFoundException('The referenced document cannot receive an adjustment note.');
    }
    this.peruValidation?.assertValidSeries(input.type, input.series, reference.type);

    return this.create({
      ...input,
      referenceDocumentId: reference.id,
      customerDocumentType: reference.customerDocumentType ?? undefined,
      customerDocumentNumber: reference.customerDocumentNumber ?? undefined,
      customerName: reference.customerName ?? undefined,
      currency: input.currency ?? reference.currency,
    });
  }

}
