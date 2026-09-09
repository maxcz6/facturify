export const ALLOWED_NODE_ENVS = ['development', 'test', 'production'] as const;
export type NodeEnv = typeof ALLOWED_NODE_ENVS[number];

export const MIN_PORT = 1;
export const MAX_PORT = 65535;

export const MIN_SECRET_BYTES = 32; // Minimum 32 bytes for JWT_SECRET and BOOTSTRAP_ADMIN_TOKEN
export const EXACT_ENCRYPTION_KEY_BYTES = 32; // 256 bits AES-256-GCM

export const MIN_STORAGE_LIMIT_BYTES = 1024; // 1 KB
export const MAX_STORAGE_LIMIT_BYTES = 100 * 1024 * 1024; // 100 MB

export const MIN_CERTIFICATE_LIMIT_BYTES = 1024; // 1 KB
export const MAX_CERTIFICATE_LIMIT_BYTES = 50 * 1024 * 1024; // 50 MB

export const MIN_SUNAT_TIMEOUT_MS = 1000; // 1s
export const MAX_SUNAT_TIMEOUT_MS = 120000; // 120s

export const MIN_OUTBOX_POLL_INTERVAL_MS = 1000; // 1s
export const MAX_OUTBOX_POLL_INTERVAL_MS = 60000; // 60s

export const MIN_OUTBOX_BATCH_SIZE = 1;
export const MAX_OUTBOX_BATCH_SIZE = 100;

export const KNOWN_WEAK_PATTERNS: readonly string[] = Object.freeze([
  'replace-with-',
  'facturify',
  'password',
  'secret',
  'changeme',
  '123456',
  'admin',
  'default',
]);

export const PLACEHOLDER_DB_PATTERNS: readonly string[] = Object.freeze([
  'replace-with-',
  'localhost',
  'example.com',
  'user:password',
  'postgres:postgres',
]);
