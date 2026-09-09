import {
  ADMIN_ROLES,
  AdminTokenRole,
  TOKEN_TIME_LIMITS,
} from './admin-token-policy.constants';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Validates whether a value is a standard RFC 4122 UUID.
 */
export function isValidUuid(val: unknown): val is string {
  return typeof val === 'string' && UUID_REGEX.test(val);
}

/**
 * Validates whether a role is one of the allowed admin roles.
 */
export function isValidAdminRole(val: unknown): val is AdminTokenRole {
  return typeof val === 'string' && (ADMIN_ROLES as readonly string[]).includes(val);
}

/**
 * Normalizes clock tolerance in seconds, bounded between 0 and 60 seconds.
 */
export function normalizeClockTolerance(toleranceRaw?: unknown): number {
  if (toleranceRaw === undefined || toleranceRaw === null || toleranceRaw === '') {
    return TOKEN_TIME_LIMITS.DEFAULT_CLOCK_TOLERANCE_SECONDS;
  }
  const parsed = Number(toleranceRaw);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return TOKEN_TIME_LIMITS.DEFAULT_CLOCK_TOLERANCE_SECONDS;
  }
  return Math.min(Math.floor(parsed), TOKEN_TIME_LIMITS.MAX_CLOCK_TOLERANCE_SECONDS);
}

/**
 * Recursively freezes an object to ensure strict immutability.
 */
export function deepFreeze<T>(obj: T): Readonly<T> {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }
  Object.freeze(obj);
  for (const key of Object.keys(obj)) {
    const val = (obj as Record<string, unknown>)[key];
    if (val !== null && typeof val === 'object' && !Object.isFrozen(val)) {
      deepFreeze(val);
    }
  }
  return obj;
}
