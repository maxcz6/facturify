export const AUTH_ACTIONS = {
  LOGIN: 'LOGIN',
  BOOTSTRAP: 'BOOTSTRAP',
} as const;

export type AuthAction = typeof AUTH_ACTIONS[keyof typeof AUTH_ACTIONS];

export interface ActionThrottleLimits {
  readonly maxFailures: number;
  readonly windowMs: number;
  readonly blockDurationMs: number;
}

export const THROTTLE_LIMITS: Record<AuthAction, ActionThrottleLimits> = {
  [AUTH_ACTIONS.LOGIN]: {
    maxFailures: 5,
    windowMs: 15 * 60 * 1000, // 15 minutes
    blockDurationMs: 15 * 60 * 1000, // 15 minutes block
  },
  [AUTH_ACTIONS.BOOTSTRAP]: {
    maxFailures: 3,
    windowMs: 30 * 60 * 1000, // 30 minutes
    blockDurationMs: 30 * 60 * 1000, // 30 minutes block
  },
};

export const DEFAULT_MAX_ENTRIES = 10000;
export const RATE_LIMITED_ERROR_CODE = 'AUTH_RATE_LIMITED';

export const PROHIBITED_THROTTLE_OUTPUT_FIELDS: readonly string[] = Object.freeze([
  'email',
  'ip',
  'token',
  'bootstrapToken',
  'identifier',
  'rawIdentifier',
  'hmacSecret',
  'secret',
  'key',
  'hash',
  'count',
  'failures',
  'firstFailureAt',
  'blockedUntil',
  'timestamps',
  'stack',
]);
