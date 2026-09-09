import { EventEmitter } from 'node:events';
import { Test, TestingModule } from '@nestjs/testing';
import {
  SafeWebhookHttpClient,
  SafeWebhookClientModule,
  SafeWebhookClientException,
  PUBLIC_ERROR_CODES,
  PROHIBITED_CLIENT_OUTPUT_FIELDS,
} from '../src/safe-webhook-client';

class MockClientRequest extends EventEmitter {
  public options: any;
  public writtenData: Buffer[] = [];
  public destroyed = false;
  public ended = false;
  public timeoutHandler?: () => void;

  constructor(options: any) {
    super();
    this.options = options;
  }

  write(chunk: any) {
    this.writtenData.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    return true;
  }

  end() {
    this.ended = true;
    this.emit('finish');
    return this;
  }

  destroy(err?: Error) {
    this.destroyed = true;
    if (err) this.emit('error', err);
    return this;
  }

  setTimeout(ms: number, cb?: () => void) {
    if (cb) this.timeoutHandler = cb;
    return this;
  }
}

class MockIncomingMessage extends EventEmitter {
  public statusCode: number;
  public headers: Record<string, string>;
  public destroyed = false;

  constructor(statusCode: number, headers: Record<string, string> = {}) {
    super();
    this.statusCode = statusCode;
    this.headers = headers;
  }

  destroy() {
    this.destroyed = true;
    return this;
  }
}

describe('SafeWebhookHttpClient', () => {
  let client: SafeWebhookHttpClient;
  let lastMockRequest: MockClientRequest | null = null;
  let requestFactoryMock: jest.Mock;

  const validOptions = {
    url: 'https://api.example.com:8443/webhooks/listener?env=prod',
    validatedIps: ['93.184.216.34', '198.51.100.1'],
    payload: JSON.stringify({ event: 'document.created', id: 'doc_123' }),
    headers: {
      'X-Signature': 'sig_test_abc123',
      'User-Agent': 'CustomWebhook/1.0',
    },
  };

  beforeEach(async () => {
    lastMockRequest = null;
    requestFactoryMock = jest.fn((options, _callback) => {
      lastMockRequest = new MockClientRequest(options);
      return lastMockRequest;
    });

    const module: TestingModule = await Test.createTestingModule({
      imports: [SafeWebhookClientModule],
    })
      .overrideProvider(SafeWebhookHttpClient)
      .useValue(new SafeWebhookHttpClient(requestFactoryMock))
      .compile();

    client = module.get<SafeWebhookHttpClient>(SafeWebhookHttpClient);
  });

  describe('Instanciación Pura y Módulo', () => {
    it('debe poder instanciarse directamente sin NestJS', () => {
      const pure = new SafeWebhookHttpClient();
      expect(pure).toBeInstanceOf(SafeWebhookHttpClient);
    });

    it('debe estar provisto adecuadamente por SafeWebhookClientModule', () => {
      expect(client).toBeDefined();
    });
  });

  describe('Conexión a IP Fijada, SNI y Host Header (Defensa Anti-Rebinding y TLS)', () => {
    it('debe conectar a la IP validada fijando host, pero usando originalHostname como SNI y Host', async () => {
      const promise = client.sendWebhook(validOptions);

      expect(requestFactoryMock).toHaveBeenCalledTimes(1);
      const reqOpts = requestFactoryMock.mock.calls[0][0];

      // Verificación de defensa anti-rebinding: host apunta a la IP fijada
      expect(reqOpts.host).toBe('93.184.216.34');
      expect(reqOpts.port).toBe(8443);
      expect(reqOpts.path).toBe('/webhooks/listener?env=prod');

      // Verificación de TLS estricto y SNI
      expect(reqOpts.servername).toBe('api.example.com');
      expect(reqOpts.rejectUnauthorized).toBe(true);

      // Verificación de cabecera Host
      expect(reqOpts.headers['Host']).toBe('api.example.com:8443');
      expect(reqOpts.headers['X-Signature']).toBe('sig_test_abc123');

      // Simula respuesta 200 OK del servidor
      const res = new MockIncomingMessage(200);
      const callback = requestFactoryMock.mock.calls[0][1];
      callback(res);
      res.emit('data', Buffer.from('{"status":"received"}'));
      res.emit('end');

      const result = await promise;
      expect(result).toEqual({
        statusCode: 200,
        ok: true,
        retryAfter: null,
      });
    });

    it('rejectUnauthorized debe ser incondicionalmente true', async () => {
      const promise = client.sendWebhook(validOptions);
      const reqOpts = requestFactoryMock.mock.calls[0][0];
      expect(reqOpts.rejectUnauthorized).toBe(true);

      const callback = requestFactoryMock.mock.calls[0][1];
      const res = new MockIncomingMessage(204);
      callback(res);
      res.emit('end');
      await promise;
    });
  });

  describe('Estados HTTP (2xx, 4xx, 5xx) y Redirecciones', () => {
    it('debe marcar ok: true únicamente para respuestas HTTP 200-299', async () => {
      const statusList = [200, 201, 204, 206];
      for (const status of statusList) {
        const promise = client.sendWebhook(validOptions);
        const callback = requestFactoryMock.mock.calls[requestFactoryMock.mock.calls.length - 1][1];
        const res = new MockIncomingMessage(status);
        callback(res);
        res.emit('end');

        const result = await promise;
        expect(result.statusCode).toBe(status);
        expect(result.ok).toBe(true);
      }
    });

    it('debe marcar ok: false para errores cliente HTTP 4xx sin lanzar excepción si se recibió respuesta', async () => {
      const promise = client.sendWebhook(validOptions);
      const callback = requestFactoryMock.mock.calls[0][1];
      const res = new MockIncomingMessage(404);
      callback(res);
      res.emit('data', Buffer.from('Not Found'));
      res.emit('end');

      const result = await promise;
      expect(result.statusCode).toBe(404);
      expect(result.ok).toBe(false);
    });

    it('debe marcar ok: false para errores servidor HTTP 5xx', async () => {
      const promise = client.sendWebhook(validOptions);
      const callback = requestFactoryMock.mock.calls[0][1];
      const res = new MockIncomingMessage(503, { 'retry-after': '60' });
      callback(res);
      res.emit('end');

      const result = await promise;
      expect(result.statusCode).toBe(503);
      expect(result.ok).toBe(false);
      expect(result.retryAfter).toBe('60');
    });

    it('no debe seguir redirecciones HTTP (301, 302, 307, 308) y devolver el código 3xx con ok: false', async () => {
      const promise = client.sendWebhook(validOptions);
      const callback = requestFactoryMock.mock.calls[0][1];
      const res = new MockIncomingMessage(302, { location: 'https://evil.internal/endpoint' });
      callback(res);
      res.emit('end');

      const result = await promise;
      expect(result.statusCode).toBe(302);
      expect(result.ok).toBe(false);
      // No debe existir location ni seguir a evil.internal
      expect((result as any).location).toBeUndefined();
    });
  });

  describe('Soporte Sanitizado de Retry-After', () => {
    it('debe extraer y limpiar Retry-After válido', async () => {
      const promise = client.sendWebhook(validOptions);
      const callback = requestFactoryMock.mock.calls[0][1];
      const res = new MockIncomingMessage(429, { 'retry-after': '  120\r\n\x00  ' });
      callback(res);
      res.emit('end');

      const result = await promise;
      expect(result.retryAfter).toBe('120');
    });

    it('debe truncar Retry-After excesivamente largo', async () => {
      const longHeader = 'A'.repeat(300);
      const promise = client.sendWebhook(validOptions);
      const callback = requestFactoryMock.mock.calls[0][1];
      const res = new MockIncomingMessage(429, { 'retry-after': longHeader });
      callback(res);
      res.emit('end');

      const result = await promise;
      expect(result.retryAfter?.length).toBe(128);
    });
  });

  describe('Protección contra Exceso de Tamaño de Respuesta', () => {
    it('debe destruir la conexión si el cuerpo de respuesta supera el límite (64 KB)', async () => {
      const promise = client.sendWebhook({ ...validOptions, maxResponseBytes: 1024 });
      const callback = requestFactoryMock.mock.calls[0][1];
      const res = new MockIncomingMessage(200);
      callback(res);

      // Enviar chunk grande que supere el límite
      res.emit('data', Buffer.alloc(2048));

      await expect(promise).rejects.toThrow(SafeWebhookClientException);
      await expect(promise).rejects.toMatchObject({
        code: PUBLIC_ERROR_CODES.RESPONSE_TOO_LARGE,
      });
      expect(res.destroyed).toBe(true);
      expect(lastMockRequest?.destroyed).toBe(true);
    });
  });

  describe('Manejo Sanitizado de Timeout y Errores de Red', () => {
    it('debe convertir timeout de socket en excepción pública con código TIMEOUT', async () => {
      const promise = client.sendWebhook(validOptions);
      expect(lastMockRequest?.timeoutHandler).toBeDefined();

      // Disparar timeout
      lastMockRequest?.timeoutHandler!();

      await expect(promise).rejects.toThrow(SafeWebhookClientException);
      await expect(promise).rejects.toMatchObject({
        code: PUBLIC_ERROR_CODES.TIMEOUT,
      });
      expect(lastMockRequest?.destroyed).toBe(true);
    });

    it('debe convertir error de conexión en excepción pública con código NETWORK_ERROR sin filtrar detalles', async () => {
      const promise = client.sendWebhook(validOptions);

      // Simula error de conexión interno que contiene datos sensibles
      const sensitiveErr = new Error('getaddrinfo ENOTFOUND internal.db secret_token');
      (sensitiveErr as any).code = 'ECONNREFUSED';
      lastMockRequest?.emit('error', sensitiveErr);

      await expect(promise).rejects.toThrow(SafeWebhookClientException);
      try {
        await promise;
      } catch (err: any) {
        expect(err.code).toBe(PUBLIC_ERROR_CODES.NETWORK_ERROR);
        expect(err.message).not.toContain('secret_token');
        expect(err.message).not.toContain('internal.db');
        expect(err.message).not.toContain('ECONNREFUSED');
      }
    });
  });

  describe('Validación Estricta de Entradas (Inputs)', () => {
    it('debe rechazar URLs que no sean HTTPS', async () => {
      await expect(
        client.sendWebhook({ ...validOptions, url: 'http://api.example.com/hook' })
      ).rejects.toThrow(SafeWebhookClientException);
    });

    it('debe rechazar lista de IPs vacía o con formato inválido', async () => {
      await expect(
        client.sendWebhook({ ...validOptions, validatedIps: [] })
      ).rejects.toThrow(SafeWebhookClientException);

      await expect(
        client.sendWebhook({ ...validOptions, validatedIps: ['not-an-ip'] })
      ).rejects.toThrow(SafeWebhookClientException);
    });

    it('debe rechazar payload que exceda el tamaño máximo de 256 KB', async () => {
      const hugePayload = 'X'.repeat(300 * 1024);
      await expect(
        client.sendWebhook({ ...validOptions, payload: hugePayload })
      ).rejects.toMatchObject({
        code: PUBLIC_ERROR_CODES.PAYLOAD_TOO_LARGE,
      });
    });
  });

  describe('Ausencia Total de Información Sensible en Respuestas', () => {
    it('la respuesta debe contener exclusivamente { statusCode, ok, retryAfter }', async () => {
      const promise = client.sendWebhook(validOptions);
      const callback = requestFactoryMock.mock.calls[0][1];
      const res = new MockIncomingMessage(200);
      callback(res);
      res.emit('data', Buffer.from('{"secret":"token123"}'));
      res.emit('end');

      const result = await promise;
      const keys = Object.keys(result).sort();
      expect(keys).toEqual(['ok', 'retryAfter', 'statusCode'].sort());

      for (const field of PROHIBITED_CLIENT_OUTPUT_FIELDS) {
        expect((result as any)[field]).toBeUndefined();
      }
    });
  });
});
