import type { ClientRequest, IncomingMessage } from 'node:http';
import type { RequestOptions as HttpsRequestOptions } from 'node:https';
import { PublicErrorCode } from './safe-webhook-client.constants';

/**
 * Options required to execute a secure webhook delivery attempt
 */
export interface SafeWebhookRequestOptions {
  /**
   * Target HTTPS URL
   */
  url: string;

  /**
   * Non-empty array of pre-validated public IP addresses
   */
  validatedIps: readonly string[];

  /**
   * Serialized JSON string payload
   */
  payload: string;

  /**
   * Already constructed headers (e.g., Content-Type, signature headers)
   */
  headers?: Record<string, string>;

  /**
   * Connection and transfer timeout in milliseconds
   */
  timeoutMs?: number;

  /**
   * Maximum response bytes to read before cutting connection
   */
  maxResponseBytes?: number;
}

/**
 * Result returned exclusively by SafeWebhookHttpClient
 */
export interface SafeWebhookResponse {
  readonly statusCode: number;
  readonly ok: boolean;
  readonly retryAfter: string | null;
}

/**
 * Factory for creating https requests, injected for tests
 */
export type HttpsRequestFactory = (
  options: HttpsRequestOptions,
  callback?: (res: IncomingMessage) => void
) => ClientRequest;

/**
 * Public exception thrown by SafeWebhookHttpClient without leaking internal info
 */
export class SafeWebhookClientException extends Error {
  public readonly code: PublicErrorCode;

  constructor(code: PublicErrorCode, publicMessage: string) {
    super(publicMessage);
    this.name = 'SafeWebhookClientException';
    this.code = code;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
