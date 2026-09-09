import { Test, TestingModule } from '@nestjs/testing';
import {
  ApplicationConfigValidationService,
  ConfigValidationModule,
  ConfigValidationException,
} from '../src/config-validation';

describe('ApplicationConfigValidationService', () => {
  let service: ApplicationConfigValidationService;

  // 32-byte valid Base64 string (AES-256 key)
  const validBase64Key = Buffer.alloc(32, 0xa5).toString('base64');
  // High-entropy 32-byte secret strings (free of weak pattern words like 'secret', 'password', 'facturify')
  const validJwtSecret = '9f83ab29c04d5e81f7263b1409284756102938475610293847561029384756a1';
  const validBootstrapToken = '18273645e9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d3e2f1a0b9c8d7e6f5a4b3c2';

  const validProductionEnv = {
    NODE_ENV: 'production',
    PORT: '3000',
    DATABASE_URL: 'postgresql://facturify_user:secure_prod_pw_987@db.internal:5432/facturify_db',
    JWT_SECRET: validJwtSecret,
    BOOTSTRAP_ADMIN_TOKEN: validBootstrapToken,
    SECRETS_ENCRYPTION_KEY: validBase64Key,
    SWAGGER_ENABLED: 'false',
    DOCUMENT_STORAGE_PATH: 'storage/documents',
    CERTIFICATES_STORAGE_PATH: 'storage/certificates',
    STORAGE_MAX_XML_BYTES: '5242880',
    STORAGE_MAX_ZIP_BYTES: '15728640',
    STORAGE_MAX_CDR_BYTES: '5242880',
    CERTIFICATE_MAX_SIZE_BYTES: '2097152',
    SUNAT_TIMEOUT_MS: '30000',
    OUTBOX_POLL_INTERVAL_MS: '5000',
    OUTBOX_BATCH_SIZE: '20',
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [ConfigValidationModule],
    }).compile();

    service = module.get<ApplicationConfigValidationService>(
      ApplicationConfigValidationService
    );
  });

  describe('Instanciación Pura y Módulo', () => {
    it('debe poder instanciarse directamente sin contenedor NestJS', () => {
      const pure = new ApplicationConfigValidationService();
      expect(pure).toBeInstanceOf(ApplicationConfigValidationService);
    });

    it('debe estar provisto por ConfigValidationModule', () => {
      expect(service).toBeDefined();
    });
  });

  describe('Validación Exitosa y Normalización Inmutable', () => {
    it('debe validar y normalizar configuración válida de producción', () => {
      const config = service.validate(validProductionEnv);

      expect(config.NODE_ENV).toBe('production');
      expect(config.PORT).toBe(3000);
      expect(config.SWAGGER_ENABLED).toBe(false);
      expect(config.STORAGE_MAX_XML_BYTES).toBe(5242880);
      expect(config.SUNAT_TIMEOUT_MS).toBe(30000);
      expect(Object.isFrozen(config)).toBe(true);
    });

    it('debe asignar valores predeterminados seguros para desarrollo/test', () => {
      const devEnv = {
        NODE_ENV: 'development',
        DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/facturify',
        JWT_SECRET: validJwtSecret,
        BOOTSTRAP_ADMIN_TOKEN: validBootstrapToken,
        SECRETS_ENCRYPTION_KEY: validBase64Key,
      };

      const config = service.validate(devEnv);
      expect(config.NODE_ENV).toBe('development');
      expect(config.PORT).toBe(3000);
      expect(config.SWAGGER_ENABLED).toBe(true); // default true in dev
      expect(config.DOCUMENT_STORAGE_PATH).toBe('storage/documents');
      expect(config.CERTIFICATES_STORAGE_PATH).toBe('storage/certificates');
    });
  });

  describe('Validación de NODE_ENV', () => {
    it('debe aceptar únicamente development, test o production', () => {
      expect(service.validate({ ...validProductionEnv, NODE_ENV: 'development' }).NODE_ENV).toBe('development');
      expect(service.validate({ ...validProductionEnv, NODE_ENV: 'test' }).NODE_ENV).toBe('test');
      expect(service.validate({ ...validProductionEnv, NODE_ENV: 'production' }).NODE_ENV).toBe('production');
    });

    it('debe rechazar entornos no permitidos o vacíos', () => {
      expect(() => service.validate({ ...validProductionEnv, NODE_ENV: 'staging' })).toThrow(ConfigValidationException);
      expect(() => service.validate({ ...validProductionEnv, NODE_ENV: '' })).toThrow(ConfigValidationException);
    });
  });

  describe('Validación de PORT', () => {
    it('debe aceptar puertos válidos entre 1 y 65535', () => {
      expect(service.validate({ ...validProductionEnv, PORT: '8080' }).PORT).toBe(8080);
      expect(service.validate({ ...validProductionEnv, PORT: 1 }).PORT).toBe(1);
      expect(service.validate({ ...validProductionEnv, PORT: 65535 }).PORT).toBe(65535);
    });

    it('debe rechazar puertos fuera de rango o decimales', () => {
      expect(() => service.validate({ ...validProductionEnv, PORT: '0' })).toThrow(ConfigValidationException);
      expect(() => service.validate({ ...validProductionEnv, PORT: '65536' })).toThrow(ConfigValidationException);
      expect(() => service.validate({ ...validProductionEnv, PORT: '3000.5' })).toThrow(ConfigValidationException);
      expect(() => service.validate({ ...validProductionEnv, PORT: 'invalid' })).toThrow(ConfigValidationException);
    });
  });

  describe('Validación de DATABASE_URL', () => {
    it('debe requerir protocolo postgresql:// o postgres://', () => {
      expect(() =>
        service.validate({ ...validProductionEnv, DATABASE_URL: 'mysql://root:pw@localhost/db' })
      ).toThrow(ConfigValidationException);

      expect(() =>
        service.validate({ ...validProductionEnv, DATABASE_URL: 'sqlite://file.db' })
      ).toThrow(ConfigValidationException);
    });

    it('en producción debe rechazar placeholders o hosts locales', () => {
      expect(() =>
        service.validate({
          ...validProductionEnv,
          DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/facturify',
        })
      ).toThrow(ConfigValidationException);

      expect(() =>
        service.validate({
          ...validProductionEnv,
          DATABASE_URL: 'postgresql://user:password@replace-with-host:5432/db',
        })
      ).toThrow(ConfigValidationException);
    });
  });

  describe('Validación de Secretos (JWT_SECRET, BOOTSTRAP_ADMIN_TOKEN, SECRETS_ENCRYPTION_KEY)', () => {
    it('debe exigir mínimo 32 bytes para JWT_SECRET', () => {
      expect(() =>
        service.validate({ ...validProductionEnv, JWT_SECRET: 'too-short-secret' })
      ).toThrow(ConfigValidationException);
    });

    it('debe exigir mínimo 32 bytes para BOOTSTRAP_ADMIN_TOKEN', () => {
      expect(() =>
        service.validate({ ...validProductionEnv, BOOTSTRAP_ADMIN_TOKEN: 'short-token' })
      ).toThrow(ConfigValidationException);
    });

    it('debe exigir que JWT_SECRET y BOOTSTRAP_ADMIN_TOKEN sean diferentes', () => {
      expect(() =>
        service.validate({
          ...validProductionEnv,
          JWT_SECRET: validJwtSecret,
          BOOTSTRAP_ADMIN_TOKEN: validJwtSecret,
        })
      ).toThrow(ConfigValidationException);
    });

    it('debe exigir Base64 estricto de exactamente 32 bytes para SECRETS_ENCRYPTION_KEY', () => {
      // 16 bytes Base64 (muy corta)
      const short16Key = Buffer.alloc(16).toString('base64');
      expect(() =>
        service.validate({ ...validProductionEnv, SECRETS_ENCRYPTION_KEY: short16Key })
      ).toThrow(ConfigValidationException);

      // Base64 corrupto / no canónico
      expect(() =>
        service.validate({ ...validProductionEnv, SECRETS_ENCRYPTION_KEY: 'not-a-valid-base64!' })
      ).toThrow(ConfigValidationException);
    });

    it('en producción debe rechazar secretos débiles con patrones conocidos', () => {
      expect(() =>
        service.validate({
          ...validProductionEnv,
          JWT_SECRET: 'replace-with-this-very-long-secret-key-that-is-over-32-bytes-long',
        })
      ).toThrow(ConfigValidationException);

      expect(() =>
        service.validate({
          ...validProductionEnv,
          BOOTSTRAP_ADMIN_TOKEN: 'facturify_bootstrap_secret_token_that_is_over_32_bytes_long',
        })
      ).toThrow(ConfigValidationException);
    });
  });

  describe('Validación de SWAGGER_ENABLED', () => {
    it('debe aceptar valores booleanos explícitos (true o false)', () => {
      expect(service.validate({ ...validProductionEnv, SWAGGER_ENABLED: 'true' }).SWAGGER_ENABLED).toBe(true);
      expect(service.validate({ ...validProductionEnv, SWAGGER_ENABLED: 'false' }).SWAGGER_ENABLED).toBe(false);
    });

    it('debe rechazar valores no booleanos', () => {
      expect(() =>
        service.validate({ ...validProductionEnv, SWAGGER_ENABLED: 'yes' })
      ).toThrow(ConfigValidationException);
    });
  });

  describe('Validación de Rutas de Almacenamiento (Path Traversal y Null Bytes)', () => {
    it('debe rechazar rutas con .. (path traversal)', () => {
      expect(() =>
        service.validate({ ...validProductionEnv, DOCUMENT_STORAGE_PATH: '../etc/passwd' })
      ).toThrow(ConfigValidationException);

      expect(() =>
        service.validate({ ...validProductionEnv, CERTIFICATES_STORAGE_PATH: 'storage/../../secrets' })
      ).toThrow(ConfigValidationException);
    });

    it('debe rechazar rutas con bytes nulos', () => {
      expect(() =>
        service.validate({ ...validProductionEnv, DOCUMENT_STORAGE_PATH: 'storage/docs\0malicious' })
      ).toThrow(ConfigValidationException);
    });
  });

  describe('Validación de Límites Numéricos (Storage, Certificados, Outbox, SUNAT)', () => {
    it('debe rechazar límites fuera de los rangos soportados', () => {
      // SUNAT_TIMEOUT_MS fuera de rango
      expect(() =>
        service.validate({ ...validProductionEnv, SUNAT_TIMEOUT_MS: '500' }) // < 1000
      ).toThrow(ConfigValidationException);

      expect(() =>
        service.validate({ ...validProductionEnv, SUNAT_TIMEOUT_MS: '150000' }) // > 120000
      ).toThrow(ConfigValidationException);

      // OUTBOX_BATCH_SIZE fuera de rango
      expect(() =>
        service.validate({ ...validProductionEnv, OUTBOX_BATCH_SIZE: '0' })
      ).toThrow(ConfigValidationException);

      expect(() =>
        service.validate({ ...validProductionEnv, OUTBOX_BATCH_SIZE: '150' }) // > 100
      ).toThrow(ConfigValidationException);
    });
  });

  describe('Sanitización Estricta de Errores (Nunca revelar secretos ni URLs)', () => {
    it('los errores solo deben indicar variableName y publicReason sin filtrar el valor recibido', () => {
      const sensitivePassword = 'my-secret-password-which-is-too-short';
      try {
        service.validate({ ...validProductionEnv, JWT_SECRET: sensitivePassword });
        fail('Debería haber lanzado ConfigValidationException');
      } catch (err: any) {
        expect(err).toBeInstanceOf(ConfigValidationException);
        expect(err.variableName).toBe('JWT_SECRET');
        expect(err.message).not.toContain(sensitivePassword);
        expect(err.publicReason).toBeDefined();
      }
    });

    it('los errores de DATABASE_URL nunca deben exponer la URL ni las credenciales', () => {
      const sensitiveDbUrl = 'postgresql://admin:super_secret_db_pass@db.prod.internal:5432/facturify_db';
      try {
        service.validate({
          ...validProductionEnv,
          DATABASE_URL: sensitiveDbUrl.replace('postgresql://', 'mysql://'),
        });
        fail('Debería haber lanzado ConfigValidationException');
      } catch (err: any) {
        expect(err).toBeInstanceOf(ConfigValidationException);
        expect(err.variableName).toBe('DATABASE_URL');
        expect(err.message).not.toContain('super_secret_db_pass');
        expect(err.message).not.toContain('db.prod.internal');
      }
    });
  });
});
