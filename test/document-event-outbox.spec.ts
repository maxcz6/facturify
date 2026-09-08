import { BadRequestException } from '@nestjs/common';
import { DocumentStatus, DocumentType, Prisma } from '@prisma/client';
import { DocumentEventsService } from '../src/document-events/document-events.service';
import { DocumentEventOutboxService } from '../src/outbox/document-event-outbox.service';

describe('DocumentEventOutboxService', () => {
  const events = new DocumentEventsService();
  const outbox = { enqueue: jest.fn() };
  const service = new DocumentEventOutboxService(events, outbox as never);
  const tx = { outboxEvent: {} } as never;
  const document = {
    id: 'doc-1', companyId: 'company-1', type: DocumentType.INVOICE,
    series: 'F001', number: 1, status: DocumentStatus.PENDING,
    currency: 'PEN', total: new Prisma.Decimal('118.00'),
    sunatCode: null, sunatMessage: null,
  };

  beforeEach(() => jest.clearAllMocks());

  it('builds and enqueues a sanitized created event using the supplied transaction', async () => {
    outbox.enqueue.mockResolvedValue({ id: 'outbox-1' });
    await service.enqueue('document.created', document, tx);
    expect(outbox.enqueue).toHaveBeenCalledWith(expect.objectContaining({
      event: 'document.created', companyId: 'company-1',
      document: expect.objectContaining({ id: 'doc-1', status: DocumentStatus.PENDING, total: '118.00' }),
    }), tx);
  });

  it('rejects an event whose status is incompatible before writing the outbox', () => {
    expect(() => service.enqueue('document.accepted', document, tx)).toThrow(BadRequestException);
    expect(outbox.enqueue).not.toHaveBeenCalled();
  });
});
