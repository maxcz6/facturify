/**
 * Masks a SUNAT SOL username to protect sensitive credentials from disclosure in status responses.
 * Never exposes the full username.
 */
export function maskSolUsername(username: unknown): string {
  if (username === null || username === undefined) {
    return '***';
  }
  const raw = String(username).trim();
  if (raw.length === 0) {
    return '***';
  }
  if (raw.length === 1) {
    return '*';
  }
  if (raw.length === 2) {
    return '**';
  }
  if (raw.length <= 4) {
    return `${raw[0]}${'*'.repeat(raw.length - 2)}${raw[raw.length - 1]}`;
  }
  // Length >= 5: show first 2 and last 2 characters, masking all middle characters
  const visibleStart = 2;
  const visibleEnd = 2;
  const maskLen = Math.max(raw.length - visibleStart - visibleEnd, 3);
  return `${raw.slice(0, visibleStart)}${'*'.repeat(maskLen)}${raw.slice(raw.length - visibleEnd)}`;
}
