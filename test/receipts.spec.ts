import { BadRequestException, ExecutionContext } from '@nestjs/common';
import { ApiKey, ApiKeyEnvironment, ApiKeyStatus, Document, DocumentStatus, DocumentType } from '@prisma/client';
import { ApiKeysService } from '../src/api-keys/api-keys.service';
import { ApiKeyGuard } from '../src/api-keys/guards/api-key.guard';
import { DocumentsService } from '../src/documents/documents.service';
import { ReceiptsController } from '../src/receipts/receipts.controller';
import { ReceiptsService } from '../src/receipts/receipts.service';

describe('ReceiptsModule (POST /receipts Facade)', () => {
  let receiptsService: ReceiptsService;
  let receiptsController: ReceiptsController;
  let mockDocumentsService: jest.Mocked<DocumentsService>;
  let apiKeysService: ApiKeysService;
  let apiKeyGuard: ApiKeyGuard;
  let mockPrisma: any;
  let apiKeysDb: Map<string, ApiKey>;

  beforeEach(() => {
    apiKeysDb = new Map<string, ApiKey>();

    mockPrisma = {
      company: {
        findUnique: jest.fn().mockResolvedValue({ id: 'cmp_live_retail' }),
      },
      apiKey: {
        create: jest.fn().mockImplementation(async ({ data }: any) => {
          const record: ApiKey = {
            id: 'key_rec_123',
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
    };

    mockDocumentsService = {
      create: jest.fn(),
      findOne: jest.fn(),
    } as unknown as jest.Mocked<DocumentsService>;

    receiptsService = new ReceiptsService(mockDocumentsService);
    receiptsController = new ReceiptsController(receiptsService);

    apiKeysService = new ApiKeysService(mockPrisma);
    apiKeyGuard = new ApiKeyGuard(apiKeysService);
  });

  describe('ReceiptsService', () => {
    it('should delegate to DocumentsService fixing type to RECEIPT', async () => {
      const mockResult: Document = {
        id: 'doc_rec_1',
        companyId: 'cmp_company_2',
        type: DocumentType.RECEIPT,
        series: 'B001',
        number: 1,
        customerDocumentType: '1',
        customerDocumentNumber: '71234567',
        customerName: 'Juan Pérez',
        currency: 'PEN',
        subtotal: 50 as any,
        tax: 9 as any,
        total: 59 as any,
        status: DocumentStatus.PENDING,
        sunatCode: null,
        sunatMessage: null,
        referenceDocumentId: null,
        adjustmentReasonCode: null,
        adjustmentReason: null,
        xmlArtifactId: null,
        zipArtifactId: null,
        cdrArtifactId: null,
        issuedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockDocumentsService.create.mockResolvedValue(mockResult);

      const receiptInput = {
        series: 'B001',
        number: 1,
        customerDocumentType: '1',
        customerDocumentNumber: '71234567',
        customerName: 'Juan Pérez',
        items: [{ description: 'Producto Retail', quantity: 1, unitPrice: 50 }],
      };

      const result = await receiptsService.create(receiptInput, 'cmp_company_2');

      expect(mockDocumentsService.create).toHaveBeenCalledTimes(1);
      const callArgs = mockDocumentsService.create.mock.calls[0][0];

      expect(callArgs.type).toBe(DocumentType.RECEIPT);
      expect(callArgs.companyId).toBe('cmp_company_2');
      expect(callArgs.series).toBe('B001');
      expect(result.type).toBe(DocumentType.RECEIPT);
    });

    it('should ignore a forged companyId from the request body', async () => {
      mockDocumentsService.create.mockResolvedValue({} as Document);

      await receiptsService.create(
        {
          companyId: 'cmp_explicit_rec',
          series: 'B001',
          number: 5,
          items: [{ description: 'Test', quantity: 2, unitPrice: 20 }],
        } as any,
        'cmp_from_key',
      );

      const callArgs = mockDocumentsService.create.mock.calls[0][0];
      expect(callArgs.companyId).toBe('cmp_from_key');
      expect(callArgs.type).toBe(DocumentType.RECEIPT);
    });

    it('should throw BadRequestException if the API Key has no companyId', async () => {
      await expect(
        receiptsService.create({
          series: 'B001',
          number: 1,
          items: [{ description: 'Test', quantity: 1, unitPrice: 10 }],
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('ReceiptsController & ApiKeyGuard integration', () => {
    it('should allow POST /receipts when valid Bearer fact_live_... is provided', async () => {
      const generated = await apiKeysService.create({
        companyId: 'cmp_live_retail',
        name: 'POS Store 1',
        environment: 'live',
      });

      const mockRequest: any = {
        headers: {
          authorization: `Bearer ${generated.apiKey}`,
        },
      };

      const mockContext = {
        switchToHttp: () => ({ getRequest: () => mockRequest }),
      } as unknown as ExecutionContext;

      const guardResult = await apiKeyGuard.canActivate(mockContext);
      expect(guardResult).toBe(true);
      expect(mockRequest.companyId).toBe('cmp_live_retail');

      mockDocumentsService.create.mockResolvedValue({
        id: 'doc_rec_2',
        type: DocumentType.RECEIPT,
      } as Document);

      const response = await receiptsController.create(
        {
          series: 'B001',
          number: 20,
          items: [{ description: 'Prenda de vestir', quantity: 1, unitPrice: 80 }],
        },
        mockRequest.companyId,
      );

      expect(mockDocumentsService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          companyId: 'cmp_live_retail',
          type: DocumentType.RECEIPT,
        }),
      );
      expect(response.type).toBe(DocumentType.RECEIPT);
    });
  });
});
