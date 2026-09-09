import { Module } from '@nestjs/common';
import { WebhooksModule } from '../webhooks/webhooks.module';
import { OutboxService } from './outbox.service';
import { WebhookPolicyModule } from '../webhook-policy/webhook-policy.module';
import { DocumentEventsModule } from '../document-events/document-events.module';
import { DocumentEventOutboxService } from './document-event-outbox.service';
import { OutboxProcessor } from './outbox.processor';

@Module({
  imports: [WebhooksModule, WebhookPolicyModule, DocumentEventsModule],
  providers: [OutboxService, DocumentEventOutboxService, OutboxProcessor],
  exports: [OutboxService, DocumentEventOutboxService],
})
export class OutboxModule {}
