export const PASSWORD_POLICY = {
  MIN_LENGTH: 12,
  MAX_LENGTH: 128,
  MAX_CONSECUTIVE_IDENTICAL_CHARS: 3,
} as const;

export const PASSWORD_ERROR_CODES = {
  NOT_A_STRING: 'PASSWORD_NOT_A_STRING',
  TOO_SHORT: 'PASSWORD_TOO_SHORT',
  TOO_LONG: 'PASSWORD_TOO_LONG',
  LEADING_OR_TRAILING_WHITESPACE: 'PASSWORD_LEADING_OR_TRAILING_WHITESPACE',
  CONTROL_CHARACTERS: 'PASSWORD_CONTROL_CHARACTERS',
  MISSING_UPPERCASE: 'PASSWORD_MISSING_UPPERCASE',
  MISSING_LOWERCASE: 'PASSWORD_MISSING_LOWERCASE',
  MISSING_NUMBER: 'PASSWORD_MISSING_NUMBER',
  MISSING_SPECIAL: 'PASSWORD_MISSING_SPECIAL',
  COMMON_WEAK_PATTERN: 'PASSWORD_COMMON_WEAK_PATTERN',
  EXCESSIVE_REPETITION: 'PASSWORD_EXCESSIVE_REPETITION',
  CONTAINS_PERSONAL_DATA: 'PASSWORD_CONTAINS_PERSONAL_DATA',
} as const;

export type PasswordErrorCode = typeof PASSWORD_ERROR_CODES[keyof typeof PASSWORD_ERROR_CODES];

export const FORBIDDEN_WORDS: readonly string[] = Object.freeze([
  'password',
  'contrasena',
  'contraseña',
  'admin',
  'facturify',
  'qwerty',
  '123456',
  '12345678',
  'letmein',
  'welcome',
  'administrator',
  'root',
]);

export const PROHIBITED_ERROR_FIELDS: readonly string[] = Object.freeze([
  'password',
  'rawPassword',
  'input',
  'email',
  'adminName',
  'entropy',
  'hash',
  'salt',
  'stack',
]);
