import { DocumentStatus, DocumentType, Prisma } from '@prisma/client';
import { DocumentPreparationService } from '../src/processing/document-preparation.service';

describe('DocumentPreparationService', () => {
  const document = {
    id: 'doc_1',
    companyId: 'cmp_1',
    type: DocumentType.INVOICE,
    series: 'F001',
    number: 1,
    currency: 'PEN',
    customerDocumentType: '6',
    customerDocumentNumber: '20987654321',
    customerName: 'Cliente SAC',
    subtotal: new Prisma.Decimal('100'),
    tax: new Prisma.Decimal('18'),
    total: new Prisma.Decimal('118'),
    status: DocumentStatus.PENDING,
    issuedAt: new Date('2026-09-08T12:00:00Z'),
    createdAt: new Date('2026-09-08T12:00:00Z'),
    company: { ruc: '20123456789', businessName: 'Emisor SAC' },
    items: [{
      description: 'Servicio', quantity: new Prisma.Decimal(1), unitPrice: new Prisma.Decimal(100),
      subtotal: new Prisma.Decimal(100), tax: new Prisma.Decimal(18), total: new Prisma.Decimal(118),
    }],
  };

  function setup() {
    const prisma = {
      document: {
        findFirst: jest.fn().mockResolvedValue(document),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        update: jest.fn().mockResolvedValue(document),
      },
    } as any;
    const ubl = { generateUnsigned: jest.fn().mockReturnValue('<Invoice><ext:ExtensionContent/></Invoice>') } as any;
    const signatures = { sign: jest.fn().mockReturnValue('<Invoice><ds:Signature>ok</ds:Signature></Invoice>') } as any;
    const zip = { packSignedXml: jest.fn().mockReturnValue({ zipFileName: 'doc.zip', content: Buffer.from('zip') }) } as any;
    const storage = {
      save: jest.fn()
        .mockResolvedValueOnce({ id: 'art_xml', type: 'XML' })
        .mockResolvedValueOnce({ id: 'art_zip', type: 'ZIP' }),
      delete: jest.fn().mockResolvedValue(true),
    } as any;
    return { service: new DocumentPreparationService(prisma, ubl, signatures, zip, storage), prisma, ubl, storage };
  }

  it('locks, generates, signs, stores and links artifacts', async () => {
    const { service, prisma, ubl, storage } = setup();
    const result = await service.prepare('cmp_1', 'doc_1', {
      privateKeyPem: 'key', certificatePem: 'cert', signatureId: 'signature-F001-1',
    });
    expect(prisma.document.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ companyId: 'cmp_1', status: DocumentStatus.PENDING }),
    }));
    expect(ubl.generateUnsigned).toHaveBeenCalled();
    expect(storage.save).toHaveBeenNthCalledWith(1, 'cmp_1', 'XML', expect.any(String));
    expect(storage.save).toHaveBeenNthCalledWith(2, 'cmp_1', 'ZIP', expect.any(Buffer));
    expect(result.xml.id).toBe('art_xml');
  });

  it('marks the document ERROR when preparation fails', async () => {
    const { service, prisma, ubl } = setup();
    ubl.generateUnsigned.mockImplementation(() => { throw new Error('UBL failed'); });
    await expect(service.prepare('cmp_1', 'doc_1', {
      privateKeyPem: 'key', certificatePem: 'cert', signatureId: 'signature-F001-1',
    })).rejects.toThrow('UBL failed');
    expect(prisma.document.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: DocumentStatus.ERROR }),
    }));
  });
});
