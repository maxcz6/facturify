import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ServiceUnavailableException } from '@nestjs/common';
const request = require('supertest');
import { HealthModule } from '../src/health/health.module';
import { HealthService } from '../src/health/health.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { PROHIBITED_HEALTH_FIELDS } from '../src/health/health.constants';

describe('Health Endpoints (/health/live y /health/ready)', () => {
  let app: INestApplication;
  let healthService: HealthService;

  const mockPrismaService = {
    "$queryRaw": jest.fn(),
  };

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [HealthModule],
    })
      .overrideProvider(PrismaService)
      .useValue(mockPrismaService)
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();

    healthService = moduleRef.get<HealthService>(HealthService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /health/live (Liveness probe)', () => {
    it('debe responder HTTP 200 con status: ok y timestamp sin requerir JWT ni API Key', async () => {
      const res = await request(app.getHttpServer())
        .get('/health/live')
        .expect(200);

      expect(res.body).toHaveProperty('status', 'ok');
      expect(res.body).toHaveProperty('timestamp');
      expect(new Date(res.body.timestamp).toISOString()).toBe(res.body.timestamp);

      // No debe consultar Prisma ni dependencias externas
      expect(mockPrismaService["$queryRaw"]).not.toHaveBeenCalled();
    });

    it('la respuesta solo debe incluir exclusivamente status y timestamp', async () => {
      const res = await request(app.getHttpServer())
        .get('/health/live')
        .expect(200);

      const keys = Object.keys(res.body);
      expect(keys.sort()).toEqual(['status', 'timestamp'].sort());
    });

    it('getLiveness() debe poder ejecutarse puramente sin NestJS ni Prisma', () => {
      const pureService = new HealthService();
      const result = pureService.getLiveness();
      expect(result.status).toBe('ok');
      expect(typeof result.timestamp).toBe('string');
      expect(Object.isFrozen(result)).toBe(true);
    });
  });

  describe('GET /health/ready (Readiness probe)', () => {
    it('debe responder HTTP 200 con status: ok y timestamp cuando PostgreSQL está disponible', async () => {
      mockPrismaService["$queryRaw"].mockResolvedValueOnce([{ '?column?': 1 }]);

      const res = await request(app.getHttpServer())
        .get('/health/ready')
        .expect(200);

      expect(res.body).toEqual({
        status: 'ok',
        timestamp: expect.any(String),
      });

      expect(mockPrismaService["$queryRaw"]).toHaveBeenCalledTimes(1);
    });

    it('debe responder HTTP 503 cuando Prisma falla (PostgreSQL no disponible)', async () => {
      // Simula fallo interno de conexión con información sensible de base de datos
      const dbError = new Error('Connection lost to postgres://postgres:super_secret_pw@db.internal:5432/facturify_db');
      (dbError as any).code = 'ECONNREFUSED';
      (dbError as any).hostname = 'db.internal';
      (dbError as any).port = 5432;
      mockPrismaService["$queryRaw"].mockRejectedValueOnce(dbError);

      const res = await request(app.getHttpServer())
        .get('/health/ready')
        .expect(503);

      expect(res.body).toHaveProperty('status', 'unavailable');
      expect(res.body).toHaveProperty('timestamp');

      // Nunca debe exponer host, puerto, db, credenciales ni stack traces
      const bodyStr = JSON.stringify(res.body);
      expect(bodyStr).not.toContain('super_secret_pw');
      expect(bodyStr).not.toContain('db.internal');
      expect(bodyStr).not.toContain('5432');
      expect(bodyStr).not.toContain('facturify_db');
      expect(bodyStr).not.toContain('ECONNREFUSED');
      expect(bodyStr).not.toContain('Connection lost');
    });

    it('debe responder HTTP 503 ante timeout interno de conexión', async () => {
      // Simula consulta que no resuelve antes del timeout sin dejar temporizadores abiertos
      const hangingPromise = new Promise(() => {});
      mockPrismaService["$queryRaw"].mockReturnValueOnce(hangingPromise);

      // Usamos getReadiness directamente con timeout corto de 20ms para la prueba unitaria rápida
      await expect(healthService.getReadiness(20)).rejects.toThrow(ServiceUnavailableException);

      try {
        await healthService.getReadiness(20);
      } catch (err: any) {
        expect(err).toBeInstanceOf(ServiceUnavailableException);
        expect(err.getStatus()).toBe(503);
        const response = err.getResponse();
        expect(response).toEqual({
          status: 'unavailable',
          timestamp: expect.any(String),
        });
      }
    });

    it('debe responder HTTP 503 si PrismaService no fue inyectado', async () => {
      const pureService = new HealthService(undefined);
      await expect(pureService.getReadiness()).rejects.toThrow(ServiceUnavailableException);
    });
  });

  describe('Ausencia Estricta de Información Sensible', () => {
    it('las respuestas de readiness (éxito y fallo) no deben contener campos sensibles', async () => {
      // Caso 1: Éxito
      mockPrismaService["$queryRaw"].mockResolvedValueOnce([1]);
      const successRes = await request(app.getHttpServer()).get('/health/ready').expect(200);

      for (const field of PROHIBITED_HEALTH_FIELDS) {
        expect(successRes.body[field]).toBeUndefined();
      }

      // Caso 2: Fallo con error contaminado
      mockPrismaService["$queryRaw"].mockRejectedValueOnce(new Error('Fatal DB failure stack trace'));
      const failureRes = await request(app.getHttpServer()).get('/health/ready').expect(503);

      for (const field of PROHIBITED_HEALTH_FIELDS) {
        expect(failureRes.body[field]).toBeUndefined();
      }
    });

    it('el endpoint /health legacy también debe responder 200 sin autenticación', async () => {
      const res = await request(app.getHttpServer())
        .get('/health')
        .expect(200);

      expect(res.body).toHaveProperty('status', 'ok');
      expect(res.body).toHaveProperty('timestamp');
    });
  });
});
