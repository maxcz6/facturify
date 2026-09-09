import { Injectable } from '@nestjs/common';
import {
  PASSWORD_POLICY,
  PASSWORD_ERROR_CODES,
  FORBIDDEN_WORDS,
} from './password-policy.constants';
import {
  PasswordError,
  PasswordValidationResult,
  PasswordValidationContext,
  PasswordPolicyException,
} from './password-policy.interface';
import {
  normalizeText,
  normalizeWithLeet,
  containsControlCharacters,
  hasExcessiveRepetitions,
} from './password-policy.util';

@Injectable()
export class PasswordPolicyService {
  /**
   * Validates a password against admin password policy requirements.
   * Never mutates or returns the password.
   * Returns a validation result object with stable error codes and messages.
   */
  public validate(
    password: unknown,
    context?: PasswordValidationContext,
  ): PasswordValidationResult {
    const errors: PasswordError[] = [];

    if (typeof password !== 'string') {
      errors.push({
        code: PASSWORD_ERROR_CODES.NOT_A_STRING,
        message: 'La contrasena debe ser una cadena de texto.',
      });
      return { valid: false, errors: Object.freeze(errors) };
    }

    // 1. Whitespace checks at boundaries
    if (password.startsWith(' ') || password.endsWith(' ') || password.startsWith('\t') || password.endsWith('\t')) {
      errors.push({
        code: PASSWORD_ERROR_CODES.LEADING_OR_TRAILING_WHITESPACE,
        message: 'La contrasena no puede contener espacios en blanco al inicio o al final.',
      });
    }

    // 2. Control characters / null bytes
    if (containsControlCharacters(password)) {
      errors.push({
        code: PASSWORD_ERROR_CODES.CONTROL_CHARACTERS,
        message: 'La contrasena no puede contener caracteres de control ni bytes nulos.',
      });
    }

    // 3. Length checks
    if (password.length < PASSWORD_POLICY.MIN_LENGTH) {
      errors.push({
        code: PASSWORD_ERROR_CODES.TOO_SHORT,
        message: 'La contrasena debe tener al menos 12 caracteres.',
      });
    } else if (password.length > PASSWORD_POLICY.MAX_LENGTH) {
      errors.push({
        code: PASSWORD_ERROR_CODES.TOO_LONG,
        message: 'La contrasena no puede exceder 128 caracteres.',
      });
    }

    // 4. Complexity requirements
    const hasUpper = /[A-Z]/.test(password);
    const hasLower = /[a-z]/.test(password);
    const hasNumber = /[0-9]/.test(password);
    // Special character: anything that is not alphanumeric, space, or control char
    const hasSpecial = /[^A-Za-z0-9\s]/.test(password);

    if (!hasUpper) {
      errors.push({
        code: PASSWORD_ERROR_CODES.MISSING_UPPERCASE,
        message: 'La contrasena debe contener al menos una letra mayuscula.',
      });
    }

    if (!hasLower) {
      errors.push({
        code: PASSWORD_ERROR_CODES.MISSING_LOWERCASE,
        message: 'La contrasena debe contener al menos una letra minuscula.',
      });
    }

    if (!hasNumber) {
      errors.push({
        code: PASSWORD_ERROR_CODES.MISSING_NUMBER,
        message: 'La contrasena debe contener al menos un numero.',
      });
    }

    if (!hasSpecial) {
      errors.push({
        code: PASSWORD_ERROR_CODES.MISSING_SPECIAL,
        message: 'La contrasena debe contener al menos un caracter especial.',
      });
    }

    // 5. Excessive identical repetition (e.g. 'aaaa', '1111')
    if (hasExcessiveRepetitions(password, PASSWORD_POLICY.MAX_CONSECUTIVE_IDENTICAL_CHARS)) {
      errors.push({
        code: PASSWORD_ERROR_CODES.EXCESSIVE_REPETITION,
        message: 'La contrasena no puede contener mas de 3 caracteres identicos consecutivos.',
      });
    }

    // 6. Common weak patterns & forbidden words
    const normalizedPassword = normalizeText(password);
    const leetPassword = normalizeWithLeet(password);

    for (const forbidden of FORBIDDEN_WORDS) {
      const normalizedForbidden = normalizeText(forbidden);
      const leetForbidden = normalizeWithLeet(forbidden);
      if (
        normalizedPassword.includes(normalizedForbidden) ||
        leetPassword.includes(leetForbidden)
      ) {
        errors.push({
          code: PASSWORD_ERROR_CODES.COMMON_WEAK_PATTERN,
          message: 'La contrasena contiene secuencias o palabras debiles comunes no permitidas.',
        });
        break;
      }
    }

    // 7. Personal data checks (email, local part of email, admin name)
    if (context) {
      if (this.containsPersonalData(normalizedPassword, leetPassword, context)) {
        errors.push({
          code: PASSWORD_ERROR_CODES.CONTAINS_PERSONAL_DATA,
          message: 'La contrasena no puede contener datos personales del administrador.',
        });
      }
    }

    return {
      valid: errors.length === 0,
      errors: Object.freeze(errors),
    };
  }

  /**
   * Asserts that a password is valid according to policy.
   * Throws PasswordPolicyException with safe, stable errors if invalid.
   */
  public assertValid(
    password: unknown,
    context?: PasswordValidationContext,
  ): void {
    const result = this.validate(password, context);
    if (!result.valid) {
      throw new PasswordPolicyException(result.errors);
    }
  }

  private containsPersonalData(
    normalizedPassword: string,
    leetPassword: string,
    context: PasswordValidationContext,
  ): boolean {
    // Check email & local part of email
    if (context.email && typeof context.email === 'string') {
      const normalizedEmail = normalizeText(context.email);
      if (normalizedEmail.length >= 3 && normalizedPassword.includes(normalizedEmail)) {
        return true;
      }
      const atIndex = normalizedEmail.indexOf('@');
      const localPart = atIndex !== -1 ? normalizedEmail.slice(0, atIndex) : normalizedEmail;
      if (localPart.length >= 3 && (normalizedPassword.includes(localPart) || leetPassword.includes(localPart))) {
        return true;
      }
    }

    // Check name & individual name tokens
    if (context.name && typeof context.name === 'string') {
      const normalizedName = normalizeText(context.name);
      if (normalizedName.length >= 3 && (normalizedPassword.includes(normalizedName) || leetPassword.includes(normalizedName))) {
        return true;
      }
      // Check words/tokens in the name (e.g. first name, last name) if >= 3 characters
      const tokens = normalizedName.split(/[\s,.-_]+/);
      for (const token of tokens) {
        if (token.length >= 3 && (normalizedPassword.includes(token) || leetPassword.includes(token))) {
          return true;
        }
      }
    }

    return false;
  }
}
