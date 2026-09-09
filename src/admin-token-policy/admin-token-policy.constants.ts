/**
 * Allowed administrative roles in token claims.
 */
export const ADMIN_ROLES = Object.freeze(['ADMIN', 'SUPERADMIN'] as const);
export type AdminTokenRole = (typeof ADMIN_ROLES)[number];

/**
 * Expected explicit token type for admin access tokens.
 */
export const ADMIN_TOKEN_TYPE = 'admin_access' as const;
export const ADMIN_TOKEN_ISSUER = 'facturify-api' as const;
export const ADMIN_TOKEN_AUDIENCE = 'facturify-admin' as const;

/**
 * Time constraints and boundaries (in seconds).
 */
export const TOKEN_TIME_LIMITS = {
  MAX_TTL_SECONDS: 8 * 60 * 60, // 8 hours (28,800 seconds)
  MAX_CLOCK_TOLERANCE_SECONDS: 60, // Maximum allowed clock skew tolerance
  DEFAULT_CLOCK_TOLERANCE_SECONDS: 0,
} as const;

/**
 * Public stable error codes.
 */
export const TOKEN_ERROR_CODES = {
  TOKEN_INVALID: 'TOKEN_INVALID',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  TOKEN_NOT_ACTIVE: 'TOKEN_NOT_ACTIVE',
  TOKEN_SCOPE_INVALID: 'TOKEN_SCOPE_INVALID',
} as const;

export type TokenErrorCode = (typeof TOKEN_ERROR_CODES)[keyof typeof TOKEN_ERROR_CODES];

/**
 * Exact allowed keys for AdminTokenClaims.
 */
export const ALLOWED_TOKEN_CLAIM_KEYS = Object.freeze([
  'sub',
  'role',
  'tokenType',
  'iss',
  'aud',
  'iat',
  'exp',
] as const);

/**
 * Prohibited fields that must never appear in claims or outputs.
 */
export const PROHIBITED_TOKEN_FIELDS = Object.freeze([
  'email',
  'name',
  'username',
  'company',
  'companyId',
  'password',
  'apiKey',
  'key',
  'secret',
  'ip',
  'clientIp',
  'userAgent',
  'credentials',
  'solUser',
  'solPassword',
  'certificate',
  'stack',
  'stackTrace',
] as const);
