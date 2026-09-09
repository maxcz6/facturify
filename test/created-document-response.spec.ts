import { DocumentStatus, DocumentType, Prisma } from '@prisma/client';
import { toCreatedDocumentResponse } from '../src/documents/dto/created-document-response.dto';

describe('Created document public response', () => {
  it('returns only the safe creation contract and serializes money exactly', () => {
    const response = toCreatedDocumentResponse({
      id: 'doc-1', companyId: 'company-secret', type: DocumentType.INVOICE,
      series: 'F001', number: 1, status: DocumentStatus.PENDING, currency: 'PEN',
      subtotal: new Prisma.Decimal('0.1'), tax: new Prisma.Decimal('0.02'), total: new Prisma.Decimal('0.12'),
      customerDocumentType: '6', customerDocumentNumber: '20123456789', customerName: 'Private Customer',
      referenceDocumentId: null, adjustmentReasonCode: null, adjustmentReason: null,
      sunatCode: null, sunatMessage: null,
      xmlArtifactId: 'xml-secret', zipArtifactId: 'zip-secret', cdrArtifactId: 'cdr-secret',
      issuedAt: new Date('2026-09-08T00:00:00.000Z'), createdAt: new Date('2026-09-08T00:00:00.000Z'),
      updatedAt: new Date('2026-09-08T00:00:00.000Z'),
    });

    expect(response).toEqual(expect.objectContaining({ subtotal: '0.10', tax: '0.02', total: '0.12' }));
    expect(Object.keys(response).sort()).toEqual([
      'createdAt', 'currency', 'id', 'issuedAt', 'number', 'series', 'status', 'subtotal', 'tax', 'total', 'type',
    ].sort());
    const serialized = JSON.stringify(response);
    expect(serialized).not.toContain('company-secret');
    expect(serialized).not.toContain('20123456789');
    expect(serialized).not.toContain('xml-secret');
  });
});
