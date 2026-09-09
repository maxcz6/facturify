import {
  AdminTokenRole,
  ADMIN_TOKEN_TYPE,
  TokenErrorCode,
} from './admin-token-policy.constants';

export interface AdminTokenClaims {
  readonly sub: string;
  readonly role: AdminTokenRole;
  readonly tokenType: typeof ADMIN_TOKEN_TYPE;
  readonly iss: string;
  readonly aud: string;
  readonly iat: number;
  readonly exp: number;
}

export interface BuildAdminClaimsInput {
  readonly sub: string;
  readonly role: AdminTokenRole;
  readonly iss: string;
  readonly aud: string;
  readonly ttlSeconds?: number;
  readonly iat?: number;
}

export interface ValidateTokenContext {
  readonly expectedIss: string;
  readonly expectedAud: string;
  readonly clockToleranceSeconds?: number;
}

export interface TokenValidationSuccess {
  readonly valid: true;
  readonly claims: Readonly<AdminTokenClaims>;
}

export interface TokenValidationFailure {
  readonly valid: false;
  readonly error: {
    readonly code: TokenErrorCode;
    readonly message: string;
  };
}

export type TokenValidationResult = TokenValidationSuccess | TokenValidationFailure;

export class AdminTokenPolicyException extends Error {
  public readonly code: TokenErrorCode;

  constructor(code: TokenErrorCode, message: string) {
    super(message);
    this.name = 'AdminTokenPolicyException';
    this.code = code;
    // Strip stack trace so internal call frames and paths are never leaked
    delete (this as { stack?: string }).stack;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
