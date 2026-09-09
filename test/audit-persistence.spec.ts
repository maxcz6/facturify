import { AuditEventWriterService } from '../src/audit-events/audit-events-writer.service';
import { AuditEvent } from '../src/audit-events/audit-events.interface';

describe('AuditEventWriterService', () => {
  it('appends only the public audit envelope', async () => {
    const create = jest.fn().mockResolvedValue({ id: 'internal-id' });
    const writer = new AuditEventWriterService({
      auditLog: { create },
    } as never);
    const event: AuditEvent = {
      eventId: '0198f703-6e7a-7000-8000-000000000001',
      event: 'api_key.rotated',
      apiVersion: 'v1',
      occurredAt: '2026-09-09T12:00:00.000Z',
      actorType: 'ADMIN',
      actorId: '0198f703-6e7a-7000-8000-000000000002',
      companyId: '0198f703-6e7a-7000-8000-000000000003',
      result: 'SUCCESS',
      publicCode: null,
      requestId: 'request-safe-1',
    };

    await writer.append(event);

    expect(create).toHaveBeenCalledWith({
      data: {
        ...event,
        occurredAt: new Date(event.occurredAt),
      },
    });
    const serialized = JSON.stringify(create.mock.calls[0][0]);
    for (const forbidden of ['password', 'secret', 'token', 'email', 'stack', 'body']) {
      expect(serialized.toLowerCase()).not.toContain(forbidden);
    }
  });
});
