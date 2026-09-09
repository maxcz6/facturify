import {
  AUDIT_ACTIONS,
  AUDIT_ACTOR_TYPES,
  AUDIT_RESULTS,
  AUDIT_FIELD_LIMITS,
  AuditAction,
  AuditActorType,
  AuditResult,
} from './audit-events.constants';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SAFE_TOKEN_REGEX = /^[a-zA-Z0-9_.-]+$/;

/**
 * Validates that a string is a standard RFC 4122 UUID.
 */
export function isValidUuid(val: unknown): val is string {
  return typeof val === 'string' && UUID_REGEX.test(val);
}

/**
 * Validates whether the given value is an allowed audit action.
 */
export function isValidAuditAction(val: unknown): val is AuditAction {
  return typeof val === 'string' && (AUDIT_ACTIONS as readonly string[]).includes(val);
}

/**
 * Validates whether the given value is an allowed actor type.
 */
export function isValidActorType(val: unknown): val is AuditActorType {
  return typeof val === 'string' && (AUDIT_ACTOR_TYPES as readonly string[]).includes(val);
}

/**
 * Validates whether the given value is an allowed result.
 */
export function isValidAuditResult(val: unknown): val is AuditResult {
  return typeof val === 'string' && (AUDIT_RESULTS as readonly string[]).includes(val);
}

/**
 * Sanitizes and validates a public code.
 * Allows alphanumeric, underscore, hyphen and dot up to 64 chars.
 * Returns sanitized string or null.
 */
export function sanitizePublicCode(val: unknown): string | null {
  if (val === undefined || val === null) {
    return null;
  }
  if (typeof val !== 'string') {
    throw new TypeError('publicCode debe ser una cadena de texto o null');
  }
  const trimmed = val.trim();
  if (trimmed.length === 0) {
    return null;
  }
  if (trimmed.length > AUDIT_FIELD_LIMITS.PUBLIC_CODE_MAX_LENGTH) {
    throw new Error('publicCode excede la longitud maxima permitida');
  }
  if (!SAFE_TOKEN_REGEX.test(trimmed)) {
    throw new Error('publicCode contiene caracteres no permitidos');
  }
  return trimmed;
}

/**
 * Sanitizes and validates a requestId.
 * Allows alphanumeric, underscore, hyphen and dot up to 64 chars.
 * Returns sanitized string or null.
 */
export function sanitizeRequestId(val: unknown): string | null {
  if (val === undefined || val === null) {
    return null;
  }
  if (typeof val !== 'string') {
    throw new TypeError('requestId debe ser una cadena de texto o null');
  }
  const trimmed = val.trim();
  if (trimmed.length === 0) {
    return null;
  }
  if (trimmed.length > AUDIT_FIELD_LIMITS.REQUEST_ID_MAX_LENGTH) {
    throw new Error('requestId excede la longitud maxima permitida');
  }
  if (!SAFE_TOKEN_REGEX.test(trimmed)) {
    throw new Error('requestId contiene caracteres no permitidos');
  }
  return trimmed;
}

/**
 * Parses and formats an occurredAt date to ISO 8601 string.
 */
export function formatOccurredAt(dateOrStr?: Date | string): string {
  if (!dateOrStr) {
    return new Date().toISOString();
  }
  const date = typeof dateOrStr === 'string' ? new Date(dateOrStr) : dateOrStr;
  if (!(date instanceof Date) || isNaN(date.getTime())) {
    throw new Error('occurredAt debe ser una fecha valida');
  }
  return date.toISOString();
}

/**
 * Recursively freezes an object making it completely immutable.
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
