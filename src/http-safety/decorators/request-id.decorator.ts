import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';

export const RequestId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest<Request & { id?: string }>();
    return (
      request?.id ||
      (request?.headers?.['x-request-id'] as string) ||
      'unknown'
    );
  },
);
