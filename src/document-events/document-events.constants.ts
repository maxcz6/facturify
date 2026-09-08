/**
 * Supported electronic document lifecycle events for webhooks and auditing.
 */
export const DOCUMENT_EVENT_TYPES = Object.freeze([
  'document.created',
  'document.processing',
  'document.accepted',
  'document.observed',
  'document.rejected',
  'document.voided',
  'document.error',
] as const);

export type DocumentEventType = (typeof DOCUMENT_EVENT_TYPES)[number];

/**
 * Current API contract version for event payloads.
 */
export const DOCUMENT_EVENTS_API_VERSION = 'v1' as const;

/**
 * Maximum character length allowed for SUNAT response messages in public payloads.
 */
export const SUNAT_MESSAGE_MAX_LENGTH = 500;

/**
 * Prohibited fields that must NEVER appear in public event payloads.
 */
export const PROHIBITED_DOCUMENT_FIELDS = Object.freeze([
  'xmlArtifactId',
  'zipArtifactId',
  'cdrArtifactId',
  'customerDocumentType',
  'customerDocumentNumber',
  'customerName',
  'referenceDocumentId',
  'referenceDocument',
  'adjustmentReasonCode',
  'adjustmentReason',
  'items',
  'summaryEntries',
  'company',
  'xml',
  'zip',
  'cdr',
  'path',
  'filePath',
  'password',
  'secret',
  'token',
  'apiKey',
  'jwt',
  'certificate',
  'certificates',
] as const);
