import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import {
  WebhookDeliveryPolicyService,
  WebhookPolicyModule,
  MAX_WEBHOOK_ATTEMPTS,
  INITIAL_RETRY_DELAY_MS,
  MAX_RETRY_DELAY_MS,
  RETRYABLE_HTTP_STATUS_CODES,
  calculateExponentialBackoff,
  parseRetryAfter,
} from '../src/webhook-policy';

describe('WebhookDeliveryPolicyService', () => {
  let service: WebhookDeliveryPolicyService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [WebhookPolicyModule],
    }).compile();

    service = module.get<WebhookDeliveryPolicyService>(WebhookDeliveryPolicyService);
  });

  describe('Instanciación pura y dependencias', () => {
    it('debe poder instanciarse directamente como servicio puro sin NestJS', () => {
      const pureService = new WebhookDeliveryPolicyService();
      expect(pureService).toBeInstanceOf(WebhookDeliveryPolicyService);
    });

    it('debe estar provisto adecuadamente por WebhookPolicyModule', () => {
      expect(service).toBeDefined();
    });
  });

  describe('Estados Exitosos (HTTP 200–299)', () => {
    const successfulCodes = [200, 201, 202, 204, 206, 299];

    successfulCodes.forEach((statusCode) => {
      it(`debe considerar HTTP ${statusCode} como exitoso sin reintento`, () => {
        const decision = service.evaluate({
          attempt: 1,
          statusCode,
        });

        expect(decision).toEqual({
          outcome: 'SUCCESS',
          retryable: false,
          nextDelayMs: null,
          attempt: 1,
          maxAttempts: MAX_WEBHOOK_ATTEMPTS,
        });
      });
    });

    it('debe priorizar HTTP 200 incluso si se enviaron flags erróneos de timeout o networkError', () => {
      const decision = service.evaluate({
        attempt: 2,
        statusCode: 200,
        isTimeout: true,
        isNetworkError: true,
      });

      expect(decision.outcome).toBe('SUCCESS');
      expect(decision.retryable).toBe(false);
      expect(decision.nextDelayMs).toBeNull();
    });
  });

  describe('Errores Reintentables Específicos (HTTP 408, 425, 429, 500, 502, 503, 504)', () => {
    const retryableCodes = [408, 425, 429, 500, 502, 503, 504];

    retryableCodes.forEach((statusCode) => {
      it(`debe reintentar HTTP ${statusCode} cuando attempt < maxAttempts`, () => {
        const decision = service.evaluate({
          attempt: 1,
          statusCode,
        });

        expect(decision.outcome).toBe('RETRY');
        expect(decision.retryable).toBe(true);
        expect(decision.nextDelayMs).toBe(INITIAL_RETRY_DELAY_MS); // attempt 1 -> 1000ms
        expect(decision.attempt).toBe(1);
        expect(decision.maxAttempts).toBe(5);
      });
    });
  });

  describe('Fallos Definitivos en HTTP 4xx (excepto 408, 425 y 429)', () => {
    const terminal4xxCodes = [400, 401, 403, 404, 405, 409, 410, 422, 499];

    terminal4xxCodes.forEach((statusCode) => {
      it(`debe marcar HTTP ${statusCode} como fallo definitivo TERMINAL_FAILURE en el primer intento`, () => {
        const decision = service.evaluate({
          attempt: 1,
          statusCode,
        });

        expect(decision).toEqual({
          outcome: 'TERMINAL_FAILURE',
          retryable: false,
          nextDelayMs: null,
          attempt: 1,
          maxAttempts: 5,
        });
      });
    });

    it('debe marcar HTTP 501 (Not Implemented) u otros 5xx no reintentables como fallo definitivo', () => {
      const decision = service.evaluate({
        attempt: 1,
        statusCode: 501,
      });

      expect(decision.outcome).toBe('TERMINAL_FAILURE');
      expect(decision.retryable).toBe(false);
      expect(decision.nextDelayMs).toBeNull();
    });
  });

  describe('Timeout y Errores de Red Sanitizados', () => {
    it('debe reintentar ante timeout (isTimeout: true)', () => {
      const decision = service.evaluate({
        attempt: 1,
        isTimeout: true,
      });

      expect(decision.outcome).toBe('RETRY');
      expect(decision.retryable).toBe(true);
      expect(decision.nextDelayMs).toBe(1000);
    });

    it('debe reintentar ante error de red genérico (isNetworkError: true)', () => {
      const decision = service.evaluate({
        attempt: 2,
        isNetworkError: true,
      });

      expect(decision.outcome).toBe('RETRY');
      expect(decision.retryable).toBe(true);
      expect(decision.nextDelayMs).toBe(2000); // 1000 * 2^(2-1) = 2000
    });

    it('debe reintentar ante código de error de red sanitizado (e.g. ECONNREFUSED)', () => {
      const decision = service.evaluate({
        attempt: 3,
        sanitizedNetworkError: 'ECONNREFUSED',
      });

      expect(decision.outcome).toBe('RETRY');
      expect(decision.retryable).toBe(true);
      expect(decision.nextDelayMs).toBe(4000); // 1000 * 2^(3-1) = 4000
    });
  });

  describe('Límite de Intentos (Máximo 5 Intentos)', () => {
    it('debe permitir hasta 5 intentos y marcar TERMINAL_FAILURE en el intento 5', () => {
      // Intentos 1 a 4 con fallo reintentable (HTTP 503)
      for (let attempt = 1; attempt <= 4; attempt++) {
        const decision = service.evaluate({
          attempt,
          statusCode: 503,
        });
        expect(decision.outcome).toBe('RETRY');
        expect(decision.retryable).toBe(true);
        expect(decision.nextDelayMs).toBeGreaterThan(0);
      }

      // Intento 5: debe ser fallo terminal aunque sea HTTP 503
      const terminalDecision = service.evaluate({
        attempt: 5,
        statusCode: 503,
      });

      expect(terminalDecision).toEqual({
        outcome: 'TERMINAL_FAILURE',
        retryable: false,
        nextDelayMs: null,
        attempt: 5,
        maxAttempts: 5,
      });
    });

    it('no debe permitir superar el tope global de 5 intentos aunque maxAttempts solicite 10', () => {
      const decision = service.evaluate({
        attempt: 5,
        statusCode: 503,
        maxAttempts: 10,
      });

      expect(decision.outcome).toBe('TERMINAL_FAILURE');
      expect(decision.retryable).toBe(false);
      expect(decision.maxAttempts).toBe(5);
    });

    it('debe respetar un maxAttempts configurado menor a 5 (e.g. 3)', () => {
      const decision = service.evaluate({
        attempt: 3,
        statusCode: 503,
        maxAttempts: 3,
      });

      expect(decision.outcome).toBe('TERMINAL_FAILURE');
      expect(decision.retryable).toBe(false);
      expect(decision.maxAttempts).toBe(3);
    });
  });

  describe('Cálculo de Backoff Exponencial y Jitter Determinista', () => {
    it('debe duplicar el tiempo de espera por cada intento sin jitter', () => {
      expect(calculateExponentialBackoff(1, 0)).toBe(1000);
      expect(calculateExponentialBackoff(2, 0)).toBe(2000);
      expect(calculateExponentialBackoff(3, 0)).toBe(4000);
      expect(calculateExponentialBackoff(4, 0)).toBe(8000);
    });

    it('debe aplicar jitter determinista correctamente sin usar Math.random', () => {
      // Jitter = 0.5 añade 50% de variación determinista
      // Intento 1: 1000 * (1 + 0.5) = 1500ms
      const decisionWithJitter = service.evaluate({
        attempt: 1,
        statusCode: 503,
        jitter: 0.5,
      });

      expect(decisionWithJitter.nextDelayMs).toBe(1500);

      // Intento 2: 2000 * (1 + 0.25) = 2500ms
      const decisionWithJitter2 = service.evaluate({
        attempt: 2,
        statusCode: 503,
        jitter: 0.25,
      });

      expect(decisionWithJitter2.nextDelayMs).toBe(2500);
    });

    it('debe limitar el retardo máximo al límite de 15 minutos (900,000 ms)', () => {
      // Para un intento muy alto o cálculo de backoff extendido
      const hugeDelay = calculateExponentialBackoff(20, 1.0);
      expect(hugeDelay).toBe(MAX_RETRY_DELAY_MS);
      expect(hugeDelay).toBe(15 * 60 * 1000);
    });
  });

  describe('Soporte Seguro de Retry-After (segundos y fecha HTTP)', () => {
    it('debe respetar Retry-After en segundos como entero numérico', () => {
      const decision = service.evaluate({
        attempt: 1,
        statusCode: 429,
        retryAfter: 30, // 30 segundos -> 30,000 ms
      });

      expect(decision.outcome).toBe('RETRY');
      expect(decision.retryable).toBe(true);
      expect(decision.nextDelayMs).toBe(30000);
    });

    it('debe respetar Retry-After en segundos como string numérico', () => {
      const decision = service.evaluate({
        attempt: 1,
        statusCode: 503,
        retryAfter: '120', // 120 segundos -> 120,000 ms
      });

      expect(decision.outcome).toBe('RETRY');
      expect(decision.nextDelayMs).toBe(120000);
    });

    it('debe respetar Retry-After en formato de fecha HTTP (RFC 1123)', () => {
      const referenceNow = new Date('2026-09-08T12:00:00.000Z');
      const targetDateStr = 'Tue, 08 Sep 2026 12:05:00 GMT'; // 5 minutos después = 300,000 ms

      const decision = service.evaluate({
        attempt: 1,
        statusCode: 429,
        retryAfter: targetDateStr,
        now: referenceNow,
      });

      expect(decision.outcome).toBe('RETRY');
      expect(decision.nextDelayMs).toBe(300000);
    });

    it('debe acotar Retry-After al límite máximo de 15 minutos si excede 900 segundos', () => {
      const decision = service.evaluate({
        attempt: 1,
        statusCode: 429,
        retryAfter: 3600, // 1 hora solicitada
      });

      expect(decision.outcome).toBe('RETRY');
      expect(decision.nextDelayMs).toBe(MAX_RETRY_DELAY_MS); // Máximo 15 min (900,000 ms)
    });

    it('si Retry-After es una fecha en el pasado, debe devolver retardo inmediato (0 ms)', () => {
      const referenceNow = new Date('2026-09-08T12:00:00.000Z');
      const pastDateStr = 'Tue, 08 Sep 2026 11:59:00 GMT'; // 1 minuto en el pasado

      const decision = service.evaluate({
        attempt: 1,
        statusCode: 429,
        retryAfter: pastDateStr,
        now: referenceNow,
      });

      expect(decision.outcome).toBe('RETRY');
      expect(decision.nextDelayMs).toBe(0);
    });

    it('si Retry-After tiene formato inválido o corrupto, debe hacer fallback seguro a backoff exponencial', () => {
      const decision = service.evaluate({
        attempt: 1,
        statusCode: 429,
        retryAfter: 'invalid-header-content-!@#$',
      });

      expect(decision.outcome).toBe('RETRY');
      expect(decision.nextDelayMs).toBe(1000); // Fallback a intento 1 backoff
    });
  });

  describe('Ausencia Total de Secretos, URLs, Payloads y Cabeceras en la Respuesta', () => {
    it('la decisión solo debe contener exclusivamente los 5 campos requeridos', () => {
      const decision = service.evaluate({
        attempt: 1,
        statusCode: 500,
        // Proveyendo contexto contaminado o campos no deseados
        isNetworkError: false,
      });

      const allowedKeys = new Set(['outcome', 'retryable', 'nextDelayMs', 'attempt', 'maxAttempts']);
      const actualKeys = Object.keys(decision);

      expect(actualKeys.sort()).toEqual(Array.from(allowedKeys).sort());

      // Verificar explícitamente ausencia de campos prohibidos
      const prohibitedKeys = [
        'url',
        'payload',
        'body',
        'headers',
        'response',
        'secret',
        'token',
        'authorization',
        'apiKey',
        'message',
        'rawError',
      ];

      for (const key of prohibitedKeys) {
        expect((decision as any)[key]).toBeUndefined();
      }
    });

    it('el objeto retornado debe ser inmutable (Object.isFrozen)', () => {
      const decision = service.evaluate({
        attempt: 1,
        statusCode: 200,
      });

      expect(Object.isFrozen(decision)).toBe(true);
      expect(() => {
        (decision as any).outcome = 'RETRY';
      }).toThrow();
    });
  });

  describe('Validación de Parámetros de Entrada (BadRequestException)', () => {
    it('debe rechazar contexto nulo o inválido', () => {
      expect(() => service.evaluate(null as any)).toThrow(BadRequestException);
      expect(() => service.evaluate(undefined as any)).toThrow(BadRequestException);
      expect(() => service.evaluate('invalid' as any)).toThrow(BadRequestException);
    });

    it('debe rechazar attempt no entero o menor a 1', () => {
      expect(() => service.evaluate({ attempt: 0 })).toThrow(BadRequestException);
      expect(() => service.evaluate({ attempt: -2 })).toThrow(BadRequestException);
      expect(() => service.evaluate({ attempt: 1.5 })).toThrow(BadRequestException);
      expect(() => service.evaluate({ attempt: NaN })).toThrow(BadRequestException);
    });

    it('debe rechazar statusCode fuera de rango HTTP válido (100–599)', () => {
      expect(() => service.evaluate({ attempt: 1, statusCode: 99 })).toThrow(BadRequestException);
      expect(() => service.evaluate({ attempt: 1, statusCode: 600 })).toThrow(BadRequestException);
      expect(() => service.evaluate({ attempt: 1, statusCode: 200.5 })).toThrow(BadRequestException);
    });

    it('debe rechazar jitter menor a 0 o mayor a 1', () => {
      expect(() => service.evaluate({ attempt: 1, statusCode: 503, jitter: -0.1 })).toThrow(BadRequestException);
      expect(() => service.evaluate({ attempt: 1, statusCode: 503, jitter: 1.1 })).toThrow(BadRequestException);
      expect(() => service.evaluate({ attempt: 1, statusCode: 503, jitter: NaN })).toThrow(BadRequestException);
    });

    it('debe rechazar maxAttempts inválido', () => {
      expect(() => service.evaluate({ attempt: 1, statusCode: 503, maxAttempts: 0 })).toThrow(BadRequestException);
      expect(() => service.evaluate({ attempt: 1, statusCode: 503, maxAttempts: -5 })).toThrow(BadRequestException);
    });
  });

  describe('Métodos Auxiliares del Servicio', () => {
    it('isRetryableStatusCode debe identificar correctamente los códigos reintentables', () => {
      expect(service.isRetryableStatusCode(408)).toBe(true);
      expect(service.isRetryableStatusCode(429)).toBe(true);
      expect(service.isRetryableStatusCode(500)).toBe(true);
      expect(service.isRetryableStatusCode(503)).toBe(true);
      expect(service.isRetryableStatusCode(404)).toBe(false);
      expect(service.isRetryableStatusCode(200)).toBe(false);
    });

    it('isSuccessfulStatusCode debe identificar correctamente los códigos de éxito HTTP 2xx', () => {
      expect(service.isSuccessfulStatusCode(200)).toBe(true);
      expect(service.isSuccessfulStatusCode(201)).toBe(true);
      expect(service.isSuccessfulStatusCode(204)).toBe(true);
      expect(service.isSuccessfulStatusCode(400)).toBe(false);
      expect(service.isSuccessfulStatusCode(500)).toBe(false);
    });
  });
});
