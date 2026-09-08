import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { ApiKeyRecord } from '../interfaces/api-key.interface';

export const CurrentApiKey = createParamDecorator(
  (data: keyof ApiKeyRecord | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const keyRecord = request.apiKey as ApiKeyRecord | undefined;
    return data && keyRecord ? keyRecord[data] : keyRecord;
  },
);
