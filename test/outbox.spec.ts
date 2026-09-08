import { OutboxEventStatus } from '@prisma/client';
import { OutboxService } from '../src/outbox/outbox.service';

describe('OutboxService', () => {
  let prisma: any;
  let webhooks: any;
  let service: OutboxService;
  const event = { id: 'out-1', eventId: '123e4567-e89b-42d3-a456-426614174000', companyId: 'company-a', event: 'document.accepted', payload: { eventId: '123e4567-e89b-42d3-a456-426614174000', apiVersion: 'v1' }, status: OutboxEventStatus.PENDING, attempt: 0, maxAttempts: 5 };
  beforeEach(() => {
    prisma = { outboxEvent: {
      create: jest.fn().mockResolvedValue(event), updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findMany: jest.fn().mockResolvedValue([event]), update: jest.fn().mockResolvedValue({}),
    } };
    webhooks = { dispatch: jest.fn().mockResolvedValue([{ status: 'SUCCESS' }]) };
    service = new OutboxService(prisma, webhooks);
  });
  it('enqueues the exact public event under its authenticated company', async () => {
    await service.enqueue({ ...event.payload, event: event.event, companyId: event.companyId } as any);
    expect(prisma.outboxEvent.create).toHaveBeenCalledWith({ data: expect.objectContaining({ eventId: event.eventId, companyId: event.companyId, event: event.event }) });
  });
  it('claims and completes successful deliveries', async () => {
    await expect(service.processBatch()).resolves.toEqual({ processed: 1 });
    expect(webhooks.dispatch).toHaveBeenCalledWith(event.companyId, event.event, event.payload, 1);
    expect(prisma.outboxEvent.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: OutboxEventStatus.COMPLETED }) }));
  });
  it('reschedules failed deliveries without persisting raw errors', async () => {
    webhooks.dispatch.mockResolvedValue([{ status: 'FAILED', error: 'secret response' }]);
    await service.processBatch();
    expect(prisma.outboxEvent.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: OutboxEventStatus.PENDING, errorCode: 'WEBHOOK_DELIVERY_FAILED' }) }));
    expect(JSON.stringify(prisma.outboxEvent.update.mock.calls)).not.toContain('secret response');
  });
});
