import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import * as crypto from 'node:crypto';

// Safe alphanumeric, dash, dot, and underscore up to 64 chars
const VALID_REQUEST_ID_REGEX = /^[a-zA-Z0-9._-]{1,64}$/;

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const incomingId =
      req.headers['x-request-id'] || req.headers['x-correlation-id'];

    let requestId: string;

    if (
      typeof incomingId === 'string' &&
      VALID_REQUEST_ID_REGEX.test(incomingId.trim())
    ) {
      requestId = incomingId.trim();
    } else {
      requestId = crypto.randomUUID();
    }

    // Attach request ID to request object and headers
    (req as any).id = requestId;
    req.headers['x-request-id'] = requestId;

    // Set header on outgoing HTTP response
    res.setHeader('X-Request-Id', requestId);

    next();
  }
}
