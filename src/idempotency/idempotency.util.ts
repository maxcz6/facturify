import {
  SENSITIVE_KEY_NAMES,
  SENSITIVE_PATTERNS,
} from './idempotency.constants';

/**
 * Checks whether a given property key is sensitive and must be omitted from fingerprinting.
 * Evaluates exact names, normalized names, and regex patterns (case-insensitive).
 */
export function isSensitiveKey(key: string): boolean {
  if (!key || typeof key !== 'string') return false;

  const lower = key.toLowerCase();
  const stripped = lower.replace(/[-_]/g, '');

  if (SENSITIVE_KEY_NAMES.includes(lower) || SENSITIVE_KEY_NAMES.includes(stripped)) {
    return true;
  }

  return SENSITIVE_PATTERNS.some((pattern) => pattern.test(key));
}

/**
 * Normalizes an HTTP method to uppercase trimmed ASCII.
 */
export function normalizeMethod(method: unknown): string {
  if (typeof method !== 'string' || method.trim() === '') {
    return 'POST';
  }
  return method.trim().toUpperCase();
}

/**
 * Normalizes an HTTP request path:
 * - Trims whitespace
 * - Merges duplicate slashes (e.g. //documents -> /documents)
 * - Ensures leading slash
 * - Removes trailing slash (except for root '/')
 * - Sorts query parameters deterministically if present
 */
export function normalizePath(rawPath: unknown): string {
  if (typeof rawPath !== 'string' || rawPath.trim() === '') {
    return '/';
  }

  const trimmed = rawPath.trim();
  const [pathname, queryString] = trimmed.split('?');

  let normalized = pathname.replace(/\/+/g, '/');
  if (!normalized.startsWith('/')) {
    normalized = `/${normalized}`;
  }
  if (normalized.length > 1 && normalized.endsWith('/')) {
    normalized = normalized.slice(0, -1);
  }

  if (queryString !== undefined) {
    const params = new URLSearchParams(queryString);
    const sortedKeys = Array.from(new Set(params.keys())).sort();
    const parts: string[] = [];

    for (const key of sortedKeys) {
      const values = params.getAll(key).sort();
      for (const val of values) {
        parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(val)}`);
      }
    }

    if (parts.length > 0) {
      return `${normalized}?${parts.join('&')}`;
    }
  }

  return normalized;
}

/**
 * Recursively canonicalizes any JSON-compatible value:
 * - Objects have their non-sensitive keys sorted lexicographically.
 * - Sensitive keys (passwords, tokens, secrets, api keys, certificates) are stripped at every level.
 * - Arrays maintain their element order, with each element canonicalized.
 * - Primitives (numbers, booleans, strings, null) are represented deterministically.
 * - Undefined and functions inside objects are omitted.
 */
export function canonicalizeJson(value: unknown): string {
  if (value === null) {
    return 'null';
  }

  if (value === undefined) {
    return '';
  }

  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error('Non-finite numbers cannot be canonicalized.');
    }
    return Object.is(value, -0) ? '0' : value.toString();
  }

  if (typeof value === 'string') {
    return JSON.stringify(value);
  }

  if (value instanceof Date) {
    return JSON.stringify(value.toISOString());
  }

  // Support Prisma.Decimal without serializing its internal implementation fields.
  if (
    typeof value === 'object' &&
    typeof (value as any).toFixed === 'function' &&
    (typeof (value as any).isDecimal === 'function' ||
      (typeof (value as any).toDecimalPlaces === 'function' && typeof (value as any).isFinite === 'function'))
  ) {
    return JSON.stringify(value.toString());
  }

  if (Array.isArray(value)) {
    const elements = value.map((item) => {
      if (item === undefined) return 'null';
      return canonicalizeJson(item);
    });
    return `[${elements.join(',')}]`;
  }

  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).filter((key) => {
      // Exclude sensitive keys at any nesting level
      if (isSensitiveKey(key)) return false;
      // Omit undefined properties from objects
      if (obj[key] === undefined) return false;
      return true;
    });

    keys.sort();

    const entries = keys.map((key) => {
      const canonicalVal = canonicalizeJson(obj[key]);
      return `${JSON.stringify(key)}:${canonicalVal}`;
    });

    return `{${entries.join(',')}}`;
  }

  return JSON.stringify(String(value));
}
