import { BadRequestException, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import {
  IDEMPOTENCY_KEY_MAX_LENGTH,
  IDEMPOTENCY_KEY_MIN_LENGTH,
  IDEMPOTENCY_KEY_REGEX,
} from './idempotency.constants';
import {
  GenerateFingerprintInput,
  IdempotencyKeyValidationResult,
} from './idempotency.interface';
import {
  canonicalizeJson,
  isSensitiveKey,
  normalizeMethod,
  normalizePath,
} from './idempotency.util';

@Injectable()
export class IdempotencyService {
  /**
   * Validates an Idempotency-Key header value.
   * Requirements:
   * - 16 to 128 characters
   * - Safe ASCII characters only: A-Z, a-z, 0-9, _, -, .
   * - Rejects spaces, Unicode, CRLF, control characters, empty or too short/long keys.
   * Error messages are safe and never echo malicious input.
   */
  validateIdempotencyKey(key: unknown): IdempotencyKeyValidationResult {
    if (key === null || key === undefined) {
      return {
        isValid: false,
        error: 'La cabecera Idempotency-Key es obligatoria.',
      };
    }

    if (typeof key !== 'string') {
      return {
        isValid: false,
        error: 'La cabecera Idempotency-Key debe ser una cadena de texto.',
      };
    }

    if (key.length === 0) {
      return {
        isValid: false,
        error: 'La cabecera Idempotency-Key no puede estar vacía.',
      };
    }

    // Check for CRLF / newline / control characters
    if (/[\r\n\t\0]/.test(key)) {
      return {
        isValid: false,
        error: 'La clave Idempotency-Key no puede contener caracteres de control o saltos de línea (CRLF).',
      };
    }

    // Check for spaces
    if (/\s/.test(key)) {
      return {
        isValid: false,
        error: 'La clave Idempotency-Key no puede contener espacios en blanco.',
      };
    }

    // Check length boundaries
    if (key.length < IDEMPOTENCY_KEY_MIN_LENGTH) {
      return {
        isValid: false,
        error: `La clave Idempotency-Key es demasiado corta (mínimo ${IDEMPOTENCY_KEY_MIN_LENGTH} caracteres).`,
      };
    }

    if (key.length > IDEMPOTENCY_KEY_MAX_LENGTH) {
      return {
        isValid: false,
        error: `La clave Idempotency-Key es demasiado larga (máximo ${IDEMPOTENCY_KEY_MAX_LENGTH} caracteres).`,
      };
    }

    // Check for non-ASCII or disallowed symbols
    if (!IDEMPOTENCY_KEY_REGEX.test(key)) {
      return {
        isValid: false,
        error:
          'La clave Idempotency-Key contiene caracteres no permitidos. Solo se admiten caracteres ASCII seguros (A-Z, a-z, 0-9, _, -, .).',
      };
    }

    return {
      isValid: true,
      sanitizedKey: key,
    };
  }

  /**
   * Asserts that an Idempotency-Key is valid.
   * Throws BadRequestException with a safe error message if invalid.
   */
  assertValidIdempotencyKey(key: unknown): string {
    const result = this.validateIdempotencyKey(key);
    if (!result.isValid) {
      throw new BadRequestException(result.error);
    }
    return result.sanitizedKey!;
  }

  /**
   * Generates a deterministic SHA-256 fingerprint of an incoming HTTP request.
   *
   * Form:
   * `${method}|${path}|${companyId}|${canonicalBody}`
   *
   * Properties:
   * - Method normalized to uppercase
   * - Path normalized (leading slash, duplicate slashes removed, trailing slash trimmed)
   * - Strict companyId inclusion (guaranteeing multi-tenant isolation)
   * - Request body canonicalized recursively with lexicographically sorted keys
   * - Sensitive fields (authorization, password, token, secret, apiKey, certificados) stripped at all depths
   */
  generateFingerprint(input: GenerateFingerprintInput): string {
    if (!input || typeof input !== 'object') {
      throw new BadRequestException('Los parámetros de la petición son requeridos.');
    }

    const { companyId } = input;
    if (!companyId || typeof companyId !== 'string' || companyId.trim() === '') {
      throw new BadRequestException(
        'El companyId es obligatorio para garantizar el aislamiento multiempresa de la huella.',
      );
    }

    const normalizedMethod = normalizeMethod(input.method);
    const normalizedPath = normalizePath(input.path);
    const normalizedCompany = companyId.trim();

    let canonicalBody = '';
    try {
      canonicalBody = canonicalizeJson(input.body);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error al canonicalizar el cuerpo';
      throw new BadRequestException(`Cuerpo de petición inválido: ${message}`);
    }

    const payload = `${normalizedMethod}|${normalizedPath}|${normalizedCompany}|${canonicalBody}`;

    return createHash('sha256').update(payload, 'utf8').digest('hex');
  }

  /**
   * Public helper to canonicalize a body payload.
   */
  canonicalizeBody(body: unknown): string {
    return canonicalizeJson(body);
  }

  /**
   * Public helper to normalize a request path.
   */
  normalizePath(path: string): string {
    return normalizePath(path);
  }

  /**
   * Public helper to normalize an HTTP method.
   */
  normalizeMethod(method: string): string {
    return normalizeMethod(method);
  }

  /**
   * Public helper to test whether a field key is sensitive.
   */
  isSensitiveKey(key: string): boolean {
    return isSensitiveKey(key);
  }
}
