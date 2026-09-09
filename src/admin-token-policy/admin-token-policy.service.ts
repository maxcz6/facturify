import { Injectable, Optional } from '@nestjs/common';
import {
  ADMIN_TOKEN_TYPE,
  AdminTokenRole,
  TOKEN_TIME_LIMITS,
  TOKEN_ERROR_CODES,
  ALLOWED_TOKEN_CLAIM_KEYS,
  PROHIBITED_TOKEN_FIELDS,
} from './admin-token-policy.constants';
import {
  AdminTokenClaims,
  BuildAdminClaimsInput,
  ValidateTokenContext,
  TokenValidationResult,
  AdminTokenPolicyException,
} from './admin-token-policy.interface';
import {
  isValidUuid,
  isValidAdminRole,
  normalizeClockTolerance,
  deepFreeze,
} from './admin-token-policy.util';

export type ClockFn = () => number;

@Injectable()
export class AdminTokenPolicyService {
  private readonly clock: ClockFn;

  constructor(@Optional() clock?: ClockFn) {
    this.clock = clock || (() => Math.floor(Date.now() / 1000));
  }

  /**
   * Builds clean, validated and frozen AdminTokenClaims.
   * Ensures exact schema, TTL boundaries (max 8 hours), and absence of sensitive fields.
   */
  public buildClaims(input: BuildAdminClaimsInput): Readonly<AdminTokenClaims> {
    if (!input || typeof input !== 'object') {
      throw new AdminTokenPolicyException(
        TOKEN_ERROR_CODES.TOKEN_INVALID,
        'Parametros de construccion de token invalidos.',
      );
    }

    // 1. Validate sub
    if (!isValidUuid(input.sub)) {
      throw new AdminTokenPolicyException(
        TOKEN_ERROR_CODES.TOKEN_INVALID,
        'El subject (sub) debe ser un UUID valido.',
      );
    }

    // 2. Validate role
    if (!isValidAdminRole(input.role)) {
      throw new AdminTokenPolicyException(
        TOKEN_ERROR_CODES.TOKEN_SCOPE_INVALID,
        'El rol administrativo no es valido.',
      );
    }

    // 3. Validate iss and aud
    if (!input.iss || typeof input.iss !== 'string' || input.iss.trim().length === 0) {
      throw new AdminTokenPolicyException(
        TOKEN_ERROR_CODES.TOKEN_INVALID,
        'El issuer (iss) es obligatorio y debe ser valido.',
      );
    }

    if (!input.aud || typeof input.aud !== 'string' || input.aud.trim().length === 0) {
      throw new AdminTokenPolicyException(
        TOKEN_ERROR_CODES.TOKEN_INVALID,
        'El audience (aud) es obligatorio y debe ser valido.',
      );
    }

    // 4. Validate iat and exp timestamps
    const nowSeconds = this.clock();
    const iat = input.iat !== undefined ? input.iat : nowSeconds;
    if (!Number.isInteger(iat) || iat < 0) {
      throw new AdminTokenPolicyException(
        TOKEN_ERROR_CODES.TOKEN_INVALID,
        'El timestamp iat debe ser un entero positivo.',
      );
    }

    const ttl =
      input.ttlSeconds !== undefined
        ? input.ttlSeconds
        : TOKEN_TIME_LIMITS.MAX_TTL_SECONDS;

    if (!Number.isInteger(ttl) || ttl <= 0 || ttl > TOKEN_TIME_LIMITS.MAX_TTL_SECONDS) {
      throw new AdminTokenPolicyException(
        TOKEN_ERROR_CODES.TOKEN_INVALID,
        'La duracion del token excede el maximo permitido de 8 horas.',
      );
    }

    const exp = iat + ttl;

    const claims: AdminTokenClaims = {
      sub: input.sub.toLowerCase(),
      role: input.role,
      tokenType: ADMIN_TOKEN_TYPE,
      iss: input.iss.trim(),
      aud: input.aud.trim(),
      iat,
      exp,
    };

    return deepFreeze(claims);
  }

  /**
   * Validates received claims against security policy and context.
   * Enforces exact keys, valid roles, sub UUID, tokenType, iss, aud, timing, and skew tolerance.
   * Returns TokenValidationResult without leaking payloads or stack traces.
   */
  public validateClaims(
    payload: unknown,
    context: ValidateTokenContext,
  ): TokenValidationResult {
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return {
        valid: false,
        error: {
          code: TOKEN_ERROR_CODES.TOKEN_INVALID,
          message: 'El payload del token es invalido.',
        },
      };
    }

    const rawClaims = payload as Record<string, unknown>;

    // 1. Check for unexpected or prohibited extra fields
    const keys = Object.keys(rawClaims);
    for (const key of keys) {
      if (!(ALLOWED_TOKEN_CLAIM_KEYS as readonly string[]).includes(key as any)) {
        return {
          valid: false,
          error: {
            code: TOKEN_ERROR_CODES.TOKEN_INVALID,
            message: 'El token contiene campos no permitidos.',
          },
        };
      }
    }

    // Explicit check on prohibited fields
    for (const prohibited of PROHIBITED_TOKEN_FIELDS) {
      if (rawClaims[prohibited] !== undefined) {
        return {
          valid: false,
          error: {
            code: TOKEN_ERROR_CODES.TOKEN_INVALID,
            message: 'El token contiene campos sensibles prohibidos.',
          },
        };
      }
    }

    // 2. Validate all mandatory fields presence
    for (const requiredKey of ALLOWED_TOKEN_CLAIM_KEYS) {
      if (rawClaims[requiredKey] === undefined || rawClaims[requiredKey] === null) {
        return {
          valid: false,
          error: {
            code: TOKEN_ERROR_CODES.TOKEN_INVALID,
            message: 'El token carece de campos obligatorios.',
          },
        };
      }
    }

    // 3. Validate sub UUID
    if (!isValidUuid(rawClaims.sub)) {
      return {
        valid: false,
        error: {
          code: TOKEN_ERROR_CODES.TOKEN_INVALID,
          message: 'El identificador del usuario (sub) no es valido.',
        },
      };
    }

    // 4. Validate role
    if (!isValidAdminRole(rawClaims.role)) {
      return {
        valid: false,
        error: {
          code: TOKEN_ERROR_CODES.TOKEN_SCOPE_INVALID,
          message: 'El rol administrativo no es valido.',
        },
      };
    }

    // 5. Validate tokenType
    if (rawClaims.tokenType !== ADMIN_TOKEN_TYPE) {
      return {
        valid: false,
        error: {
          code: TOKEN_ERROR_CODES.TOKEN_SCOPE_INVALID,
          message: 'Tipo de token no valido para acceso administrativo.',
        },
      };
    }

    // 6. Validate expected issuer and audience
    if (rawClaims.iss !== context.expectedIss) {
      return {
        valid: false,
        error: {
          code: TOKEN_ERROR_CODES.TOKEN_INVALID,
          message: 'El emisor (iss) del token no coincide con el esperado.',
        },
      };
    }

    if (rawClaims.aud !== context.expectedAud) {
      return {
        valid: false,
        error: {
          code: TOKEN_ERROR_CODES.TOKEN_INVALID,
          message: 'La audiencia (aud) del token no coincide con la esperada.',
        },
      };
    }

    // 7. Validate iat and exp format
    const iat = rawClaims.iat;
    const exp = rawClaims.exp;

    if (!Number.isInteger(iat) || !Number.isInteger(exp)) {
      return {
        valid: false,
        error: {
          code: TOKEN_ERROR_CODES.TOKEN_INVALID,
          message: 'Los tiempos de emision y expiracion deben ser enteros Unix.',
        },
      };
    }

    if ((exp as number) <= (iat as number)) {
      return {
        valid: false,
        error: {
          code: TOKEN_ERROR_CODES.TOKEN_INVALID,
          message: 'El tiempo de expiracion debe ser posterior a la emision.',
        },
      };
    }

    // 8. Duration check (max 8 hours)
    if ((exp as number) - (iat as number) > TOKEN_TIME_LIMITS.MAX_TTL_SECONDS) {
      return {
        valid: false,
        error: {
          code: TOKEN_ERROR_CODES.TOKEN_INVALID,
          message: 'La duracion del token excede el maximo permitido de 8 horas.',
        },
      };
    }

    // 9. Time verification with clock tolerance
    const now = this.clock();
    const tolerance = normalizeClockTolerance(context.clockToleranceSeconds);

    // Not active yet (issued in the future beyond tolerance)
    if ((iat as number) > now + tolerance) {
      return {
        valid: false,
        error: {
          code: TOKEN_ERROR_CODES.TOKEN_NOT_ACTIVE,
          message: 'El token aun no es valido (emitido en el futuro).',
        },
      };
    }

    // Expired
    if (now - tolerance >= (exp as number)) {
      return {
        valid: false,
        error: {
          code: TOKEN_ERROR_CODES.TOKEN_EXPIRED,
          message: 'El token ha expirado.',
        },
      };
    }

    const validatedClaims: AdminTokenClaims = {
      sub: (rawClaims.sub as string).toLowerCase(),
      role: rawClaims.role as AdminTokenRole,
      tokenType: ADMIN_TOKEN_TYPE,
      iss: rawClaims.iss as string,
      aud: rawClaims.aud as string,
      iat: rawClaims.iat as number,
      exp: rawClaims.exp as number,
    };

    return {
      valid: true,
      claims: deepFreeze(validatedClaims),
    };
  }
}
