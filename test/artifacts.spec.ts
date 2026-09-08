import { BadRequestException, ExecutionContext, NotFoundException } from '@nestjs/common';
import { ApiKey, ApiKeyEnvironment, ApiKeyStatus, Document, DocumentStatus, DocumentType } from '@prisma/client';
import { ApiKeysService } from '../src/api-keys/api-keys.service';
import { ApiKeyGuard } from '../src/api-keys/guards/api-key.guard';
import { ArtifactsController } from '../src/artifacts/artifacts.controller';
import { ArtifactsService } from '../src/artifacts/artifacts.service';
import { DocumentStorageService } from '../src/storage/document-storage.service';

describe('ArtifactsModule (GET /documents/:id/xml & GET /documents/:id/cdr)', () => {
  let artifactsService: ArtifactsService;
  let artifactsController: ArtifactsController;
  let mockPrisma: any;
  let mockStorage: jest.Mocked<DocumentStorageService>;
  let apiKeysService: ApiKeysService;
  let apiKeyGuard: ApiKeyGuard;
  let apiKeysDb: Map<string, ApiKey>;

  const companyA = 'cmp_alpha_111';
  const companyB = 'cmp_beta_222';

  const docAlpha: Document & { company: { ruc: string } } = {
    id: 'doc_alpha_001',
    companyId: companyA,
    type: DocumentType.INVOICE,
    series: 'F001',
    number: 123,
    customerDocumentType: '6',
    customerDocumentNumber: '20123456789',
    customerName: 'Alpha Client S.A.C.',
    currency: 'PEN',
    subtotal: 100 as any,
    tax: 18 as any,
    total: 118 as any,
    status: DocumentStatus.ACCEPTED,
    sunatCode: '0',
    sunatMessage: 'La Factura F001-123 ha sido aceptada',
    referenceDocumentId: null,
    adjustmentReasonCode: null,
    adjustmentReason: null,
    xmlArtifactId: 'art_xml_alpha_001',
    zipArtifactId: 'art_zip_alpha_001',
    cdrArtifactId: 'art_cdr_alpha_001',
    issuedAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    company: { ruc: '20100000001' },
  };

  const docAlphaNoCdr: Document & { company: { ruc: string } } = {
    ...docAlpha,
    id: 'doc_alpha_no_cdr',
    cdrArtifactId: null,
  };

  const docAlphaNoXml: Document & { company: { ruc: string } } = {
    ...docAlpha,
    id: 'doc_alpha_no_xml',
    xmlArtifactId: null,
  };

  const fakeXmlContent = Buffer.from('<?xml version="1.0"?><Invoice>test</Invoice>', 'utf8');
  const fakeCdrContent = Buffer.from('PK\x03\x04fake-cdr-zip-binary-data', 'utf8');

  beforeEach(() => {
    apiKeysDb = new Map<string, ApiKey>();

    mockPrisma = {
      company: {
        findUnique: jest.fn().mockImplementation(async ({ where }: any) => {
          if (where.id === companyA) return { id: companyA, ruc: '20100000001' };
          if (where.id === companyB) return { id: companyB, ruc: '20200000002' };
          return null;
        }),
      },
      apiKey: {
        create: jest.fn().mockImplementation(async ({ data }: any) => {
          const record: ApiKey = {
            id: `key_${apiKeysDb.size + 1}`,
            companyId: data.companyId,
            name: data.name,
            keyHash: data.keyHash,
            prefix: data.prefix,
            lastFour: data.lastFour,
            environment: data.environment || ApiKeyEnvironment.LIVE,
            status: data.status || ApiKeyStatus.ACTIVE,
            lastUsedAt: null,
            revokedAt: null,
            expiresAt: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          apiKeysDb.set(record.keyHash, record);
          return record;
        }),
        findUnique: jest.fn().mockImplementation(async ({ where }: any) => {
          if (where.keyHash) return apiKeysDb.get(where.keyHash) ?? null;
          return null;
        }),
        update: jest.fn().mockImplementation(async ({ where, data }: any) => {
          const key = [...apiKeysDb.values()].find((k) => k.id === where.id);
          if (key) Object.assign(key, data);
          return key;
        }),
      },
      document: {
        findFirst: jest.fn().mockImplementation(async ({ where }: any) => {
          if (where.id === 'doc_alpha_001' && where.companyId === companyA) {
            return docAlpha;
          }
          if (where.id === 'doc_alpha_no_cdr' && where.companyId === companyA) {
            return docAlphaNoCdr;
          }
          if (where.id === 'doc_alpha_no_xml' && where.companyId === companyA) {
            return docAlphaNoXml;
          }
          return null;
        }),
      },
    };

    mockStorage = {
      get: jest.fn().mockImplementation(async (comp: string, artifactId: string) => {
        if (artifactId === 'art_xml_alpha_001') {
          return {
            content: fakeXmlContent,
            metadata: {
              artifactId,
              companyId: comp,
              filename: 'art_xml_alpha_001.xml',
              type: 'xml',
              mimeType: 'application/xml',
              sizeBytes: fakeXmlContent.length,
              sha256: 'sha256_mock_xml_hash',
              createdAt: new Date().toISOString(),
            },
          };
        }
        if (artifactId === 'art_cdr_alpha_001') {
          return {
            content: fakeCdrContent,
            metadata: {
              artifactId,
              companyId: comp,
              filename: 'art_cdr_alpha_001.zip',
              type: 'cdr',
              mimeType: 'application/zip',
              sizeBytes: fakeCdrContent.length,
              sha256: 'sha256_mock_cdr_hash',
              createdAt: new Date().toISOString(),
            },
          };
        }
        throw new NotFoundException(`Artifact '${artifactId}' not found.`);
      }),
    } as unknown as jest.Mocked<DocumentStorageService>;

    artifactsService = new ArtifactsService(mockPrisma, mockStorage);
    artifactsController = new ArtifactsController(artifactsService);

    apiKeysService = new ApiKeysService(mockPrisma);
    apiKeyGuard = new ApiKeyGuard(apiKeysService);
  });

  describe('ArtifactsService', () => {
    describe('getXml', () => {
      it('should retrieve signed XML with correct metadata and derived SUNAT filename', async () => {
        const result = await artifactsService.getXml(companyA, 'doc_alpha_001');

        expect(result.buffer).toEqual(fakeXmlContent);
        expect(result.mimeType).toBe('application/xml');
        expect(result.filename).toBe('20100000001-01-F001-123.xml');
        expect(result.sizeBytes).toBe(fakeXmlContent.length);
        expect(result.sha256).toBe('sha256_mock_xml_hash');

        expect(mockPrisma.document.findFirst).toHaveBeenCalledWith({
          where: { id: 'doc_alpha_001', companyId: companyA },
          include: { company: { select: { ruc: true } } },
        });
        expect(mockStorage.get).toHaveBeenCalledWith(companyA, 'art_xml_alpha_001');
      });

      it('should throw NotFoundException when document does not exist', async () => {
        await expect(
          artifactsService.getXml(companyA, 'non_existent_doc'),
        ).rejects.toThrow(NotFoundException);
      });

      it('should enforce multi-tenant isolation (company B cannot access company A XML)', async () => {
        await expect(
          artifactsService.getXml(companyB, 'doc_alpha_001'),
        ).rejects.toThrow(NotFoundException);
      });

      it('should throw NotFoundException when xmlArtifactId is not yet available', async () => {
        await expect(
          artifactsService.getXml(companyA, 'doc_alpha_no_xml'),
        ).rejects.toThrow(/XML artifact is not yet available/);
      });

      it('should reject invalid or path traversal documentId with BadRequestException', async () => {
        await expect(
          artifactsService.getXml(companyA, '../etc/passwd'),
        ).rejects.toThrow(BadRequestException);

        await expect(
          artifactsService.getXml(companyA, 'doc/with/slashes'),
        ).rejects.toThrow(BadRequestException);
      });
    });

    describe('getCdr', () => {
      it('should retrieve CDR zip with correct metadata and derived SUNAT filename', async () => {
        const result = await artifactsService.getCdr(companyA, 'doc_alpha_001');

        expect(result.buffer).toEqual(fakeCdrContent);
        expect(result.mimeType).toBe('application/zip');
        expect(result.filename).toBe('R-20100000001-01-F001-123.zip');
        expect(result.sizeBytes).toBe(fakeCdrContent.length);
        expect(result.sha256).toBe('sha256_mock_cdr_hash');

        expect(mockPrisma.document.findFirst).toHaveBeenCalledWith({
          where: { id: 'doc_alpha_001', companyId: companyA },
          include: { company: { select: { ruc: true } } },
        });
        expect(mockStorage.get).toHaveBeenCalledWith(companyA, 'art_cdr_alpha_001');
      });

      it('should throw NotFoundException when document does not exist', async () => {
        await expect(
          artifactsService.getCdr(companyA, 'non_existent_doc'),
        ).rejects.toThrow(NotFoundException);
      });

      it('should enforce multi-tenant isolation (company B cannot access company A CDR)', async () => {
        await expect(
          artifactsService.getCdr(companyB, 'doc_alpha_001'),
        ).rejects.toThrow(NotFoundException);
      });

      it('should throw NotFoundException when cdrArtifactId is not yet available', async () => {
        await expect(
          artifactsService.getCdr(companyA, 'doc_alpha_no_cdr'),
        ).rejects.toThrow(/CDR artifact is not yet available/);
      });

      it('should reject invalid or path traversal documentId with BadRequestException', async () => {
        await expect(
          artifactsService.getCdr(companyA, '../../secret'),
        ).rejects.toThrow(BadRequestException);
      });
    });
  });

  describe('ArtifactsController', () => {
    let mockResponse: any;
    let headers: Record<string, string>;

    beforeEach(() => {
      headers = {};
      mockResponse = {
        setHeader: jest.fn().mockImplementation((key: string, val: string) => {
          headers[key.toLowerCase()] = val;
        }),
        send: jest.fn().mockImplementation((data: any) => data),
      };
    });

    it('GET /documents/:id/xml should send binary content with secure headers', async () => {
      await artifactsController.getXml('doc_alpha_001', companyA, mockResponse);

      expect(headers['content-type']).toBe('application/xml');
      expect(headers['content-disposition']).toBe('attachment; filename="20100000001-01-F001-123.xml"');
      expect(headers['content-length']).toBe(fakeXmlContent.length.toString());
      expect(headers['etag']).toBe('"sha256_mock_xml_hash"');
      expect(headers['x-content-type-options']).toBe('nosniff');
      expect(headers['cache-control']).toBe('private, max-age=86400');
      expect(mockResponse.send).toHaveBeenCalledWith(fakeXmlContent);
    });

    it('GET /documents/:id/cdr should send binary zip with secure headers', async () => {
      await artifactsController.getCdr('doc_alpha_001', companyA, mockResponse);

      expect(headers['content-type']).toBe('application/zip');
      expect(headers['content-disposition']).toBe('attachment; filename="R-20100000001-01-F001-123.zip"');
      expect(headers['content-length']).toBe(fakeCdrContent.length.toString());
      expect(headers['etag']).toBe('"sha256_mock_cdr_hash"');
      expect(headers['x-content-type-options']).toBe('nosniff');
      expect(headers['cache-control']).toBe('private, max-age=86400');
      expect(mockResponse.send).toHaveBeenCalledWith(fakeCdrContent);
    });

    it('should derive companyId strictly from ApiKeyGuard and enforce tenant boundary', async () => {
      const generatedA = await apiKeysService.create({
        companyId: companyA,
        name: 'Company A API Key',
        environment: 'live',
      });

      const reqA: any = {
        headers: {
          authorization: `Bearer ${generatedA.apiKey}`,
        },
      };

      const contextA = {
        switchToHttp: () => ({ getRequest: () => reqA }),
      } as unknown as ExecutionContext;

      const authorizedA = await apiKeyGuard.canActivate(contextA);
      expect(authorizedA).toBe(true);
      expect(reqA.companyId).toBe(companyA);

      // Company A can download XML
      await artifactsController.getXml('doc_alpha_001', reqA.companyId, mockResponse);
      expect(mockResponse.send).toHaveBeenCalledWith(fakeXmlContent);

      // Now create key for Company B
      const generatedB = await apiKeysService.create({
        companyId: companyB,
        name: 'Company B API Key',
        environment: 'live',
      });

      const reqB: any = {
        headers: {
          authorization: `Bearer ${generatedB.apiKey}`,
        },
      };

      const contextB = {
        switchToHttp: () => ({ getRequest: () => reqB }),
      } as unknown as ExecutionContext;

      const authorizedB = await apiKeyGuard.canActivate(contextB);
      expect(authorizedB).toBe(true);
      expect(reqB.companyId).toBe(companyB);

      // Company B attempts to download Company A's document -> 404
      await expect(
        artifactsController.getXml('doc_alpha_001', reqB.companyId, mockResponse),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
