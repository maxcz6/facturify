import {
  PasswordPolicyService,
  PASSWORD_ERROR_CODES,
  PasswordPolicyException,
  PROHIBITED_ERROR_FIELDS,
  normalizeText,
  hasExcessiveRepetitions,
} from '../src/password-policy';

describe('PasswordPolicyModule', () => {
  let service: PasswordPolicyService;

  beforeEach(() => {
    service = new PasswordPolicyService();
  });

  describe('Basic Validation & Non-Mutation', () => {
    it('approves strong valid passwords without modifying them', () => {
      const strongPassword = 'V@lid-K3y-Phr4se!2026';
      const result = service.validate(strongPassword);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect((result as unknown as Record<string, unknown>).password).toBeUndefined();
    });

    it('assertValid does not throw on strong password', () => {
      expect(() => service.assertValid('Str0ng!Secur3#Pass')).not.toThrow();
    });

    it('rejects non-string inputs', () => {
      const result = service.validate(123456789012 as unknown as string);
      expect(result.valid).toBe(false);
      expect(result.errors[0].code).toBe(PASSWORD_ERROR_CODES.NOT_A_STRING);

      expect(() => service.assertValid(null)).toThrow(PasswordPolicyException);
      expect(() => service.assertValid(undefined)).toThrow(PasswordPolicyException);
    });
  });

  describe('Length Constraints (12 to 128 chars)', () => {
    it('rejects passwords shorter than 12 characters', () => {
      const short = 'Sh0rt!123';
      const result = service.validate(short);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === PASSWORD_ERROR_CODES.TOO_SHORT)).toBe(true);

      expect(() => service.assertValid(short)).toThrow(PasswordPolicyException);
    });

    it('accepts passwords exactly 12 characters', () => {
      const exact12 = 'Ab1!cd2@ef3#';
      const result = service.validate(exact12);
      expect(result.valid).toBe(true);
    });

    it('accepts passwords up to 128 characters', () => {
      // Repeat alternating chars to avoid excessive repetition
      const char128 = 'A!1' + 'ab'.repeat(62) + 'a';
      expect(char128.length).toBe(128);
      const result = service.validate(char128);
      expect(result.valid).toBe(true);
    });

    it('rejects passwords longer than 128 characters', () => {
      const char129 = 'A!1' + 'ab'.repeat(63);
      expect(char129.length).toBe(129);
      const result = service.validate(char129);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === PASSWORD_ERROR_CODES.TOO_LONG)).toBe(true);
    });
  });

  describe('Character Complexity (Upper, Lower, Number, Special)', () => {
    it('rejects missing uppercase letter', () => {
      const result = service.validate('lowercase!12345');
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === PASSWORD_ERROR_CODES.MISSING_UPPERCASE)).toBe(true);
    });

    it('rejects missing lowercase letter', () => {
      const result = service.validate('UPPERCASE!12345');
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === PASSWORD_ERROR_CODES.MISSING_LOWERCASE)).toBe(true);
    });

    it('rejects missing number', () => {
      const result = service.validate('Uppercase!Letter');
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === PASSWORD_ERROR_CODES.MISSING_NUMBER)).toBe(true);
    });

    it('rejects missing special character', () => {
      const result = service.validate('Uppercase123456');
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === PASSWORD_ERROR_CODES.MISSING_SPECIAL)).toBe(true);
    });
  });

  describe('Whitespace, Null Bytes & Control Characters', () => {
    it('rejects leading whitespace', () => {
      const result = service.validate(' Str0ng!Secur3#Pass');
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === PASSWORD_ERROR_CODES.LEADING_OR_TRAILING_WHITESPACE)).toBe(true);
    });

    it('rejects trailing whitespace', () => {
      const result = service.validate('Str0ng!Secur3#Pass ');
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === PASSWORD_ERROR_CODES.LEADING_OR_TRAILING_WHITESPACE)).toBe(true);
    });

    it('rejects tab at beginning or end', () => {
      const result = service.validate('\tStr0ng!Secur3#Pass');
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === PASSWORD_ERROR_CODES.LEADING_OR_TRAILING_WHITESPACE)).toBe(true);
    });

    it('allows internal spaces as part of passphrases if strong and complex', () => {
      const result = service.validate('Correct Horse 1! Battery Staple');
      expect(result.valid).toBe(true);
    });

    it('rejects null bytes', () => {
      const result = service.validate('Str0ng!Secur3\0#Pass');
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === PASSWORD_ERROR_CODES.CONTROL_CHARACTERS)).toBe(true);
    });

    it('rejects control characters (CR, LF, DEL, etc.)', () => {
      expect(service.validate('Str0ng!\rSecur3#Pass').valid).toBe(false);
      expect(service.validate('Str0ng!\nSecur3#Pass').valid).toBe(false);
      expect(service.validate('Str0ng!\x1bSecur3#Pass').valid).toBe(false);
      expect(service.validate('Str0ng!\x7fSecur3#Pass').valid).toBe(false);
    });
  });

  describe('Repetition & Common Weak Patterns', () => {
    it('rejects excessive identical repetitions (more than 3 consecutive)', () => {
      const result = service.validate('Str0ngaaaa!1234');
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === PASSWORD_ERROR_CODES.EXCESSIVE_REPETITION)).toBe(true);

      const resultDigits = service.validate('Str0ng!1111Pass');
      expect(resultDigits.valid).toBe(false);
      expect(resultDigits.errors.some((e) => e.code === PASSWORD_ERROR_CODES.EXCESSIVE_REPETITION)).toBe(true);
    });

    it('allows up to 3 consecutive identical characters', () => {
      const result = service.validate('Str0ngaaa!1234');
      expect(result.valid).toBe(true);
    });

    it('rejects forbidden weak words and common patterns case-insensitively and with leet variations', () => {
      const weakPasswords = [
        'P@ssword1234!',
        'Admin12345678!',
        'MyContrasena!2026',
        'MiContraseña!2026',
        'FacturifyApp!2026',
        'Qwerty123456!#',
        '12345678!Abcd',
        'LetMeIn!12345',
        'Welcome!12345',
        'Root#SuperUser1',
        'F4ctur1fy#2026',
      ];

      for (const weak of weakPasswords) {
        const result = service.validate(weak);
        expect(result.valid).toBe(false);
        expect(
          result.errors.some((e) => e.code === PASSWORD_ERROR_CODES.COMMON_WEAK_PATTERN),
        ).toBe(true);
      }
    });
  });

  describe('Personal Data Constraints (Email, Local Part, Admin Name)', () => {
    const context = {
      email: 'admin.carlos@facturify.pe',
      name: 'Carlos Mendoza',
    };

    it('rejects password containing the full email', () => {
      const result = service.validate('Admin.carlos@facturify.pe!2026', context);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === PASSWORD_ERROR_CODES.CONTAINS_PERSONAL_DATA)).toBe(true);
    });

    it('rejects password containing the local part of the email', () => {
      const result = service.validate('X#admin.carlos!999', context);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === PASSWORD_ERROR_CODES.CONTAINS_PERSONAL_DATA)).toBe(true);
    });

    it('rejects password containing the full name or parts of the name (case and accent insensitive)', () => {
      const resultFullName = service.validate('CarlosMendoza!2026', context);
      expect(resultFullName.valid).toBe(false);
      expect(resultFullName.errors.some((e) => e.code === PASSWORD_ERROR_CODES.CONTAINS_PERSONAL_DATA)).toBe(true);

      const resultLastName = service.validate('MendozaSuper!2026', context);
      expect(resultLastName.valid).toBe(false);
      expect(resultLastName.errors.some((e) => e.code === PASSWORD_ERROR_CODES.CONTAINS_PERSONAL_DATA)).toBe(true);
    });

    it('handles unicode accents in name properly', () => {
      const accentedContext = {
        name: 'José María González',
      };
      // Password has unaccented  jose or gonzalez
      const result = service.validate('JoseSecur3!Pass#', accentedContext);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === PASSWORD_ERROR_CODES.CONTAINS_PERSONAL_DATA)).toBe(true);
    });

    it('allows strong passwords that do not contain personal data', () => {
      const result = service.validate('Unr3lat3d-S3cur3#P4ss', context);
      expect(result.valid).toBe(true);
    });
  });

  describe('Utility functions edge cases', () => {
    it('handles null/empty inputs in normalizeText and hasExcessiveRepetitions', () => {
      expect(normalizeText('')).toBe('');
      expect(normalizeText(null as unknown as string)).toBe('');
      expect(hasExcessiveRepetitions('')).toBe(false);
      expect(hasExcessiveRepetitions('abc', 5)).toBe(false);
    });
  });

  describe('Exception Class Edge Cases', () => {
    it('creates default message if empty errors array is passed to exception', () => {
      const exception = new PasswordPolicyException([]);
      expect(exception.code).toBe(PASSWORD_ERROR_CODES.TOO_SHORT);
      expect(exception.message).toContain('La contrasena no cumple');
      expect(exception.errors).toHaveLength(0);
    });
  });

  describe('Privacy & Absence of Sensitive Information', () => {
    it('never leaks the password, email, or admin name in errors or exception objects', () => {
      const rawPassword = 'SecretPassword123!';
      const context = {
        email: 'secret-admin@company.com',
        name: 'Secret Admin',
      };

      const result = service.validate(rawPassword, context);
      expect(result.valid).toBe(false);

      // Verify validation result errors
      for (const err of result.errors) {
        expect(err.message).not.toContain(rawPassword);
        expect(err.message).not.toContain(context.email);
        expect(err.message).not.toContain(context.name);
      }

      // Verify exception thrown by assertValid
      try {
        service.assertValid(rawPassword, context);
        fail('Should have thrown PasswordPolicyException');
      } catch (e: unknown) {
        const exception = e as PasswordPolicyException;
        const serialized = JSON.stringify(exception, Object.getOwnPropertyNames(exception));

        expect(serialized).not.toContain(rawPassword);
        expect(serialized).not.toContain(context.email);
        expect(serialized).not.toContain(context.name);

        for (const prohibited of PROHIBITED_ERROR_FIELDS) {
          expect((exception as unknown as Record<string, unknown>)[prohibited]).toBeUndefined();
        }

        expect(exception.code).toBeDefined();
        expect(Array.isArray(exception.errors)).toBe(true);
      }
    });
  });
});
