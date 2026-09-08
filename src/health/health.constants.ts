export const DEFAULT_HEALTH_TIMEOUT_MS = 3000; // 3 seconds timeout for PostgreSQL readiness check

export type HealthStatus = 'ok' | 'unavailable';

export interface HealthResponse {
  readonly status: HealthStatus;
  readonly timestamp: string;
}

export const PROHIBITED_HEALTH_FIELDS: readonly string[] = Object.freeze([
  'host',
  'hostname',
  'port',
  'database',
  'db',
  'user',
  'username',
  'password',
  'connectionString',
  'datasource',
  'url',
  'env',
  'stack',
  'message',
  'error',
  'internal',
  'details',
]);
