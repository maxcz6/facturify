import { BadRequestException } from '@nestjs/common';
import { UblDailySummaryService } from '../src/xml/ubl-daily-summary.service';

describe('UblDailySummaryService', () => {
  const service = new UblDailySummaryService();
  const input = {
    id: 'RC-20260908-1', referenceDate: '2026-09-08', issueDate: '2026-09-09',
    supplierRuc: '20123456789', supplierName: 'Empresa SAC',
    lines: [{ lineId: 1, documentId: 'B001-10', customerDocumentType: '1', customerDocumentNumber: '12345678', currency: 'PEN', taxableAmount: '100.00', taxAmount: '18.00', totalAmount: '118.00' }],
  };

  it('generates a SUNAT daily summary with receipt totals', () => {
    const xml = service.generateUnsigned(input);
    expect(xml).toContain('<cbc:ID>RC-20260908-1</cbc:ID>');
    expect(xml).toContain('<cbc:DocumentTypeCode>03</cbc:DocumentTypeCode>');
    expect(xml).toContain('<sac:TotalAmount currencyID="PEN">118.00</sac:TotalAmount>');
    expect(xml).toContain('<ext:ExtensionContent/>');
  });

  it('rejects non-receipt lines and empty summaries', () => {
    expect(() => service.generateUnsigned({ ...input, lines: [] })).toThrow(BadRequestException);
    expect(() => service.generateUnsigned({ ...input, lines: [{ ...input.lines[0], documentId: 'F001-1' }] })).toThrow(BadRequestException);
  });
});
