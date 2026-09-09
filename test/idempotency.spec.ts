import { BadRequestException } from '@nestjs/common';
import {
  IDEMPOTENCY_KEY_MAX_LENGTH,
  IDEMPOTENCY_KEY_MIN_LENGTH,
  IDEMPOTENCY_KEY_REGEX,
} from '../src/idempotency/idempotency.constants';
import { IdempotencyModule } from '../src/idempotency/idempotency.module';
import { IdempotencyService } from '../src/idempotency/idempotency.service';
import {
  canonicalizeJson,
  isSensitiveKey,
  normalizeMethod,
  normalizePath,
} from '../src/idempotency/idempotency.util';

describe('IdempotencyService (Pure Key Validation & Deterministic SHA-256 Fingerprinting)', () => {
  let service: IdempotencyService;

  const companyA = '5f15da94-4e0c-42d7-947e-9ad304a31710';
  const companyB = '6c26eb05-5f1d-53e8-058f-0be415b42821';

  beforeEach(() => {
    service = new IdempotencyService();
  });

  describe('Module & Constants', () => {
    it('should be instantiable directly and via module', () => {
      expect(service).toBeDefined();
      expect(new IdempotencyModule()).toBeDefined();
    });

    it('should expose consistent boundary constants', () => {
      expect(IDEMPOTENCY_KEY_MIN_LENGTH).toBe(16);
      expect(IDEMPOTENCY_KEY_MAX_LENGTH).toBe(128);
      expect(IDEMPOTENCY_KEY_REGEX).toBeDefined();
    });
  });

  describe('Validación de Claves Idempotency-Key', () => {
    it('should accept valid standard UUID v4 keys', () => {
      const validUuid = '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d';
      const result = service.validateIdempotencyKey(validUuid);

      expect(result.isValid).toBe(true);
      expect(result.error).toBeUndefined();
      expect(service.assertValidIdempotencyKey(validUuid)).toBe(validUuid);
    });

    it('should accept minimum length keys (exactly 16 safe ASCII characters)', () => {
      const minKey = 'A1b2C3d4E5f6G7h8';
      expect(minKey).toHaveLength(16);

      const result = service.validateIdempotencyKey(minKey);
      expect(result.isValid).toBe(true);
      expect(service.assertValidIdempotencyKey(minKey)).toBe(minKey);
    });

    it('should accept maximum length keys (exactly 128 safe ASCII characters)', () => {
      const maxKey = 'a'.repeat(128);
      expect(maxKey).toHaveLength(128);

      const result = service.validateIdempotencyKey(maxKey);
      expect(result.isValid).toBe(true);
      expect(service.assertValidIdempotencyKey(maxKey)).toBe(maxKey);
    });

    it('should accept safe ASCII characters: uppercase, lowercase, numbers, underscores, hyphens and dots', () => {
      const complexKey = 'Req_2026-09-08.Invoice_Batch-001.Final';
      const result = service.validateIdempotencyKey(complexKey);

      expect(result.isValid).toBe(true);
      expect(service.assertValidIdempotencyKey(complexKey)).toBe(complexKey);
    });

    it('should reject keys shorter than 16 characters', () => {
      const shortKey = 'short-key-15chr'; // 15 characters
      expect(shortKey.length).toBe(15);

      const result = service.validateIdempotencyKey(shortKey);
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('demasiado corta');

      expect(() => service.assertValidIdempotencyKey(shortKey)).toThrow(BadRequestException);
    });

    it('should reject keys longer than 128 characters', () => {
      const longKey = 'a'.repeat(129); // 129 characters
      expect(longKey.length).toBe(129);

      const result = service.validateIdempotencyKey(longKey);
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('demasiado larga');

      expect(() => service.assertValidIdempotencyKey(longKey)).toThrow(BadRequestException);
    });

    it('should reject keys with spaces (leading, trailing, or middle)', () => {
      const keysWithSpaces = [
        ' 9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d',
        '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d ',
        '9b1deb4d-3b7d 4bad-9bdd-2b0d7b3dcb6d',
        '                ',
      ];

      for (const key of keysWithSpaces) {
        const result = service.validateIdempotencyKey(key);
        expect(result.isValid).toBe(false);
        expect(result.error).toContain('espacios');
        expect(() => service.assertValidIdempotencyKey(key)).toThrow(BadRequestException);
      }
    });

    it('should reject CRLF and control characters', () => {
      const maliciousKeys = [
        'key-123456789012\r\n',
        'key-123456789012\n',
        'key-123456789012\r',
        'key-123456789012\t',
        'key-123456789012\0',
      ];

      for (const key of maliciousKeys) {
        const result = service.validateIdempotencyKey(key);
        expect(result.isValid).toBe(false);
        expect(result.error).toContain('saltos de línea');
        expect(() => service.assertValidIdempotencyKey(key)).toThrow(BadRequestException);
      }
    });

    it('should reject Unicode and accented characters', () => {
      const unicodeKeys = [
        'clave-idempotente-con-ñ-12345',
        'key-with-accent-áéíóú-12345',
        'key-with-unicode-symbol-§-12345',
        'key-with-chinese-你好世界123',
      ];

      for (const key of unicodeKeys) {
        const result = service.validateIdempotencyKey(key);
        expect(result.isValid).toBe(false);
        expect(result.error).toContain('caracteres no permitidos');
        expect(() => service.assertValidIdempotencyKey(key)).toThrow(BadRequestException);
      }
    });

    it('should reject disallowed punctuation and special characters', () => {
      const invalidPunctuation = [
        'key-with-semi;colon-12345',
        'key-with-slash/path-12345',
        'key-with-backslash\\-12345',
        'key-with-at@symbol-12345',
        'key-with-hash#tag-12345',
        'key-with-dollar$val-12345',
        'key-with-quotes"val-12345',
        'key-with-colon:val-12345',
      ];

      for (const key of invalidPunctuation) {
        const result = service.validateIdempotencyKey(key);
        expect(result.isValid).toBe(false);
        expect(result.error).toContain('caracteres no permitidos');
      }
    });

    it('should reject empty, null, undefined, or non-string inputs with safe messages', () => {
      expect(service.validateIdempotencyKey('').isValid).toBe(false);
      expect(service.validateIdempotencyKey(null).isValid).toBe(false);
      expect(service.validateIdempotencyKey(undefined).isValid).toBe(false);
      expect(service.validateIdempotencyKey(1234567890123456 as any).isValid).toBe(false);
      expect(service.validateIdempotencyKey({} as any).isValid).toBe(false);

      expect(() => service.assertValidIdempotencyKey('')).toThrow(BadRequestException);
      expect(() => service.assertValidIdempotencyKey(null)).toThrow(BadRequestException);
      expect(() => service.assertValidIdempotencyKey(undefined)).toThrow(BadRequestException);
    });

    it('should ensure error messages do not echo dangerous input', () => {
      const maliciousPayload = '<script>alert(1)</script>';
      const result = service.validateIdempotencyKey(maliciousPayload);

      expect(result.isValid).toBe(false);
      expect(result.error).not.toContain('<script>');
      expect(result.error).not.toContain('alert(1)');
    });
  });

  describe('Canonicalización Determinista de JSON', () => {
    it('should produce identical canonical strings for objects with different key order', () => {
      const obj1 = { series: 'F001', number: 1, type: 'INVOICE' };
      const obj2 = { type: 'INVOICE', number: 1, series: 'F001' };
      const obj3 = { number: 1, series: 'F001', type: 'INVOICE' };

      const canon1 = canonicalizeJson(obj1);
      const canon2 = canonicalizeJson(obj2);
      const canon3 = canonicalizeJson(obj3);

      expect(canon1).toBe('{"number":1,"series":"F001","type":"INVOICE"}');
      expect(canon1).toBe(canon2);
      expect(canon2).toBe(canon3);
    });

    it('should produce identical canonical strings for deeply nested objects with mixed key order', () => {
      const deep1 = {
        meta: { z: 10, a: 20 },
        items: [
          { subtotal: 100, description: 'Prod A', quantity: 2 },
          { subtotal: 50, description: 'Prod B', quantity: 1 },
        ],
      };

      const deep2 = {
        items: [
          { quantity: 2, description: 'Prod A', subtotal: 100 },
          { description: 'Prod B', subtotal: 50, quantity: 1 },
        ],
        meta: { a: 20, z: 10 },
      };

      expect(canonicalizeJson(deep1)).toBe(canonicalizeJson(deep2));
    });

    it('should preserve array element order strictly', () => {
      const arr1 = [1, 2, 3];
      const arr2 = [3, 2, 1];

      expect(canonicalizeJson(arr1)).not.toBe(canonicalizeJson(arr2));
      expect(canonicalizeJson(arr1)).toBe('[1,2,3]');
      expect(canonicalizeJson(arr2)).toBe('[3,2,1]');
    });

    it('should handle primitives: numbers, booleans, strings, and null', () => {
      expect(canonicalizeJson(null)).toBe('null');
      expect(canonicalizeJson(true)).toBe('true');
      expect(canonicalizeJson(false)).toBe('false');
      expect(canonicalizeJson(0)).toBe('0');
      expect(canonicalizeJson(-0)).toBe('0');
      expect(canonicalizeJson(123.45)).toBe('123.45');
      expect(canonicalizeJson('simple text')).toBe('"simple text"');
      expect(canonicalizeJson('text with "quotes"')).toBe('"text with \\"quotes\\""');
    });

    it('should handle undefined inside objects by omitting the property', () => {
      const objWithUndefined = { a: 1, b: undefined, c: 3 };
      const objClean = { a: 1, c: 3 };

      expect(canonicalizeJson(objWithUndefined)).toBe(canonicalizeJson(objClean));
      expect(canonicalizeJson(objWithUndefined)).toBe('{"a":1,"c":3}');
    });

    it('should reject non-finite numbers during canonicalization', () => {
      expect(() => canonicalizeJson({ a: NaN })).toThrow(
        'Non-finite numbers cannot be canonicalized.',
      );
      expect(() => canonicalizeJson({ a: Infinity })).toThrow(
        'Non-finite numbers cannot be canonicalized.',
      );
    });
  });

  describe('Exclusión Estricta de Campos Sensibles', () => {
    it('should identify sensitive keys via isSensitiveKey', () => {
      expect(isSensitiveKey('authorization')).toBe(true);
      expect(isSensitiveKey('Authorization')).toBe(true);
      expect(isSensitiveKey('password')).toBe(true);
      expect(isSensitiveKey('token')).toBe(true);
      expect(isSensitiveKey('secret')).toBe(true);
      expect(isSensitiveKey('apiKey')).toBe(true);
      expect(isSensitiveKey('api_key')).toBe(true);
      expect(isSensitiveKey('certificado')).toBe(true);
      expect(isSensitiveKey('certificados')).toBe(true);
      expect(isSensitiveKey('certificate')).toBe(true);
      expect(isSensitiveKey('clientSecret')).toBe(true);
      expect(isSensitiveKey('accessToken')).toBe(true);

      // Business fields must NOT be flagged as sensitive
      expect(isSensitiveKey('series')).toBe(false);
      expect(isSensitiveKey('number')).toBe(false);
      expect(isSensitiveKey('customerName')).toBe(false);
      expect(isSensitiveKey('ruc')).toBe(false);
      expect(isSensitiveKey('subtotal')).toBe(false);
      expect(isSensitiveKey('tax')).toBe(false);
      expect(isSensitiveKey('total')).toBe(false);
    });

    it('should strip root-level sensitive fields from canonical JSON', () => {
      const bodyWithSecrets = {
        companyId: companyA,
        series: 'F001',
        number: 10,
        password: 'SuperSecretPassword123!',
        token: 'eyJhbGciOiJIUzI1NiIsIn...',
        secret: 'webhook_secret_key',
        authorization: 'Bearer admin-token',
        apiKey: 'fact_live_1234567890',
        certificados: ['base64-pfx-content'],
      };

      const canonical = canonicalizeJson(bodyWithSecrets);

      expect(canonical).not.toContain('password');
      expect(canonical).not.toContain('SuperSecretPassword123!');
      expect(canonical).not.toContain('token');
      expect(canonical).not.toContain('webhook_secret_key');
      expect(canonical).not.toContain('apiKey');
      expect(canonical).not.toContain('certificados');

      expect(canonical).toBe(
        `{"companyId":"${companyA}","number":10,"series":"F001"}`,
      );
    });

    it('should strip deeply nested sensitive fields at all levels', () => {
      const payload = {
        document: {
          series: 'F001',
          number: 25,
          auth: {
            token: 'nested-token-value',
            apiKey: 'nested-api-key',
          },
        },
        items: [
          {
            description: 'Item 1',
            secret: 'item-secret',
            clientSecret: 'sub-secret',
            unitPrice: 100,
          },
        ],
      };

      const canonical = canonicalizeJson(payload);

      expect(canonical).not.toContain('nested-token-value');
      expect(canonical).not.toContain('nested-api-key');
      expect(canonical).not.toContain('item-secret');
      expect(canonical).not.toContain('sub-secret');

      expect(canonical).toBe(
        '{"document":{"auth":{},"number":25,"series":"F001"},"items":[{"description":"Item 1","unitPrice":100}]}',
      );
    });

    it('should produce identical fingerprints even if sensitive field values are altered or rotated', () => {
      const req1 = {
        method: 'POST',
        path: '/v1/documents',
        companyId: companyA,
        body: {
          series: 'F001',
          number: 100,
          token: 'token_version_1',
          password: 'oldPassword!',
          secret: 'oldSecret',
        },
      };

      const req2 = {
        method: 'POST',
        path: '/v1/documents',
        companyId: companyA,
        body: {
          series: 'F001',
          number: 100,
          token: 'token_version_2_after_rotation',
          password: 'newRotatedPassword!',
          secret: 'newSecretKey',
        },
      };

      const fp1 = service.generateFingerprint(req1);
      const fp2 = service.generateFingerprint(req2);

      expect(fp1).toBe(fp2);
    });
  });

  describe('Generación Determinista de Huella SHA-256 (generateFingerprint)', () => {
    it('should return a 64-character lowercase hexadecimal SHA-256 hash', () => {
      const fp = service.generateFingerprint({
        method: 'POST',
        path: '/documents',
        companyId: companyA,
        body: { series: 'F001', number: 1 },
      });

      expect(fp).toHaveLength(64);
      expect(fp).toMatch(/^[0-9a-f]{64}$/);
    });

    it('should generate identical fingerprints for equivalent bodies with different key order', () => {
      const fp1 = service.generateFingerprint({
        method: 'POST',
        path: '/documents',
        companyId: companyA,
        body: {
          series: 'F001',
          number: 45,
          total: 118,
          items: [{ desc: 'Laptop', price: 100, qty: 1 }],
        },
      });

      const fp2 = service.generateFingerprint({
        method: 'POST',
        path: '/documents',
        companyId: companyA,
        body: {
          total: 118,
          items: [{ qty: 1, desc: 'Laptop', price: 100 }],
          series: 'F001',
          number: 45,
        },
      });

      expect(fp1).toBe(fp2);
    });

    it('should enforce multi-tenant isolation (different companyId produces different fingerprint)', () => {
      const payloadBody = { series: 'F001', number: 45, total: 118 };

      const fpCompanyA = service.generateFingerprint({
        method: 'POST',
        path: '/documents',
        companyId: companyA,
        body: payloadBody,
      });

      const fpCompanyB = service.generateFingerprint({
        method: 'POST',
        path: '/documents',
        companyId: companyB,
        body: payloadBody,
      });

      expect(fpCompanyA).not.toBe(fpCompanyB);
    });

    it('should produce different fingerprints for different HTTP methods', () => {
      const fpPost = service.generateFingerprint({
        method: 'POST',
        path: '/documents',
        companyId: companyA,
        body: { a: 1 },
      });

      const fpPut = service.generateFingerprint({
        method: 'PUT',
        path: '/documents',
        companyId: companyA,
        body: { a: 1 },
      });

      expect(fpPost).not.toBe(fpPut);
    });

    it('should produce different fingerprints for different routes', () => {
      const fp1 = service.generateFingerprint({
        method: 'POST',
        path: '/documents',
        companyId: companyA,
        body: { a: 1 },
      });

      const fp2 = service.generateFingerprint({
        method: 'POST',
        path: '/invoices',
        companyId: companyA,
        body: { a: 1 },
      });

      expect(fp1).not.toBe(fp2);
    });

    it('should produce different fingerprints for different bodies', () => {
      const fp1 = service.generateFingerprint({
        method: 'POST',
        path: '/documents',
        companyId: companyA,
        body: { amount: 100 },
      });

      const fp2 = service.generateFingerprint({
        method: 'POST',
        path: '/documents',
        companyId: companyA,
        body: { amount: 200 },
      });

      expect(fp1).not.toBe(fp2);
    });
  });

  describe('Normalización de Métodos y Rutas', () => {
    it('should normalize HTTP method case-insensitively', () => {
      expect(normalizeMethod('post')).toBe('POST');
      expect(normalizeMethod('Post')).toBe('POST');
      expect(normalizeMethod('  PUT  ')).toBe('PUT');

      const fpLower = service.generateFingerprint({
        method: 'post',
        path: '/documents',
        companyId: companyA,
        body: { a: 1 },
      });

      const fpUpper = service.generateFingerprint({
        method: 'POST',
        path: '/documents',
        companyId: companyA,
        body: { a: 1 },
      });

      expect(fpLower).toBe(fpUpper);
    });

    it('should normalize paths with trailing slashes, duplicate slashes, and whitespace', () => {
      expect(normalizePath('/documents/')).toBe('/documents');
      expect(normalizePath('documents')).toBe('/documents');
      expect(normalizePath('/v1//documents///')).toBe('/v1/documents');
      expect(normalizePath('/')).toBe('/');

      const fp1 = service.generateFingerprint({
        method: 'POST',
        path: '/v1/documents/',
        companyId: companyA,
      });

      const fp2 = service.generateFingerprint({
        method: 'POST',
        path: 'v1//documents',
        companyId: companyA,
      });

      expect(fp1).toBe(fp2);
    });

    it('should normalize query parameters in path deterministically', () => {
      const path1 = '/documents?sort=asc&limit=10';
      const path2 = '/documents?limit=10&sort=asc';

      const fp1 = service.generateFingerprint({
        method: 'GET',
        path: path1,
        companyId: companyA,
      });

      const fp2 = service.generateFingerprint({
        method: 'GET',
        path: path2,
        companyId: companyA,
      });

      expect(fp1).toBe(fp2);
    });
  });

  describe('Validaciones de Entrada para generateFingerprint', () => {
    it('should throw BadRequestException when companyId is missing or empty', () => {
      expect(() =>
        service.generateFingerprint({
          method: 'POST',
          path: '/documents',
          companyId: '',
        }),
      ).toThrow(BadRequestException);

      expect(() =>
        service.generateFingerprint({
          method: 'POST',
          path: '/documents',
          companyId: null as any,
        }),
      ).toThrow(BadRequestException);

      expect(() =>
        service.generateFingerprint({
          method: 'POST',
          path: '/documents',
          companyId: '   ',
        }),
      ).toThrow(BadRequestException);
    });

    it('should throw BadRequestException when input object is null or invalid', () => {
      expect(() => service.generateFingerprint(null as any)).toThrow(BadRequestException);
      expect(() => service.generateFingerprint(undefined as any)).toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException when body contains non-finite numbers', () => {
      expect(() =>
        service.generateFingerprint({
          method: 'POST',
          path: '/documents',
          companyId: companyA,
          body: { amount: NaN },
        }),
      ).toThrow(BadRequestException);
    });

    it('should expose public helper methods with expected behavior', () => {
      expect(service.canonicalizeBody({ b: 2, a: 1 })).toBe('{"a":1,"b":2}');
      expect(service.normalizePath('///invoices///')).toBe('/invoices');
      expect(service.normalizeMethod('get')).toBe('GET');
      expect(service.isSensitiveKey('password')).toBe(true);
      expect(service.isSensitiveKey('series')).toBe(false);
    });

    it('should handle Date and Decimal objects and edge case types in canonicalizeBody', () => {
      const date = new Date('2026-09-08T12:00:00.000Z');
      const fakeDecimal = {
        toFixed: () => '10.50',
        isDecimal: () => true,
        toString: () => '10.50',
      };

      const canon = service.canonicalizeBody({
        issuedAt: date,
        amount: fakeDecimal,
        list: [undefined, 'item'],
      });

      expect(canon).toContain('"issuedAt":"2026-09-08T12:00:00.000Z"');
      expect(canon).toContain('"amount":"10.50"');
      expect(canon).toContain('"list":[null,"item"]');
    });

    it('should handle fallback defaults for empty method and empty path', () => {
      expect(normalizeMethod('')).toBe('POST');
      expect(normalizeMethod(null as any)).toBe('POST');
      expect(normalizePath('')).toBe('/');
      expect(normalizePath(null as any)).toBe('/');
    });
  });
});
