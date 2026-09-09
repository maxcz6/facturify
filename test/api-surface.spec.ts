import 'reflect-metadata';
import { RequestMethod, Type } from '@nestjs/common';
import { PATH_METADATA, METHOD_METADATA, GUARDS_METADATA, INTERCEPTORS_METADATA } from '@nestjs/common/constants';
import { ForbiddenException } from '@nestjs/common';
import { API_GLOBAL_PREFIX } from '../src/app.constants';

// Guards & Interceptors
import { ApiKeyGuard } from '../src/api-keys/guards/api-key.guard';
import { JwtAuthGuard } from '../src/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../src/auth/guards/roles.guard';
import { IdempotencyInterceptor } from '../src/idempotency/idempotency.interceptor';

// Controllers
import { HealthController } from '../src/health/health.controller';
import { AuthController } from '../src/auth/auth.controller';
import { CompaniesController } from '../src/companies/companies.controller';
import { CertificatesController } from '../src/certificates/certificates.controller';
import { SunatCredentialsController } from '../src/sunat-credentials/sunat-credentials.controller';
import { AuditQueriesController } from '../src/audit-queries/audit-queries.controller';
import { ApiKeysController } from '../src/api-keys/api-keys.controller';
import { InvoicesController } from '../src/invoices/invoices.controller';
import { ReceiptsController } from '../src/receipts/receipts.controller';
import { CreditNotesController } from '../src/adjustment-notes/credit-notes.controller';
import { DebitNotesController } from '../src/adjustment-notes/debit-notes.controller';
import { DocumentQueriesController } from '../src/document-queries/document-queries.controller';
import { ArtifactsController } from '../src/artifacts/artifacts.controller';
import { ProcessingController } from '../src/processing/processing.controller';
import { WebhooksController } from '../src/webhooks/webhooks.controller';

interface RouteMetadata {
  controllerName: string;
  methodName: string;
  httpMethod: string;
  path: string;
  fullPath: string;
  guards: any[];
  interceptors: any[];
  controllerClass: Type<any>;
}

const GLOBAL_PREFIX = `/${API_GLOBAL_PREFIX}`;

const HTTP_METHOD_MAP: Record<number, string> = {
  [RequestMethod.GET]: 'GET',
  [RequestMethod.POST]: 'POST',
  [RequestMethod.PUT]: 'PUT',
  [RequestMethod.DELETE]: 'DELETE',
  [RequestMethod.PATCH]: 'PATCH',
  [RequestMethod.ALL]: 'ALL',
  [RequestMethod.OPTIONS]: 'OPTIONS',
  [RequestMethod.HEAD]: 'HEAD',
};

function normalizeRoutePath(basePath: string, routePath: string): string {
  const cleanBase = basePath ? basePath.replace(/^\/+|\/+$/g, '') : '';
  const cleanRoute = routePath ? routePath.replace(/^\/+|\/+$/g, '') : '';
  const combined = [cleanBase, cleanRoute].filter(Boolean).join('/');
  return '/' + combined;
}

function extractControllerRoutes(controllerClass: Type<any>): RouteMetadata[] {
  const controllerPath: string = Reflect.getMetadata(PATH_METADATA, controllerClass) || '';
  const classGuards: any[] = Reflect.getMetadata(GUARDS_METADATA, controllerClass) || [];
  const classInterceptors: any[] = Reflect.getMetadata(INTERCEPTORS_METADATA, controllerClass) || [];

  const prototype = controllerClass.prototype;
  const methodNames = Object.getOwnPropertyNames(prototype).filter(
    (prop) => prop !== 'constructor' && typeof prototype[prop] === 'function',
  );

  const routes: RouteMetadata[] = [];

  for (const methodName of methodNames) {
    const methodRef = prototype[methodName];
    const pathMetadata = Reflect.getMetadata(PATH_METADATA, methodRef);
    const requestMethodCode: number | undefined = Reflect.getMetadata(METHOD_METADATA, methodRef);

    if (requestMethodCode === undefined || pathMetadata === undefined) {
      continue;
    }

    const httpMethod = HTTP_METHOD_MAP[requestMethodCode] || 'UNKNOWN';
    const methodGuards: any[] = Reflect.getMetadata(GUARDS_METADATA, methodRef) || [];
    const methodInterceptors: any[] = Reflect.getMetadata(INTERCEPTORS_METADATA, methodRef) || [];

    const normalizedPath = normalizeRoutePath(controllerPath, pathMetadata);
    const fullPath = GLOBAL_PREFIX + (normalizedPath === '/' ? '' : normalizedPath);

    routes.push({
      controllerName: controllerClass.name,
      methodName,
      httpMethod,
      path: normalizedPath,
      fullPath,
      guards: [...classGuards, ...methodGuards],
      interceptors: [...classInterceptors, ...methodInterceptors],
      controllerClass,
    });
  }

  return routes;
}

describe('API Surface Contract Verification', () => {
  const registeredControllers: Type<any>[] = [
    HealthController,
    AuthController,
    CompaniesController,
    CertificatesController,
    SunatCredentialsController,
    AuditQueriesController,
    ApiKeysController,
    InvoicesController,
    ReceiptsController,
    CreditNotesController,
    DebitNotesController,
    DocumentQueriesController,
    ArtifactsController,
    ProcessingController,
    WebhooksController,
  ];

  let allRoutes: RouteMetadata[] = [];

  beforeAll(() => {
    allRoutes = registeredControllers.flatMap((c) => extractControllerRoutes(c));
  });

  it('should reflect all registered controllers and non-empty route list', () => {
    expect(registeredControllers.length).toBe(15);
    expect(allRoutes.length).toBeGreaterThanOrEqual(25);
  });

  describe('Route Inventory & Global Prefix (/api/v1)', () => {
    const expectedRoutes = [
      // Health
      { method: 'GET', fullPath: '/api/v1/health' },
      { method: 'GET', fullPath: '/api/v1/health/live' },
      { method: 'GET', fullPath: '/api/v1/health/ready' },

      // Auth
      { method: 'POST', fullPath: '/api/v1/auth/bootstrap' },
      { method: 'POST', fullPath: '/api/v1/auth/login' },
      { method: 'POST', fullPath: '/api/v1/auth/register' },
      { method: 'GET', fullPath: '/api/v1/auth/profile' },

      // Companies
      { method: 'POST', fullPath: '/api/v1/companies' },
      { method: 'GET', fullPath: '/api/v1/companies' },

      // Certificates
      { method: 'POST', fullPath: '/api/v1/certificates' },
      { method: 'POST', fullPath: '/api/v1/certificates/company/:companyId' },
      { method: 'GET', fullPath: '/api/v1/certificates/company/:companyId' },
      { method: 'PATCH', fullPath: '/api/v1/certificates/:id/deactivate' },
      { method: 'PATCH', fullPath: '/api/v1/certificates/company/:companyId/:id/deactivate' },
      { method: 'DELETE', fullPath: '/api/v1/certificates/:id' },

      // SUNAT Credentials
      { method: 'PUT', fullPath: '/api/v1/companies/:companyId/sunat-credentials' },
      { method: 'GET', fullPath: '/api/v1/companies/:companyId/sunat-credentials/status' },
      { method: 'DELETE', fullPath: '/api/v1/companies/:companyId/sunat-credentials' },

      // Audit Events
      { method: 'GET', fullPath: '/api/v1/audit-events' },

      // API Keys
      { method: 'POST', fullPath: '/api/v1/api-keys' },
      { method: 'GET', fullPath: '/api/v1/api-keys/company/:companyId' },
      { method: 'POST', fullPath: '/api/v1/api-keys/:id/rotate' },
      { method: 'DELETE', fullPath: '/api/v1/api-keys/:id' },
      { method: 'GET', fullPath: '/api/v1/api-keys/verify' },

      // Invoices
      { method: 'POST', fullPath: '/api/v1/invoices' },

      // Receipts
      { method: 'POST', fullPath: '/api/v1/receipts' },

      // Adjustment Notes (Credit & Debit)
      { method: 'POST', fullPath: '/api/v1/credit-notes' },
      { method: 'POST', fullPath: '/api/v1/debit-notes' },

      // Document Queries
      { method: 'GET', fullPath: '/api/v1/documents/:id' },
      { method: 'GET', fullPath: '/api/v1/documents' },

      // Artifacts
      { method: 'GET', fullPath: '/api/v1/documents/:id/xml' },
      { method: 'GET', fullPath: '/api/v1/documents/:id/cdr' },

      // Processing
      { method: 'POST', fullPath: '/api/v1/documents/:id/send' },
      { method: 'POST', fullPath: '/api/v1/documents/daily-summaries' },
      { method: 'POST', fullPath: '/api/v1/documents/daily-summaries/:id/status' },
      { method: 'POST', fullPath: '/api/v1/documents/void-communications' },
      { method: 'POST', fullPath: '/api/v1/documents/void-communications/:id/status' },

      // Webhooks
      { method: 'POST', fullPath: '/api/v1/webhooks' },
      { method: 'GET', fullPath: '/api/v1/webhooks' },
      { method: 'DELETE', fullPath: '/api/v1/webhooks/:id' },
      { method: 'GET', fullPath: '/api/v1/webhooks/deliveries' },
      { method: 'POST', fullPath: '/api/v1/webhooks/test-dispatch' },
      { method: 'POST', fullPath: '/api/v1/webhooks/verify-signature' },
    ];

    it('should have all expected routes present under /api/v1', () => {
      for (const expected of expectedRoutes) {
        const found = allRoutes.find(
          (r) => r.httpMethod === expected.method && r.fullPath === expected.fullPath,
        );
        expect(found).toBeDefined();
      }
    });

    it('should not contain any unexpected or unclassified routes', () => {
      const expectedKeySet = new Set(
        expectedRoutes.map((r) => r.method + ' ' + r.fullPath),
      );

      for (const route of allRoutes) {
        const routeKey = route.httpMethod + ' ' + route.fullPath;
        expect(expectedKeySet.has(routeKey)).toBe(true);
      }

      expect(allRoutes.length).toBe(expectedRoutes.length);
    });

    it('must NOT expose a legacy POST /documents route', () => {
      const legacyRoute = allRoutes.find(
        (r) => r.httpMethod === 'POST' && (r.fullPath === '/api/v1/documents' || r.path === '/documents'),
      );
      expect(legacyRoute).toBeUndefined();
    });
  });

  describe('Anonymous Endpoints Protection', () => {
    const strictlyAnonymousPaths = new Set([
      '/api/v1/health',
      '/api/v1/health/live',
      '/api/v1/health/ready',
      '/api/v1/auth/bootstrap',
      '/api/v1/auth/login',
    ]);

    it('only /health, /health/live, /health/ready, /auth/login and /auth/bootstrap must be anonymous', () => {
      for (const route of allRoutes) {
        const isStrictlyAnonymous = strictlyAnonymousPaths.has(route.fullPath);
        const hasAuthGuard = route.guards.some((g) => g === JwtAuthGuard || g === ApiKeyGuard);

        if (isStrictlyAnonymous) {
          expect(hasAuthGuard).toBe(false);
        } else {
          expect(hasAuthGuard).toBe(true);
        }
      }
    });
  });

  describe('Admin Endpoints Protection', () => {
    const adminControllers = [
      CompaniesController,
      CertificatesController,
      SunatCredentialsController,
      AuditQueriesController,
    ];

    it('should protect all routes in admin-only controllers with JwtAuthGuard and RolesGuard', () => {
      for (const ctrl of adminControllers) {
        const routes = allRoutes.filter((r) => r.controllerClass === ctrl);
        expect(routes.length).toBeGreaterThan(0);
        for (const r of routes) {
          expect(r.guards).toContain(JwtAuthGuard);
          expect(r.guards).toContain(RolesGuard);
          expect(r.guards).not.toContain(ApiKeyGuard);
        }
      }
    });

    it('should protect administrative Auth routes (register, profile) with JwtAuthGuard and RolesGuard', () => {
      const adminAuthRoutes = allRoutes.filter(
        (r) =>
          r.controllerClass === AuthController &&
          (r.fullPath === '/api/v1/auth/register' || r.fullPath === '/api/v1/auth/profile'),
      );
      expect(adminAuthRoutes.length).toBe(2);
      for (const r of adminAuthRoutes) {
        expect(r.guards).toContain(JwtAuthGuard);
        expect(r.guards).toContain(RolesGuard);
        expect(r.guards).not.toContain(ApiKeyGuard);
      }
    });

    it('should protect administrative API key management routes with JwtAuthGuard and RolesGuard', () => {
      const adminApiKeyRoutes = allRoutes.filter(
        (r) =>
          r.controllerClass === ApiKeysController &&
          r.fullPath !== '/api/v1/api-keys/verify',
      );
      expect(adminApiKeyRoutes.length).toBe(4);
      for (const r of adminApiKeyRoutes) {
        expect(r.guards).toContain(JwtAuthGuard);
        expect(r.guards).toContain(RolesGuard);
        expect(r.guards).not.toContain(ApiKeyGuard);
      }
    });

    it('should NEVER allow ApiKeyGuard on any administrative route', () => {
      const adminRoutes = allRoutes.filter(
        (r) => r.guards.includes(JwtAuthGuard) || r.guards.includes(RolesGuard),
      );
      expect(adminRoutes.length).toBeGreaterThan(0);
      for (const r of adminRoutes) {
        expect(r.guards).not.toContain(ApiKeyGuard);
      }
    });
  });

  describe('Integrator Endpoints Protection', () => {
    const integratorControllers = [
      InvoicesController,
      ReceiptsController,
      CreditNotesController,
      DebitNotesController,
      DocumentQueriesController,
      ArtifactsController,
      ProcessingController,
      WebhooksController,
    ];

    it('should protect all routes in integrator controllers with ApiKeyGuard and without JwtAuthGuard', () => {
      for (const ctrl of integratorControllers) {
        const routes = allRoutes.filter((r) => r.controllerClass === ctrl);
        expect(routes.length).toBeGreaterThan(0);
        for (const r of routes) {
          expect(r.guards).toContain(ApiKeyGuard);
          expect(r.guards).not.toContain(JwtAuthGuard);
          expect(r.guards).not.toContain(RolesGuard);
        }
      }
    });

    it('should protect GET /api/v1/api-keys/verify strictly with ApiKeyGuard', () => {
      const verifyRoute = allRoutes.find(
        (r) => r.controllerClass === ApiKeysController && r.fullPath === '/api/v1/api-keys/verify',
      );
      expect(verifyRoute).toBeDefined();
      expect(verifyRoute?.guards).toContain(ApiKeyGuard);
      expect(verifyRoute?.guards).not.toContain(JwtAuthGuard);
      expect(verifyRoute?.guards).not.toContain(RolesGuard);
    });
  });

  describe('Mutable Documents & SUNAT Communications Idempotency', () => {
    const idempotentRoutes = [
      { method: 'POST', fullPath: '/api/v1/invoices' },
      { method: 'POST', fullPath: '/api/v1/receipts' },
      { method: 'POST', fullPath: '/api/v1/credit-notes' },
      { method: 'POST', fullPath: '/api/v1/debit-notes' },
      { method: 'POST', fullPath: '/api/v1/documents/:id/send' },
      { method: 'POST', fullPath: '/api/v1/documents/daily-summaries' },
      { method: 'POST', fullPath: '/api/v1/documents/void-communications' },
    ];

    it('should attach IdempotencyInterceptor to all mutable creation/issuance and SUNAT dispatch routes', () => {
      for (const expected of idempotentRoutes) {
        const route = allRoutes.find(
          (r) => r.httpMethod === expected.method && r.fullPath === expected.fullPath,
        );
        expect(route).toBeDefined();
        expect(route?.interceptors).toContain(IdempotencyInterceptor);
      }
    });

    it('should NOT attach IdempotencyInterceptor to non-mutable or query routes', () => {
      const nonIdempotentRoutes = allRoutes.filter(
        (r) =>
          !idempotentRoutes.some(
            (idm) => idm.method === r.httpMethod && idm.fullPath === r.fullPath,
          ),
      );

      for (const route of nonIdempotentRoutes) {
        expect(route.interceptors).not.toContain(IdempotencyInterceptor);
      }
    });
  });

  describe('Development Webhook Endpoints Environment Guarding', () => {
    it('should reject test dispatch and signature verification when NODE_ENV === "production"', async () => {
      const originalEnv = process.env.NODE_ENV;
      try {
        process.env.NODE_ENV = 'production';
        const dummyWebhooksService: any = {
          dispatch: jest.fn(),
          register: jest.fn(),
          listByCompany: jest.fn(),
          delete: jest.fn(),
          getDeliveries: jest.fn(),
        };
        const controller = new WebhooksController(dummyWebhooksService);

        await expect(
          controller.testDispatch({ event: 'invoice.issued' as any, data: {} }, 'company-uuid'),
        ).rejects.toThrow(ForbiddenException);

        expect(() =>
          controller.verifySignature({ payload: {}, header: 't=1,v1=abc', secret: 'whsec_test' }),
        ).toThrow(ForbiddenException);
      } finally {
        process.env.NODE_ENV = originalEnv;
      }
    });
  });
});
