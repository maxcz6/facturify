import { Module } from '@nestjs/common';
import { WebhooksModule } from '../webhooks/webhooks.module';
import { OutboxService } from './outbox.service';
import { WebhookPolicyModule } from '../webhook-policy/webhook-policy.module';
import { DocumentEventsModule } from '../document-events/document-events.module';
import { DocumentEventOutboxService } from './document-event-outbox.service';

@Module({
  imports: [WebhooksModule, WebhookPolicyModule, DocumentEventsModule],
  providers: [OutboxService, DocumentEventOutboxService],
  exports: [OutboxService, DocumentEventOutboxService],
})
export class OutboxModule {}
