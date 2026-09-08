/**
 * Masks identity document numbers to prevent exposure of complete personal/tax data in public error messages.
 */
export function maskIdentityDocument(doc: unknown): string {
  if (doc === null || doc === undefined) {
    return '***';
  }

  const raw = String(doc).trim();
  if (raw.length === 0) {
    return '***';
  }

  // Sanitize any malicious injection attempts before masking
  const sanitized = raw.replace(/<[^>]*>/g, '').replace(/[\r\n\0\t]/g, '');

  if (sanitized.length === 11) {
    // RUC format: first 2 + '*****' + last 4 (e.g. 20*****6789)
    return `${sanitized.slice(0, 2)}*****${sanitized.slice(7)}`;
  }

  if (sanitized.length === 8) {
    // DNI format: first 2 + '****' + last 2 (e.g. 45****01)
    return `${sanitized.slice(0, 2)}****${sanitized.slice(6)}`;
  }

  if (sanitized.length >= 5) {
    const visibleStart = 2;
    const visibleEnd = 2;
    const maskLen = Math.min(sanitized.length - visibleStart - visibleEnd, 6);
    return `${sanitized.slice(0, visibleStart)}${'*'.repeat(maskLen)}${sanitized.slice(sanitized.length - visibleEnd)}`;
  }

  return '****';
}

/**
 * Strips dangerous control characters and script tags from text intended for error reporting.
 */
export function sanitizeSafeText(input: unknown): string {
  if (input === null || input === undefined) {
    return '';
  }
  return String(input)
    .replace(/<[^>]*>/g, '')
    .replace(/[\r\n\0]/g, '')
    .slice(0, 30);
}
