import {
  AuditAction,
  AuditActorType,
  AuditResult,
  AUDIT_EVENTS_API_VERSION,
} from './audit-events.constants';

export interface AuditEvent {
  readonly eventId: string;
  readonly event: AuditAction;
  readonly apiVersion: typeof AUDIT_EVENTS_API_VERSION;
  readonly occurredAt: string;
  readonly actorType: AuditActorType;
  readonly actorId: string | null;
  readonly companyId: string | null;
  readonly result: AuditResult;
  readonly publicCode: string | null;
  readonly requestId: string | null;
}

export interface CreateAuditEventInput {
  readonly eventId?: string;
  readonly event: AuditAction;
  readonly occurredAt?: Date | string;
  readonly actorType: AuditActorType;
  readonly actorId?: string | null;
  readonly companyId?: string | null;
  readonly result: AuditResult;
  readonly publicCode?: string | null;
  readonly requestId?: string | null;
}
