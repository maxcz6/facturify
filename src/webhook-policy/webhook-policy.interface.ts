/**
 * Outcome of a webhook delivery attempt
 */
export type WebhookDeliveryOutcome = 'SUCCESS' | 'RETRY' | 'TERMINAL_FAILURE';

/**
 * Sanitized network error reasons recognized by the policy
 */
export type SanitizedNetworkError =
  | 'TIMEOUT'
  | 'ECONNREFUSED'
  | 'ECONNRESET'
  | 'ENOTFOUND'
  | 'ETIMEDOUT'
  | 'EAI_AGAIN'
  | 'EHOSTUNREACH'
  | 'ENETUNREACH'
  | 'NETWORK_ERROR'
  | 'ABORT_ERROR';

/**
 * Context input provided to evaluate a webhook delivery
 */
export interface WebhookDeliveryContext {
  /**
   * Current 1-based attempt count (e.g. 1, 2, 3, 4, 5)
   */
  attempt: number;

  /**
   * Maximum attempts configured (default 5 if omitted, max capped at 5)
   */
  maxAttempts?: number;

  /**
   * HTTP response status code if an HTTP response was received (e.g. 200, 404, 500)
   */
  statusCode?: number | null;

  /**
   * Flag indicating if the failure was a timeout
   */
  isTimeout?: boolean;

  /**
   * Flag indicating if the failure was a network/transport error
   */
  isNetworkError?: boolean;

  /**
   * Sanitized network error code/token, if any
   */
  sanitizedNetworkError?: SanitizedNetworkError | string | null;

  /**
   * Safe Retry-After value extracted from response header.
   * Can be integer seconds (e.g. "120" or 120) or HTTP Date string (e.g. "Wed, 21 Oct 2026 07:28:00 GMT")
   */
  retryAfter?: string | number | null;

  /**
   * Deterministic jitter factor between 0 and 1 inclusive.
   * Disallows Math.random to guarantee 100% deterministic, testable behavior.
   */
  jitter?: number;

  /**
   * Reference timestamp for evaluating date-based Retry-After (defaults to Date.now())
   */
  now?: number | Date;
}

/**
 * Strict evaluation decision returned by WebhookDeliveryPolicyService.
 * Strictly contains ONLY: outcome, retryable, nextDelayMs, attempt, maxAttempts.
 * NEVER contains URLs, payloads, headers, response, secrets, or original error messages.
 */
export interface WebhookDeliveryDecision {
  readonly outcome: WebhookDeliveryOutcome;
  readonly retryable: boolean;
  readonly nextDelayMs: number | null;
  readonly attempt: number;
  readonly maxAttempts: number;
}
