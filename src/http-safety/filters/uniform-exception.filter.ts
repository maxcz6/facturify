import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import * as crypto from 'node:crypto';
import { UniformErrorResponse } from '../interfaces/http-safety.interface';

const HTTP_STATUS_NAMES: Record<number, string> = {
  [HttpStatus.BAD_REQUEST]: 'Bad Request',
  [HttpStatus.UNAUTHORIZED]: 'Unauthorized',
  [HttpStatus.FORBIDDEN]: 'Forbidden',
  [HttpStatus.NOT_FOUND]: 'Not Found',
  [HttpStatus.METHOD_NOT_ALLOWED]: 'Method Not Allowed',
  [HttpStatus.CONFLICT]: 'Conflict',
  [HttpStatus.UNPROCESSABLE_ENTITY]: 'Unprocessable Entity',
  [HttpStatus.TOO_MANY_REQUESTS]: 'Too Many Requests',
  [HttpStatus.INTERNAL_SERVER_ERROR]: 'Internal Server Error',
  [HttpStatus.BAD_GATEWAY]: 'Bad Gateway',
  [HttpStatus.SERVICE_UNAVAILABLE]: 'Service Unavailable',
  [HttpStatus.GATEWAY_TIMEOUT]: 'Gateway Timeout',
};

@Catch()
export class UniformExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(UniformExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request & { id?: string }>();

    // 1. Resolve or generate correlation request ID
    const candidateRequestId = request?.id || request?.headers?.['x-request-id'] ||
      (response?.getHeader && response.getHeader('X-Request-Id'));
    const requestId = typeof candidateRequestId === 'string' && /^[a-zA-Z0-9._-]{1,64}$/.test(candidateRequestId)
      ? candidateRequestId
      : crypto.randomUUID();

    if (response?.setHeader && !response.headersSent) {
      response.setHeader('X-Request-Id', requestId);
    }

    // 2. Determine HTTP Status Code
    let statusCode: number;
    let error: string;
    let message: string | string[];
    let details: unknown;
    let publicCode: string | undefined;
    let retryAfterSeconds: number | undefined;

    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
        error = HTTP_STATUS_NAMES[statusCode] || 'Http Exception';
      } else if (
        typeof exceptionResponse === 'object' &&
        exceptionResponse !== null
      ) {
        const body = exceptionResponse as Record<string, any>;
        message = body.message || exception.message;
        error = body.error || HTTP_STATUS_NAMES[statusCode] || 'Http Exception';
        if (body.details !== undefined) {
          details = body.details;
        }
        if (typeof body.code === 'string' && /^[A-Z][A-Z0-9_]{1,63}$/.test(body.code)) {
          publicCode = body.code;
        }
        if (statusCode === HttpStatus.TOO_MANY_REQUESTS && Number.isInteger(body.retryAfterSeconds)) {
          retryAfterSeconds = Math.max(1, Math.min(3600, body.retryAfterSeconds));
          if (!response.headersSent) response.setHeader('Retry-After', String(retryAfterSeconds));
        }
      } else {
        message = exception.message;
        error = HTTP_STATUS_NAMES[statusCode] || 'Http Exception';
      }
    } else {
      // Unhandled / Internal 500 error
      statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
      error = 'Internal Server Error';
      message = 'Internal server error';

      if (exception instanceof Error) {
        this.logger.error(`[${requestId}] Unhandled exception (${exception.name || 'Error'}).`);
      } else {
        this.logger.error(`[${requestId}] Unknown non-Error exception.`);
      }
    }

    // 3. Construct uniform error payload
    const path = request?.originalUrl || request?.url || '/';
    const timestamp = new Date().toISOString();

    const payload: UniformErrorResponse = {
      statusCode,
      error,
      message,
      ...(details !== undefined ? { details } : {}),
      ...(publicCode !== undefined ? { code: publicCode } : {}),
      ...(retryAfterSeconds !== undefined ? { retryAfterSeconds } : {}),
      path,
      timestamp,
      requestId,
    };

    response.status(statusCode).json(payload);
  }
}
