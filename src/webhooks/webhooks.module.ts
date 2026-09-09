import { Module } from '@nestjs/common';
import { ApiKeysModule } from '../api-keys/api-keys.module';
import { WebhooksController } from './webhooks.controller';
import { WebhooksService } from './webhooks.service';
import { WebhookDnsSafetyModule } from '../webhook-dns-safety/webhook-dns-safety.module';
import { SafeWebhookClientModule } from '../safe-webhook-client/safe-webhook-client.module';

@Module({
  imports: [ApiKeysModule, WebhookDnsSafetyModule, SafeWebhookClientModule],
  controllers: [WebhooksController],
  providers: [WebhooksService],
  exports: [WebhooksService],
})
export class WebhooksModule {}
