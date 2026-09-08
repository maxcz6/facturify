export type WebhookStatus = 'ACTIVE' | 'DISABLED';

/**
 * Public sanitized webhook representation — never contains secret
 */
export interface WebhookSubscription {
  id: string;
  companyId: string;
  url: string;
  events: string[];
  status: WebhookStatus;
  createdAt: Date;
}

/**
 * Only returned once during creation
 */
export interface RegisteredWebhookResponse extends WebhookSubscription {
  secret: string; // whsec_... ONLY returned on creation!
}

/**
 * Internal storage record holding secret for HMAC signing
 */
export interface WebhookInternalRecord extends WebhookSubscription {
  secret: string;
}
