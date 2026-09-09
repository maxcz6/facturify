import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Webhook, WebhookDelivery, WebhookDeliveryStatus, WebhookStatus } from '@prisma/client';
import { SecretsEncryptionService } from '../src/security/secrets-encryption.service';
import { WebhooksController } from '../src/webhooks/webhooks.controller';
import { WebhookCrypto } from '../src/webhooks/webhooks.crypto';
import { WebhooksService } from '../src/webhooks/webhooks.service';
import { WebhookValidator } from '../src/webhooks/webhooks.validator';

describe('WebhooksModule (with Prisma & SecretsEncryptionService)', () => {
  let service: WebhooksService;
  let controller: WebhooksController;
  let encryptionService: SecretsEncryptionService;
  let mockPrisma: any;
  let webhooksDb: Map<string, Webhook>;
  let deliveriesDb: WebhookDelivery[];

  beforeEach(() => {
    webhooksDb = new Map<string, Webhook>();
    deliveriesDb = [];

    // Mock ConfigService with 32 bytes AES-256-GCM key (base64)
    const test32ByteKey = Buffer.from('01234567890123456789012345678901').toString('base64');
    const mockConfig = {
      get: jest.fn().mockImplementation((key: string) => {
        if (key === 'SECRETS_ENCRYPTION_KEY') return test32ByteKey;
        return undefined;
      }),
    } as unknown as ConfigService;

    encryptionService = new SecretsEncryptionService(mockConfig);

    mockPrisma = {
      company: {
        findUnique: jest.fn().mockImplementation(async ({ where }: any) => {
          return { id: where.id, ruc: '20123456789', businessName: 'Test Company' };
        }),
      },
      webhook: {
        create: jest.fn().mockImplementation(async ({ data }: any) => {
          const record: Webhook = {
            id: `whk_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            companyId: data.companyId,
            url: data.url,
            events: data.events,
            encryptedSecret: data.encryptedSecret,
            secretIv: data.secretIv,
            secretAuthTag: data.secretAuthTag,
            status: data.status || WebhookStatus.ACTIVE,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          webhooksDb.set(record.id, record);
          return record;
        }),
        findMany: jest.fn().mockImplementation(async ({ where }: any) => {
          const list = [...webhooksDb.values()];
          return list.filter(
            (w) =>
              (!where.companyId || w.companyId === where.companyId) &&
              (!where.status || w.status === where.status),
          );
        }),
        findFirst: jest.fn().mockImplementation(async ({ where }: any) => {
          for (const w of webhooksDb.values()) {
            if (w.id === where.id && (!where.companyId || w.companyId === where.companyId)) {
              return w;
            }
          }
          return null;
        }),
        delete: jest.fn().mockImplementation(async ({ where }: any) => {
          const existing = webhooksDb.get(where.id);
          webhooksDb.delete(where.id);
          return existing;
        }),
      },
      webhookDelivery: {
        create: jest.fn().mockImplementation(async ({ data }: any) => {
          const record: WebhookDelivery = {
            id: `del_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            webhookId: data.webhookId,
            companyId: data.companyId,
            event: data.event,
            payload: data.payload,
            signatureHeader: data.signatureHeader,
            attempt: data.attempt || 1,
            maxAttempts: data.maxAttempts || 3,
            status: data.status || WebhookDeliveryStatus.PENDING,
            statusCode: null,
            error: null,
            durationMs: null,
            deliveredAt: null,
            createdAt: new Date(),
          };
          deliveriesDb.push(record);
          return record;
        }),
        update: jest.fn().mockImplementation(async ({ where, data }: any) => {
          const existing = deliveriesDb.find((d) => d.id === where.id);
          if (existing) {
            Object.assign(existing, data);
            return existing;
          }
          return null;
        }),
        findMany: jest.fn().mockImplementation(async ({ where }: any) => {
          return deliveriesDb.filter((d) => d.companyId === where.companyId);
        }),
      },
    };

    service = new WebhooksService(mockPrisma, encryptionService);
    controller = new WebhooksController(service);
    delete process.env.NODE_ENV;
  });

  afterEach(() => {
    delete process.env.NODE_ENV;
  });

  describe('WebhookCrypto', () => {
    const testSecret = 'whsec_9876543210abcdef0123456789abcdef';
    const testPayload = JSON.stringify({
      id: 'evt_123',
      event: 'invoice.accepted',
      companyId: 'cmp_123',
      data: { invoiceId: 'inv_001', status: 'ACCEPTED' },
    });

    it('should generate secrets with whsec_ prefix', () => {
      const secret = WebhookCrypto.generateSecret();
      expect(secret).toMatch(/^whsec_[a-f0-9]{48}$/);
    });

    it('should create valid signature and signature header', () => {
      const now = Math.floor(Date.now() / 1000);
      const header = WebhookCrypto.buildSignatureHeader(testPayload, testSecret, now);

      expect(header).toContain(`t=${now}`);
      expect(header).toContain('v1=');

      const verification = WebhookCrypto.verifySignature(testPayload, header, testSecret);
      expect(verification.valid).toBe(true);
    });

    it('should reject tampered payload', () => {
      const now = Math.floor(Date.now() / 1000);
      const header = WebhookCrypto.buildSignatureHeader(testPayload, testSecret, now);

      const tamperedPayload = testPayload.replace('ACCEPTED', 'REJECTED');
      const verification = WebhookCrypto.verifySignature(tamperedPayload, header, testSecret);

      expect(verification.valid).toBe(false);
      expect(verification.reason).toBe('Signature mismatch.');
    });

    it('should reject wrong secret', () => {
      const now = Math.floor(Date.now() / 1000);
      const header = WebhookCrypto.buildSignatureHeader(testPayload, testSecret, now);

      const wrongSecret = 'whsec_00000000000000000000000000000000';
      const verification = WebhookCrypto.verifySignature(testPayload, header, wrongSecret);

      expect(verification.valid).toBe(false);
      expect(verification.reason).toBe('Signature mismatch.');
    });

    it('should reject expired signature (replay attack protection)', () => {
      const oldTimestamp = Math.floor(Date.now() / 1000) - 600;
      const header = WebhookCrypto.buildSignatureHeader(testPayload, testSecret, oldTimestamp);

      const verification = WebhookCrypto.verifySignature(testPayload, header, testSecret, 300);
      expect(verification.valid).toBe(false);
      expect(verification.reason).toBe('Webhook signature timestamp outside tolerance window.');
    });
  });

  describe('Webhook Secret Protection & AES-256-GCM Storage', () => {
    it('should return secret ONLY upon registration and NEVER on list or getDeliveries', async () => {
      const registration = await controller.register(
        { url: 'https://client-api.pe/webhooks/cpe', events: ['invoice.accepted'] },
        'cmp_company_secure',
      );

      // 1. Returned on creation
      expect(registration.secret).toBeDefined();
      expect(registration.secret).toMatch(/^whsec_/);

      // Verify it was stored encrypted in Prisma
      const stored = webhooksDb.get(registration.id);
      expect(stored?.encryptedSecret).toBeDefined();
      expect(stored?.encryptedSecret).not.toBe(registration.secret);
      expect(stored?.secretIv).toBeDefined();
      expect(stored?.secretAuthTag).toBeDefined();

      // 2. Listing webhooks must NEVER reveal secret or encryptedSecret
      const list = await controller.list('cmp_company_secure');
      expect(list.length).toBe(1);
      expect((list[0] as any).secret).toBeUndefined();
      expect((list[0] as any).encryptedSecret).toBeUndefined();

      // 3. Deliveries logs must NEVER contain secret
      const mockFetch = jest.fn().mockResolvedValue({ ok: true, status: 200, statusText: 'OK' });
      global.fetch = mockFetch;

      await service.dispatch('cmp_company_secure', 'invoice.accepted', { invoiceId: '1' });
      const deliveries = await controller.getDeliveries('cmp_company_secure');

      expect(deliveries.length).toBe(1);
      expect((deliveries[0] as any).secret).toBeUndefined();
    });
  });

  describe('SSRF Protection & Protocol Enforcement', () => {
    it('should enforce HTTPS in production', () => {
      expect(() =>
        WebhookValidator.validateUrl('http://my-company.com/webhook', true),
      ).toThrow('In production environments, webhook endpoints MUST use HTTPS.');

      expect(() =>
        WebhookValidator.validateUrl('https://my-company.com/webhook', true),
      ).not.toThrow();
    });

    it('should reject loopback and localhost addresses (SSRF)', () => {
      expect(() => WebhookValidator.validateUrl('http://localhost:8080/wh', false)).toThrow(
        BadRequestException,
      );
      expect(() => WebhookValidator.validateUrl('https://sub.localhost/wh', false)).toThrow(
        BadRequestException,
      );
      expect(() => WebhookValidator.validateUrl('http://127.0.0.1/wh', false)).toThrow(
        BadRequestException,
      );
      expect(() => WebhookValidator.validateUrl('http://127.0.1.5/wh', false)).toThrow(
        BadRequestException,
      );
      expect(() => WebhookValidator.validateUrl('http://[::1]/wh', false)).toThrow(
        BadRequestException,
      );
    });

    it('should reject internal private network addresses (SSRF)', () => {
      expect(() => WebhookValidator.validateUrl('https://10.0.0.1/wh', false)).toThrow(
        BadRequestException,
      );
      expect(() => WebhookValidator.validateUrl('https://192.168.1.50/wh', false)).toThrow(
        BadRequestException,
      );
      expect(() => WebhookValidator.validateUrl('https://172.20.10.2/wh', false)).toThrow(
        BadRequestException,
      );
    });

    it('should reject cloud metadata service address (169.254.169.254)', () => {
      expect(() =>
        WebhookValidator.validateUrl('http://169.254.169.254/latest/meta-data', false),
      ).toThrow(BadRequestException);
    });

    it('should allow valid public internet URLs', () => {
      expect(() =>
        WebhookValidator.validateUrl('https://api.empresa.com/facturify-webhook', true),
      ).not.toThrow();
      expect(() =>
        WebhookValidator.validateUrl('https://webhook.site/abc-123', true),
      ).not.toThrow();
    });
  });

  describe('Multi-tenant Isolation', () => {
    it('should strictly isolate webhooks by authenticated companyId', async () => {
      const webhookA = await controller.register(
        { url: 'https://company-a.com/wh', events: ['invoice.accepted'] },
        'cmp_company_A',
      );

      const webhookB = await controller.register(
        { url: 'https://company-b.com/wh', events: ['invoice.accepted'] },
        'cmp_company_B',
      );

      expect(webhookA.companyId).toBe('cmp_company_A');
      expect(webhookB.companyId).toBe('cmp_company_B');

      // Company A can only see its own webhooks
      const listA = await controller.list('cmp_company_A');
      expect(listA.length).toBe(1);
      expect(listA[0].id).toBe(webhookA.id);

      // Company B cannot see Company A's webhooks
      const listB = await controller.list('cmp_company_B');
      expect(listB.length).toBe(1);
      expect(listB[0].id).toBe(webhookB.id);

      // Company B cannot delete Company A's webhook
      await expect(controller.delete(webhookA.id, 'cmp_company_B')).rejects.toThrow(
        NotFoundException,
      );

      // Company A can delete its own webhook
      const deleteRes = await controller.delete(webhookA.id, 'cmp_company_A');
      expect(deleteRes.success).toBe(true);
    });
  });

  describe('Testing Tools Environment Guard', () => {
    it('should permit testing tools in non-production environments', async () => {
      process.env.NODE_ENV = 'development';

      const mockFetch = jest.fn().mockResolvedValue({ ok: true, status: 200, statusText: 'OK' });
      global.fetch = mockFetch;

      await controller.register({ url: 'https://dev.public-url.com/wh', events: ['test'] }, 'cmp_dev');

      const res = await controller.testDispatch(
        { event: 'test', data: { ping: true } },
        'cmp_dev',
      );
      expect(res).toBeDefined();

      const verifyRes = controller.verifySignature({
        payload: { ping: true },
        header: 't=123,v1=abc',
        secret: 'whsec_123',
      });
      expect(verifyRes).toBeDefined();
    });

    it('should block testing tools in production environment', async () => {
      process.env.NODE_ENV = 'production';

      await expect(
        controller.testDispatch({ event: 'test', data: {} }, 'cmp_prod'),
      ).rejects.toThrow(ForbiddenException);

      expect(() =>
        controller.verifySignature({
          payload: {},
          header: 't=123,v1=abc',
          secret: 'whsec_123',
        }),
      ).toThrow(ForbiddenException);
    });
  });

  describe('Sanitized delivery failures', () => {
    it('uses DNS-approved addresses with the pinned HTTPS client instead of fetch', async () => {
      await controller.register({ url: 'https://public.example/wh', events: ['safe.event'] }, 'cmp_safe');
      const dnsSafety = { validateWebhookDestination: jest.fn().mockResolvedValue({ allowed: true, addresses: ['203.0.114.10'] }) };
      const safeClient = { sendWebhook: jest.fn().mockResolvedValue({ statusCode: 204, ok: true, retryAfter: null }) };
      const guardedService = new WebhooksService(mockPrisma, encryptionService, dnsSafety as never, safeClient as never);
      global.fetch = jest.fn();

      const result = await guardedService.dispatch('cmp_safe', 'safe.event', { safe: true }, 1);

      expect(safeClient.sendWebhook).toHaveBeenCalledWith(expect.objectContaining({
        url: 'https://public.example/wh', validatedIps: ['203.0.114.10'], timeoutMs: 5000,
      }));
      expect(global.fetch).not.toHaveBeenCalled();
      expect(result[0]).toEqual(expect.objectContaining({ status: 'SUCCESS', statusCode: 204 }));
    });

    it('blocks an unsafe DNS resolution before fetch and stores only a terminal code', async () => {
      await controller.register({ url: 'https://public.example/wh', events: ['safe.event'] }, 'cmp_safe');
      const dnsSafety = { validateWebhookDestination: jest.fn().mockRejectedValue(new BadRequestException('generic')) };
      const guardedService = new WebhooksService(mockPrisma, encryptionService, dnsSafety as never);
      global.fetch = jest.fn();

      const result = await guardedService.dispatch('cmp_safe', 'safe.event', {}, 3);

      expect(dnsSafety.validateWebhookDestination).toHaveBeenCalledTimes(1);
      expect(global.fetch).not.toHaveBeenCalled();
      expect(result[0]).toEqual(expect.objectContaining({ status: 'FAILED', error: 'UNSAFE_DESTINATION', attempt: 1 }));
    });

    it('never persists an HTTP status text or response details', async () => {
      await controller.register({ url: 'https://public.example/wh', events: ['safe.event'] }, 'cmp_safe');
      global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 503, statusText: 'upstream secret details' });

      const result = await service.dispatch('cmp_safe', 'safe.event', {}, 1);

      expect(result[0].error).toBe('HTTP_503');
      expect(deliveriesDb[0].error).toBe('HTTP_503');
      expect(JSON.stringify(deliveriesDb[0])).not.toContain('upstream secret details');
    });

    it('never persists network exception messages, URLs, or credentials', async () => {
      await controller.register({ url: 'https://public.example/wh', events: ['safe.event'] }, 'cmp_safe');
      global.fetch = jest.fn().mockRejectedValue(new Error('connect postgres://admin:secret@10.0.0.1 private.pem'));

      const result = await service.dispatch('cmp_safe', 'safe.event', {}, 1);

      expect(result[0].error).toBe('NETWORK_ERROR');
      expect(deliveriesDb[0].error).toBe('NETWORK_ERROR');
      expect(JSON.stringify(deliveriesDb[0])).not.toContain('admin:secret');
      expect(JSON.stringify(deliveriesDb[0])).not.toContain('private.pem');
    });
  });
});
