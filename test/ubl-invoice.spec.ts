import { BadRequestException } from '@nestjs/common';
import { UblInvoiceService } from '../src/xml/ubl-invoice.service';

describe('UblInvoiceService', () => {
  const service = new UblInvoiceService();
  const input = {
    documentId: 'F001-1',
    issueDate: '2026-09-07',
    invoiceTypeCode: '01' as const,
    currency: 'PEN',
    supplier: { documentType: '6', documentNumber: '20123456789', legalName: 'Facturify & Asociados' },
    customer: { documentType: '6', documentNumber: '20987654321', legalName: 'Cliente <Demo>' },
    subtotal: '100.00',
    taxAmount: '18.00',
    total: '118.00',
    lines: [{
      id: 1,
      description: 'Servicio de integración',
      quantity: '1.0000',
      unitValue: '100.00',
      lineExtensionAmount: '100.00',
      taxAmount: '18.00',
      totalAmount: '118.00',
    }],
  };

  it('generates an unsigned UBL 2.1 invoice with SUNAT identifiers', () => {
    const xml = service.generateUnsigned(input);
    expect(xml).toContain('<cbc:UBLVersionID>2.1</cbc:UBLVersionID>');
    expect(xml).toContain('<cbc:InvoiceTypeCode');
    expect(xml).toContain('>01</cbc:InvoiceTypeCode>');
    expect(xml).toContain('<cbc:ID>F001-1</cbc:ID>');
    expect(xml).toContain('currencyID="PEN">18.00</cbc:TaxAmount>');
  });

  it('escapes user-controlled XML text', () => {
    const xml = service.generateUnsigned(input);
    expect(xml).toContain('Facturify &amp; Asociados');
    expect(xml).toContain('Cliente &lt;Demo&gt;');
  });

  it('rejects an invalid series and correlativo', () => {
    expect(() => service.generateUnsigned({ ...input, documentId: 'INVALID' }))
      .toThrow(BadRequestException);
  });
});
