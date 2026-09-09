export type DeliveryStatus = 'SUCCESS' | 'FAILED' | 'PENDING';

export interface WebhookDeliveryLog {
  id: string;
  webhookId: string;
  companyId: string;
  url: string;
  event: string;
  payload: any;
  signatureHeader: string;
  attempt: number;
  maxAttempts: number;
  statusCode?: number;
  retryAfter?: string | null;
  status: DeliveryStatus;
  error?: string;
  timestamp: number;
  durationMs?: number;
  deliveredAt?: Date;
}
