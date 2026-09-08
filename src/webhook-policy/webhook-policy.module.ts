import { Module } from '@nestjs/common';
import { WebhookDeliveryPolicyService } from './webhook-delivery-policy.service';

@Module({
  providers: [WebhookDeliveryPolicyService],
  exports: [WebhookDeliveryPolicyService],
})
export class WebhookPolicyModule {}
