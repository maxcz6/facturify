import { BadRequestException } from '@nestjs/common';
import { UblVoidedDocumentsService } from '../src/xml/ubl-voided-documents.service';

describe('UblVoidedDocumentsService', () => {
  const service = new UblVoidedDocumentsService();
  const input = {
    id: 'RA-20260908-1', referenceDate: '2026-09-08', issueDate: '2026-09-09',
    supplierRuc: '20123456789', supplierName: 'Empresa SAC',
    lines: [{ lineId: 1, documentTypeCode: '01' as const, series: 'F001', number: 10, reason: 'Error en los datos' }],
  };
  it('generates a void communication with the referenced document', () => {
    const xml = service.generateUnsigned(input);
    expect(xml).toContain('<cbc:ID>RA-20260908-1</cbc:ID>');
    expect(xml).toContain('<sac:DocumentSerialID>F001</sac:DocumentSerialID>');
    expect(xml).toContain('<sac:VoidReasonDescription>Error en los datos</sac:VoidReasonDescription>');
  });
  it('rejects empty communications and unsafe reasons', () => {
    expect(() => service.generateUnsigned({ ...input, lines: [] })).toThrow(BadRequestException);
    expect(() => service.generateUnsigned({ ...input, lines: [{ ...input.lines[0], reason: '' }] })).toThrow(BadRequestException);
  });
});
