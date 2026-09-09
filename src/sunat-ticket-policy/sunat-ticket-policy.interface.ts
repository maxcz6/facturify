/**
 * Outcome of a SUNAT ticket polling evaluation
 */
export type TicketPollingOutcome =
  | 'PENDING'
  | 'PROCESS_CDR'
  | 'EXHAUSTED'
  | 'TERMINAL_FAILURE';

/**
 * Context input provided to evaluate a SUNAT ticket polling status
 */
export interface TicketPollingContext {
  /**
   * 1-based attempt number (e.g. 1, 2, ..., 20)
   */
  attempt: number;

  /**
   * Configured maximum attempts (capped at 20)
   */
  maxAttempts?: number;

  /**
   * SUNAT status code returned by getStatus (e.g. "98", "0", "99", etc.)
   */
  sunatStatusCode: unknown;

  /**
   * Total elapsed time in milliseconds since the ticket was submitted
   */
  elapsedMs: number;

  /**
   * Maximum total polling time in milliseconds (default/capped at 30 mins)
   */
  maxTotalMs?: number;

  /**
   * Suggested delay in milliseconds from SUNAT response (if present)
   */
  retryAfterMs?: number | null;

  /**
   * Deterministic jitter between 0 and 1 inclusive (no Math.random allowed)
   */
  jitter?: number;
}

/**
 * Decision returned by SunatTicketPollingPolicyService.
 * Contains exclusively { outcome, retryable, nextDelayMs, attempt, maxAttempts }.
 */
export interface TicketPollingDecision {
  readonly outcome: TicketPollingOutcome;
  readonly retryable: boolean;
  readonly nextDelayMs: number | null;
  readonly attempt: number;
  readonly maxAttempts: number;
}
