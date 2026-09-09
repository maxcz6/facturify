import { Injectable } from '@nestjs/common';
import {
  ALLOWED_NODE_ENVS,
  NodeEnv,
  MIN_PORT,
  MAX_PORT,
  MIN_SECRET_BYTES,
  EXACT_ENCRYPTION_KEY_BYTES,
  MIN_STORAGE_LIMIT_BYTES,
  MAX_STORAGE_LIMIT_BYTES,
  MIN_CERTIFICATE_LIMIT_BYTES,
  MAX_CERTIFICATE_LIMIT_BYTES,
  MIN_SUNAT_TIMEOUT_MS,
  MAX_SUNAT_TIMEOUT_MS,
  MIN_OUTBOX_POLL_INTERVAL_MS,
  MAX_OUTBOX_POLL_INTERVAL_MS,
  MIN_OUTBOX_BATCH_SIZE,
  MAX_OUTBOX_BATCH_SIZE,
  KNOWN_WEAK_PATTERNS,
  PLACEHOLDER_DB_PATTERNS,
} from './config-validation.constants';
import {
  ConfigValidationException,
  ValidatedApplicationConfig,
} from './config-validation.interface';
import {
  containsWeakPattern,
  hasPathTraversalOrNullBytes,
  isStrictBase64,
} from './config-validation.util';

@Injectable()
export class ApplicationConfigValidationService {
  /**
   * Pure method that validates an environment dictionary before application bootstrap.
   * Does NOT read process.env directly.
   * Never leaks raw values, DATABASE_URL, secrets, paths, or stack traces in error messages.
   * Returns a deeply frozen normalized configuration object.
   */
  validate(env: Record<string, unknown>): ValidatedApplicationConfig {
    if (!env || typeof env !== 'object') {
      throw new ConfigValidationException('ENVIRONMENT', 'El objeto de configuración es nulo o inválido.');
    }

    // 1. NODE_ENV: development, test, production
    const nodeEnvRaw = String(env.NODE_ENV ?? '').trim().toLowerCase();
    if (!ALLOWED_NODE_ENVS.includes(nodeEnvRaw as NodeEnv)) {
      throw new ConfigValidationException(
        'NODE_ENV',
        'Debe ser uno de los valores permitidos: development, test, production.'
      );
    }
    const nodeEnv = nodeEnvRaw as NodeEnv;
    const isProduction = nodeEnv === 'production';

    // 2. PORT: integer between 1 and 65535 (default 3000 if omitted)
    let port = 3000;
    if (env.PORT !== undefined && env.PORT !== null && String(env.PORT).trim() !== '') {
      const parsedPort = Number(env.PORT);
      if (!Number.isInteger(parsedPort) || parsedPort < MIN_PORT || parsedPort > MAX_PORT) {
        throw new ConfigValidationException(
          'PORT',
          `Debe ser un número entero válido entre ${MIN_PORT} y ${MAX_PORT}.`
        );
      }
      port = parsedPort;
    }

    // 3. DATABASE_URL: PostgreSQL protocol required
    const dbUrlRaw = env.DATABASE_URL;
    if (!dbUrlRaw || typeof dbUrlRaw !== 'string' || !dbUrlRaw.trim()) {
      throw new ConfigValidationException('DATABASE_URL', 'La URL de conexión a la base de datos es obligatoria.');
    }
    const dbUrl = dbUrlRaw.trim();
    if (!dbUrl.startsWith('postgresql://') && !dbUrl.startsWith('postgres://')) {
      throw new ConfigValidationException(
        'DATABASE_URL',
        'El protocolo debe ser obligatoriamente PostgreSQL (postgresql:// o postgres://).'
      );
    }
    if (isProduction && containsWeakPattern(dbUrl, PLACEHOLDER_DB_PATTERNS)) {
      throw new ConfigValidationException(
        'DATABASE_URL',
        'En entorno de producción no se permiten URLs con valores placeholder o hosts locales.'
      );
    }

    // 4. JWT_SECRET: min 32 bytes
    const jwtSecretRaw = env.JWT_SECRET;
    if (!jwtSecretRaw || typeof jwtSecretRaw !== 'string' || !jwtSecretRaw.trim()) {
      throw new ConfigValidationException('JWT_SECRET', 'El secreto JWT es obligatorio.');
    }
    const jwtSecret = jwtSecretRaw.trim();
    if (Buffer.byteLength(jwtSecret, 'utf8') < MIN_SECRET_BYTES) {
      throw new ConfigValidationException(
        'JWT_SECRET',
        `Debe tener una longitud mínima de ${MIN_SECRET_BYTES} bytes de entropía.`
      );
    }
    if (isProduction && containsWeakPattern(jwtSecret, KNOWN_WEAK_PATTERNS)) {
      throw new ConfigValidationException(
        'JWT_SECRET',
        'En producción no se permiten secretos predecibles o que contengan patrones débiles conocidos.'
      );
    }

    // 5. BOOTSTRAP_ADMIN_TOKEN: min 32 bytes, distinct from JWT_SECRET
    const bootstrapTokenRaw = env.BOOTSTRAP_ADMIN_TOKEN;
    if (!bootstrapTokenRaw || typeof bootstrapTokenRaw !== 'string' || !bootstrapTokenRaw.trim()) {
      throw new ConfigValidationException(
        'BOOTSTRAP_ADMIN_TOKEN',
        'El token de bootstrap de administración inicial es obligatorio.'
      );
    }
    const bootstrapToken = bootstrapTokenRaw.trim();
    if (Buffer.byteLength(bootstrapToken, 'utf8') < MIN_SECRET_BYTES) {
      throw new ConfigValidationException(
        'BOOTSTRAP_ADMIN_TOKEN',
        `Debe tener una longitud mínima de ${MIN_SECRET_BYTES} bytes de entropía.`
      );
    }
    if (bootstrapToken === jwtSecret) {
      throw new ConfigValidationException(
        'BOOTSTRAP_ADMIN_TOKEN',
        'Debe ser diferente del secreto JWT_SECRET para garantizar la separación de funciones.'
      );
    }
    if (isProduction && containsWeakPattern(bootstrapToken, KNOWN_WEAK_PATTERNS)) {
      throw new ConfigValidationException(
        'BOOTSTRAP_ADMIN_TOKEN',
        'En producción no se permiten tokens de bootstrap débiles o predecibles.'
      );
    }

    // 6. SECRETS_ENCRYPTION_KEY: strict Base64 that decodes to exactly 32 bytes
    const encKeyRaw = env.SECRETS_ENCRYPTION_KEY;
    if (!encKeyRaw || typeof encKeyRaw !== 'string' || !encKeyRaw.trim()) {
      throw new ConfigValidationException(
        'SECRETS_ENCRYPTION_KEY',
        'La clave de cifrado de secretos es obligatoria.'
      );
    }
    const encKey = encKeyRaw.trim();
    if (!isStrictBase64(encKey)) {
      throw new ConfigValidationException(
        'SECRETS_ENCRYPTION_KEY',
        'Debe ser una cadena Base64 estricta válida con longitud múltiplo de 4.'
      );
    }
    const encBuffer = Buffer.from(encKey, 'base64');
    if (encBuffer.byteLength !== EXACT_ENCRYPTION_KEY_BYTES) {
      throw new ConfigValidationException(
        'SECRETS_ENCRYPTION_KEY',
        `La clave Base64 debe decodificar exactamente ${EXACT_ENCRYPTION_KEY_BYTES} bytes (256 bits).`
      );
    }
    if (encKey === jwtSecret || encKey === bootstrapToken) {
      throw new ConfigValidationException(
        'SECRETS_ENCRYPTION_KEY',
        'La clave de cifrado debe ser distinta de las demás credenciales del sistema.'
      );
    }

    // 7. SWAGGER_ENABLED: true or false; in production must be false unless explicitly 'true'
    let swaggerEnabled = !isProduction; // default true in dev/test, false in prod
    if (env.SWAGGER_ENABLED !== undefined && env.SWAGGER_ENABLED !== null) {
      const swStr = String(env.SWAGGER_ENABLED).trim().toLowerCase();
      if (swStr !== 'true' && swStr !== 'false') {
        throw new ConfigValidationException(
          'SWAGGER_ENABLED',
          'Debe ser un valor booleano explícito: true o false.'
        );
      }
      swaggerEnabled = swStr === 'true';
    }

    // 8. Storage and Certificate Paths: non-empty, no null bytes, no traversal
    const docStoragePath = this.validatePath(
      env.DOCUMENT_STORAGE_PATH,
      'DOCUMENT_STORAGE_PATH',
      'storage/documents'
    );
    const certStoragePath = this.validatePath(
      env.CERTIFICATES_STORAGE_PATH || env.CERTIFICATE_STORAGE_PATH,
      'CERTIFICATES_STORAGE_PATH',
      'storage/certificates'
    );

    // 9. Storage Limits and Certificate Limits
    const storageMaxXml = this.validateIntegerRange(
      env.STORAGE_MAX_XML_BYTES,
      'STORAGE_MAX_XML_BYTES',
      5 * 1024 * 1024,
      MIN_STORAGE_LIMIT_BYTES,
      MAX_STORAGE_LIMIT_BYTES
    );
    const storageMaxZip = this.validateIntegerRange(
      env.STORAGE_MAX_ZIP_BYTES,
      'STORAGE_MAX_ZIP_BYTES',
      15 * 1024 * 1024,
      MIN_STORAGE_LIMIT_BYTES,
      MAX_STORAGE_LIMIT_BYTES
    );
    const storageMaxCdr = this.validateIntegerRange(
      env.STORAGE_MAX_CDR_BYTES,
      'STORAGE_MAX_CDR_BYTES',
      5 * 1024 * 1024,
      MIN_STORAGE_LIMIT_BYTES,
      MAX_STORAGE_LIMIT_BYTES
    );
    const certMaxSize = this.validateIntegerRange(
      env.CERTIFICATE_MAX_SIZE_BYTES,
      'CERTIFICATE_MAX_SIZE_BYTES',
      2 * 1024 * 1024,
      MIN_CERTIFICATE_LIMIT_BYTES,
      MAX_CERTIFICATE_LIMIT_BYTES
    );

    // 10. SUNAT and Outbox parameters
    const sunatTimeout = this.validateIntegerRange(
      env.SUNAT_TIMEOUT_MS,
      'SUNAT_TIMEOUT_MS',
      30000,
      MIN_SUNAT_TIMEOUT_MS,
      MAX_SUNAT_TIMEOUT_MS
    );
    const outboxPollInterval = this.validateIntegerRange(
      env.OUTBOX_POLL_INTERVAL_MS,
      'OUTBOX_POLL_INTERVAL_MS',
      5000,
      MIN_OUTBOX_POLL_INTERVAL_MS,
      MAX_OUTBOX_POLL_INTERVAL_MS
    );
    const outboxBatchSize = this.validateIntegerRange(
      env.OUTBOX_BATCH_SIZE,
      'OUTBOX_BATCH_SIZE',
      20,
      MIN_OUTBOX_BATCH_SIZE,
      MAX_OUTBOX_BATCH_SIZE
    );

    const validatedConfig: ValidatedApplicationConfig = {
      NODE_ENV: nodeEnv,
      PORT: port,
      DATABASE_URL: dbUrl,
      JWT_SECRET: jwtSecret,
      BOOTSTRAP_ADMIN_TOKEN: bootstrapToken,
      SECRETS_ENCRYPTION_KEY: encKey,
      SWAGGER_ENABLED: swaggerEnabled,
      DOCUMENT_STORAGE_PATH: docStoragePath,
      CERTIFICATES_STORAGE_PATH: certStoragePath,
      STORAGE_MAX_XML_BYTES: storageMaxXml,
      STORAGE_MAX_ZIP_BYTES: storageMaxZip,
      STORAGE_MAX_CDR_BYTES: storageMaxCdr,
      CERTIFICATE_MAX_SIZE_BYTES: certMaxSize,
      SUNAT_TIMEOUT_MS: sunatTimeout,
      OUTBOX_POLL_INTERVAL_MS: outboxPollInterval,
      OUTBOX_BATCH_SIZE: outboxBatchSize,
    };

    return Object.freeze(validatedConfig);
  }

  private validatePath(
    rawPath: unknown,
    variableName: string,
    defaultPath: string
  ): string {
    if (rawPath === undefined || rawPath === null || String(rawPath).trim() === '') {
      return defaultPath;
    }
    const str = String(rawPath).trim();
    if (hasPathTraversalOrNullBytes(str)) {
      throw new ConfigValidationException(
        variableName,
        'La ruta no debe contener bytes nulos ni secuencias de path traversal (.. o .).'
      );
    }
    return str;
  }

  private validateIntegerRange(
    rawValue: unknown,
    variableName: string,
    defaultValue: number,
    min: number,
    max: number
  ): number {
    if (rawValue === undefined || rawValue === null || String(rawValue).trim() === '') {
      return defaultValue;
    }
    const num = Number(rawValue);
    if (!Number.isInteger(num) || num < min || num > max) {
      throw new ConfigValidationException(
        variableName,
        `Debe ser un número entero entre ${min} y ${max}.`
      );
    }
    return num;
  }
}
