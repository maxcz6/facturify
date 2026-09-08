/**
 * Length constraints for Idempotency-Key header.
 */
export const IDEMPOTENCY_KEY_MIN_LENGTH = 16;
export const IDEMPOTENCY_KEY_MAX_LENGTH = 128;

/**
 * Regex matching safe ASCII characters: letters (A-Z, a-z), digits (0-9),
 * underscores (_), hyphens (-), and periods (.).
 */
export const IDEMPOTENCY_KEY_REGEX = /^[A-Za-z0-9_.-]{16,128}$/;

/**
 * Exact set of sensitive property names (case-insensitive) to omit from request fingerprinting.
 */
export const SENSITIVE_KEY_NAMES: readonly string[] = Object.freeze([
  'authorization',
  'password',
  'token',
  'secret',
  'apikey',
  'api_key',
  'certificado',
  'certificados',
  'certificate',
  'certificates',
  'accesstoken',
  'access_token',
  'refreshtoken',
  'refresh_token',
  'clientsecret',
  'client_secret',
  'encryptedpassword',
  'encrypted_password',
  'passwordiv',
  'password_iv',
  'passwordauthtag',
  'password_auth_tag',
  'solpassword',
  'sol_password',
]);

/**
 * Patterns matching sensitive fields even if nested or suffixed/prefixed.
 */
export const SENSITIVE_PATTERNS: readonly RegExp[] = Object.freeze([
  /authorization/i,
  /password/i,
  /token/i,
  /secret/i,
  /apikey/i,
  /api_key/i,
  /certificado/i,
  /certificate/i,
]);
