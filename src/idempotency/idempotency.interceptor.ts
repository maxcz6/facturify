import { BadRequestException, CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Request, Response } from 'express';
import { Observable, catchError, from, mergeMap, of, throwError } from 'rxjs';
import { IdempotencyPersistenceService } from './idempotency-persistence.service';
import { IdempotencyService } from './idempotency.service';

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(private readonly fingerprints: IdempotencyService, private readonly records: IdempotencyPersistenceService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request & { companyId?: string }>();
    const response = context.switchToHttp().getResponse<Response>();
    const companyId = request.companyId;
    if (!companyId) throw new BadRequestException('Authenticated company is required for idempotency.');
    const key = this.fingerprints.assertValidIdempotencyKey(request.headers['idempotency-key']);
    const fingerprint = this.fingerprints.generateFingerprint({
      method: request.method, path: request.originalUrl || request.url, companyId, body: request.body,
    });
    return from(this.records.begin(companyId, key, fingerprint)).pipe(mergeMap((result) => {
      if (result.mode === 'REPLAY') {
        response.status(result.responseStatus);
        response.setHeader('Idempotency-Replayed', 'true');
        return of(result.responseBody);
      }
      return next.handle().pipe(
        mergeMap((body) => from(this.records.complete(result.recordId, response.statusCode, body)).pipe(mergeMap(() => of(body)))),
        catchError((error) => from(this.records.abort(result.recordId)).pipe(mergeMap(() => throwError(() => error)))),
      );
    }));
  }
}
