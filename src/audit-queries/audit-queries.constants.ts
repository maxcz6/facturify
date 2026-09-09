import {
  AUDIT_ACTIONS,
  AUDIT_ACTOR_TYPES,
  AUDIT_RESULTS,
  AUDIT_EVENTS_API_VERSION,
  AuditAction,
  AuditActorType,
  AuditResult,
} from '../audit-events';

export const AUDIT_QUERY_PAGINATION = {
  DEFAULT_LIMIT: 50,
  MIN_LIMIT: 1,
  MAX_LIMIT: 100,
} as const;

export {
  AUDIT_ACTIONS,
  AUDIT_ACTOR_TYPES,
  AUDIT_RESULTS,
  AUDIT_EVENTS_API_VERSION,
  AuditAction,
  AuditActorType,
  AuditResult,
};

export const PROHIBITED_AUDIT_OUTPUT_FIELDS: readonly string[] = Object.freeze([
  'id',
  'createdAt',
  'updatedAt',
  'email',
  'name',
  'password',
  'token',
  'jwt',
  'apiKey',
  'secret',
  'ip',
  'clientIp',
  'userAgent',
  'body',
  'url',
  'route',
  'path',
  'stack',
  'stackTrace',
]);
