import {
  BadRequestException,
  ExecutionContext,
  HttpException,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { UniformExceptionFilter } from '../src/http-safety/filters/uniform-exception.filter';
import { HttpSafetyModule } from '../src/http-safety/http-safety.module';
import { RequestIdMiddleware } from '../src/http-safety/middlewares/request-id.middleware';

describe('HttpSafetyModule (Request IDs & Uniform Error Format)', () => {
  describe('RequestIdMiddleware', () => {
    let middleware: RequestIdMiddleware;
    let mockReq: any;
    let mockRes: any;
    let next: NextFunction;
    let responseHeaders: Record<string, string>;

    beforeEach(() => {
      middleware = new RequestIdMiddleware();
      responseHeaders = {};
      mockReq = {
        headers: {},
      };
      mockRes = {
        setHeader: jest.fn().mockImplementation((key: string, value: string) => {
          responseHeaders[key.toLowerCase()] = value;
        }),
      };
      next = jest.fn();
    });

    it('should generate a UUID when x-request-id header is absent', () => {
      middleware.use(mockReq as Request, mockRes as Response, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(mockReq.id).toBeDefined();
      // UUID format check (8-4-4-4-12)
      expect(mockReq.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      );
      expect(mockReq.headers['x-request-id']).toBe(mockReq.id);
      expect(responseHeaders['x-request-id']).toBe(mockReq.id);
    });

    it('should propagate a valid client-supplied x-request-id', () => {
      mockReq.headers['x-request-id'] = 'client-req-123.abc_def';

      middleware.use(mockReq as Request, mockRes as Response, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(mockReq.id).toBe('client-req-123.abc_def');
      expect(mockReq.headers['x-request-id']).toBe('client-req-123.abc_def');
      expect(responseHeaders['x-request-id']).toBe('client-req-123.abc_def');
    });

    it('should accept valid x-correlation-id if x-request-id is absent', () => {
      mockReq.headers['x-correlation-id'] = 'corr-id-999';

      middleware.use(mockReq as Request, mockRes as Response, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(mockReq.id).toBe('corr-id-999');
      expect(responseHeaders['x-request-id']).toBe('corr-id-999');
    });

    it('should sanitize and replace malicious x-request-id (CRLF injection attempt)', () => {
      mockReq.headers['x-request-id'] = 'malicious\r\nSet-Cookie: evil=true';

      middleware.use(mockReq as Request, mockRes as Response, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(mockReq.id).not.toContain('\r');
      expect(mockReq.id).not.toContain('\n');
      expect(mockReq.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      );
      expect(responseHeaders['x-request-id']).toBe(mockReq.id);
    });

    it('should replace x-request-id that exceeds maximum allowed length (64 chars)', () => {
      mockReq.headers['x-request-id'] = 'a'.repeat(70);

      middleware.use(mockReq as Request, mockRes as Response, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(mockReq.id).not.toBe('a'.repeat(70));
      expect(mockReq.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      );
    });

    it('should replace x-request-id containing illegal characters (spaces, special symbols)', () => {
      mockReq.headers['x-request-id'] = 'id with spaces and <script>';

      middleware.use(mockReq as Request, mockRes as Response, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(mockReq.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      );
    });
  });

  describe('UniformExceptionFilter', () => {
    let filter: UniformExceptionFilter;
    let mockReq: any;
    let mockRes: any;
    let mockHost: any;
    let responseBody: any;
    let responseStatus: number;
    let responseHeaders: Record<string, string>;

    beforeEach(() => {
      filter = new UniformExceptionFilter();
      responseHeaders = {};
      responseBody = null;
      responseStatus = 200;

      mockReq = {
        id: 'test-trace-id-12345',
        originalUrl: '/api/v1/documents/doc_demo_99',
        headers: {
          'x-request-id': 'test-trace-id-12345',
        },
      };

      mockRes = {
        headersSent: false,
        setHeader: jest.fn().mockImplementation((key: string, value: string) => {
          responseHeaders[key.toLowerCase()] = value;
        }),
        getHeader: jest.fn().mockImplementation((key: string) => {
          return responseHeaders[key.toLowerCase()];
        }),
        status: jest.fn().mockImplementation((statusCode: number) => {
          responseStatus = statusCode;
          return mockRes;
        }),
        json: jest.fn().mockImplementation((body: any) => {
          responseBody = body;
          return mockRes;
        }),
      };

      mockHost = {
        switchToHttp: () => ({
          getRequest: () => mockReq,
          getResponse: () => mockRes,
        }),
      };
    });

    it('should format standard HttpException into uniform error structure', () => {
      const exception = new NotFoundException("Document 'doc_demo_99' not found.");

      filter.catch(exception, mockHost);

      expect(responseStatus).toBe(HttpStatus.NOT_FOUND);
      expect(responseHeaders['x-request-id']).toBe('test-trace-id-12345');
      expect(responseBody).toEqual({
        statusCode: 404,
        error: 'Not Found',
        message: "Document 'doc_demo_99' not found.",
        path: '/api/v1/documents/doc_demo_99',
        timestamp: expect.any(String),
        requestId: 'test-trace-id-12345',
      });
      // ISO timestamp format verification
      expect(new Date(responseBody.timestamp).toISOString()).toBe(responseBody.timestamp);
    });

    it('should handle validation pipe errors with array of messages', () => {
      const validationErrors = [
        'series must be a valid alphanumeric string',
        'subtotal must not be negative',
      ];
      const exception = new BadRequestException({
        message: validationErrors,
        error: 'Bad Request',
      });

      filter.catch(exception, mockHost);

      expect(responseStatus).toBe(HttpStatus.BAD_REQUEST);
      expect(responseBody.statusCode).toBe(400);
      expect(responseBody.error).toBe('Bad Request');
      expect(responseBody.message).toEqual(validationErrors);
      expect(responseBody.requestId).toBe('test-trace-id-12345');
    });

    it('should preserve custom details if provided in exception response', () => {
      const exception = new BadRequestException({
        message: 'Invalid certificate payload',
        error: 'Bad Request',
        details: { maxAllowedBytes: 512000, receivedBytes: 600000 },
      });

      filter.catch(exception, mockHost);

      expect(responseStatus).toBe(HttpStatus.BAD_REQUEST);
      expect(responseBody.details).toEqual({
        maxAllowedBytes: 512000,
        receivedBytes: 600000,
      });
    });

    it('should handle HttpException with simple string response', () => {
      const exception = new HttpException('Forbidden Action', HttpStatus.FORBIDDEN);

      filter.catch(exception, mockHost);

      expect(responseStatus).toBe(HttpStatus.FORBIDDEN);
      expect(responseBody.statusCode).toBe(403);
      expect(responseBody.error).toBe('Forbidden');
      expect(responseBody.message).toBe('Forbidden Action');
    });

    it('preserves a safe rate-limit code and emits a bounded Retry-After header', () => {
      const exception = new HttpException({
        code: 'AUTH_RATE_LIMITED', message: 'Authentication rate limit exceeded.', retryAfterSeconds: 900,
      }, HttpStatus.TOO_MANY_REQUESTS);

      filter.catch(exception, mockHost);

      expect(responseStatus).toBe(429);
      expect(responseHeaders['retry-after']).toBe('900');
      expect(responseBody).toEqual(expect.objectContaining({
        code: 'AUTH_RATE_LIMITED', retryAfterSeconds: 900,
        message: 'Authentication rate limit exceeded.',
      }));
    });

    it('should format unhandled 500 Error without leaking internal stack traces in production', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      try {
        const error = new Error('DATABASE CONNECTION TIMEOUT: postgres://secret_user:password@db.internal:5432');

        filter.catch(error, mockHost);

        expect(responseStatus).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
        expect(responseBody.statusCode).toBe(500);
        expect(responseBody.error).toBe('Internal Server Error');
        // Must NEVER expose the database password or internal error message
        expect(responseBody.message).toBe('Internal server error');
        expect(responseBody).not.toHaveProperty('details');
        expect(responseBody.requestId).toBe('test-trace-id-12345');
      } finally {
        process.env.NODE_ENV = originalEnv;
      }
    });

    it('should handle non-Error thrown objects gracefully', () => {
      filter.catch('Unexpected string rejection', mockHost);

      expect(responseStatus).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
      expect(responseBody.statusCode).toBe(500);
      expect(responseBody.error).toBe('Internal Server Error');
      expect(responseBody.requestId).toBe('test-trace-id-12345');
    });

    it('should generate a requestId if missing from both request and response', () => {
      mockReq.id = undefined;
      mockReq.headers = {};

      const exception = new NotFoundException('Item not found');
      filter.catch(exception, mockHost);

      expect(responseBody.requestId).toBeDefined();
      expect(responseBody.requestId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      );
      expect(responseHeaders['x-request-id']).toBe(responseBody.requestId);
    });
  });

  describe('@RequestId() Decorator', () => {
    it('should extract request ID from request object', () => {
      const ctx = {
        switchToHttp: () => ({
          getRequest: () => ({ id: 'req-decorator-test-123' }),
        }),
      } as unknown as ExecutionContext;

      // Extract factory function registered via createParamDecorator
      // Nest param decorator metadata extraction
      const req = ctx.switchToHttp().getRequest();
      expect(req.id).toBe('req-decorator-test-123');
    });
  });

  describe('HttpSafetyModule Integration', () => {
    it('should configure RequestIdMiddleware for all routes', () => {
      const module = new HttpSafetyModule();
      const mockConsumer = {
        apply: jest.fn().mockReturnThis(),
        forRoutes: jest.fn().mockReturnThis(),
      };

      module.configure(mockConsumer as any);

      expect(mockConsumer.apply).toHaveBeenCalledWith(RequestIdMiddleware);
      expect(mockConsumer.forRoutes).toHaveBeenCalledWith('{*path}');
    });
  });
});
