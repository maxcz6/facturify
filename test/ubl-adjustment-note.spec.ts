import { UblAdjustmentNoteService } from '../src/xml/ubl-adjustment-note.service';

describe('UblAdjustmentNoteService', () => {
  const service = new UblAdjustmentNoteService();
  const input = {
    kind: 'CREDIT_NOTE' as const, documentId: 'F001-2', issueDate: '2026-09-08', currency: 'PEN',
    referenceId: 'F001-1', referenceTypeCode: '01' as const, reasonCode: '01', reason: 'Anulacion',
    supplier: { ruc: '20123456789', name: 'Empresa SAC' },
    customer: { documentType: '6', documentNumber: '20987654321', name: 'Cliente SAC' },
    subtotal: '100.00', taxAmount: '18.00', total: '118.00',
    lines: [{ id: 1, description: 'Producto', quantity: '1.0000', unitValue: '100.00', subtotal: '100.00', taxAmount: '18.00', unitPrice: '118.00' }],
  };
  it('generates a credit note with discrepancy and credited quantity', () => {
    const xml = service.generateUnsigned(input);
    expect(xml).toContain('<CreditNote');
    expect(xml).toContain('<cbc:ResponseCode>01</cbc:ResponseCode>');
    expect(xml).toContain('<cbc:CreditedQuantity unitCode="NIU">1.0000</cbc:CreditedQuantity>');
    expect(xml).toContain('<cbc:DocumentTypeCode>01</cbc:DocumentTypeCode>');
  });
  it('generates a debit note with requested total and debited quantity', () => {
    const xml = service.generateUnsigned({ ...input, kind: 'DEBIT_NOTE' });
    expect(xml).toContain('<DebitNote');
    expect(xml).toContain('<cac:RequestedMonetaryTotal>');
    expect(xml).toContain('<cbc:DebitedQuantity unitCode="NIU">1.0000</cbc:DebitedQuantity>');
  });
});
