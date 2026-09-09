import * as https from 'node:https';
import type { ClientRequest, IncomingMessage } from 'node:http';
import * as net from 'node:net';
import { Injectable, Optional } from '@nestjs/common';
import {
  DEFAULT_WEBHOOK_TIMEOUT_MS,
  MAX_WEBHOOK_TIMEOUT_MS,
  MAX_PAYLOAD_SIZE_BYTES,
  MAX_RESPONSE_BYTES,
  MAX_PINNED_IPS,
  MAX_RETRY_AFTER_LENGTH,
  PUBLIC_ERROR_CODES,
} from './safe-webhook-client.constants';
import {
  HttpsRequestFactory,
  SafeWebhookClientException,
  SafeWebhookRequestOptions,
  SafeWebhookResponse,
} from './safe-webhook-client.interface';

@Injectable()
export class SafeWebhookHttpClient {
  private readonly requestFactory: HttpsRequestFactory;

  constructor(@Optional() customRequestFactory?: HttpsRequestFactory) {
    this.requestFactory = customRequestFactory ?? https.request;
  }

  /**
   * Executes a safe POST webhook request:
   * - Pins destination to a pre-validated IP to eliminate DNS rebinding & second DNS lookup.
   * - Preserves original hostname as SNI (servername) and Host header.
   * - Forces TLS validation (ejectUnauthorized: true).
   * - Does not follow HTTP redirects.
   * - Rejects oversized payloads or responses.
   * - Returns exclusively { statusCode, ok, retryAfter }.
   * - Sanitizes errors into public codes TIMEOUT or NETWORK_ERROR without leaking secrets.
   */
  async sendWebhook(options: SafeWebhookRequestOptions): Promise<SafeWebhookResponse> {
    this.validateInputs(options);

    const parsedUrl = new URL(options.url.trim());
    const originalHostname = parsedUrl.hostname.trim();
    const port = parsedUrl.port ? parseInt(parsedUrl.port, 10) : 443;
    const path = (parsedUrl.pathname || '/') + (parsedUrl.search || '');

    // Select the first pre-validated IP from the pinned set
    const pinnedIp = options.validatedIps[0].trim().replace(/^\[|\]$/g, '');

    const payloadBuffer = Buffer.from(options.payload, 'utf8');
    const timeoutMs = Math.min(
      Math.max(100, options.timeoutMs ?? DEFAULT_WEBHOOK_TIMEOUT_MS),
      MAX_WEBHOOK_TIMEOUT_MS
    );
    const requestedResponseLimit = options.maxResponseBytes ?? MAX_RESPONSE_BYTES;
    const maxResponseBytes = Math.min(Math.max(1, requestedResponseLimit), MAX_RESPONSE_BYTES);

    // Build headers
    const sanitizedHeaders: Record<string, string> = {};
    if (options.headers && typeof options.headers === 'object') {
      for (const [key, value] of Object.entries(options.headers)) {
        const normalizedKey = key.toLowerCase();
        if (typeof value === 'string' && !['host', 'content-length'].includes(normalizedKey)) {
          sanitizedHeaders[key] = value;
        }
      }
    }

    // Strictly enforce Host header matching the original hostname
    sanitizedHeaders['Host'] = parsedUrl.host;
    sanitizedHeaders['Content-Type'] = sanitizedHeaders['Content-Type'] || 'application/json';
    sanitizedHeaders['Content-Length'] = String(payloadBuffer.byteLength);

    // Node.js https.request options with IP pinning & mandatory TLS validation
    const requestOptions: https.RequestOptions = {
      protocol: 'https:',
      method: 'POST',
      host: pinnedIp, // Direct connection to pinned IP address
      port,
      path,
      headers: sanitizedHeaders,
      servername: originalHostname, // SNI uses the original hostname for certificate verification
      rejectUnauthorized: true, // Non-negotiable TLS validation
    };

    return new Promise<SafeWebhookResponse>((resolve, reject) => {
      let isCompleted = false;
      let timeoutTimer: NodeJS.Timeout | null = null;

      const cleanup = () => {
        isCompleted = true;
        if (timeoutTimer) {
          clearTimeout(timeoutTimer);
          timeoutTimer = null;
        }
      };

      let req: ClientRequest;
      try {
        req = this.requestFactory(requestOptions, (res: IncomingMessage) => {
          let receivedBytes = 0;

          res.on('data', (chunk: Buffer) => {
            receivedBytes += chunk.length;
            if (receivedBytes > maxResponseBytes) {
              cleanup();
              res.destroy();
              req.destroy();
              reject(
                new SafeWebhookClientException(
                  PUBLIC_ERROR_CODES.RESPONSE_TOO_LARGE,
                  'El tamaño de respuesta del webhook superó el límite permitido.'
                )
              );
            }
          });

          res.on('end', () => {
            if (isCompleted) return;
            cleanup();

            const statusCode = res.statusCode ?? 500;
            const ok = statusCode >= 200 && statusCode < 300;

            // Extract sanitized Retry-After header if present
            let retryAfter: string | null = null;
            const rawRetryAfter = res.headers['retry-after'];
            if (rawRetryAfter && typeof rawRetryAfter === 'string') {
              const cleaned = rawRetryAfter
                .replace(/[\u0000-\u001F\u007F-\u009F]/g, '')
                .trim();
              if (cleaned.length > 0) {
                retryAfter = cleaned.slice(0, MAX_RETRY_AFTER_LENGTH);
              }
            }

            resolve(
              Object.freeze({
                statusCode,
                ok,
                retryAfter,
              })
            );
          });

          res.on('error', () => {
            if (isCompleted) return;
            cleanup();
            res.destroy();
            req.destroy();
            reject(
              new SafeWebhookClientException(
                PUBLIC_ERROR_CODES.NETWORK_ERROR,
                'Error de comunicación de red al entregar webhook.'
              )
            );
          });
        });
      } catch {
        cleanup();
        return reject(
          new SafeWebhookClientException(
            PUBLIC_ERROR_CODES.NETWORK_ERROR,
            'Error al inicializar transporte seguro del webhook.'
          )
        );
      }

      // Socket & request timeout handling
      req.setTimeout(timeoutMs, () => {
        if (isCompleted) return;
        cleanup();
        req.destroy();
        reject(
          new SafeWebhookClientException(
            PUBLIC_ERROR_CODES.TIMEOUT,
            'Tiempo de espera agotado al conectar o transmitir el webhook.'
          )
        );
      });

      // Overall transfer fallback timer
      timeoutTimer = setTimeout(() => {
        if (isCompleted) return;
        cleanup();
        req.destroy();
        reject(
          new SafeWebhookClientException(
            PUBLIC_ERROR_CODES.TIMEOUT,
            'Tiempo de espera límite agotado durante la entrega del webhook.'
          )
        );
      }, timeoutMs + 200);

      req.on('error', (err: any) => {
        if (isCompleted) return;
        cleanup();
        req.destroy();

        if (err?.name === 'AbortError' || err?.code === 'ETIMEDOUT' || err?.code === 'ESOCKETTIMEDOUT') {
          return reject(
            new SafeWebhookClientException(
              PUBLIC_ERROR_CODES.TIMEOUT,
              'Tiempo de espera agotado al entregar el webhook.'
            )
          );
        }

        reject(
          new SafeWebhookClientException(
            PUBLIC_ERROR_CODES.NETWORK_ERROR,
            'Error de red o conexión al entregar el webhook.'
          )
        );
      });

      // Write payload and close request stream
      try {
        req.write(payloadBuffer);
        req.end();
      } catch {
        if (isCompleted) return;
        cleanup();
        req.destroy();
        reject(
          new SafeWebhookClientException(
            PUBLIC_ERROR_CODES.NETWORK_ERROR,
            'Error al escribir datos en el socket del webhook.'
          )
        );
      }
    });
  }

  private validateInputs(options: SafeWebhookRequestOptions): void {
    if (!options || typeof options !== 'object') {
      throw new SafeWebhookClientException(
        PUBLIC_ERROR_CODES.INVALID_INPUT,
        'Opciones de petición webhook inválidas o ausentes.'
      );
    }

    if (typeof options.url !== 'string' || !options.url.trim()) {
      throw new SafeWebhookClientException(
        PUBLIC_ERROR_CODES.INVALID_INPUT,
        'La URL de destino del webhook es requerida.'
      );
    }

    let parsed: URL;
    try {
      parsed = new URL(options.url.trim());
    } catch {
      throw new SafeWebhookClientException(
        PUBLIC_ERROR_CODES.INVALID_INPUT,
        'Formato de URL del webhook inválido.'
      );
    }

    if (parsed.protocol !== 'https:') {
      throw new SafeWebhookClientException(
        PUBLIC_ERROR_CODES.INVALID_INPUT,
        'Solo se permite el protocolo seguro HTTPS para la entrega de webhooks.'
      );
    }

    if (
      !Array.isArray(options.validatedIps) ||
      options.validatedIps.length === 0 ||
      options.validatedIps.length > MAX_PINNED_IPS
    ) {
      throw new SafeWebhookClientException(
        PUBLIC_ERROR_CODES.INVALID_INPUT,
        'El conjunto de IPs validadas debe ser no vacío y contener como máximo 16 direcciones.'
      );
    }

    for (const ip of options.validatedIps) {
      if (typeof ip !== 'string' || net.isIP(ip.trim().replace(/^\[|\]$/g, '')) === 0) {
        throw new SafeWebhookClientException(
          PUBLIC_ERROR_CODES.INVALID_INPUT,
          'Se detectó una dirección IP con formato inválido en el conjunto validado.'
        );
      }
    }

    if (typeof options.payload !== 'string') {
      throw new SafeWebhookClientException(
        PUBLIC_ERROR_CODES.INVALID_INPUT,
        'El payload debe ser una cadena JSON serializada.'
      );
    }

    if (options.maxResponseBytes !== undefined && (!Number.isInteger(options.maxResponseBytes) || options.maxResponseBytes < 1)) {
      throw new SafeWebhookClientException(
        PUBLIC_ERROR_CODES.INVALID_INPUT,
        'El límite de respuesta debe ser un entero positivo.'
      );
    }

    const payloadBytes = Buffer.byteLength(options.payload, 'utf8');
    if (payloadBytes > MAX_PAYLOAD_SIZE_BYTES) {
      throw new SafeWebhookClientException(
        PUBLIC_ERROR_CODES.PAYLOAD_TOO_LARGE,
        'El tamaño del payload del webhook excede el límite máximo permitido (256 KB).'
      );
    }
  }
}
