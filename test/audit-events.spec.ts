import {
  AuditEventBuilderService,
  AUDIT_ACTIONS,
  AUDIT_ACTOR_TYPES,
  AUDIT_RESULTS,
  AUDIT_EVENTS_API_VERSION,
  PROHIBITED_AUDIT_FIELDS,
  isValidUuid,
  sanitizePublicCode,
  sanitizeRequestId,
  formatOccurredAt,
  deepFreeze,
  CreateAuditEventInput,
} from '../src/audit-events';

describe('AuditEventsModule', () => {
  let service: AuditEventBuilderService;
  const validAdminId = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
  const validCompanyId = 'b1ffcd88-8b0a-4df7-aa5c-5aa8ac270b22';
  const validEventId = 'c2eebc77-7a09-4ce6-994b-49979b160c33';

  beforeEach(() => {
    service = new AuditEventBuilderService();
  });

  describe('Core Event Building and All Actions', () => {
    it('builds an event successfully for every allowed action in AUDIT_ACTIONS', () => {
      for (const action of AUDIT_ACTIONS) {
        const event = service.build({
          event: action,
          actorType: 'ADMIN',
          actorId: validAdminId,
          companyId: validCompanyId,
          result: 'SUCCESS',
          publicCode: 'RESOURCE_CREATED',
          requestId: 'req-12345',
        });

        expect(event).toBeDefined();
        expect(event.event).toBe(action);
        expect(event.apiVersion).toBe(AUDIT_EVENTS_API_VERSION);
        expect(event.actorType).toBe('ADMIN');
        expect(event.actorId).toBe(validAdminId);
        expect(event.companyId).toBe(validCompanyId);
        expect(event.result).toBe('SUCCESS');
        expect(event.publicCode).toBe('RESOURCE_CREATED');
        expect(event.requestId).toBe('req-12345');
        expect(isValidUuid(event.eventId)).toBe(true);
        expect(typeof event.occurredAt).toBe('string');
        expect(new Date(event.occurredAt).getTime()).not.toBeNaN();
      }
    });

    it('rejects null or non-object input', () => {
      expect(() => service.build(null as unknown as CreateAuditEventInput)).toThrow(
        'El input del evento de auditoria es invalido',
      );
      expect(() => service.build('invalid' as unknown as CreateAuditEventInput)).toThrow(
        'El input del evento de auditoria es invalido',
      );
    });

    it('rejects disallowed audit actions', () => {
      expect(() =>
        service.build({
          event: 'admin.deleted_everything' as unknown as typeof AUDIT_ACTIONS[0],
          actorType: 'ADMIN',
          actorId: validAdminId,
          result: 'SUCCESS',
        }),
      ).toThrow('Accion de auditoria no permitida');
    });

    it('preserves provided valid eventId or generates one if omitted', () => {
      const explicit = service.build({
        eventId: validEventId,
        event: 'admin.created',
        actorType: 'ADMIN',
        actorId: validAdminId,
        result: 'SUCCESS',
      });
      expect(explicit.eventId).toBe(validEventId);

      const generated = service.build({
        event: 'admin.created',
        actorType: 'ADMIN',
        actorId: validAdminId,
        result: 'SUCCESS',
      });
      expect(isValidUuid(generated.eventId)).toBe(true);
      expect(generated.eventId).not.toBe(validEventId);
    });

    it('rejects invalid eventId format', () => {
      expect(() =>
        service.build({
          eventId: 'not-a-uuid',
          event: 'admin.created',
          actorType: 'ADMIN',
          actorId: validAdminId,
          result: 'SUCCESS',
        }),
      ).toThrow('eventId debe ser un UUID valido');
    });
  });

  describe('Actor Type & Coherence Rules', () => {
    it('requires actorId for ADMIN actorType', () => {
      expect(() =>
        service.build({
          event: 'company.created',
          actorType: 'ADMIN',
          result: 'SUCCESS',
        }),
      ).toThrow('Actores ADMIN deben tener un actorId UUID valido');

      expect(() =>
        service.build({
          event: 'company.created',
          actorType: 'ADMIN',
          actorId: 'invalid-uuid',
          result: 'SUCCESS',
        }),
      ).toThrow('Actores ADMIN deben tener un actorId UUID valido');
    });

    it('forbids actorId for ANONYMOUS actorType', () => {
      expect(() =>
        service.build({
          event: 'admin.login_failed',
          actorType: 'ANONYMOUS',
          actorId: validAdminId,
          result: 'FAILURE',
        }),
      ).toThrow('Actores ANONYMOUS no pueden tener actorId');

      const anonymousValid = service.build({
        event: 'admin.login_failed',
        actorType: 'ANONYMOUS',
        result: 'FAILURE',
      });
      expect(anonymousValid.actorType).toBe('ANONYMOUS');
      expect(anonymousValid.actorId).toBeNull();
    });

    it('allows optional actorId for SYSTEM actorType but rejects non-UUID actorId', () => {
      const systemWithId = service.build({
        event: 'api_key.revoked',
        actorType: 'SYSTEM',
        actorId: validAdminId,
        companyId: validCompanyId,
        result: 'SUCCESS',
      });
      expect(systemWithId.actorType).toBe('SYSTEM');
      expect(systemWithId.actorId).toBe(validAdminId);

      expect(() =>
        service.build({
          event: 'api_key.revoked',
          actorType: 'SYSTEM',
          actorId: 'not-a-uuid',
          companyId: validCompanyId,
          result: 'SUCCESS',
        }),
      ).toThrow('actorId de SYSTEM debe ser un UUID valido si se proporciona');

      const systemWithoutId = service.build({
        event: 'api_key.revoked',
        actorType: 'SYSTEM',
        companyId: validCompanyId,
        result: 'SUCCESS',
      });
      expect(systemWithoutId.actorType).toBe('SYSTEM');
      expect(systemWithoutId.actorId).toBeNull();
    });

    it('rejects invalid actorType', () => {
      expect(() =>
        service.build({
          event: 'admin.created',
          actorType: 'SUPERADMIN' as unknown as typeof AUDIT_ACTOR_TYPES[0],
          actorId: validAdminId,
          result: 'SUCCESS',
        }),
      ).toThrow('actorType no valido');
    });

    it('validates and rejects invalid companyId format', () => {
      expect(() =>
        service.build({
          event: 'company.created',
          actorType: 'ADMIN',
          actorId: validAdminId,
          companyId: 'invalid-company-id',
          result: 'SUCCESS',
        }),
      ).toThrow('companyId debe ser un UUID valido');
    });

    it('validates and rejects invalid result', () => {
      expect(() =>
        service.build({
          event: 'admin.created',
          actorType: 'ADMIN',
          actorId: validAdminId,
          result: 'PENDING' as unknown as typeof AUDIT_RESULTS[0],
        }),
      ).toThrow('result no valido');
    });
  });

  describe('Sanitization & Limits for publicCode and requestId', () => {
    it('accepts valid safe publicCode and requestId', () => {
      const event = service.build({
        event: 'admin.login_failed',
        actorType: 'ANONYMOUS',
        result: 'FAILURE',
        publicCode: 'INVALID_CREDENTIALS',
        requestId: 'req-prod.123_abc',
      });
      expect(event.publicCode).toBe('INVALID_CREDENTIALS');
      expect(event.requestId).toBe('req-prod.123_abc');
    });

    it('converts empty or whitespace-only code/requestId to null', () => {
      const event = service.build({
        event: 'admin.login_failed',
        actorType: 'ANONYMOUS',
        result: 'FAILURE',
        publicCode: '   ',
        requestId: '',
      });
      expect(event.publicCode).toBeNull();
      expect(event.requestId).toBeNull();
    });

    it('rejects publicCode exceeding 64 characters', () => {
      expect(() =>
        service.build({
          event: 'admin.login_failed',
          actorType: 'ANONYMOUS',
          result: 'FAILURE',
          publicCode: 'A'.repeat(65),
        }),
      ).toThrow('publicCode excede la longitud maxima permitida');
    });

    it('rejects requestId exceeding 64 characters', () => {
      expect(() =>
        service.build({
          event: 'admin.login_failed',
          actorType: 'ANONYMOUS',
          result: 'FAILURE',
          requestId: 'B'.repeat(65),
        }),
      ).toThrow('requestId excede la longitud maxima permitida');
    });

    it('rejects unsafe characters (CR, LF, spaces, quotes, sql) in publicCode and requestId', () => {
      expect(() =>
        service.build({
          event: 'admin.login_failed',
          actorType: 'ANONYMOUS',
          result: 'FAILURE',
          publicCode: 'CODE WITH SPACES',
        }),
      ).toThrow('publicCode contiene caracteres no permitidos');

      expect(() =>
        service.build({
          event: 'admin.login_failed',
          actorType: 'ANONYMOUS',
          result: 'FAILURE',
          requestId: 'req;DROP TABLE users;',
        }),
      ).toThrow('requestId contiene caracteres no permitidos');
    });
  });

  describe('Immutability and JSON Serialization', () => {
    it('returns deeply frozen immutable event objects', () => {
      const event = service.build({
        event: 'company.created',
        actorType: 'ADMIN',
        actorId: validAdminId,
        companyId: validCompanyId,
        result: 'SUCCESS',
      });

      expect(Object.isFrozen(event)).toBe(true);
      expect(() => {
        (event as unknown as Record<string, unknown>).result = 'FAILURE';
      }).toThrow();
    });

    it('serializes cleanly to JSON without circular references or functions', () => {
      const event = service.build({
        event: 'certificate.registered',
        actorType: 'ADMIN',
        actorId: validAdminId,
        companyId: validCompanyId,
        result: 'SUCCESS',
        publicCode: 'CERT_ACTIVE',
        requestId: 'req-456',
      });

      const jsonStr = JSON.stringify(event);
      const parsed = JSON.parse(jsonStr);

      expect(parsed).toEqual({
        eventId: event.eventId,
        event: 'certificate.registered',
        apiVersion: 'v1',
        occurredAt: event.occurredAt,
        actorType: 'ADMIN',
        actorId: validAdminId,
        companyId: validCompanyId,
        result: 'SUCCESS',
        publicCode: 'CERT_ACTIVE',
        requestId: 'req-456',
      });
    });
  });

  describe('Absence of Sensitive Fields', () => {
    it('guarantees that no prohibited sensitive fields exist in the built event', () => {
      const event = service.build({
        event: 'sunat_credentials.updated',
        actorType: 'ADMIN',
        actorId: validAdminId,
        companyId: validCompanyId,
        result: 'SUCCESS',
        publicCode: 'CREDENTIALS_SET',
        requestId: 'req-789',
      });

      const eventKeys = Object.keys(event);
      for (const prohibited of PROHIBITED_AUDIT_FIELDS) {
        expect(eventKeys).not.toContain(prohibited);
        expect((event as unknown as Record<string, unknown>)[prohibited]).toBeUndefined();
      }

      // Explicitly check key names
      expect(eventKeys.sort()).toEqual([
        'actorId',
        'actorType',
        'apiVersion',
        'companyId',
        'event',
        'eventId',
        'occurredAt',
        'publicCode',
        'requestId',
        'result',
      ]);
    });
  });

  describe('Helper Methods for Specific Actions', () => {
    it('buildAdminBootstrap handles SUCCESS and FAILURE correctly', () => {
      const success = service.buildAdminBootstrap({
        result: 'SUCCESS',
        adminId: validAdminId,
        requestId: 'req-1',
      });
      expect(success.event).toBe('admin.bootstrap');
      expect(success.actorType).toBe('ADMIN');
      expect(success.actorId).toBe(validAdminId);

      const failure = service.buildAdminBootstrap({
        result: 'FAILURE',
        publicCode: 'INVALID_TOKEN',
        requestId: 'req-2',
      });
      expect(failure.event).toBe('admin.bootstrap');
      expect(failure.actorType).toBe('ANONYMOUS');
      expect(failure.actorId).toBeNull();
      expect(failure.publicCode).toBe('INVALID_TOKEN');
    });

    it('buildAdminLogin handles SUCCESS and FAILURE', () => {
      const success = service.buildAdminLogin({
        adminId: validAdminId,
        result: 'SUCCESS',
      });
      expect(success.event).toBe('admin.login_succeeded');
      expect(success.actorType).toBe('ADMIN');
      expect(success.actorId).toBe(validAdminId);

      const failure = service.buildAdminLogin({
        result: 'FAILURE',
        publicCode: 'AUTH_FAILED',
      });
      expect(failure.event).toBe('admin.login_failed');
      expect(failure.actorType).toBe('ANONYMOUS');
      expect(failure.actorId).toBeNull();
      expect(failure.publicCode).toBe('AUTH_FAILED');
    });

    it('buildCompanyCreated builds company creation event', () => {
      const event = service.buildCompanyCreated({
        actorId: validAdminId,
        companyId: validCompanyId,
        requestId: 'req-comp',
      });
      expect(event.event).toBe('company.created');
      expect(event.actorType).toBe('ADMIN');
      expect(event.actorId).toBe(validAdminId);
      expect(event.companyId).toBe(validCompanyId);
      expect(event.result).toBe('SUCCESS');
    });

    it('buildApiKeyAction builds API key lifecycle events', () => {
      const created = service.buildApiKeyAction({
        action: 'api_key.created',
        actorId: validAdminId,
        companyId: validCompanyId,
      });
      expect(created.event).toBe('api_key.created');

      const rotated = service.buildApiKeyAction({
        action: 'api_key.rotated',
        actorId: validAdminId,
        companyId: validCompanyId,
      });
      expect(rotated.event).toBe('api_key.rotated');

      const revoked = service.buildApiKeyAction({
        action: 'api_key.revoked',
        actorId: validAdminId,
        companyId: validCompanyId,
      });
      expect(revoked.event).toBe('api_key.revoked');
    });

    it('buildCertificateAction and buildSunatCredentialsAction build respective events', () => {
      const cert = service.buildCertificateAction({
        action: 'certificate.registered',
        actorId: validAdminId,
        companyId: validCompanyId,
      });
      expect(cert.event).toBe('certificate.registered');

      const sunat = service.buildSunatCredentialsAction({
        action: 'sunat_credentials.updated',
        actorId: validAdminId,
        companyId: validCompanyId,
      });
      expect(sunat.event).toBe('sunat_credentials.updated');
    });
  });

  describe('Utility Edge Cases', () => {
    it('handles formatOccurredAt validation', () => {
      expect(formatOccurredAt()).toBeDefined();
      const iso = new Date(1700000000000).toISOString();
      expect(formatOccurredAt(iso)).toBe(iso);
      expect(() => formatOccurredAt('invalid-date')).toThrow('occurredAt debe ser una fecha valida');
    });

    it('handles deepFreeze with nested objects, primitives and null', () => {
      expect(deepFreeze(null)).toBeNull();
      expect(deepFreeze(42)).toBe(42);
      expect(deepFreeze('str')).toBe('str');

      const nested = { a: { b: 1 } };
      deepFreeze(nested);
      expect(Object.isFrozen(nested.a)).toBe(true);
    });

    it('handles sanitizePublicCode and sanitizeRequestId type errors', () => {
      expect(() => sanitizePublicCode(123)).toThrow(TypeError);
      expect(() => sanitizeRequestId(123)).toThrow(TypeError);
    });
  });
});
