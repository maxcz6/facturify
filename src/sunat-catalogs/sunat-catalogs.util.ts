/**
 * Sanitizes an input code for safe error reporting:
 * - strips CRLF and control characters
 * - collapses whitespace
 * - limits length to 30 characters
 * - returns '(vacío)' if empty/null/undefined
 */
export function sanitizeCatalogCodeForError(rawCode: unknown): string {
  if (rawCode === null || rawCode === undefined) {
    return '(vacío)';
  }

  const str = String(rawCode)
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');

  if (!str) {
    return '(vacío)';
  }

  return str.length > 30 ? str.slice(0, 30) + '...' : str;
}
