import { RATE_LIMITED_ERROR_CODE } from './auth-throttle.constants';

/**
 * Clock provider function returning the current epoch milliseconds
 */
export type Clock = () => number;

/**
 * Options for configuring AuthThrottleService
 */
export interface AuthThrottleOptions {
  hmacSecret: string;
  clock?: Clock;
  maxEntries?: number;
}

/**
 * Public exception thrown when an authentication action is rate-limited.
 * Never leaks the identifier, IP, email, token, internal hash, timestamps, or counters.
 */
export class AuthRateLimitedException extends Error {
  public readonly code: string = RATE_LIMITED_ERROR_CODE;
  public readonly retryAfterSeconds: number;

  constructor(retryAfterSeconds: number) {
    super('Demasiados intentos fallidos. Intente nuevamente en ' + retryAfterSeconds + ' segundos.');
    this.name = 'AuthRateLimitedException';
    this.retryAfterSeconds = retryAfterSeconds;
    // Strip stack trace so internal paths, methods, and call frames are never leaked
    delete (this as { stack?: string }).stack;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
