import { Injectable, BadRequestException } from '@nestjs/common';
import {
  MAX_WEBHOOK_ATTEMPTS,
  MAX_RETRY_DELAY_MS,
  RETRYABLE_HTTP_STATUS_CODES,
} from './webhook-policy.constants';
import {
  WebhookDeliveryContext,
  WebhookDeliveryDecision,
} from './webhook-policy.interface';
import {
  calculateExponentialBackoff,
  parseRetryAfter,
} from './webhook-policy.util';

@Injectable()
export class WebhookDeliveryPolicyService {
  /**
   * Pure method that evaluates the result of a webhook delivery attempt.
   *
   * Rules:
   * 1. HTTP 200–299: SUCCESS (outcome='SUCCESS', retryable=false, nextDelayMs=null).
   * 2. Retryable triggers:
   *    - Sanitized network errors (isNetworkError=true or sanitizedNetworkError set)
   *    - Timeout (isTimeout=true)
   *    - HTTP status 408, 425, 429, 500, 502, 503, 504.
   * 3. Terminal failure triggers:
   *    - Other HTTP 4xx (e.g. 400, 401, 403, 404, 422, etc.)
   *    - Max attempts reached (attempt >= maxAttempts)
   *    - Non-retryable status codes (e.g., 3xx, 501, or unknown unhandled codes)
   * 4. Delay calculation:
   *    - If Retry-After is specified and valid, uses Retry-After (bounded by 15 mins).
   *    - Otherwise, computes exponential backoff with deterministic jitter (0 <= jitter <= 1).
   *    - If attempt >= maxAttempts: nextDelayMs=null, outcome='TERMINAL_FAILURE', retryable=false.
   * 5. Returns strictly { outcome, retryable, nextDelayMs, attempt, maxAttempts }.
   *    Never leaks URLs, payloads, headers, responses, secrets, or raw error messages.
   */
  evaluate(context: WebhookDeliveryContext): WebhookDeliveryDecision {
    if (!context || typeof context !== 'object') {
      throw new BadRequestException('El contexto de entrega de webhook es inválido o nulo.');
    }

    // Attempt validation
    const rawAttempt = Number(context.attempt);
    if (!Number.isInteger(rawAttempt) || rawAttempt < 1) {
      throw new BadRequestException('El número de intento debe ser un número entero mayor o igual a 1.');
    }

    // Max attempts configuration (default 5, strictly capped at MAX_WEBHOOK_ATTEMPTS = 5)
    let configuredMaxAttempts = MAX_WEBHOOK_ATTEMPTS;
    if (context.maxAttempts !== undefined && context.maxAttempts !== null) {
      const parsedMax = Number(context.maxAttempts);
      if (!Number.isInteger(parsedMax) || parsedMax < 1) {
        throw new BadRequestException('El número máximo de intentos debe ser un entero positivo.');
      }
      configuredMaxAttempts = Math.min(parsedMax, MAX_WEBHOOK_ATTEMPTS);
    }
    const maxAttempts = configuredMaxAttempts;
    const currentAttempt = rawAttempt;

    // Jitter validation: deterministic number between 0 and 1
    let jitter = 0;
    if (context.jitter !== undefined && context.jitter !== null) {
      const numJitter = Number(context.jitter);
      if (!Number.isFinite(numJitter) || numJitter < 0 || numJitter > 1) {
        throw new BadRequestException('El factor de jitter debe ser un número entre 0 y 1 inclusive.');
      }
      jitter = numJitter;
    }

    // Status code extraction & validation
    let statusCode: number | null = null;
    if (context.statusCode !== undefined && context.statusCode !== null) {
      const code = Number(context.statusCode);
      if (!Number.isInteger(code) || code < 100 || code > 599) {
        throw new BadRequestException('El código de estado HTTP debe ser un número entero entre 100 y 599.');
      }
      statusCode = code;
    }

    const isTimeout = Boolean(context.isTimeout);
    const isNetworkError = Boolean(
      context.isNetworkError ||
      (context.sanitizedNetworkError && String(context.sanitizedNetworkError).trim() !== '')
    );

    // 1. Success condition: HTTP 200..299
    if (statusCode !== null && statusCode >= 200 && statusCode < 300) {
      return Object.freeze({
        outcome: 'SUCCESS',
        retryable: false,
        nextDelayMs: null,
        attempt: currentAttempt,
        maxAttempts,
      });
    }

    // 2. Identify if the failure is inherently retryable
    const isRetryableError =
      isTimeout ||
      isNetworkError ||
      (statusCode !== null && RETRYABLE_HTTP_STATUS_CODES.has(statusCode));

    // 3. If not retryable or already at/exceeded max attempts, terminal failure
    if (!isRetryableError || currentAttempt >= maxAttempts) {
      return Object.freeze({
        outcome: 'TERMINAL_FAILURE',
        retryable: false,
        nextDelayMs: null,
        attempt: currentAttempt,
        maxAttempts,
      });
    }

    // 4. Calculate next delay
    let nextDelayMs: number;
    const parsedRetryAfterMs = parseRetryAfter(context.retryAfter, context.now);

    if (parsedRetryAfterMs !== null && parsedRetryAfterMs >= 0) {
      // Respect safe Retry-After bounded to MAX_RETRY_DELAY_MS (15 mins)
      nextDelayMs = Math.min(parsedRetryAfterMs, MAX_RETRY_DELAY_MS);
    } else {
      // Exponential backoff based on the attempt that just failed
      nextDelayMs = calculateExponentialBackoff(currentAttempt, jitter);
    }

    return Object.freeze({
      outcome: 'RETRY',
      retryable: true,
      nextDelayMs,
      attempt: currentAttempt,
      maxAttempts,
    });
  }

  /**
   * Helper to check if an HTTP status code is retryable according to policy
   */
  isRetryableStatusCode(statusCode: number): boolean {
    return RETRYABLE_HTTP_STATUS_CODES.has(statusCode);
  }

  /**
   * Helper to check if an HTTP status code is successful
   */
  isSuccessfulStatusCode(statusCode: number): boolean {
    return Number.isInteger(statusCode) && statusCode >= 200 && statusCode < 300;
  }
}
