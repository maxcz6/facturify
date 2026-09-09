import { TestingModule, Test } from '@nestjs/testing';

describe('AppModule dependency graph', () => {
  let moduleRef: TestingModule | undefined;
  const originalEnvironment = { ...process.env };

  beforeAll(async () => {
    Object.assign(process.env, {
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://facturify:test-only@localhost:5432/facturify',
      JWT_SECRET: 'test-only-jwt-secret-with-more-than-32-bytes',
      BOOTSTRAP_ADMIN_TOKEN: 'test-only-bootstrap-token-with-more-than-32-bytes',
      SECRETS_ENCRYPTION_KEY: Buffer.alloc(32, 9).toString('base64'),
      DOCUMENT_STORAGE_PATH: 'storage/documents',
      CERTIFICATES_STORAGE_PATH: 'storage/certificates',
      SWAGGER_ENABLED: 'false',
    });
    const { AppModule } = await import('../src/app.module');
    moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  });

  afterAll(async () => {
    await moduleRef?.close();
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnvironment)) delete process.env[key];
    }
    Object.assign(process.env, originalEnvironment);
  });

  it('resolves the complete Nest dependency graph without starting the application', () => {
    expect(moduleRef).toBeDefined();
  });
});
