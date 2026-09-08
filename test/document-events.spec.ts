import { BadRequestException } from '@nestjs/common';
import { DocumentStatus, DocumentType, Prisma } from '@prisma/client';
import {
  DOCUMENT_EVENTS_API_VERSION,
  DOCUMENT_EVENT_TYPES,
  DocumentEventType,
  PROHIBITED_DOCUMENT_FIELDS,
  SUNAT_MESSAGE_MAX_LENGTH,
} from '../src/document-events/document-events.constants';
import { DocumentEventsModule } from '../src/document-events/document-events.module';
import { DocumentEventsService } from '../src/document-events/document-events.service';
import {
  deepFreeze,
  formatMonetaryTotal,
  sanitizeSunatMessage,
} from '../src/document-events/document-events.util';

describe('DocumentEventsService (Pure Versioned Document Event Payloads)', () => {
  let service: DocumentEventsService;

  const testCompanyId = '5f15da94-4e0c-42d7-947e-9ad304a31710';
  const testDocumentId = 'doc-1234-5678-abcd-ef01';

  const baseDocument = {
    id: testDocumentId,
    companyId: testCompanyId,
    type: DocumentType.INVOICE,
    series: 'F001',
    number: 105,
    status: DocumentStatus.ACCEPTED,
    currency: 'PEN',
    total: new Prisma.Decimal('118.00'),
    sunatCode: '0',
    sunatMessage: 'La Factura numero F001-105, ha sido aceptada',
  };

  beforeEach(() => {
    service = new DocumentEventsService();
  });

  describe('Module & Constants Setup', () => {
    it('should be instantiable directly and via module', () => {
      expect(service).toBeDefined();
      expect(new DocumentEventsModule()).toBeDefined();
    });

    it('should expose correct constants', () => {
      expect(DOCUMENT_EVENTS_API_VERSION).toBe('v1');
      expect(SUNAT_MESSAGE_MAX_LENGTH).toBe(500);
      expect(DOCUMENT_EVENT_TYPES).toHaveLength(7);
      expect(DOCUMENT_EVENT_TYPES).toEqual([
        'document.created',
        'document.processing',
        'document.accepted',
        'document.observed',
        'document.rejected',
        'document.voided',
        'document.error',
      ]);
      expect(PROHIBITED_DOCUMENT_FIELDS).toContain('xmlArtifactId');
      expect(PROHIBITED_DOCUMENT_FIELDS).toContain('customerName');
    });
  });

  describe('Generación de Payloads para cada uno de los 7 Eventos', () => {
    const allEvents: DocumentEventType[] = [
      'document.created',
      'document.processing',
      'document.accepted',
      'document.observed',
      'document.rejected',
      'document.voided',
      'document.error',
    ];

    it.each(allEvents)('should build a valid public payload for event: %s', (eventType) => {
      const payload = service.buildEvent(eventType, baseDocument);

      // Verify top-level structure
      expect(payload.eventId).toBeDefined();
      expect(payload.eventId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
      expect(payload.event).toBe(eventType);
      expect(payload.apiVersion).toBe('v1');
      expect(payload.occurredAt).toBeDefined();
      expect(new Date(payload.occurredAt).toISOString()).toBe(payload.occurredAt);
      expect(payload.companyId).toBe(testCompanyId);

      // Verify document summary structure
      expect(payload.document).toBeDefined();
      expect(payload.document.id).toBe(testDocumentId);
      expect(payload.document.type).toBe(DocumentType.INVOICE);
      expect(payload.document.series).toBe('F001');
      expect(payload.document.number).toBe(105);
      expect(payload.document.status).toBe(DocumentStatus.ACCEPTED);
      expect(payload.document.currency).toBe('PEN');
      expect(payload.document.total).toBe('118.00');
      expect(payload.document.sunatCode).toBe('0');
      expect(payload.document.sunatMessage).toBe(
        'La Factura numero F001-105, ha sido aceptada',
      );
    });

    it('should support builder shortcut methods for all events', () => {
      const created = service.buildCreatedEvent(baseDocument);
      expect(created.event).toBe('document.created');

      const processing = service.buildProcessingEvent(baseDocument);
      expect(processing.event).toBe('document.processing');

      const accepted = service.buildAcceptedEvent(baseDocument);
      expect(accepted.event).toBe('document.accepted');

      const observed = service.buildObservedEvent(baseDocument);
      expect(observed.event).toBe('document.observed');

      const rejected = service.buildRejectedEvent(baseDocument);
      expect(rejected.event).toBe('document.rejected');

      const voided = service.buildVoidedEvent(baseDocument);
      expect(voided.event).toBe('document.voided');

      const error = service.buildErrorEvent(baseDocument);
      expect(error.event).toBe('document.error');
    });

    it('should allow overriding eventId, companyId and occurredAt via options', () => {
      const customEventId = '11111111-2222-4333-8444-555555555555';
      const customCompanyId = 'cmp-override-999';
      const customDate = new Date('2026-09-08T10:30:00.000Z');

      const payload = service.buildCreatedEvent(baseDocument, {
        eventId: customEventId,
        companyId: customCompanyId,
        occurredAt: customDate,
      });

      expect(payload.eventId).toBe(customEventId);
      expect(payload.companyId).toBe(customCompanyId);
      expect(payload.occurredAt).toBe('2026-09-08T10:30:00.000Z');
    });
  });

  describe('Serialización JSON', () => {
    it('should serialize cleanly to JSON and deserialize back with identical structure', () => {
      const payload = service.buildAcceptedEvent(baseDocument);
      const jsonString = JSON.stringify(payload);
      const parsed = JSON.parse(jsonString);

      expect(parsed).toEqual(payload);
      expect(parsed.apiVersion).toBe('v1');
      expect(parsed.document.total).toBe('118.00');
      expect(typeof parsed.document.number).toBe('number');
    });
  });

  describe('Conversión de Decimales a Formato Monetario (formatMonetaryTotal)', () => {
    it('should convert Prisma.Decimal instances to 2-decimal string', () => {
      expect(formatMonetaryTotal(new Prisma.Decimal('100'))).toBe('100.00');
      expect(formatMonetaryTotal(new Prisma.Decimal('123.4'))).toBe('123.40');
      expect(formatMonetaryTotal(new Prisma.Decimal('0'))).toBe('0.00');
      expect(formatMonetaryTotal(new Prisma.Decimal('19.99'))).toBe('19.99');
    });

    it('should convert numbers to 2-decimal string', () => {
      expect(formatMonetaryTotal(100)).toBe('100.00');
      expect(formatMonetaryTotal(100.5)).toBe('100.50');
      expect(formatMonetaryTotal(0)).toBe('0.00');
    });

    it('should convert numeric strings to 2-decimal string with HALF_UP rounding', () => {
      expect(formatMonetaryTotal('100')).toBe('100.00');
      expect(formatMonetaryTotal('100.555')).toBe('100.56');
      expect(formatMonetaryTotal('100.554')).toBe('100.55');
    });

    it('should reject invalid or non-finite total values', () => {
      expect(() => formatMonetaryTotal(NaN)).toThrow(BadRequestException);
      expect(() => formatMonetaryTotal(Infinity)).toThrow(BadRequestException);
      expect(() => formatMonetaryTotal('not-a-number')).toThrow(BadRequestException);
      expect(() => formatMonetaryTotal(null)).toThrow(BadRequestException);
      expect(() => formatMonetaryTotal(undefined)).toThrow(BadRequestException);
    });
  });

  describe('Sanitización de Mensajes SUNAT (sanitizeSunatMessage)', () => {
    it('should strip CRLF, control characters and collapse whitespace', () => {
      const dirtyMessage = 'La Factura\r\nha sido aceptada con éxito.\t\0\x1b[31m';
      const sanitized = sanitizeSunatMessage(dirtyMessage);

      expect(sanitized).toBe('La Factura ha sido aceptada con éxito. [31m');
      expect(sanitized).not.toContain('\r');
      expect(sanitized).not.toContain('\n');
      expect(sanitized).not.toContain('\t');
      expect(sanitized).not.toContain('\0');
    });

    it('should truncate messages to a maximum of 500 characters', () => {
      const longMessage = 'A'.repeat(600);
      const sanitized = sanitizeSunatMessage(longMessage);

      expect(sanitized).toHaveLength(500);
      expect(sanitized).toBe('A'.repeat(500));
    });

    it('should return null for empty, whitespace-only, null or undefined messages', () => {
      expect(sanitizeSunatMessage(null)).toBeNull();
      expect(sanitizeSunatMessage(undefined)).toBeNull();
      expect(sanitizeSunatMessage('')).toBeNull();
      expect(sanitizeSunatMessage('   \r\n\t  ')).toBeNull();
    });
  });

  describe('Exclusión Estricta de Campos Prohibidos y Datos Sensibles', () => {
    it('should never include artifact IDs, storage paths, raw files, credentials or customer info', () => {
      const fullPrismaDocument = {
        ...baseDocument,
        // Prohibited artifact and file fields
        xmlArtifactId: 'art_xml_99999',
        zipArtifactId: 'art_zip_88888',
        cdrArtifactId: 'art_cdr_77777',
        filePath: 'c:/storage/docs/F001-105.xml',
        xml: '<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2">...</Invoice>',
        zip: Buffer.from('FAKE-ZIP'),
        cdr: Buffer.from('FAKE-CDR'),
        // Prohibited customer personal info
        customerDocumentType: '6',
        customerDocumentNumber: '20123456789',
        customerName: 'Cliente Confidencial S.A.C.',
        // Prohibited internal relations and adjustments
        referenceDocumentId: 'ref-doc-111',
        referenceDocument: { id: 'ref-doc-111' },
        adjustmentReasonCode: '01',
        adjustmentReason: 'Anulación de la operación',
        items: [{ id: 'item-1', description: 'Servicio', subtotal: 100 }],
        summaryEntries: [],
        company: { id: testCompanyId, ruc: '20100000001' },
        // Prohibited secrets
        apiKey: 'fact_live_secret_key_123',
        password: 'admin-password',
        token: 'jwt-token-value',
        secret: 'webhook-secret',
        certificate: 'pfx-data',
      };

      const payload = service.buildAcceptedEvent(fullPrismaDocument);

      // Verify that document summary strictly has ONLY the 9 allowed public fields
      const allowedDocKeys = [
        'id',
        'type',
        'series',
        'number',
        'status',
        'currency',
        'total',
        'sunatCode',
        'sunatMessage',
      ];
      expect(Object.keys(payload.document).sort()).toEqual(allowedDocKeys.sort());

      // Verify serialized JSON does not contain any prohibited terms
      const json = JSON.stringify(payload);
      for (const prohibited of PROHIBITED_DOCUMENT_FIELDS) {
        expect(json).not.toContain(`"${prohibited}"`);
      }

      expect(json).not.toContain('art_xml_99999');
      expect(json).not.toContain('art_zip_88888');
      expect(json).not.toContain('art_cdr_77777');
      expect(json).not.toContain('20123456789');
      expect(json).not.toContain('Cliente Confidencial');
      expect(json).not.toContain('fact_live_secret_key_123');
      expect(json).not.toContain('admin-password');
      expect(json).not.toContain('webhook-secret');
    });
  });

  describe('Inmutabilidad (deepFreeze)', () => {
    it('should freeze the top-level payload and the nested document object', () => {
      const payload = service.buildCreatedEvent(baseDocument);

      expect(Object.isFrozen(payload)).toBe(true);
      expect(Object.isFrozen(payload.document)).toBe(true);

      // Mutating should fail in strict mode
      expect(() => {
        (payload as any).event = 'document.error';
      }).toThrow(TypeError);

      expect(() => {
        (payload.document as any).status = DocumentStatus.VOIDED;
      }).toThrow(TypeError);

      expect(() => {
        (payload.document as any).total = '9999.00';
      }).toThrow(TypeError);
    });

    it('deepFreeze utility should freeze objects and nested properties', () => {
      const target = { a: 1, nested: { b: 2 } };
      deepFreeze(target);

      expect(Object.isFrozen(target)).toBe(true);
      expect(Object.isFrozen(target.nested)).toBe(true);
      expect(deepFreeze(null)).toBeNull();
      expect(deepFreeze('primitive')).toBe('primitive');
    });
  });

  describe('Validación de Entradas (BadRequestException)', () => {
    it('should reject invalid or unknown event types', () => {
      expect(() => service.buildEvent('unknown.event' as any, baseDocument)).toThrow(
        BadRequestException,
      );
      expect(() => service.buildEvent('' as any, baseDocument)).toThrow(
        BadRequestException,
      );
      expect(() => service.buildEvent(null as any, baseDocument)).toThrow(
        BadRequestException,
      );
    });

    it('should reject null, undefined or non-object document', () => {
      expect(() => service.buildCreatedEvent(null as any)).toThrow(BadRequestException);
      expect(() => service.buildCreatedEvent(undefined as any)).toThrow(BadRequestException);
      expect(() => service.buildCreatedEvent('not-an-object' as any)).toThrow(
        BadRequestException,
      );
    });

    it('should reject when companyId is missing', () => {
      const docWithoutCompany = { ...baseDocument, companyId: undefined };
      expect(() => service.buildCreatedEvent(docWithoutCompany)).toThrow(
        BadRequestException,
      );
    });

    it('should reject when document id, series, type or status is missing', () => {
      expect(() =>
        service.buildCreatedEvent({ ...baseDocument, id: '' }),
      ).toThrow(BadRequestException);

      expect(() =>
        service.buildCreatedEvent({ ...baseDocument, series: '   ' }),
      ).toThrow(BadRequestException);

      expect(() =>
        service.buildCreatedEvent({ ...baseDocument, number: -1 }),
      ).toThrow(BadRequestException);

      expect(() =>
        service.buildCreatedEvent({ ...baseDocument, type: undefined as any }),
      ).toThrow(BadRequestException);

      expect(() =>
        service.buildCreatedEvent({ ...baseDocument, status: undefined as any }),
      ).toThrow(BadRequestException);
    });

    it('should handle string occurredAt, currency fallback, and service helper methods', () => {
      const payloadWithStringDate = service.buildCreatedEvent(
        { ...baseDocument, currency: undefined },
        { occurredAt: '2026-09-08T14:00:00.000Z' },
      );

      expect(payloadWithStringDate.occurredAt).toBe('2026-09-08T14:00:00.000Z');
      expect(payloadWithStringDate.document.currency).toBe('PEN');

      expect(service.formatMonetaryTotal('123.456')).toBe('123.46');
      expect(service.sanitizeSunatMessage('Msg \x00 test')).toBe('Msg test');
      expect(service.sanitizeSunatMessage('\x00\x01\x1f')).toBeNull();
    });
  });
});
