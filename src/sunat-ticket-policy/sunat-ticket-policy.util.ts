import {
  MIN_TICKET_DELAY_MS,
  MAX_TICKET_DELAY_MS,
  TICKET_BACKOFF_FACTOR,
} from './sunat-ticket-policy.constants';

/**
 * Calculates exponential backoff delay for ticket polling:
 * Base: MIN_TICKET_DELAY_MS * (2 ^ (attempt - 1))
 * Limited between MIN_TICKET_DELAY_MS (2s) and MAX_TICKET_DELAY_MS (2m / 120s).
 * If jitter is provided (0 <= jitter <= 1):
 * totalDelay = delay + (delay * jitter) bounded by MAX_TICKET_DELAY_MS.
 */
export function calculateTicketBackoffDelay(
  attempt: number,
  jitter: number = 0,
): number {
  const safeAttempt = Math.max(1, Math.floor(attempt));
  // attempt 1 -> 2000 * 2^0 = 2000 ms
  // attempt 2 -> 2000 * 2^1 = 4000 ms
  // attempt 3 -> 2000 * 2^2 = 8000 ms
  // attempt 4 -> 2000 * 2^3 = 16000 ms
  // attempt 5 -> 2000 * 2^4 = 32000 ms
  // attempt 6 -> 2000 * 2^5 = 64000 ms
  // attempt 7 -> 2000 * 2^6 = 128000 ms -> clamped to 120000 ms
  const exponent = safeAttempt - 1;
  const baseDelay = MIN_TICKET_DELAY_MS * Math.pow(TICKET_BACKOFF_FACTOR, exponent);
  const clampedBase = Math.min(Math.max(baseDelay, MIN_TICKET_DELAY_MS), MAX_TICKET_DELAY_MS);

  let totalDelay = clampedBase;
  if (typeof jitter === 'number' && Number.isFinite(jitter) && jitter > 0) {
    const clampedJitter = Math.min(1, Math.max(0, jitter));
    totalDelay = Math.round(clampedBase * (1 + clampedJitter));
  }

  return Math.min(Math.max(totalDelay, MIN_TICKET_DELAY_MS), MAX_TICKET_DELAY_MS);
}

/**
 * Bounds a suggested retryAfterMs within [MIN_TICKET_DELAY_MS, MAX_TICKET_DELAY_MS]
 */
export function sanitizeRetryAfterMs(retryAfterMs: unknown): number | null {
  if (retryAfterMs === null || retryAfterMs === undefined) {
    return null;
  }

  const num = Number(retryAfterMs);
  if (!Number.isFinite(num) || num <= 0) {
    return null;
  }

  // Clamped between 2 seconds and 2 minutes
  return Math.min(Math.max(Math.round(num), MIN_TICKET_DELAY_MS), MAX_TICKET_DELAY_MS);
}
