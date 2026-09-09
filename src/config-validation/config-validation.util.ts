const BASE64_STRICT_REGEX = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

/**
 * Validates whether a string is strict RFC 4648 Base64 (length must be multiple of 4, valid chars and padding).
 */
export function isStrictBase64(value: string): boolean {
  if (typeof value !== 'string' || value.length === 0 || value.length % 4 !== 0) {
    return false;
  }
  return BASE64_STRICT_REGEX.test(value);
}

/**
 * Checks for path traversal characters and null bytes in storage path.
 */
export function hasPathTraversalOrNullBytes(p: string): boolean {
  if (!p || typeof p !== 'string') return true;
  if (p.includes('\0')) return true;

  // Split path segments by both forward and backslashes
  const segments = p.split(/[/\\]+/);
  for (const seg of segments) {
    if (seg === '..' || seg === '.') return true;
  }

  return false;
}

/**
 * Checks if a string contains known weak patterns in lowercase.
 */
export function containsWeakPattern(value: string, weakPatterns: readonly string[]): boolean {
  const lower = value.toLowerCase();
  return weakPatterns.some((pattern) => lower.includes(pattern));
}
