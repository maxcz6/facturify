import { DocumentStatus } from '@prisma/client';

/**
 * Terminal document states from which no further progression is possible.
 */
export const TERMINAL_DOCUMENT_STATES: readonly DocumentStatus[] = Object.freeze([
  DocumentStatus.REJECTED,
  DocumentStatus.VOIDED,
]);

/**
 * States that can be voided (comunicación de baja) upon confirmation from SUNAT.
 */
export const VOIDABLE_DOCUMENT_STATES: readonly DocumentStatus[] = Object.freeze([
  DocumentStatus.ACCEPTED,
  DocumentStatus.OBSERVED,
]);

/**
 * Valid transitions mapping for electronic documents.
 * Note: Transitions to VOIDED from ACCEPTED/OBSERVED additionally require explicit void confirmation.
 */
export const ALLOWED_TRANSITIONS: Readonly<Record<DocumentStatus, readonly DocumentStatus[]>> = Object.freeze({
  [DocumentStatus.DRAFT]: Object.freeze([DocumentStatus.PENDING]),
  [DocumentStatus.PENDING]: Object.freeze([DocumentStatus.PROCESSING]),
  [DocumentStatus.PROCESSING]: Object.freeze([DocumentStatus.SENT, DocumentStatus.ERROR]),
  [DocumentStatus.SENT]: Object.freeze([
    DocumentStatus.ACCEPTED,
    DocumentStatus.OBSERVED,
    DocumentStatus.REJECTED,
    DocumentStatus.ERROR,
  ]),
  [DocumentStatus.ERROR]: Object.freeze([DocumentStatus.PROCESSING]),
  [DocumentStatus.ACCEPTED]: Object.freeze([DocumentStatus.VOIDED]),
  [DocumentStatus.OBSERVED]: Object.freeze([DocumentStatus.VOIDED]),
  [DocumentStatus.REJECTED]: Object.freeze([]),
  [DocumentStatus.VOIDED]: Object.freeze([]),
});
