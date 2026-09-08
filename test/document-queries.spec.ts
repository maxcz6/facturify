import {
  BadRequestException,
  ExecutionContext,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  ApiKey,
  ApiKeyEnvironment,
  ApiKeyStatus,
  Document,
  DocumentItem,
  DocumentStatus,
  DocumentType,
  Prisma,
} from '@prisma/client';
import { ApiKeysService } from '../src/api-keys/api-keys.service';
import { ApiKeyGuard } from '../src/api-keys/guards/api-key.guard';
import { DocumentQueriesController } from '../src/document-queries/document-queries.controller';
import { DocumentQueriesService } from '../src/document-queries/document-queries.service';

describe('DocumentQueriesModule (GET /documents/:id & GET /documents with Cursor Pagination)', () => {
  let queriesService: DocumentQueriesService;
  let queriesController: DocumentQueriesController;
  let apiKeysService: ApiKeysService;
  let apiKeyGuard: ApiKeyGuard;

  let mockPrisma: any;
  let apiKeysDb: Map<string, ApiKey>;
  let documentsDb: Map<string, Document & { items: DocumentItem[] }>;

  const companyA = 'cmp_alpha_111';
  const companyB = 'cmp_beta_222';

  beforeEach(() => {
    apiKeysDb = new Map<string, ApiKey>();
    documentsDb = new Map();

    // Mock Prisma setup
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
          for (const doc of documentsDb.values()) {
            if (where.id && doc.id !== where.id) continue;
            if (where.companyId && doc.companyId !== where.companyId) continue;
            return doc;
          }
          return null;
        }),
        findMany: jest.fn().mockImplementation(async (args: any) => {
          const { where, take, cursor, skip } = args;
          let list = [...documentsDb.values()].filter((doc) => {
            if (where.companyId && doc.companyId !== where.companyId) return false;
            if (where.status && doc.status !== where.status) return false;
            if (where.type && doc.type !== where.type) return false;
            if (where.series && doc.series !== where.series) return false;
            if (where.createdAt?.gte && doc.createdAt < where.createdAt.gte) return false;
            if (where.createdAt?.lte && doc.createdAt > where.createdAt.lte) return false;
            return true;
          });

          // Sort by createdAt desc, then id desc
          list.sort((a, b) => {
            const timeDiff = b.createdAt.getTime() - a.createdAt.getTime();
            if (timeDiff !== 0) return timeDiff;
            return b.id.localeCompare(a.id);
          });

          // Handle cursor pagination
          if (cursor?.id) {
            const index = list.findIndex((d) => d.id === cursor.id);
            if (index !== -1) {
              list = list.slice(index + (skip ?? 0));
            }
          }

          if (take !== undefined) {
            list = list.slice(0, take);
          }

          return list;
        }),
      },
    };

    queriesService = new DocumentQueriesService(mockPrisma);
    queriesController = new DocumentQueriesController(queriesService);

    apiKeysService = new ApiKeysService(mockPrisma);
    apiKeyGuard = new ApiKeyGuard(apiKeysService);
  });

  function seedDocument(
    overrides: Partial<Document> & { id: string; companyId: string },
    itemsCount = 1,
  ): Document & { items: DocumentItem[] } {
    const items: DocumentItem[] = [];
    for (let i = 1; i <= itemsCount; i++) {
      items.push({
        id: `item_${overrides.id}_${i}`,
        documentId: overrides.id,
        description: `Item ${i} for ${overrides.id}`,
        quantity: new Prisma.Decimal(i),
        unitPrice: new Prisma.Decimal(100),
        subtotal: new Prisma.Decimal(100 * i),
        tax: new Prisma.Decimal(18 * i),
        total: new Prisma.Decimal(118 * i),
      });
    }

    const doc: Document & { items: DocumentItem[] } = {
      id: overrides.id,
      companyId: overrides.companyId,
      type: overrides.type ?? DocumentType.INVOICE,
      series: overrides.series ?? 'F001',
      number: overrides.number ?? 1,
      customerDocumentType: overrides.customerDocumentType ?? '6',
      customerDocumentNumber: overrides.customerDocumentNumber ?? '20123456789',
      customerName: overrides.customerName ?? 'Cliente S.A.C.',
      currency: overrides.currency ?? 'PEN',
      subtotal: overrides.subtotal ?? new Prisma.Decimal(100),
      tax: overrides.tax ?? new Prisma.Decimal(18),
      total: overrides.total ?? new Prisma.Decimal(118),
      status: overrides.status ?? DocumentStatus.ACCEPTED,
      sunatCode: overrides.sunatCode ?? '0',
      sunatMessage: overrides.sunatMessage ?? 'Aceptada',
      referenceDocumentId: 'referenceDocumentId' in overrides ? overrides.referenceDocumentId! : null,
      adjustmentReasonCode: 'adjustmentReasonCode' in overrides ? overrides.adjustmentReasonCode! : null,
      adjustmentReason: 'adjustmentReason' in overrides ? overrides.adjustmentReason! : null,
      xmlArtifactId: 'xmlArtifactId' in overrides ? overrides.xmlArtifactId! : 'art_xml_123',
      zipArtifactId: 'zipArtifactId' in overrides ? overrides.zipArtifactId! : 'art_zip_456',
      cdrArtifactId: 'cdrArtifactId' in overrides ? overrides.cdrArtifactId! : 'art_cdr_789',
      issuedAt: overrides.issuedAt ?? new Date('2026-09-08T10:00:00.000Z'),
      createdAt: overrides.createdAt ?? new Date('2026-09-08T10:00:00.000Z'),
      updatedAt: overrides.updatedAt ?? new Date('2026-09-08T10:00:00.000Z'),
      items,
    };

    documentsDb.set(doc.id, doc);
    return doc;
  }

  describe('Authorization with ApiKeyGuard', () => {
    function createMockContext(authHeader?: string): ExecutionContext {
      const req: any = {
        headers: authHeader ? { authorization: authHeader } : {},
      };
      return {
        switchToHttp: () => ({ getRequest: () => req }),
      } as unknown as ExecutionContext;
    }

    it('should reject requests with missing Authorization header', async () => {
      const ctx = createMockContext();
      await expect(apiKeyGuard.canActivate(ctx)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should reject requests with JWT tokens instead of fact_live_ API keys', async () => {
      const ctx = createMockContext('Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.xyz');
      await expect(apiKeyGuard.canActivate(ctx)).rejects.toThrow(
        /API Keys must start with fact_live_ or fact_test_/,
      );
    });

    it('should reject invalid or non-existent API Keys', async () => {
      const ctx = createMockContext('Bearer fact_live_non_existent_key_1234567890');
      await expect(apiKeyGuard.canActivate(ctx)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should allow active Bearer fact_live_ key and attach companyId', async () => {
      const createdKey = await apiKeysService.create({
        companyId: companyA,
        name: 'Alpha Production Key',
        environment: 'live',
      });

      const ctx = createMockContext(`Bearer ${createdKey.apiKey}`);
      const allowed = await apiKeyGuard.canActivate(ctx);
      expect(allowed).toBe(true);

      const req = ctx.switchToHttp().getRequest();
      expect(req.companyId).toBe(companyA);
    });
  });

  describe('GET /documents/:id (Single Document Query)', () => {
    it('should return document with items, numeric amounts and artifact boolean flags', async () => {
      seedDocument({
        id: 'doc_alpha_1',
        companyId: companyA,
        xmlArtifactId: 'art_xml_alpha',
        zipArtifactId: 'art_zip_alpha',
        cdrArtifactId: 'art_cdr_alpha',
      });

      const response = await queriesController.findOne('doc_alpha_1', companyA);

      expect(response.id).toBe('doc_alpha_1');
      expect(response.companyId).toBe(companyA);
      expect(response.type).toBe(DocumentType.INVOICE);
      expect(response.series).toBe('F001');
      expect(response.number).toBe(1);
      expect(response.status).toBe(DocumentStatus.ACCEPTED);
      expect(response.subtotal).toBe(100);
      expect(response.tax).toBe(18);
      expect(response.total).toBe(118);

      // Artifact availability booleans
      expect(response.xmlAvailable).toBe(true);
      expect(response.zipAvailable).toBe(true);
      expect(response.cdrAvailable).toBe(true);

      // Items
      expect(response.items.length).toBe(1);
      expect(response.items[0].description).toBe('Item 1 for doc_alpha_1');
      expect(response.items[0].unitPrice).toBe(100);
      expect(response.items[0].total).toBe(118);
    });

    it('should accurately report boolean false when artifacts are not available', async () => {
      seedDocument({
        id: 'doc_pending_artifacts',
        companyId: companyA,
        xmlArtifactId: null,
        zipArtifactId: null,
        cdrArtifactId: null,
      });

      const response = await queriesController.findOne('doc_pending_artifacts', companyA);

      expect(response.xmlAvailable).toBe(false);
      expect(response.zipAvailable).toBe(false);
      expect(response.cdrAvailable).toBe(false);
    });

    it('should throw NotFoundException if document does not exist', async () => {
      await expect(
        queriesController.findOne('doc_non_existent', companyA),
      ).rejects.toThrow(NotFoundException);
    });

    it('should reject invalid or path traversal document ID with BadRequestException', async () => {
      await expect(
        queriesController.findOne('../../etc/passwd', companyA),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('Ausencia de campos sensibles (Zero Sensitive Fields)', () => {
    it('should never expose internal artifact IDs, storage paths or credentials in responses', async () => {
      seedDocument({
        id: 'doc_sensitive_check',
        companyId: companyA,
        xmlArtifactId: 'internal_secret_xml_artifact_id_123',
        zipArtifactId: 'internal_secret_zip_artifact_id_456',
        cdrArtifactId: 'internal_secret_cdr_artifact_id_789',
      });

      const singleDoc = await queriesController.findOne('doc_sensitive_check', companyA);

      const forbiddenKeys = [
        'xmlArtifactId',
        'zipArtifactId',
        'cdrArtifactId',
        'storagePath',
        'filePath',
        'solUsername',
        'solPassword',
        'encryptedPassword',
        'passwordIv',
        'passwordAuthTag',
      ];

      for (const key of forbiddenKeys) {
        expect(singleDoc).not.toHaveProperty(key);
      }

      const listResponse = await queriesController.findMany(companyA, {});
      for (const item of listResponse.items) {
        for (const key of forbiddenKeys) {
          expect(item).not.toHaveProperty(key);
        }
      }
    });
  });

  describe('Aislamiento multiempresa (Multi-tenant Isolation)', () => {
    it('should prevent Company B from accessing Company A document by ID (returns 404)', async () => {
      seedDocument({
        id: 'doc_company_a_private',
        companyId: companyA,
      });

      // Company A can access it
      const docA = await queriesController.findOne('doc_company_a_private', companyA);
      expect(docA.id).toBe('doc_company_a_private');

      // Company B requesting Company A document must receive 404 (not reveal existence)
      await expect(
        queriesController.findOne('doc_company_a_private', companyB),
      ).rejects.toThrow(NotFoundException);
    });

    it('should strictly isolate document listing between companies', async () => {
      seedDocument({ id: 'doc_alpha_list_1', companyId: companyA });
      seedDocument({ id: 'doc_alpha_list_2', companyId: companyA });
      seedDocument({ id: 'doc_beta_list_1', companyId: companyB });

      const listA = await queriesController.findMany(companyA, {});
      expect(listA.items.length).toBe(2);
      expect(listA.items.map((i) => i.id)).toEqual(
        expect.arrayContaining(['doc_alpha_list_1', 'doc_alpha_list_2']),
      );
      expect(listA.items.map((i) => i.id)).not.toContain('doc_beta_list_1');

      const listB = await queriesController.findMany(companyB, {});
      expect(listB.items.length).toBe(1);
      expect(listB.items[0].id).toBe('doc_beta_list_1');
    });
  });

  describe('Filtros seguros (Safe Filters)', () => {
    beforeEach(() => {
      seedDocument({
        id: 'doc_filt_1',
        companyId: companyA,
        status: DocumentStatus.ACCEPTED,
        type: DocumentType.INVOICE,
        series: 'F001',
        createdAt: new Date('2026-09-01T12:00:00.000Z'),
      });
      seedDocument({
        id: 'doc_filt_2',
        companyId: companyA,
        status: DocumentStatus.REJECTED,
        type: DocumentType.INVOICE,
        series: 'F001',
        createdAt: new Date('2026-09-05T12:00:00.000Z'),
      });
      seedDocument({
        id: 'doc_filt_3',
        companyId: companyA,
        status: DocumentStatus.ACCEPTED,
        type: DocumentType.RECEIPT,
        series: 'B001',
        createdAt: new Date('2026-09-10T12:00:00.000Z'),
      });
    });

    it('should filter documents by status', async () => {
      const result = await queriesController.findMany(companyA, {
        status: DocumentStatus.ACCEPTED,
      });

      expect(result.items.length).toBe(2);
      expect(result.items.every((d) => d.status === DocumentStatus.ACCEPTED)).toBe(true);
    });

    it('should filter documents by type', async () => {
      const result = await queriesController.findMany(companyA, {
        type: DocumentType.RECEIPT,
      });

      expect(result.items.length).toBe(1);
      expect(result.items[0].id).toBe('doc_filt_3');
    });

    it('should filter documents by series', async () => {
      const result = await queriesController.findMany(companyA, {
        series: 'B001',
      });

      expect(result.items.length).toBe(1);
      expect(result.items[0].series).toBe('B001');
    });

    it('should filter documents by creation date range', async () => {
      const result = await queriesController.findMany(companyA, {
        createdFrom: '2026-09-04T00:00:00.000Z',
        createdUntil: '2026-09-08T23:59:59.999Z',
      });

      expect(result.items.length).toBe(1);
      expect(result.items[0].id).toBe('doc_filt_2');
    });

    it('should reject invalid document status filter with BadRequestException', async () => {
      await expect(
        queriesController.findMany(companyA, { status: 'INVALID_STATUS' as any }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject invalid document type filter with BadRequestException', async () => {
      await expect(
        queriesController.findMany(companyA, { type: 'INVALID_TYPE' as any }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject invalid series format with BadRequestException', async () => {
      await expect(
        queriesController.findMany(companyA, { series: 'WAY_TOO_LONG_SERIES_NAME' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject invalid createdFrom date string with BadRequestException', async () => {
      await expect(
        queriesController.findMany(companyA, {
          createdFrom: 'invalid-date-string',
        }),
      ).rejects.toThrow(/Invalid date format/);
    });

    it('should reject invalid createdUntil date string with BadRequestException', async () => {
      await expect(
        queriesController.findMany(companyA, {
          createdUntil: 'invalid-date-string',
        }),
      ).rejects.toThrow(/Invalid date format/);
    });

    it('should reject if createdFrom is after createdUntil', async () => {
      await expect(
        queriesController.findMany(companyA, {
          createdFrom: '2026-09-10T00:00:00.000Z',
          createdUntil: '2026-09-01T00:00:00.000Z',
        }),
      ).rejects.toThrow(/must be earlier than or equal to createdUntil/);
    });
  });

  describe('Paginación por cursor y límites (Cursor Pagination & Limits)', () => {
    beforeEach(() => {
      // Seed 5 documents with distinct timestamps
      for (let i = 1; i <= 5; i++) {
        seedDocument({
          id: `doc_page_${i}`,
          companyId: companyA,
          createdAt: new Date(`2026-09-0${i}T12:00:00.000Z`),
        });
      }
    });

    it('should paginate correctly with limit, nextCursor and hasMore', async () => {
      // Page 1 with limit 2
      const page1 = await queriesController.findMany(companyA, { limit: 2 });
      expect(page1.items.length).toBe(2);
      expect(page1.hasMore).toBe(true);
      expect(page1.limit).toBe(2);
      expect(page1.nextCursor).toBe('doc_page_4'); // descending: 5, 4
      expect(page1.items[0].id).toBe('doc_page_5');
      expect(page1.items[1].id).toBe('doc_page_4');

      // Page 2 using nextCursor
      const page2 = await queriesController.findMany(companyA, {
        limit: 2,
        cursor: page1.nextCursor!,
      });
      expect(page2.items.length).toBe(2);
      expect(page2.hasMore).toBe(true);
      expect(page2.items[0].id).toBe('doc_page_3');
      expect(page2.items[1].id).toBe('doc_page_2');
      expect(page2.nextCursor).toBe('doc_page_2');

      // Page 3 (final page)
      const page3 = await queriesController.findMany(companyA, {
        limit: 2,
        cursor: page2.nextCursor!,
      });
      expect(page3.items.length).toBe(1);
      expect(page3.hasMore).toBe(false);
      expect(page3.items[0].id).toBe('doc_page_1');
      expect(page3.nextCursor).toBeNull();
    });

    it('should enforce limit boundaries (minimum 1, maximum 100)', async () => {
      await expect(
        queriesController.findMany(companyA, { limit: 0 }),
      ).rejects.toThrow(BadRequestException);

      await expect(
        queriesController.findMany(companyA, { limit: 101 }),
      ).rejects.toThrow(BadRequestException);

      await expect(
        queriesController.findMany(companyA, { limit: -5 }),
      ).rejects.toThrow(BadRequestException);

      const validMin = await queriesController.findMany(companyA, { limit: 1 });
      expect(validMin.limit).toBe(1);

      const validMax = await queriesController.findMany(companyA, { limit: 100 });
      expect(validMax.limit).toBe(100);
    });

    it('should reject invalid cursor format with BadRequestException', async () => {
      await expect(
        queriesController.findMany(companyA, { cursor: '../illegal/cursor' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject cursor referencing non-existent document or document of another company', async () => {
      seedDocument({
        id: 'doc_other_comp',
        companyId: companyB,
      });

      // Cursor does not exist
      await expect(
        queriesController.findMany(companyA, { cursor: 'doc_does_not_exist' }),
      ).rejects.toThrow(/Invalid cursor/);

      // Cursor belongs to Company B -> Company A cannot use it
      await expect(
        queriesController.findMany(companyA, { cursor: 'doc_other_comp' }),
      ).rejects.toThrow(/Invalid cursor/);
    });
  });
});
