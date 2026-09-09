import {
  HASH_ALGORITHM,
  CURRENT_HASH_VERSION,
  DEFAULT_SCRYPT_PARAMS,
  SCRYPT_SAFETY_BOUNDS,
} from './password-hashing.constants';

export interface ParsedScryptHash {
  algorithm: string;
  version: string;
  N: number;
  r: number;
  p: number;
  salt: Buffer;
  hash: Buffer;
}

const BASE64URL_REGEX = /^[A-Za-z0-9_-]+$/;

/**
 * Checks whether a number is an integer power of two.
 */
export function isPowerOfTwo(n: number): boolean {
  return typeof n === 'number' && Number.isInteger(n) && n > 0 && (n & (n - 1)) === 0;
}

/**
 * Safely decodes a base64url string to Buffer.
 * Verifies character set and returns null on failure or empty.
 */
export function safeDecodeBase64url(encoded: string): Buffer | null {
  if (typeof encoded !== 'string' || encoded.length === 0 || !BASE64URL_REGEX.test(encoded)) {
    return null;
  }
  try {
    const buf = Buffer.from(encoded, 'base64url');
    if (buf.length === 0) {
      return null;
    }
    // Strict verification: re-encoding must match original input
    if (buf.toString('base64url') !== encoded) {
      return null;
    }
    return buf;
  } catch {
    return null;
  }
}

/**
 * Parses and strictly validates a formatted scrypt hash string:
 * scrypt
 * Returns ParsedScryptHash or null if malformed or outside safety bounds.
 */
export function parseScryptHash(encodedHash: string): ParsedScryptHash | null {
  if (
    typeof encodedHash !== 'string' ||
    encodedHash.length === 0 ||
    encodedHash.length > SCRYPT_SAFETY_BOUNDS.MAX_ENCODED_LENGTH
  ) {
    return null;
  }

  const parts = encodedHash.split('$');
  if (parts.length !== 7) {
    return null;
  }

  const [algorithm, version, nStr, rStr, pStr, saltStr, hashStr] = parts;

  // 1. Verify algorithm and supported version
  if (algorithm !== HASH_ALGORITHM || version !== CURRENT_HASH_VERSION) {
    return null;
  }

  // 2. Parse and validate numeric parameters
  const N = Number(nStr);
  const r = Number(rStr);
  const p = Number(pStr);

  if (!Number.isInteger(N) || !Number.isInteger(r) || !Number.isInteger(p)) {
    return null;
  }

  // Cost N must be power of two within bounds
  if (!isPowerOfTwo(N) || N < SCRYPT_SAFETY_BOUNDS.MIN_N || N > SCRYPT_SAFETY_BOUNDS.MAX_N) {
    return null;
  }

  // Block size r within bounds
  if (r < SCRYPT_SAFETY_BOUNDS.MIN_R || r > SCRYPT_SAFETY_BOUNDS.MAX_R) {
    return null;
  }

  // Parallelism p within bounds
  if (p < SCRYPT_SAFETY_BOUNDS.MIN_P || p > SCRYPT_SAFETY_BOUNDS.MAX_P) {
    return null;
  }

  // 3. Decode and validate salt
  const salt = safeDecodeBase64url(saltStr);
  if (
    !salt ||
    salt.length < SCRYPT_SAFETY_BOUNDS.MIN_SALT_LENGTH ||
    salt.length > SCRYPT_SAFETY_BOUNDS.MAX_SALT_LENGTH
  ) {
    return null;
  }

  // 4. Decode and validate hash
  const hash = safeDecodeBase64url(hashStr);
  if (
    !hash ||
    hash.length < SCRYPT_SAFETY_BOUNDS.MIN_KEY_LENGTH ||
    hash.length > SCRYPT_SAFETY_BOUNDS.MAX_KEY_LENGTH
  ) {
    return null;
  }

  return {
    algorithm,
    version,
    N,
    r,
    p,
    salt,
    hash,
  };
}

/**
 * Checks whether an encoded hash was generated with older versions or non-standard parameters,
 * indicating that re-hashing should occur on next successful login.
 * Never executes scrypt computation.
 */
export function needsRehash(encodedHash: string): boolean {
  if (typeof encodedHash !== 'string' || encodedHash.length === 0) {
    return true;
  }

  const parts = encodedHash.split('$');
  if (parts.length !== 7) {
    return true;
  }

  const [algorithm, version, nStr, rStr, pStr, saltStr, hashStr] = parts;

  if (algorithm !== HASH_ALGORITHM || version !== CURRENT_HASH_VERSION) {
    return true;
  }

  const N = Number(nStr);
  const r = Number(rStr);
  const p = Number(pStr);

  if (
    N !== DEFAULT_SCRYPT_PARAMS.N ||
    r !== DEFAULT_SCRYPT_PARAMS.r ||
    p !== DEFAULT_SCRYPT_PARAMS.p
  ) {
    return true;
  }

  const salt = safeDecodeBase64url(saltStr);
  const hash = safeDecodeBase64url(hashStr);

  if (
    !salt ||
    !hash ||
    salt.length !== DEFAULT_SCRYPT_PARAMS.saltLength ||
    hash.length !== DEFAULT_SCRYPT_PARAMS.keyLength
  ) {
    return true;
  }

  return false;
}
