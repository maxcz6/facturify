import { DocumentStatus, DocumentType, Prisma } from '@prisma/client';
import { DocumentEventType } from './document-events.constants';

/**
 * Public document summary exposed inside public event payloads.
 * Strictly limited to 9 public business fields.
 */
export interface DocumentPublicSummary {
  id: string;
  type: DocumentType | string;
  series: string;
  number: number;
  status: DocumentStatus | string;
  currency: string;
  total: string;
  sunatCode: string | null;
  sunatMessage: string | null;
}

/**
 * Top-level versioned public event payload.
 */
export interface DocumentPublicPayload {
  eventId: string;
  event: DocumentEventType;
  apiVersion: 'v1';
  occurredAt: string;
  companyId: string;
  document: DocumentPublicSummary;
}

/**
 * Flexible input object representing an electronic document
 * (Prisma Document model, DTO, or plain object).
 */
export interface DocumentInputLike {
  id: string;
  companyId?: string;
  type: DocumentType | string;
  series: string;
  number: number | string;
  status: DocumentStatus | string;
  currency?: string | null;
  total: Prisma.Decimal | number | string;
  sunatCode?: string | null;
  sunatMessage?: string | null;
  [key: string]: unknown;
}

/**
 * Options for constructing a document event payload.
 */
export interface BuildDocumentEventOptions {
  eventId?: string;
  companyId?: string;
  occurredAt?: Date | string;
}
