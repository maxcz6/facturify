export const DEFAULT_WEBHOOK_TIMEOUT_MS = 10000; // 10 seconds timeout
export const MAX_WEBHOOK_TIMEOUT_MS = 30000; // 30 seconds max timeout
export const MAX_PAYLOAD_SIZE_BYTES = 256 * 1024; // 256 KB max payload size
export const MAX_RESPONSE_BYTES = 64 * 1024; // 64 KB max response size
export const MAX_PINNED_IPS = 16;
export const MAX_RETRY_AFTER_LENGTH = 128;

export const PUBLIC_ERROR_CODES = {
  TIMEOUT: 'TIMEOUT',
  NETWORK_ERROR: 'NETWORK_ERROR',
  PAYLOAD_TOO_LARGE: 'PAYLOAD_TOO_LARGE',
  RESPONSE_TOO_LARGE: 'RESPONSE_TOO_LARGE',
  INVALID_INPUT: 'INVALID_INPUT',
} as const;

export type PublicErrorCode = typeof PUBLIC_ERROR_CODES[keyof typeof PUBLIC_ERROR_CODES];

export const PROHIBITED_CLIENT_OUTPUT_FIELDS: readonly string[] = Object.freeze([
  'url',
  'hostname',
  'host',
  'ip',
  'address',
  'port',
  'body',
  'payload',
  'data',
  'headers',
  'statusText',
  'socket',
  'certificate',
  'cert',
  'secret',
  'signature',
  'rawError',
  'stack',
  'message',
]);
