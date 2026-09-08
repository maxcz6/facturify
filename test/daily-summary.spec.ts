import { ConflictException, NotFoundException } from '@nestjs/common';
import { DailySummaryStatus, DocumentStatus, DocumentType, Prisma } from '@prisma/client';
import { DailySummaryService } from '../src/processing/daily-summary.service';

describe('DailySummaryService', () => {
  const companyId = 'company-a';
  const receipt = {
    id: 'receipt-1', companyId, type: DocumentType.RECEIPT, series: 'B001', number: 1,
    status: DocumentStatus.PENDING, customerDocumentType: '1', customerDocumentNumber: '12345678',
    currency: 'PEN', subtotal: new Prisma.Decimal(100), tax: new Prisma.Decimal(18), total: new Prisma.Decimal(118),
  };
  let prisma: any;
  let storage: any;
  let gateway: any;
  let service: DailySummaryService;

  beforeEach(() => {
    prisma = {
      company: { findUnique: jest.fn().mockResolvedValue({ id: companyId, ruc: '20123456789', businessName: 'Empresa SAC' }) },
      document: { findMany: jest.fn().mockResolvedValue([receipt]), updateMany: jest.fn() },
      dailySummary: {
        aggregate: jest.fn().mockResolvedValue({ _max: { sequence: null } }),
        create: jest.fn().mockResolvedValue({ id: 'summary-1', sequence: 1 }),
        update: jest.fn().mockResolvedValue({}),
        findFirst: jest.fn(),
      },
      $transaction: jest.fn(async (arg: any) => typeof arg === 'function' ? arg(prisma) : Promise.all(arg)),
    };
    storage = { save: jest.fn().mockResolvedValue({ id: 'art_zip' }), delete: jest.fn().mockResolvedValue(true) };
    gateway = {
      sendSummary: jest.fn().mockResolvedValue({ ticket: 'ticket_1', requestId: 'req-1' }),
      getStatus: jest.fn(),
    };
    service = new DailySummaryService(
      prisma,
      { generateUnsigned: jest.fn().mockReturnValue('<SummaryDocuments><ext:ExtensionContent/></SummaryDocuments>') } as any,
      { sign: jest.fn().mockReturnValue('<SummaryDocuments><ds:Signature/></SummaryDocuments>') } as any,
      { packSummaryXml: jest.fn().mockReturnValue({ zipFileName: '20123456789-RC-20260908-1.zip', content: Buffer.from('zip') }) } as any,
      storage,
      { getActiveSigningMaterial: jest.fn().mockResolvedValue({ pfx: Buffer.from('pfx'), password: 'secret' }) } as any,
      { extract: jest.fn().mockResolvedValue({ privateKeyPem: 'key', certificatePem: 'cert' }) } as any,
      { getDecryptedSolCredential: jest.fn().mockResolvedValue({ ruc: '20123456789', username: 'MODDATOS', password: 'secret', environment: 'BETA' }) } as any,
      gateway,
      { extractAndParse: jest.fn().mockReturnValue({ responseCode: '0', description: 'Aceptado', status: 'ACCEPTED', notes: [] }) } as any,
    );
  });

  it('selects only tenant receipts, creates the relation and persists the ticket', async () => {
    await expect(service.createAndSend(companyId, '2026-09-08')).resolves.toEqual({
      id: 'summary-1', status: DailySummaryStatus.SENT, ticket: 'ticket_1', documentCount: 1,
    });
    expect(prisma.document.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ companyId, type: DocumentType.RECEIPT, status: DocumentStatus.PENDING }),
      take: 501,
    }));
    expect(prisma.dailySummary.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ companyId, documents: { create: [{ documentId: receipt.id }] } }),
    }));
  });

  it('rejects empty dates and oversized batches', async () => {
    prisma.document.findMany.mockResolvedValue([]);
    await expect(service.createAndSend(companyId, '2026-09-08')).rejects.toBeInstanceOf(ConflictException);
    prisma.document.findMany.mockResolvedValue(Array.from({ length: 501 }, (_, i) => ({ ...receipt, id: `r-${i}` })));
    await expect(service.createAndSend(companyId, '2026-09-08')).rejects.toBeInstanceOf(ConflictException);
  });

  it('keeps a ticket pending when SUNAT returns status 98', async () => {
    prisma.dailySummary.findFirst.mockResolvedValue({ id: 'summary-1', companyId, status: DailySummaryStatus.SENT, ticket: 'ticket_1', documents: [] });
    gateway.getStatus.mockResolvedValue({ statusCode: '98', requestId: 'req-1' });
    await expect(service.refreshStatus(companyId, 'summary-1')).resolves.toEqual({ id: 'summary-1', status: DailySummaryStatus.SENT, pending: true });
    expect(storage.save).not.toHaveBeenCalled();
  });

  it('stores a CDR and atomically accepts only linked tenant documents', async () => {
    prisma.dailySummary.findFirst.mockResolvedValue({ id: 'summary-1', companyId, status: DailySummaryStatus.SENT, ticket: 'ticket_1', documents: [{ documentId: receipt.id }] });
    gateway.getStatus.mockResolvedValue({ statusCode: '0', cdrZip: Buffer.from('cdr'), requestId: 'req-1' });
    storage.save.mockResolvedValue({ id: 'art_cdr' });
    await expect(service.refreshStatus(companyId, 'summary-1')).resolves.toMatchObject({ status: DailySummaryStatus.ACCEPTED, pending: false });
    expect(prisma.document.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: { in: [receipt.id] }, companyId }, data: expect.objectContaining({ status: DocumentStatus.ACCEPTED }),
    }));
  });

  it('does not reveal summaries from another tenant', async () => {
    prisma.dailySummary.findFirst.mockResolvedValue(null);
    await expect(service.refreshStatus('company-b', 'summary-1')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.dailySummary.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'summary-1', companyId: 'company-b' } }));
  });
});
