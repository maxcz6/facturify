/**
 * Normalizes text for case-insensitive and accent-resilient comparison.
 * Trims, converts to lowercase, and normalizes unicode (NFC/NFD accents stripped).
 */
export function normalizeText(text: string): string {
  if (!text || typeof text !== 'string') {
    return '';
  }
  return text
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/**
 * Normalizes text with leetspeak substitutions (e.g. @ -> a, 0 -> o, 1 -> i/l, $ -> s, 3 -> e).
 * Allows detecting obfuscated common weak words like P@ssw0rd or Factur1fy.
 */
export function normalizeWithLeet(text: string): string {
  const normalized = normalizeText(text);
  return normalized
    .replace(/[@4]/g, 'a')
    .replace(/[0]/g, 'o')
    .replace(/[1!|]/g, 'i')
    .replace(/[$5]/g, 's')
    .replace(/[3]/g, 'e')
    .replace(/[7]/g, 't');
}

/**
 * Checks if a string contains null bytes or ASCII/Unicode control characters.
 * Control chars: \x00-\x1F, \x7F, and unicode \u0080-\u009F.
 */
export function containsControlCharacters(text: string): boolean {
  return /[\u0000-\u001F\u007F-\u009F]/.test(text);
}

/**
 * Checks for excessive consecutive repetitions of the same character (case-insensitive).
 * Example: 'aaaa' or '1111' exceeds 3 consecutive identical chars.
 */
export function hasExcessiveRepetitions(text: string, maxConsecutive: number = 3): boolean {
  if (!text || text.length <= maxConsecutive) {
    return false;
  }
  let count = 1;
  const lower = text.toLowerCase();
  for (let i = 1; i < lower.length; i++) {
    if (lower[i] === lower[i - 1]) {
      count++;
      if (count > maxConsecutive) {
        return true;
      }
    } else {
      count = 1;
    }
  }
  return false;
}
