import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import {
  SunatTicketPollingPolicyService,
  SunatTicketPolicyModule,
  DEFAULT_TICKET_MAX_ATTEMPTS,
  ABSOLUTE_MAX_TICKET_ATTEMPTS,
  MIN_TICKET_DELAY_MS,
  MAX_TICKET_DELAY_MS,
  PROHIBITED_TICKET_POLICY_FIELDS,
  calculateTicketBackoffDelay,
  sanitizeRetryAfterMs,
} from '../src/sunat-ticket-policy';

describe('SunatTicketPollingPolicyService', () => {
  let service: SunatTicketPollingPolicyService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [SunatTicketPolicyModule],
    }).compile();

    service = module.get<SunatTicketPollingPolicyService>(SunatTicketPollingPolicyService);
  });

  describe('Instanciación Pura y Módulo', () => {
    it('debe poder instanciarse directamente sin NestJS', () => {
      const pure = new SunatTicketPollingPolicyService();
      expect(pure).toBeInstanceOf(SunatTicketPollingPolicyService);
    });

    it('debe estar provisto por SunatTicketPolicyModule', () => {
      expect(service).toBeDefined();
    });
  });

  describe('Estado 98 (En Proceso - Reintento Válido)', () => {
    it('debe indicar PENDING y retryable: true en el primer intento', () => {
      const decision = service.evaluate({
        attempt: 1,
        sunatStatusCode: '98',
        elapsedMs: 2000,
      });

      expect(decision).toEqual({
        outcome: 'PENDING',
        retryable: true,
        nextDelayMs: MIN_TICKET_DELAY_MS, // 2000 ms
        attempt: 1,
        maxAttempts: DEFAULT_TICKET_MAX_ATTEMPTS,
      });
      expect(Object.isFrozen(decision)).toBe(true);
    });

    it('debe calcular backoff exponencial creciente por cada intento en estado 98', () => {
      // Intento 1 -> 2000 ms
      // Intento 2 -> 4000 ms
      // Intento 3 -> 8000 ms
      // Intento 4 -> 16000 ms
      const d1 = service.evaluate({ attempt: 1, sunatStatusCode: '98', elapsedMs: 0 });
      const d2 = service.evaluate({ attempt: 2, sunatStatusCode: '98', elapsedMs: 2000 });
      const d3 = service.evaluate({ attempt: 3, sunatStatusCode: '98', elapsedMs: 6000 });
      const d4 = service.evaluate({ attempt: 4, sunatStatusCode: '98', elapsedMs: 14000 });

      expect(d1.nextDelayMs).toBe(2000);
      expect(d2.nextDelayMs).toBe(4000);
      expect(d3.nextDelayMs).toBe(8000);
      expect(d4.nextDelayMs).toBe(16000);
    });

    it('debe topar el retardo máximo en 2 minutos (120,000 ms)', () => {
      const decision = service.evaluate({
        attempt: 10,
        sunatStatusCode: '98',
        elapsedMs: 60000,
      });

      expect(decision.outcome).toBe('PENDING');
      expect(decision.nextDelayMs).toBe(MAX_TICKET_DELAY_MS); // 120,000 ms
    });
  });

  describe('Estados Terminales con CDR Disponible (0, 00, 99)', () => {
    const terminalWithCdr = ['0', '00', '99'];

    terminalWithCdr.forEach((code) => {
      it(`debe devolver PROCESS_CDR y retryable: false para código SUNAT: ${code}`, () => {
        const decision = service.evaluate({
          attempt: 3,
          sunatStatusCode: code,
          elapsedMs: 15000,
        });

        expect(decision).toEqual({
          outcome: 'PROCESS_CDR',
          retryable: false,
          nextDelayMs: null,
          attempt: 3,
          maxAttempts: DEFAULT_TICKET_MAX_ATTEMPTS,
        });
      });
    });
  });

  describe('Estados Desconocidos o No Manejados (Prevención de Bucles Infinitos)', () => {
    const unknownCodes = ['UNKNOWN', 'ERROR_SUNAT', '0100', '999', 'INVALID'];

    unknownCodes.forEach((code) => {
      it(`debe clasificar el código no previsto '${code}' como TERMINAL_FAILURE de forma conservadora`, () => {
        const decision = service.evaluate({
          attempt: 1,
          sunatStatusCode: code,
          elapsedMs: 1000,
        });

        expect(decision).toEqual({
          outcome: 'TERMINAL_FAILURE',
          retryable: false,
          nextDelayMs: null,
          attempt: 1,
          maxAttempts: DEFAULT_TICKET_MAX_ATTEMPTS,
        });
      });
    });
  });

  describe('Límites de Intentos y Límite Temporal Máximo (Agotamiento)', () => {
    it('debe devolver EXHAUSTED si attempt >= maxAttempts', () => {
      const decision = service.evaluate({
        attempt: 20,
        maxAttempts: 20,
        sunatStatusCode: '98',
        elapsedMs: 60000,
      });

      expect(decision).toEqual({
        outcome: 'EXHAUSTED',
        retryable: false,
        nextDelayMs: null,
        attempt: 20,
        maxAttempts: 20,
      });
    });

    it('no debe permitir un maxAttempts mayor a 20 aunque se configure un valor superior', () => {
      const decision = service.evaluate({
        attempt: 20,
        maxAttempts: 50, // Debe toparse en 20
        sunatStatusCode: '98',
        elapsedMs: 60000,
      });

      expect(decision.outcome).toBe('EXHAUSTED');
      expect(decision.maxAttempts).toBe(ABSOLUTE_MAX_TICKET_ATTEMPTS); // 20
    });

    it('debe devolver EXHAUSTED si elapsedMs >= maxTotalMs (30 minutos)', () => {
      const thirtyMinutesMs = 30 * 60 * 1000;
      const decision = service.evaluate({
        attempt: 5,
        sunatStatusCode: '98',
        elapsedMs: thirtyMinutesMs,
      });

      expect(decision).toEqual({
        outcome: 'EXHAUSTED',
        retryable: false,
        nextDelayMs: null,
        attempt: 5,
        maxAttempts: 20,
      });
    });

    it('no debe permitir un maxTotalMs mayor a 30 minutos', () => {
      const fortyMinutesMs = 40 * 60 * 1000;
      const thirtyMinutesMs = 30 * 60 * 1000;

      const decision = service.evaluate({
        attempt: 5,
        sunatStatusCode: '98',
        elapsedMs: thirtyMinutesMs,
        maxTotalMs: fortyMinutesMs, // Debe toparse en 30 minutos
      });

      expect(decision.outcome).toBe('EXHAUSTED');
    });
  });

  describe('Soporte de Retry-After y Jitter Determinista', () => {
    it('debe respetar retryAfterMs dentro del rango permitido [2s, 120s]', () => {
      const decision = service.evaluate({
        attempt: 1,
        sunatStatusCode: '98',
        elapsedMs: 1000,
        retryAfterMs: 45000, // 45 segundos
      });

      expect(decision.nextDelayMs).toBe(45000);
    });

    it('debe acotar retryAfterMs si es menor al mínimo (2s) o mayor al máximo (120s)', () => {
      const decisionLow = service.evaluate({
        attempt: 1,
        sunatStatusCode: '98',
        elapsedMs: 1000,
        retryAfterMs: 500, // Menor que 2000 ms
      });
      expect(decisionLow.nextDelayMs).toBe(2000);

      const decisionHigh = service.evaluate({
        attempt: 1,
        sunatStatusCode: '98',
        elapsedMs: 1000,
        retryAfterMs: 300000, // Mayor que 120,000 ms
      });
      expect(decisionHigh.nextDelayMs).toBe(120000);
    });

    it('debe aplicar jitter determinista correctamente sin Math.random', () => {
      // Intento 1 base: 2000 ms. Con jitter 0.5 -> 3000 ms
      const decision = service.evaluate({
        attempt: 1,
        sunatStatusCode: '98',
        elapsedMs: 1000,
        jitter: 0.5,
      });

      expect(decision.nextDelayMs).toBe(3000);

      // Intento 2 base: 4000 ms. Con jitter 0.25 -> 5000 ms
      const decision2 = service.evaluate({
        attempt: 2,
        sunatStatusCode: '98',
        elapsedMs: 1000,
        jitter: 0.25,
      });

      expect(decision2.nextDelayMs).toBe(5000);
    });
  });

  describe('Ausencia Estricta de Secretos y Datos Sensibles en Respuestas', () => {
    it('el objeto retornado debe contener exclusivamente los 5 campos requeridos', () => {
      const decision = service.evaluate({
        attempt: 1,
        sunatStatusCode: '98',
        elapsedMs: 500,
      });

      const allowedKeys = ['attempt', 'maxAttempts', 'nextDelayMs', 'outcome', 'retryable'];
      expect(Object.keys(decision).sort()).toEqual(allowedKeys);

      for (const field of PROHIBITED_TICKET_POLICY_FIELDS) {
        expect((decision as any)[field]).toBeUndefined();
      }
    });
  });

  describe('Validación de Entradas (BadRequestException)', () => {
    it('debe rechazar contexto nulo o inválido', () => {
      expect(() => service.evaluate(null as any)).toThrow(BadRequestException);
      expect(() => service.evaluate('invalid' as any)).toThrow(BadRequestException);
    });

    it('debe rechazar attempt inválido (< 1 o no entero)', () => {
      expect(() =>
        service.evaluate({ attempt: 0, sunatStatusCode: '98', elapsedMs: 0 })
      ).toThrow(BadRequestException);

      expect(() =>
        service.evaluate({ attempt: 1.5, sunatStatusCode: '98', elapsedMs: 0 })
      ).toThrow(BadRequestException);
    });

    it('debe rechazar elapsedMs negativo o no finito', () => {
      expect(() =>
        service.evaluate({ attempt: 1, sunatStatusCode: '98', elapsedMs: -100 })
      ).toThrow(BadRequestException);

      expect(() =>
        service.evaluate({ attempt: 1, sunatStatusCode: '98', elapsedMs: NaN })
      ).toThrow(BadRequestException);
    });

    it('debe rechazar código de estado SUNAT ausente o vacío', () => {
      expect(() =>
        service.evaluate({ attempt: 1, sunatStatusCode: '', elapsedMs: 0 })
      ).toThrow(BadRequestException);

      expect(() =>
        service.evaluate({ attempt: 1, sunatStatusCode: null, elapsedMs: 0 })
      ).toThrow(BadRequestException);
    });

    it('debe rechazar jitter fuera de [0, 1]', () => {
      expect(() =>
        service.evaluate({ attempt: 1, sunatStatusCode: '98', elapsedMs: 0, jitter: -0.1 })
      ).toThrow(BadRequestException);

      expect(() =>
        service.evaluate({ attempt: 1, sunatStatusCode: '98', elapsedMs: 0, jitter: 1.5 })
      ).toThrow(BadRequestException);
    });

    it('debe rechazar maxAttempts o maxTotalMs no válidos', () => {
      expect(() =>
        service.evaluate({ attempt: 1, sunatStatusCode: '98', elapsedMs: 0, maxAttempts: 0 })
      ).toThrow(BadRequestException);

      expect(() =>
        service.evaluate({ attempt: 1, sunatStatusCode: '98', elapsedMs: 0, maxTotalMs: -1 })
      ).toThrow(BadRequestException);
    });
  });

  describe('Funciones Puras de Utilidad (calculateTicketBackoffDelay, sanitizeRetryAfterMs)', () => {
    it('calculateTicketBackoffDelay debe devolver siempre valores dentro de los límites', () => {
      expect(calculateTicketBackoffDelay(1)).toBe(2000);
      expect(calculateTicketBackoffDelay(20)).toBe(120000);
      expect(calculateTicketBackoffDelay(1, 0.5)).toBe(3000);
    });

    it('sanitizeRetryAfterMs debe manejar valores nulos o inválidos', () => {
      expect(sanitizeRetryAfterMs(null)).toBeNull();
      expect(sanitizeRetryAfterMs(undefined)).toBeNull();
      expect(sanitizeRetryAfterMs(-100)).toBeNull();
      expect(sanitizeRetryAfterMs('not-a-number')).toBeNull();
    });
  });
});
