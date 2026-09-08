import {
  INITIAL_RETRY_DELAY_MS,
  BACKOFF_MULTIPLIER,
  MAX_RETRY_DELAY_MS,
} from './webhook-policy.constants';

/**
 * Calculates exponential backoff delay with deterministic jitter:
 * delay = base * (multiplier ^ (attempt - 1))
 * If jitter is provided (0 <= jitter <= 1):
 * totalDelay = delay + (delay * jitter) capped at MAX_RETRY_DELAY_MS.
 */
export function calculateExponentialBackoff(
  attempt: number,
  jitter: number = 0,
): number {
  const safeAttempt = Math.max(1, Math.floor(attempt));
  // attempt 1 -> base * 2^0 = 1000
  // attempt 2 -> base * 2^1 = 2000
  // attempt 3 -> base * 2^2 = 4000
  // attempt 4 -> base * 2^3 = 8000
  const exponent = safeAttempt - 1;
  const baseDelay = INITIAL_RETRY_DELAY_MS * Math.pow(BACKOFF_MULTIPLIER, exponent);

  let totalDelay = baseDelay;
  if (typeof jitter === 'number' && Number.isFinite(jitter) && jitter > 0) {
    const clampedJitter = Math.min(1, Math.max(0, jitter));
    totalDelay = Math.round(baseDelay * (1 + clampedJitter));
  }

  return Math.min(totalDelay, MAX_RETRY_DELAY_MS);
}

/**
 * Safely parses Retry-After header value:
 * 1. Number of seconds (integer >= 0)
 * 2. HTTP Date string (RFC 1123, e.g. "Wed, 21 Oct 2026 07:28:00 GMT")
 * Returns milliseconds to wait, capped at MAX_RETRY_DELAY_MS, or null if invalid/past.
 */
export function parseRetryAfter(
  retryAfter: string | number | null | undefined,
  referenceDateOrMs?: number | Date,
): number | null {
  if (retryAfter === null || retryAfter === undefined) {
    return null;
  }

  const nowMs =
    referenceDateOrMs instanceof Date
      ? referenceDateOrMs.getTime()
      : typeof referenceDateOrMs === 'number' && Number.isFinite(referenceDateOrMs)
      ? referenceDateOrMs
      : Date.now();

  // Case 1: Numeric or integer string (seconds)
  if (typeof retryAfter === 'number') {
    if (!Number.isFinite(retryAfter) || retryAfter < 0) return null;
    const ms = Math.round(retryAfter * 1000);
    return Math.min(ms, MAX_RETRY_DELAY_MS);
  }

  const trimmed = String(retryAfter).trim();
  if (!trimmed) return null;

  // Check if it represents an integer string of seconds (e.g. "120")
  if (/^\d+$/.test(trimmed)) {
    const seconds = parseInt(trimmed, 10);
    if (!Number.isFinite(seconds) || seconds < 0) return null;
    const ms = seconds * 1000;
    return Math.min(ms, MAX_RETRY_DELAY_MS);
  }

  // Case 2: HTTP-date (e.g., "Wed, 21 Oct 2026 07:28:00 GMT")
  const targetTimeMs = Date.parse(trimmed);
  if (Number.isNaN(targetTimeMs)) {
    return null;
  }

  const diffMs = targetTimeMs - nowMs;
  if (diffMs <= 0) {
    return 0;
  }

  return Math.min(diffMs, MAX_RETRY_DELAY_MS);
}
