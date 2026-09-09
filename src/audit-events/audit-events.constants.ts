/**
 * Supported administrative actions for audit events.
 */
export const AUDIT_ACTIONS = Object.freeze([
  'admin.bootstrap',
  'admin.created',
  'admin.login_succeeded',
  'admin.login_failed',
  'company.created',
  'api_key.created',
  'api_key.rotated',
  'api_key.revoked',
  'sunat_credentials.updated',
  'sunat_credentials.deleted',
  'certificate.registered',
  'certificate.deactivated',
] as const);

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export const AUDIT_ACTOR_TYPES = Object.freeze([
  'ADMIN',
  'SYSTEM',
  'ANONYMOUS',
] as const);

export type AuditActorType = (typeof AUDIT_ACTOR_TYPES)[number];

export const AUDIT_RESULTS = Object.freeze([
  'SUCCESS',
  'FAILURE',
] as const);

export type AuditResult = (typeof AUDIT_RESULTS)[number];

export const AUDIT_EVENTS_API_VERSION = 'v1' as const;

export const AUDIT_FIELD_LIMITS = {
  PUBLIC_CODE_MAX_LENGTH: 64,
  REQUEST_ID_MAX_LENGTH: 64,
} as const;

export const PROHIBITED_AUDIT_FIELDS = Object.freeze([
  'email',
  'name',
  'username',
  'password',
  'bootstrapToken',
  'token',
  'jwt',
  'apiKey',
  'key',
  'secret',
  'solUser',
  'solPassword',
  'credentials',
  'certificate',
  'pfx',
  'ip',
  'clientIp',
  'userAgent',
  'body',
  'requestBody',
  'responseBody',
  'url',
  'path',
  'route',
  'stack',
  'stackTrace',
  'passwordHash',
  'hash',
  'salt',
  'internalMessage',
  'message',
] as const);
