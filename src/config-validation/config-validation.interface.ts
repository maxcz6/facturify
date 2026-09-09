import { NodeEnv } from './config-validation.constants';

/**
 * Normalized and validated application configuration
 */
export interface ValidatedApplicationConfig {
  readonly NODE_ENV: NodeEnv;
  readonly PORT: number;
  readonly DATABASE_URL: string;
  readonly JWT_SECRET: string;
  readonly BOOTSTRAP_ADMIN_TOKEN: string;
  readonly SECRETS_ENCRYPTION_KEY: string;
  readonly SWAGGER_ENABLED: boolean;
  readonly DOCUMENT_STORAGE_PATH: string;
  readonly CERTIFICATES_STORAGE_PATH: string;
  readonly STORAGE_MAX_XML_BYTES: number;
  readonly STORAGE_MAX_ZIP_BYTES: number;
  readonly STORAGE_MAX_CDR_BYTES: number;
  readonly CERTIFICATE_MAX_SIZE_BYTES: number;
  readonly SUNAT_TIMEOUT_MS: number;
  readonly OUTBOX_POLL_INTERVAL_MS: number;
  readonly OUTBOX_BATCH_SIZE: number;
}

/**
 * Strict public exception thrown on configuration failure.
 * Never leaks the received value, DATABASE_URL, secrets, full paths or stack traces.
 */
export class ConfigValidationException extends Error {
  public readonly variableName: string;
  public readonly publicReason: string;

  constructor(variableName: string, publicReason: string) {
    super(`Error de configuración en '${variableName}': ${publicReason}`);
    this.name = 'ConfigValidationException';
    this.variableName = variableName;
    this.publicReason = publicReason;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
