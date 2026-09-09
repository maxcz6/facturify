import { Module } from '@nestjs/common';
import { SafeWebhookHttpClient } from './safe-webhook-client.service';

@Module({
  providers: [SafeWebhookHttpClient],
  exports: [SafeWebhookHttpClient],
})
export class SafeWebhookClientModule {}
