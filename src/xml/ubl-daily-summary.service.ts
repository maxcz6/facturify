import { BadRequestException, Injectable } from '@nestjs/common';
import { create } from 'xmlbuilder2';

export interface DailySummaryLineInput {
  lineId: number;
  documentId: string;
  customerDocumentType: string;
  customerDocumentNumber: string;
  currency: string;
  taxableAmount: string;
  taxAmount: string;
  totalAmount: string;
}

export interface DailySummaryInput {
  id: string;
  referenceDate: string;
  issueDate: string;
  supplierRuc: string;
  supplierName: string;
  lines: DailySummaryLineInput[];
}

@Injectable()
export class UblDailySummaryService {
  generateUnsigned(input: DailySummaryInput): string {
    this.validate(input);
    const root = create({ version: '1.0', encoding: 'UTF-8' }).ele('SummaryDocuments', {
      xmlns: 'urn:sunat:names:specification:ubl:peru:schema:xsd:SummaryDocuments-1',
      'xmlns:cac': 'urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2',
      'xmlns:cbc': 'urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2',
      'xmlns:ds': 'http://www.w3.org/2000/09/xmldsig#',
      'xmlns:ext': 'urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2',
      'xmlns:sac': 'urn:sunat:names:specification:ubl:peru:schema:xsd:SunatAggregateComponents-1',
    });
    root.ele('ext:UBLExtensions').ele('ext:UBLExtension').ele('ext:ExtensionContent').up().up().up();
    root.ele('cbc:UBLVersionID').txt('2.0').up();
    root.ele('cbc:CustomizationID').txt('1.1').up();
    root.ele('cbc:ID').txt(input.id).up();
    root.ele('cbc:ReferenceDate').txt(input.referenceDate).up();
    root.ele('cbc:IssueDate').txt(input.issueDate).up();
    const signature = root.ele('cac:Signature');
    signature.ele('cbc:ID').txt(`IDSign-${input.id}`).up();
    signature.ele('cac:SignatoryParty').ele('cac:PartyIdentification').ele('cbc:ID').txt(input.supplierRuc).up().up().up();
    signature.ele('cac:DigitalSignatureAttachment').ele('cac:ExternalReference').ele('cbc:URI').txt(`#Signature-${input.id}`).up().up().up();
    signature.up();
    const supplier = root.ele('cac:AccountingSupplierParty');
    supplier.ele('cbc:CustomerAssignedAccountID').txt(input.supplierRuc).up();
    supplier.ele('cbc:AdditionalAccountID').txt('6').up();
    supplier.ele('cac:Party').ele('cac:PartyLegalEntity').ele('cbc:RegistrationName').txt(input.supplierName).up().up().up();
    supplier.up();

    for (const line of input.lines) {
      const node = root.ele('sac:SummaryDocumentsLine');
      node.ele('cbc:LineID').txt(String(line.lineId)).up();
      node.ele('cbc:DocumentTypeCode').txt('03').up();
      node.ele('cbc:ID').txt(line.documentId).up();
      const customer = node.ele('cac:AccountingCustomerParty');
      customer.ele('cbc:CustomerAssignedAccountID').txt(line.customerDocumentNumber || '-').up();
      customer.ele('cbc:AdditionalAccountID').txt(line.customerDocumentType || '0').up();
      customer.up();
      node.ele('cac:Status').ele('cbc:ConditionCode').txt('1').up().up();
      node.ele('sac:TotalAmount', { currencyID: line.currency }).txt(line.totalAmount).up();
      node.ele('sac:BillingPayment').ele('cbc:PaidAmount', { currencyID: line.currency }).txt(line.totalAmount).up().ele('cbc:InstructionID').txt('01').up().up();
      const tax = node.ele('cac:TaxTotal');
      tax.ele('cbc:TaxAmount', { currencyID: line.currency }).txt(line.taxAmount).up();
      const subtotal = tax.ele('cac:TaxSubtotal');
      subtotal.ele('cbc:TaxableAmount', { currencyID: line.currency }).txt(line.taxableAmount).up();
      subtotal.ele('cbc:TaxAmount', { currencyID: line.currency }).txt(line.taxAmount).up();
      subtotal.ele('cac:TaxCategory').ele('cac:TaxScheme').ele('cbc:ID').txt('1000').up().ele('cbc:Name').txt('IGV').up().ele('cbc:TaxTypeCode').txt('VAT').up().up().up();
      subtotal.up(); tax.up(); node.up();
    }
    return root.end({ prettyPrint: true });
  }

  private validate(input: DailySummaryInput): void {
    if (!/^RC-\d{8}-\d{1,5}$/.test(input.id)) throw new BadRequestException('Invalid daily summary ID.');
    if (!/^\d{11}$/.test(input.supplierRuc)) throw new BadRequestException('Invalid supplier RUC.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.referenceDate) || !/^\d{4}-\d{2}-\d{2}$/.test(input.issueDate)) {
      throw new BadRequestException('Summary dates must use YYYY-MM-DD.');
    }
    if (input.lines.length === 0 || input.lines.length > 500) throw new BadRequestException('A daily summary requires between 1 and 500 lines.');
    for (const line of input.lines) {
      if (!/^B[A-Z0-9]{3}-\d+$/.test(line.documentId)) throw new BadRequestException('Daily summaries only accept receipt identifiers.');
      if (!/^[A-Z]{3}$/.test(line.currency)) throw new BadRequestException('Invalid currency.');
    }
  }
}
