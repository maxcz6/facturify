export const MAX_WEBHOOK_ATTEMPTS = 5;
export const INITIAL_RETRY_DELAY_MS = 1000; // 1 second base delay
export const BACKOFF_MULTIPLIER = 2; // exponential factor: 2^(attempt - 1)
export const MAX_RETRY_DELAY_MS = 15 * 60 * 1000; // 15 minutes = 900,000 ms

/**
 * Standard retryable HTTP status codes:
 * 408 Request Timeout, 425 Too Early, 429 Too Many Requests,
 * 500 Internal Server Error, 502 Bad Gateway, 503 Service Unavailable, 504 Gateway Timeout
 */
export const RETRYABLE_HTTP_STATUS_CODES: ReadonlySet<number> = new Set([
  408, 425, 429, 500, 502, 503, 504,
]);

/**
 * Fields that must never be present in the returned evaluation decision
 */
export const PROHIBITED_OUTPUT_FIELDS: readonly string[] = Object.freeze([
  'url',
  'payload',
  'headers',
  'response',
  'body',
  'secret',
  'token',
  'authorization',
  'apiKey',
  'message',
  'originalMessage',
  'rawError',
  'stack',
]);
