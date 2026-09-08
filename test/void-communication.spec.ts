import { ConflictException, NotFoundException } from '@nestjs/common';
import { DocumentStatus, DocumentType, VoidCommunicationStatus } from '@prisma/client';
import { VoidCommunicationService } from '../src/processing/void-communication.service';

describe('VoidCommunicationService', () => {
  const companyId = 'company-a';
  const document = { id: 'doc-1', companyId, type: DocumentType.INVOICE, series: 'F001', number: 1, status: DocumentStatus.ACCEPTED, issuedAt: new Date('2026-09-08T10:00:00Z') };
  let prisma: any;
  let storage: any;
  let gateway: any;
  let lifecycle: any;
  let service: VoidCommunicationService;

  beforeEach(() => {
    prisma = {
      company: { findUnique: jest.fn().mockResolvedValue({ id: companyId, ruc: '20123456789', businessName: 'Empresa SAC' }) },
      document: { findMany: jest.fn().mockResolvedValue([document]), updateMany: jest.fn() },
      voidCommunication: {
        aggregate: jest.fn().mockResolvedValue({ _max: { sequence: null } }),
        create: jest.fn().mockResolvedValue({ id: 'void-1', sequence: 1 }),
        update: jest.fn().mockResolvedValue({}), findFirst: jest.fn(),
      },
      $transaction: jest.fn(async (arg: any) => typeof arg === 'function' ? arg(prisma) : Promise.all(arg)),
    };
    storage = { save: jest.fn().mockResolvedValue({ id: 'art-1' }), delete: jest.fn().mockResolvedValue(true) };
    gateway = { sendSummary: jest.fn().mockResolvedValue({ ticket: 'ticket-1' }), getStatus: jest.fn() };
    lifecycle = { assertTransition: jest.fn() };
    service = new VoidCommunicationService(
      prisma,
      { generateUnsigned: jest.fn().mockReturnValue('<VoidedDocuments><ext:ExtensionContent/></VoidedDocuments>') } as any,
      { sign: jest.fn().mockReturnValue('<VoidedDocuments><ds:Signature/></VoidedDocuments>') } as any,
      { packVoidXml: jest.fn().mockReturnValue({ zipFileName: '20123456789-RA-20260908-1.zip', content: Buffer.from('zip') }) } as any,
      storage,
      { getActiveSigningMaterial: jest.fn().mockResolvedValue({ pfx: Buffer.from('pfx'), password: 'secret' }) } as any,
      { extract: jest.fn().mockResolvedValue({ privateKeyPem: 'key', certificatePem: 'cert' }) } as any,
      { getDecryptedSolCredential: jest.fn().mockResolvedValue({ ruc: '20123456789', username: 'MODDATOS', password: 'secret', environment: 'BETA' }) } as any,
      gateway,
      { extractAndParse: jest.fn().mockReturnValue({ status: 'ACCEPTED', responseCode: '0', description: 'Aceptado' }) } as any,
      lifecycle,
    );
  });

  it('creates a tenant-scoped RA and persists its ticket', async () => {
    await expect(service.createAndSend(companyId, '2026-09-08', [{ documentId: document.id, reason: 'Error de datos' }])).resolves.toMatchObject({
      id: 'void-1', status: VoidCommunicationStatus.SENT, ticket: 'ticket-1', documentCount: 1,
    });
    expect(prisma.document.findMany).toHaveBeenCalledWith({ where: { id: { in: [document.id] }, companyId } });
    expect(gateway.sendSummary).toHaveBeenCalled();
  });

  it('rejects receipts and documents not accepted by SUNAT', async () => {
    prisma.document.findMany.mockResolvedValue([{ ...document, type: DocumentType.RECEIPT }]);
    await expect(service.createAndSend(companyId, '2026-09-08', [{ documentId: document.id, reason: 'Error de datos' }])).rejects.toBeInstanceOf(ConflictException);
    prisma.document.findMany.mockResolvedValue([{ ...document, status: DocumentStatus.PENDING }]);
    await expect(service.createAndSend(companyId, '2026-09-08', [{ documentId: document.id, reason: 'Error de datos' }])).rejects.toBeInstanceOf(ConflictException);
  });

  it('does not reveal or include another tenant document', async () => {
    prisma.document.findMany.mockResolvedValue([]);
    await expect(service.createAndSend('company-b', '2026-09-08', [{ documentId: document.id, reason: 'Error de datos' }])).rejects.toBeInstanceOf(NotFoundException);
  });

  it('keeps status SENT while SUNAT reports ticket 98', async () => {
    prisma.voidCommunication.findFirst.mockResolvedValue({ id: 'void-1', companyId, status: VoidCommunicationStatus.SENT, ticket: 'ticket-1', documents: [] });
    gateway.getStatus.mockResolvedValue({ statusCode: '98' });
    await expect(service.refreshStatus(companyId, 'void-1')).resolves.toEqual({ id: 'void-1', status: VoidCommunicationStatus.SENT, pending: true });
  });

  it('requires lifecycle confirmation before atomically setting VOIDED', async () => {
    prisma.voidCommunication.findFirst.mockResolvedValue({ id: 'void-1', companyId, status: VoidCommunicationStatus.SENT, ticket: 'ticket-1', documents: [{ documentId: document.id }] });
    gateway.getStatus.mockResolvedValue({ statusCode: '0', cdrZip: Buffer.from('cdr') });
    storage.save.mockResolvedValue({ id: 'cdr-1' });
    await service.refreshStatus(companyId, 'void-1');
    expect(lifecycle.assertTransition).toHaveBeenCalledWith(DocumentStatus.ACCEPTED, DocumentStatus.VOIDED, { hasVoidConfirmation: true });
    expect(prisma.document.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: DocumentStatus.VOIDED }) }));
  });

  it('does not change documents when SUNAT rejects the communication', async () => {
    prisma.voidCommunication.findFirst.mockResolvedValue({ id: 'void-1', companyId, status: VoidCommunicationStatus.SENT, ticket: 'ticket-1', documents: [{ documentId: document.id }] });
    gateway.getStatus.mockResolvedValue({ statusCode: '0', cdrZip: Buffer.from('cdr') });
    (service as any).cdr.extractAndParse.mockReturnValue({ status: 'REJECTED', responseCode: '2001', description: 'Rechazado' });
    await service.refreshStatus(companyId, 'void-1');
    expect(prisma.document.updateMany).not.toHaveBeenCalled();
  });
});
