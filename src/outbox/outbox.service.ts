import { BadRequestException, Injectable } from '@nestjs/common';
import { OutboxEventStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { WebhooksService } from '../webhooks/webhooks.service';
import { WebhookDeliveryPolicyService } from '../webhook-policy/webhook-delivery-policy.service';

interface PublicEventEnvelope extends Record<string, unknown> {
  eventId: string;
  event: string;
  companyId: string;
}

@Injectable()
export class OutboxService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly webhooks: WebhooksService,
    private readonly policy?: WebhookDeliveryPolicyService,
  ) {}

  enqueue(payload: PublicEventEnvelope, tx: Pick<PrismaService, 'outboxEvent'> = this.prisma) {
    if (!/^[0-9a-f-]{36}$/i.test(payload.eventId) || !payload.companyId || !payload.event) {
      throw new BadRequestException('Invalid public event envelope.');
    }
    return tx.outboxEvent.create({ data: {
      eventId: payload.eventId,
      companyId: payload.companyId,
      event: payload.event,
      payload: JSON.parse(JSON.stringify(payload)) as Prisma.InputJsonValue,
    } });
  }

  async processBatch(limit = 20): Promise<{ processed: number }> {
    const safeLimit = Math.max(1, Math.min(100, Math.trunc(limit)));
    const now = new Date();
    const staleLock = new Date(now.getTime() - 5 * 60_000);
    await this.prisma.outboxEvent.updateMany({
      where: { status: OutboxEventStatus.PROCESSING, lockedAt: { lt: staleLock } },
      data: { status: OutboxEventStatus.PENDING, lockedAt: null },
    });
    const candidates = await this.prisma.outboxEvent.findMany({
      where: { status: OutboxEventStatus.PENDING, nextAttemptAt: { lte: now } },
      orderBy: { createdAt: 'asc' }, take: safeLimit,
    });
    let processed = 0;
    for (const event of candidates) {
      const claimed = await this.prisma.outboxEvent.updateMany({
        where: { id: event.id, status: OutboxEventStatus.PENDING },
        data: { status: OutboxEventStatus.PROCESSING, lockedAt: now, attempt: { increment: 1 } },
      });
      if (claimed.count !== 1) continue;
      const attempt = event.attempt + 1;
      try {
        const deliveries = await this.webhooks.dispatch(
          event.companyId, event.event, event.payload as Record<string, unknown>, 1,
        );
        if (deliveries.every((delivery) => delivery.status === 'SUCCESS')) {
          await this.prisma.outboxEvent.update({ where: { id: event.id }, data: {
            status: OutboxEventStatus.COMPLETED, completedAt: new Date(), lockedAt: null, errorCode: null,
          } });
        } else {
          const decisions = deliveries.filter((delivery) => delivery.status !== 'SUCCESS').map((delivery) =>
            this.policy?.evaluate({
              attempt, maxAttempts: event.maxAttempts, statusCode: delivery.statusCode,
              isNetworkError: delivery.error === 'NETWORK_ERROR',
              isTimeout: delivery.error === 'TIMEOUT', retryAfter: delivery.retryAfter ?? undefined, jitter: 0,
            }),
          ).filter(Boolean);
          const retryable = decisions.length === 0 || decisions.some((decision) => decision!.retryable);
          const delay = decisions.reduce((max, decision) => Math.max(max, decision!.nextDelayMs ?? 0), 0);
          await this.reschedule(event.id, attempt, event.maxAttempts, retryable, delay || undefined);
        }
      } catch {
        await this.reschedule(event.id, attempt, event.maxAttempts, true);
      }
      processed++;
    }
    return { processed };
  }

  private async reschedule(id: string, attempt: number, maxAttempts: number, retryable = true, policyDelay?: number): Promise<void> {
    const exhausted = !retryable || attempt >= maxAttempts;
    const delay = policyDelay ?? Math.min(15 * 60_000, 1000 * 2 ** Math.max(0, attempt - 1));
    await this.prisma.outboxEvent.update({ where: { id }, data: {
      status: exhausted ? OutboxEventStatus.DEAD : OutboxEventStatus.PENDING,
      nextAttemptAt: new Date(Date.now() + delay), lockedAt: null, errorCode: 'WEBHOOK_DELIVERY_FAILED',
    } });
  }
}
