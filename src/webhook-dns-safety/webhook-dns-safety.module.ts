import { Module } from '@nestjs/common';
import { WebhookDnsSafetyService } from './webhook-dns-safety.service';

@Module({
  providers: [WebhookDnsSafetyService],
  exports: [WebhookDnsSafetyService],
})
export class WebhookDnsSafetyModule {}
