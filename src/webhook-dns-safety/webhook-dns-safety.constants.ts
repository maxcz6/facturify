export const DEFAULT_DNS_TIMEOUT_MS = 3000;
export const MAX_DNS_RESOLVED_ADDRESSES = 16;
export const GENERIC_DNS_SAFETY_ERROR_MESSAGE =
  'La dirección del webhook no cumple con las políticas de seguridad de red o resolución DNS.';

/**
 * Fields prohibited from appearing in responses or error messages
 */
export const PROHIBITED_DNS_SAFETY_FIELDS: readonly string[] = Object.freeze([
  'hostname',
  'url',
  'ip',
  'address',
  'addresses',
  'rawError',
  'dnsError',
  'stack',
  'code',
]);
