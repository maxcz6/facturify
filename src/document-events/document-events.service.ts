import { BadRequestException, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  DOCUMENT_EVENTS_API_VERSION,
  DOCUMENT_EVENT_TYPES,
  DocumentEventType,
} from './document-events.constants';
import {
  BuildDocumentEventOptions,
  DocumentInputLike,
  DocumentPublicPayload,
  DocumentPublicSummary,
} from './document-events.interface';
import {
  deepFreeze,
  formatMonetaryTotal,
  sanitizeSunatMessage,
} from './document-events.util';

@Injectable()
export class DocumentEventsService {
  /**
   * Constructs an immutable, sanitized, versioned public event payload for a document.
   * Never includes artifact IDs, storage paths, raw XML/ZIP/CDR, credentials, tokens,
   * certificates, full customer personal information, or internal Prisma models.
   */
  buildEvent(
    event: DocumentEventType,
    document: DocumentInputLike,
    options?: BuildDocumentEventOptions,
  ): Readonly<DocumentPublicPayload> {
    if (!event || !DOCUMENT_EVENT_TYPES.includes(event)) {
      throw new BadRequestException(
        `Tipo de evento '${event}' no reconocido. Tipos válidos: ${DOCUMENT_EVENT_TYPES.join(', ')}.`,
      );
    }

    if (!document || typeof document !== 'object') {
      throw new BadRequestException('Los datos del documento son requeridos.');
    }

    const companyId = (options?.companyId ?? document.companyId)?.trim();
    if (!companyId) {
      throw new BadRequestException(
        'El companyId es requerido para generar el payload público del evento.',
      );
    }

    if (!document.id || typeof document.id !== 'string' || document.id.trim() === '') {
      throw new BadRequestException('El ID del documento es requerido.');
    }

    if (!document.series || typeof document.series !== 'string' || document.series.trim() === '') {
      throw new BadRequestException('La serie del documento es requerida.');
    }

    const docNumber = Number(document.number);
    if (!Number.isFinite(docNumber) || docNumber <= 0) {
      throw new BadRequestException('El número del documento debe ser un entero positivo válido.');
    }

    if (!document.type) {
      throw new BadRequestException('El tipo de documento es requerido.');
    }

    if (!document.status) {
      throw new BadRequestException('El estado del documento es requerido.');
    }
    // Format monetary total strictly to 2 decimal places
    const formattedTotal = formatMonetaryTotal(document.total);

    // Sanitize SUNAT code and message
    const sunatCode = document.sunatCode ? String(document.sunatCode).trim() : null;
    const sanitizedMessage = sanitizeSunatMessage(document.sunatMessage);

    // Construct strictly sanitized public document summary (only 9 fields allowed)
    const documentSummary: DocumentPublicSummary = {
      id: document.id.trim(),
      type: document.type,
      series: document.series.trim().toUpperCase(),
      number: docNumber,
      status: document.status,
      currency: (document.currency ? String(document.currency).trim().toUpperCase() : 'PEN') || 'PEN',
      total: formattedTotal,
      sunatCode: sunatCode || null,
      sunatMessage: sanitizedMessage,
    };

    // Determine timestamp
    let occurredAtIso: string;
    if (options?.occurredAt instanceof Date) {
      if (Number.isNaN(options.occurredAt.getTime())) throw new BadRequestException('La fecha del evento no es válida.');
      occurredAtIso = options.occurredAt.toISOString();
    } else if (typeof options?.occurredAt === 'string' && options.occurredAt.trim() !== '') {
      const parsed = new Date(options.occurredAt);
      if (Number.isNaN(parsed.getTime())) throw new BadRequestException('La fecha del evento no es válida.');
      occurredAtIso = parsed.toISOString();
    } else {
      occurredAtIso = new Date().toISOString();
    }

    const eventId = options?.eventId?.trim() || randomUUID();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(eventId)) {
      throw new BadRequestException('El eventId debe ser un UUID válido.');
    }
    const payload: DocumentPublicPayload = {
      eventId,
      event,
      apiVersion: DOCUMENT_EVENTS_API_VERSION,
      occurredAt: occurredAtIso,
      companyId,
      document: documentSummary,
    };

    return deepFreeze(payload);
  }

  buildCreatedEvent(
    document: DocumentInputLike,
    options?: BuildDocumentEventOptions,
  ): Readonly<DocumentPublicPayload> {
    return this.buildEvent('document.created', document, options);
  }

  buildProcessingEvent(
    document: DocumentInputLike,
    options?: BuildDocumentEventOptions,
  ): Readonly<DocumentPublicPayload> {
    return this.buildEvent('document.processing', document, options);
  }

  buildAcceptedEvent(
    document: DocumentInputLike,
    options?: BuildDocumentEventOptions,
  ): Readonly<DocumentPublicPayload> {
    return this.buildEvent('document.accepted', document, options);
  }

  buildObservedEvent(
    document: DocumentInputLike,
    options?: BuildDocumentEventOptions,
  ): Readonly<DocumentPublicPayload> {
    return this.buildEvent('document.observed', document, options);
  }

  buildRejectedEvent(
    document: DocumentInputLike,
    options?: BuildDocumentEventOptions,
  ): Readonly<DocumentPublicPayload> {
    return this.buildEvent('document.rejected', document, options);
  }

  buildVoidedEvent(
    document: DocumentInputLike,
    options?: BuildDocumentEventOptions,
  ): Readonly<DocumentPublicPayload> {
    return this.buildEvent('document.voided', document, options);
  }

  buildErrorEvent(
    document: DocumentInputLike,
    options?: BuildDocumentEventOptions,
  ): Readonly<DocumentPublicPayload> {
    return this.buildEvent('document.error', document, options);
  }

  formatMonetaryTotal(val: unknown): string {
    return formatMonetaryTotal(val);
  }

  sanitizeSunatMessage(raw: unknown): string | null {
    return sanitizeSunatMessage(raw);
  }
}
