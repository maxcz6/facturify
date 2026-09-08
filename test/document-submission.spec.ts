import { ConflictException, ServiceUnavailableException } from '@nestjs/common';
import { DocumentStatus, DocumentType, SunatEnvironment } from '@prisma/client';
import { DocumentSubmissionService } from '../src/processing/document-submission.service';
import { UnconfiguredSunatGateway } from '../src/sunat/unconfigured-sunat.gateway';

describe('DocumentSubmissionService', () => {
  const companyId = 'company-a';
  const document = {
    id: 'doc-1', companyId, type: DocumentType.INVOICE, series: 'F001', number: 1,
    status: DocumentStatus.PROCESSING, zipArtifactId: 'art_zip1',
    company: { ruc: '20123456789', environment: SunatEnvironment.BETA },
  };
  let prisma: any;
  let storage: any;
  let gateway: any;
  let service: DocumentSubmissionService;

  beforeEach(() => {
    prisma = {
      document: {
        findFirst: jest.fn().mockResolvedValue(document),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    storage = {
      get: jest.fn().mockResolvedValue({ metadata: { type: 'ZIP' }, content: Buffer.from('zip') }),
      save: jest.fn().mockResolvedValue({ id: 'art_cdr1' }),
      delete: jest.fn().mockResolvedValue(true),
    };
    gateway = { sendBill: jest.fn().mockResolvedValue({ cdrZip: Buffer.from('cdr'), requestId: 'req-1' }) };
    service = new DocumentSubmissionService(
      prisma, storage,
      { getDecryptedSolCredential: jest.fn().mockResolvedValue({ ruc: '20123456789', username: 'MODDATOS', password: 'secret', environment: 'BETA' }) } as any,
      { extractAndParse: jest.fn().mockReturnValue({ responseCode: '0', description: 'Aceptado', notes: [], status: 'ACCEPTED' }) } as any,
      gateway,
    );
  });

  it('submits the internal ZIP, stores the CDR and accepts the document', async () => {
    await expect(service.submit(companyId, document.id)).resolves.toMatchObject({
      documentId: document.id, status: DocumentStatus.ACCEPTED, sunatCode: '0',
    });
    expect(gateway.sendBill).toHaveBeenCalledWith(expect.objectContaining({
      fileName: '20123456789-01-F001-1.zip', environment: 'BETA',
    }));
    expect(storage.save).toHaveBeenCalledWith(companyId, 'CDR', Buffer.from('cdr'));
    expect(prisma.document.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ cdrArtifactId: 'art_cdr1', status: DocumentStatus.ACCEPTED }),
    }));
  });

  it('refuses documents that are not prepared', async () => {
    prisma.document.findFirst.mockResolvedValue({ ...document, status: DocumentStatus.PENDING });
    await expect(service.submit(companyId, document.id)).rejects.toBeInstanceOf(ConflictException);
    expect(gateway.sendBill).not.toHaveBeenCalled();
  });

  it('prevents duplicate concurrent submissions with an atomic status transition', async () => {
    prisma.document.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.submit(companyId, document.id)).rejects.toBeInstanceOf(ConflictException);
  });

  it('marks the document as error when transport fails', async () => {
    gateway.sendBill.mockRejectedValue(new Error('transport failed'));
    await expect(service.submit(companyId, document.id)).rejects.toThrow('transport failed');
    expect(prisma.document.updateMany).toHaveBeenLastCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: DocumentStatus.ERROR }),
    }));
  });

  it('uses an explicit safe failure until a concrete transport is configured', async () => {
    await expect(new UnconfiguredSunatGateway().sendBill({} as any)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
