import {
  AuditAction,
  AuditActorType,
  AuditResult,
  AUDIT_EVENTS_API_VERSION,
} from '../audit-queries.constants';

export interface AuditEventItemDto {
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

export interface PaginatedAuditEventsResponseDto {
  readonly items: readonly AuditEventItemDto[];
  readonly nextCursor: string | null;
}

export interface ListAuditEventsQuery {
  readonly limit?: number | string;
  readonly cursor?: string;
  readonly companyId?: string;
  readonly actorId?: string;
  readonly event?: AuditAction | string;
  readonly result?: AuditResult | string;
  readonly from?: string;
  readonly to?: string;
}
