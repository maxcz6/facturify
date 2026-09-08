/**
 * Input for generating a deterministic SHA-256 request fingerprint.
 */
export interface GenerateFingerprintInput {
  /**
   * HTTP Method (e.g., POST, PUT, GET). Case-insensitive, will be normalized to uppercase.
   */
  method: string;

  /**
   * Request route / path. Will be normalized to strip duplicate slashes and trailing slashes.
   */
  path: string;

  /**
   * Authenticated company UUID / ID to guarantee strict multi-tenant isolation.
   */
  companyId: string;

  /**
   * Request body to canonicalize. May be object, array, primitive, null, or undefined.
   */
  body?: unknown;
}

/**
 * Result of validating an Idempotency-Key header value.
 */
export interface IdempotencyKeyValidationResult {
  isValid: boolean;
  error?: string;
  sanitizedKey?: string;
}
