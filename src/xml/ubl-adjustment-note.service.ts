import { BadRequestException, Injectable } from '@nestjs/common';
import { create } from 'xmlbuilder2';

export type AdjustmentKind = 'CREDIT_NOTE' | 'DEBIT_NOTE';
export interface AdjustmentNoteInput {
  kind: AdjustmentKind;
  documentId: string;
  issueDate: string;
  currency: string;
  referenceId: string;
  referenceTypeCode: '01' | '03';
  reasonCode: string;
  reason: string;
  supplier: { ruc: string; name: string };
  customer: { documentType: string; documentNumber: string; name: string };
  subtotal: string;
  taxAmount: string;
  total: string;
  lines: Array<{ id: number; description: string; quantity: string; unitValue: string; subtotal: string; taxAmount: string; unitPrice: string }>;
}

@Injectable()
export class UblAdjustmentNoteService {
  generateUnsigned(input: AdjustmentNoteInput): string {
    this.validate(input);
    const credit = input.kind === 'CREDIT_NOTE';
    const rootName = credit ? 'CreditNote' : 'DebitNote';
    const root = create({ version: '1.0', encoding: 'UTF-8' }).ele(rootName, {
      xmlns: `urn:oasis:names:specification:ubl:schema:xsd:${rootName}-2`,
      'xmlns:cac': 'urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2',
      'xmlns:cbc': 'urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2',
      'xmlns:ds': 'http://www.w3.org/2000/09/xmldsig#',
      'xmlns:ext': 'urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2',
    });
    root.ele('ext:UBLExtensions').ele('ext:UBLExtension').ele('ext:ExtensionContent').up().up().up();
    root.ele('cbc:UBLVersionID').txt('2.1').up();
    root.ele('cbc:CustomizationID').txt('2.0').up();
    root.ele('cbc:ID').txt(input.documentId).up();
    root.ele('cbc:IssueDate').txt(input.issueDate).up();
    root.ele('cbc:DocumentCurrencyCode').txt(input.currency).up();
    const discrepancy = root.ele('cac:DiscrepancyResponse');
    discrepancy.ele('cbc:ReferenceID').txt(input.referenceId).up();
    discrepancy.ele('cbc:ResponseCode').txt(input.reasonCode).up();
    discrepancy.ele('cbc:Description').txt(input.reason).up(); discrepancy.up();
    const billing = root.ele('cac:BillingReference').ele('cac:InvoiceDocumentReference');
    billing.ele('cbc:ID').txt(input.referenceId).up();
    billing.ele('cbc:DocumentTypeCode').txt(input.referenceTypeCode).up(); billing.up().up();
    const signature = root.ele('cac:Signature');
    signature.ele('cbc:ID').txt(`IDSign-${input.documentId}`).up();
    signature.ele('cac:SignatoryParty').ele('cac:PartyIdentification').ele('cbc:ID').txt(input.supplier.ruc).up().up().up();
    signature.ele('cac:DigitalSignatureAttachment').ele('cac:ExternalReference').ele('cbc:URI').txt(`#Signature-${input.documentId}`).up().up().up(); signature.up();
    this.party(root, 'cac:AccountingSupplierParty', '6', input.supplier.ruc, input.supplier.name);
    this.party(root, 'cac:AccountingCustomerParty', input.customer.documentType, input.customer.documentNumber, input.customer.name);
    this.tax(root, input.taxAmount, input.subtotal, input.currency);
    const monetary = root.ele(credit ? 'cac:LegalMonetaryTotal' : 'cac:RequestedMonetaryTotal');
    monetary.ele('cbc:PayableAmount', { currencyID: input.currency }).txt(input.total).up(); monetary.up();
    for (const line of input.lines) {
      const node = root.ele(credit ? 'cac:CreditNoteLine' : 'cac:DebitNoteLine');
      node.ele('cbc:ID').txt(String(line.id)).up();
      node.ele(credit ? 'cbc:CreditedQuantity' : 'cbc:DebitedQuantity', { unitCode: 'NIU' }).txt(line.quantity).up();
      node.ele('cbc:LineExtensionAmount', { currencyID: input.currency }).txt(line.subtotal).up();
      this.tax(node, line.taxAmount, line.subtotal, input.currency);
      node.ele('cac:Item').ele('cbc:Description').txt(line.description).up().up();
      node.ele('cac:Price').ele('cbc:PriceAmount', { currencyID: input.currency }).txt(line.unitValue).up().up();
      node.up();
    }
    return root.end({ prettyPrint: true });
  }

  private party(root: any, element: string, type: string, number: string, name: string): void {
    const party = root.ele(element).ele('cac:Party');
    party.ele('cac:PartyIdentification').ele('cbc:ID', { schemeID: type }).txt(number).up().up();
    party.ele('cac:PartyLegalEntity').ele('cbc:RegistrationName').txt(name).up().up(); party.up().up();
  }
  private tax(root: any, amount: string, taxable: string, currency: string): void {
    const tax = root.ele('cac:TaxTotal'); tax.ele('cbc:TaxAmount', { currencyID: currency }).txt(amount).up();
    const sub = tax.ele('cac:TaxSubtotal'); sub.ele('cbc:TaxableAmount', { currencyID: currency }).txt(taxable).up();
    sub.ele('cbc:TaxAmount', { currencyID: currency }).txt(amount).up();
    sub.ele('cac:TaxCategory').ele('cac:TaxScheme').ele('cbc:ID').txt('1000').up().ele('cbc:Name').txt('IGV').up().ele('cbc:TaxTypeCode').txt('VAT').up().up().up(); sub.up(); tax.up();
  }
  private validate(input: AdjustmentNoteInput): void {
    if (!/^[FB][A-Z0-9]{3}-\d+$/.test(input.documentId)) throw new BadRequestException('Invalid adjustment note identifier.');
    if (!/^[FB][A-Z0-9]{3}-\d+$/.test(input.referenceId)) throw new BadRequestException('Invalid referenced document identifier.');
    if (!/^\d{2,4}$/.test(input.reasonCode) || !input.reason.trim()) throw new BadRequestException('Adjustment reason is required.');
    if (!/^\d{11}$/.test(input.supplier.ruc) || input.lines.length === 0) throw new BadRequestException('Invalid adjustment note parties or lines.');
  }
}
