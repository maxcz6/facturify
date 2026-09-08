import { BadRequestException, ExecutionContext } from '@nestjs/common';
import { ApiKey, ApiKeyEnvironment, ApiKeyStatus, Document, DocumentStatus, DocumentType } from '@prisma/client';
import { ApiKeysService } from '../src/api-keys/api-keys.service';
import { ApiKeyGuard } from '../src/api-keys/guards/api-key.guard';
import { DocumentsService } from '../src/documents/documents.service';
import { InvoicesController } from '../src/invoices/invoices.controller';
import { InvoicesService } from '../src/invoices/invoices.service';

describe('InvoicesModule (POST /invoices Facade)', () => {
  let invoicesService: InvoicesService;
  let invoicesController: InvoicesController;
  let mockDocumentsService: jest.Mocked<DocumentsService>;
  let apiKeysService: ApiKeysService;
  let apiKeyGuard: ApiKeyGuard;
  let mockPrisma: any;
  let apiKeysDb: Map<string, ApiKey>;

  beforeEach(() => {
    apiKeysDb = new Map<string, ApiKey>();

    mockPrisma = {
      company: {
        findUnique: jest.fn().mockResolvedValue({ id: 'cmp_live_999' }),
      },
      apiKey: {
        create: jest.fn().mockImplementation(async ({ data }: any) => {
          const record: ApiKey = {
            id: 'key_123',
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

    invoicesService = new InvoicesService(mockDocumentsService);
    invoicesController = new InvoicesController(invoicesService);

    apiKeysService = new ApiKeysService(mockPrisma);
    apiKeyGuard = new ApiKeyGuard(apiKeysService);
  });

  describe('InvoicesService', () => {
    it('should delegate to DocumentsService fixing type to INVOICE', async () => {
      const mockResult: Document = {
        id: 'doc_123',
        companyId: 'cmp_company_1',
        type: DocumentType.INVOICE,
        series: 'F001',
        number: 1,
        customerDocumentType: '6',
        customerDocumentNumber: '20123456789',
        customerName: 'Cliente Demo S.A.C.',
        currency: 'PEN',
        subtotal: 100 as any,
        tax: 18 as any,
        total: 118 as any,
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

      const invoiceInput = {
        series: 'F001',
        number: 1,
        customerDocumentType: '6',
        customerDocumentNumber: '20123456789',
        customerName: 'Cliente Demo S.A.C.',
        items: [{ description: 'Item 1', quantity: 1, unitPrice: 100 }],
      };

      const result = await invoicesService.create(invoiceInput, 'cmp_company_1');

      expect(mockDocumentsService.create).toHaveBeenCalledTimes(1);
      const callArgs = mockDocumentsService.create.mock.calls[0][0];

      expect(callArgs.type).toBe(DocumentType.INVOICE);
      expect(callArgs.companyId).toBe('cmp_company_1');
      expect(callArgs.series).toBe('F001');
      expect(result.type).toBe(DocumentType.INVOICE);
    });

    it('should ignore a forged companyId from the request body', async () => {
      mockDocumentsService.create.mockResolvedValue({} as Document);

      await invoicesService.create(
        {
          companyId: 'cmp_explicit',
          series: 'F001',
          number: 2,
          items: [{ description: 'Test', quantity: 1, unitPrice: 50 }],
        } as any,
        'cmp_from_key',
      );

      const callArgs = mockDocumentsService.create.mock.calls[0][0];
      expect(callArgs.companyId).toBe('cmp_from_key');
      expect(callArgs.type).toBe(DocumentType.INVOICE);
    });

    it('should throw BadRequestException if the API Key has no companyId', async () => {
      await expect(
        invoicesService.create({
          series: 'F001',
          number: 1,
          items: [{ description: 'Test', quantity: 1, unitPrice: 10 }],
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('InvoicesController & ApiKeyGuard integration', () => {
    it('should allow POST /invoices when valid Bearer fact_live_... is provided', async () => {
      const generated = await apiKeysService.create({
        companyId: 'cmp_live_999',
        name: 'Billing Service',
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

      // ApiKeyGuard passes and sets companyId
      const guardResult = await apiKeyGuard.canActivate(mockContext);
      expect(guardResult).toBe(true);
      expect(mockRequest.companyId).toBe('cmp_live_999');

      // Controller receives the companyId
      mockDocumentsService.create.mockResolvedValue({
        id: 'doc_inv_1',
        type: DocumentType.INVOICE,
      } as Document);

      const response = await invoicesController.create(
        {
          series: 'F001',
          number: 10,
          items: [{ description: 'Consultoría', quantity: 1, unitPrice: 500 }],
        },
        mockRequest.companyId,
      );

      expect(mockDocumentsService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          companyId: 'cmp_live_999',
          type: DocumentType.INVOICE,
        }),
      );
      expect(response.type).toBe(DocumentType.INVOICE);
    });
  });
});
