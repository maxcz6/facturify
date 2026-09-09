import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';
import {
  AUDIT_EVENTS_API_VERSION,
  AuditResult,
} from './audit-events.constants';
import { AuditEvent, CreateAuditEventInput } from './audit-events.interface';
import {
  isValidUuid,
  isValidAuditAction,
  isValidActorType,
  isValidAuditResult,
  sanitizePublicCode,
  sanitizeRequestId,
  formatOccurredAt,
  deepFreeze,
} from './audit-events.util';

@Injectable()
export class AuditEventBuilderService {
  /**
   * Builds a safe, validated, versioned administrative audit event.
   * Ensures actor coherency, field limits, and strict immutability.
   * Never leaks raw invalid payloads, credentials, IPs, tokens, or sensitive data.
   */
  public build(input: CreateAuditEventInput): Readonly<AuditEvent> {
    if (!input || typeof input !== 'object') {
      throw new Error('El input del evento de auditoria es invalido');
    }

    // 1. Validate or generate eventId
    let eventId: string;
    if (input.eventId !== undefined && input.eventId !== null) {
      if (!isValidUuid(input.eventId)) {
        throw new Error('eventId debe ser un UUID valido');
      }
      eventId = input.eventId.toLowerCase();
    } else {
      eventId = crypto.randomUUID();
    }

    // 2. Validate action
    if (!isValidAuditAction(input.event)) {
      throw new Error('Accion de auditoria no permitida');
    }
    const event = input.event;

    // 3. Validate and format occurredAt
    const occurredAt = formatOccurredAt(input.occurredAt);

    // 4. Validate actorType
    if (!isValidActorType(input.actorType)) {
      throw new Error('actorType no valido');
    }
    const actorType = input.actorType;

    // 5. Validate actorId according to actorType coherence
    let actorId: string | null = null;
    if (actorType === 'ANONYMOUS') {
      if (input.actorId !== undefined && input.actorId !== null) {
        throw new Error('Actores ANONYMOUS no pueden tener actorId');
      }
      actorId = null;
    } else if (actorType === 'ADMIN') {
      if (!input.actorId || !isValidUuid(input.actorId)) {
        throw new Error('Actores ADMIN deben tener un actorId UUID valido');
      }
      actorId = input.actorId.toLowerCase();
    } else if (actorType === 'SYSTEM') {
      if (input.actorId !== undefined && input.actorId !== null) {
        if (!isValidUuid(input.actorId)) {
          throw new Error('actorId de SYSTEM debe ser un UUID valido si se proporciona');
        }
        actorId = input.actorId.toLowerCase();
      } else {
        actorId = null;
      }
    }

    // 6. Validate companyId if present
    let companyId: string | null = null;
    if (input.companyId !== undefined && input.companyId !== null) {
      if (!isValidUuid(input.companyId)) {
        throw new Error('companyId debe ser un UUID valido');
      }
      companyId = input.companyId.toLowerCase();
    }

    // 7. Validate result
    if (!isValidAuditResult(input.result)) {
      throw new Error('result no valido');
    }
    const result = input.result;

    // 8. Sanitize publicCode and requestId
    const publicCode = sanitizePublicCode(input.publicCode);
    const requestId = sanitizeRequestId(input.requestId);

    const auditEvent: AuditEvent = {
      eventId,
      event,
      apiVersion: AUDIT_EVENTS_API_VERSION,
      occurredAt,
      actorType,
      actorId,
      companyId,
      result,
      publicCode,
      requestId,
    };

    return deepFreeze(auditEvent);
  }

  // ==========================================
  // Helper methods for specific administrative actions
  // ==========================================

  public buildAdminBootstrap(params: {
    result: AuditResult;
    adminId?: string | null;
    publicCode?: string | null;
    requestId?: string | null;
  }): Readonly<AuditEvent> {
    return this.build({
      event: 'admin.bootstrap',
      actorType: params.result === 'SUCCESS' ? 'ADMIN' : 'ANONYMOUS',
      actorId: params.result === 'SUCCESS' ? params.adminId : null,
      result: params.result,
      publicCode: params.publicCode,
      requestId: params.requestId,
    });
  }

  public buildAdminLogin(params: {
    adminId?: string | null;
    result: AuditResult;
    publicCode?: string | null;
    requestId?: string | null;
  }): Readonly<AuditEvent> {
    const isSuccess = params.result === 'SUCCESS';
    return this.build({
      event: isSuccess ? 'admin.login_succeeded' : 'admin.login_failed',
      actorType: isSuccess ? 'ADMIN' : 'ANONYMOUS',
      actorId: isSuccess ? params.adminId : null,
      result: params.result,
      publicCode: params.publicCode,
      requestId: params.requestId,
    });
  }

  public buildCompanyCreated(params: {
    actorId: string;
    companyId: string;
    result?: AuditResult;
    requestId?: string | null;
  }): Readonly<AuditEvent> {
    return this.build({
      event: 'company.created',
      actorType: 'ADMIN',
      actorId: params.actorId,
      companyId: params.companyId,
      result: params.result || 'SUCCESS',
      requestId: params.requestId,
    });
  }

  public buildApiKeyAction(params: {
    action: 'api_key.created' | 'api_key.rotated' | 'api_key.revoked';
    actorId: string;
    companyId: string;
    result?: AuditResult;
    publicCode?: string | null;
    requestId?: string | null;
  }): Readonly<AuditEvent> {
    return this.build({
      event: params.action,
      actorType: 'ADMIN',
      actorId: params.actorId,
      companyId: params.companyId,
      result: params.result || 'SUCCESS',
      publicCode: params.publicCode,
      requestId: params.requestId,
    });
  }

  public buildCertificateAction(params: {
    action: 'certificate.registered' | 'certificate.deactivated';
    actorId: string;
    companyId: string;
    result?: AuditResult;
    publicCode?: string | null;
    requestId?: string | null;
  }): Readonly<AuditEvent> {
    return this.build({
      event: params.action,
      actorType: 'ADMIN',
      actorId: params.actorId,
      companyId: params.companyId,
      result: params.result || 'SUCCESS',
      publicCode: params.publicCode,
      requestId: params.requestId,
    });
  }

  public buildSunatCredentialsAction(params: {
    action: 'sunat_credentials.updated' | 'sunat_credentials.deleted';
    actorId: string;
    companyId: string;
    result?: AuditResult;
    publicCode?: string | null;
    requestId?: string | null;
  }): Readonly<AuditEvent> {
    return this.build({
      event: params.action,
      actorType: 'ADMIN',
      actorId: params.actorId,
      companyId: params.companyId,
      result: params.result || 'SUCCESS',
      publicCode: params.publicCode,
      requestId: params.requestId,
    });
  }
}
