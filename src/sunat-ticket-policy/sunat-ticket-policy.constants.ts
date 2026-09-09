export const DEFAULT_TICKET_MAX_ATTEMPTS = 20;
export const ABSOLUTE_MAX_TICKET_ATTEMPTS = 20;

export const DEFAULT_TICKET_MAX_TOTAL_MS = 30 * 60 * 1000; // 30 minutes in ms (1,800,000 ms)
export const ABSOLUTE_MAX_TICKET_TOTAL_MS = 30 * 60 * 1000; // 30 minutes in ms

export const MIN_TICKET_DELAY_MS = 2000; // 2 seconds
export const MAX_TICKET_DELAY_MS = 120000; // 2 minutes (120,000 ms)
export const TICKET_BACKOFF_FACTOR = 2; // exponential factor

/**
 * SUNAT Ticket Status Codes:
 * '98': En proceso (processing continues, retryable)
 * '0', '00', '99': Proceso terminado con CDR disponible (corresponde procesar el CDR)
 */
export const SUNAT_STATUS_IN_PROCESS = '98';
export const SUNAT_STATUS_TERMINAL_WITH_CDR: ReadonlySet<string> = Object.freeze(
  new Set(['0', '00', '99'])
);

export const PROHIBITED_TICKET_POLICY_FIELDS: readonly string[] = Object.freeze([
  'ticket',
  'ruc',
  'credentials',
  'solUsername',
  'solPassword',
  'password',
  'xml',
  'zip',
  'cdr',
  'url',
  'soapResponse',
  'response',
  'message',
  'internalMessage',
  'rawError',
  'stack',
]);
