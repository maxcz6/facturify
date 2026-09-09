/**
 * Current password hashing format identifier and version.
 * Format: scrypt
 */
export const HASH_ALGORITHM = 'scrypt' as const;
export const CURRENT_HASH_VERSION = 'v1' as const;

/**
 * Standard secure production parameters for scrypt.
 * Recommended by OWASP: N=16384 (2^14), r=8, p=1, keylen=32, saltlen=16
 */
export const DEFAULT_SCRYPT_PARAMS = {
  N: 16384, // CPU/memory cost parameter (must be a power of 2)
  r: 8,     // Block size parameter
  p: 1,     // Parallelization parameter
  keyLength: 32, // 256 bits output
  saltLength: 16, // 128 bits cryptographic salt
  maxmem: 32 * 1024 * 1024, // 32 MB max memory allowance
} as const;

/**
 * Defensive upper and lower bounds for verifying received hashes.
 * Protects against memory exhaustion, high CPU DoS, and parameter degradation attacks.
 */
export const SCRYPT_SAFETY_BOUNDS = {
  MIN_N: 1024,
  MAX_N: 65536, // 2^16 max acceptable cost to prevent CPU denial of service
  MIN_R: 1,
  MAX_R: 16,
  MIN_P: 1,
  MAX_P: 4,
  MIN_SALT_LENGTH: 16,
  MAX_SALT_LENGTH: 64,
  MIN_KEY_LENGTH: 32,
  MAX_KEY_LENGTH: 64,
  MAX_MEM: 64 * 1024 * 1024, // 64 MB maximum allowed memory for verification
  MAX_ENCODED_LENGTH: 512, // Format string size guard
  MAX_PASSWORD_LENGTH: 128,
} as const;

export const PROHIBITED_HASHING_OUTPUT_FIELDS: readonly string[] = Object.freeze([
  'password',
  'rawPassword',
  'salt',
  'rawSalt',
  'binaryHash',
  'hashBuffer',
  'internalParams',
  'stack',
  'stackTrace',
  'comparisonTimeMs',
  'executionTimeMs',
]);
