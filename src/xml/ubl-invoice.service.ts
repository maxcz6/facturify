import { BadRequestException, Injectable } from '@nestjs/common';
import { create } from 'xmlbuilder2';
import { UblInvoiceInput } from './ubl-invoice.types';

const NS = {
  default: 'urn:oasis:names:specification:ubl:schema:xsd:Invoice-2',
  cac: 'urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2',
  cbc: 'urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2',
  ds: 'http://www.w3.org/2000/09/xmldsig#',
  ext: 'urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2',
};

@Injectable()
export class UblInvoiceService {
  generateUnsigned(input: UblInvoiceInput): string {
    this.validate(input);

    const root = create({ version: '1.0', encoding: 'UTF-8' })
      .ele('Invoice', {
        xmlns: NS.default,
        'xmlns:cac': NS.cac,
        'xmlns:cbc': NS.cbc,
        'xmlns:ds': NS.ds,
        'xmlns:ext': NS.ext,
      });

    root.ele('ext:UBLExtensions').ele('ext:UBLExtension').ele('ext:ExtensionContent').up().up().up();
    root.ele('cbc:UBLVersionID').txt('2.1').up();
    root.ele('cbc:CustomizationID').txt('2.0').up();
    root.ele('cbc:ID').txt(input.documentId).up();
    root.ele('cbc:IssueDate').txt(input.issueDate).up();
    root.ele('cbc:InvoiceTypeCode', {
      listAgencyName: 'PE:SUNAT',
      listName: 'Tipo de Documento',
      listURI: 'urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo01',
    }).txt(input.invoiceTypeCode).up();
    root.ele('cbc:DocumentCurrencyCode', {
      listID: 'ISO 4217 Alpha',
      listName: 'Currency',
      listAgencyName: 'United Nations Economic Commission for Europe',
    }).txt(input.currency).up();

    this.addSignatureReference(root, input);
    this.addParty(root, 'cac:AccountingSupplierParty', input.supplier);
    this.addParty(root, 'cac:AccountingCustomerParty', input.customer);
    this.addTaxTotal(root, input.taxAmount, input.subtotal, input.currency);

    const monetary = root.ele('cac:LegalMonetaryTotal');
    monetary.ele('cbc:LineExtensionAmount', { currencyID: input.currency }).txt(input.subtotal).up();
    monetary.ele('cbc:TaxInclusiveAmount', { currencyID: input.currency }).txt(input.total).up();
    monetary.ele('cbc:PayableAmount', { currencyID: input.currency }).txt(input.total).up();
    monetary.up();

    for (const line of input.lines) this.addLine(root, line, input.currency);
    return root.end({ prettyPrint: true });
  }

  private addSignatureReference(root: any, input: UblInvoiceInput): void {
    const signature = root.ele('cac:Signature');
    signature.ele('cbc:ID').txt(`IDSign-${input.documentId}`).up();
    const party = signature.ele('cac:SignatoryParty');
    party.ele('cac:PartyIdentification').ele('cbc:ID').txt(input.supplier.documentNumber).up().up();
    party.ele('cac:PartyName').ele('cbc:Name').txt(input.supplier.legalName).up().up();
    party.up();
    signature.ele('cac:DigitalSignatureAttachment')
      .ele('cac:ExternalReference').ele('cbc:URI').txt(`#signature-${input.documentId}`).up().up().up();
    signature.up();
  }

  private addParty(root: any, element: string, partyInput: UblInvoiceInput['supplier']): void {
    const container = root.ele(element);
    const party = container.ele('cac:Party');
    const identification = party.ele('cac:PartyIdentification');
    identification.ele('cbc:ID', {
      schemeID: partyInput.documentType,
      schemeName: 'Documento de Identidad',
      schemeAgencyName: 'PE:SUNAT',
      schemeURI: 'urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo06',
    }).txt(partyInput.documentNumber).up();
    identification.up();
    party.ele('cac:PartyLegalEntity').ele('cbc:RegistrationName').txt(partyInput.legalName).up().up();
    party.up();
    container.up();
  }

  private addTaxTotal(root: any, tax: string, taxable: string, currency: string): void {
    const total = root.ele('cac:TaxTotal');
    total.ele('cbc:TaxAmount', { currencyID: currency }).txt(tax).up();
    const subtotal = total.ele('cac:TaxSubtotal');
    subtotal.ele('cbc:TaxableAmount', { currencyID: currency }).txt(taxable).up();
    subtotal.ele('cbc:TaxAmount', { currencyID: currency }).txt(tax).up();
    const category = subtotal.ele('cac:TaxCategory');
    const scheme = category.ele('cac:TaxScheme');
    scheme.ele('cbc:ID').txt('1000').up();
    scheme.ele('cbc:Name').txt('IGV').up();
    scheme.ele('cbc:TaxTypeCode').txt('VAT').up();
    scheme.up();
    category.up();
    subtotal.up();
    total.up();
  }

  private addLine(root: any, line: UblInvoiceInput['lines'][number], currency: string): void {
    const invoiceLine = root.ele('cac:InvoiceLine');
    invoiceLine.ele('cbc:ID').txt(String(line.id)).up();
    invoiceLine.ele('cbc:InvoicedQuantity', { unitCode: line.unitCode ?? 'NIU' }).txt(line.quantity).up();
    invoiceLine.ele('cbc:LineExtensionAmount', { currencyID: currency }).txt(line.lineExtensionAmount).up();
    invoiceLine.ele('cac:PricingReference').ele('cac:AlternativeConditionPrice')
      .ele('cbc:PriceAmount', { currencyID: currency }).txt(line.totalAmount).up()
      .ele('cbc:PriceTypeCode').txt('01').up().up().up();
    this.addTaxTotal(invoiceLine, line.taxAmount, line.lineExtensionAmount, currency);
    invoiceLine.ele('cac:Item').ele('cbc:Description').txt(line.description).up().up();
    invoiceLine.ele('cac:Price').ele('cbc:PriceAmount', { currencyID: currency }).txt(line.unitValue).up().up();
    invoiceLine.up();
  }

  private validate(input: UblInvoiceInput): void {
    if (!/^[FB][A-Z0-9]{3}-\d+$/.test(input.documentId)) {
      throw new BadRequestException('Document ID must use a valid SUNAT series and correlativo.');
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.issueDate)) {
      throw new BadRequestException('Issue date must use YYYY-MM-DD format.');
    }
    if (!/^[A-Z]{3}$/.test(input.currency)) {
      throw new BadRequestException('Currency must be an ISO 4217 alpha code.');
    }
    if (input.lines.length === 0) throw new BadRequestException('At least one invoice line is required.');
  }
}
