import { PasswordErrorCode } from './password-policy.constants';

export interface PasswordError {
  readonly code: PasswordErrorCode;
  readonly message: string;
}

export interface PasswordValidationResult {
  readonly valid: boolean;
  readonly errors: readonly PasswordError[];
}

export interface PasswordValidationContext {
  readonly email?: string;
  readonly name?: string;
}

export class PasswordPolicyException extends Error {
  public readonly code: PasswordErrorCode;
  public readonly errors: readonly PasswordError[];

  constructor(errors: readonly PasswordError[]) {
    const primaryMessage = errors.length > 0 ? errors[0].message : 'La contrasena no cumple con la politica de seguridad.';
    super(primaryMessage);
    this.name = 'PasswordPolicyException';
    this.code = errors.length > 0 ? errors[0].code : 'PASSWORD_TOO_SHORT';
    this.errors = Object.freeze([...errors]);
    // Strip stack trace so internal paths, methods, and call frames are never leaked
    delete (this as { stack?: string }).stack;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
