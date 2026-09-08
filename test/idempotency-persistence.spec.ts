import { ConflictException } from '@nestjs/common';
import { IdempotencyStatus } from '@prisma/client';
import { createHash } from 'node:crypto';
import { IdempotencyPersistenceService } from '../src/idempotency/idempotency-persistence.service';

describe('IdempotencyPersistenceService', () => {
  const companyId = 'company-a';
  const key = 'request-key-123456789';
  const keyHash = createHash('sha256').update(key).digest('hex');
  let prisma: any;
  let service: IdempotencyPersistenceService;

  beforeEach(() => {
    prisma = { idempotencyRecord: {
      create: jest.fn().mockResolvedValue({ id: 'idem-1' }),
      findUnique: jest.fn(), update: jest.fn(), delete: jest.fn(), deleteMany: jest.fn(),
    } };
    service = new IdempotencyPersistenceService(prisma);
  });

  it('creates a tenant-scoped record containing only the key hash', async () => {
    await expect(service.begin(companyId, key, 'fingerprint-a')).resolves.toEqual({ mode: 'NEW', recordId: 'idem-1' });
    expect(prisma.idempotencyRecord.create).toHaveBeenCalledWith({ data: expect.objectContaining({ companyId, keyHash, fingerprint: 'fingerprint-a' }) });
    expect(JSON.stringify(prisma.idempotencyRecord.create.mock.calls)).not.toContain(key);
  });

  it('replays a completed equivalent request', async () => {
    prisma.idempotencyRecord.create.mockRejectedValue({ code: 'P2002' });
    prisma.idempotencyRecord.findUnique.mockResolvedValue({
      id: 'idem-1', fingerprint: 'fingerprint-a', status: IdempotencyStatus.COMPLETED,
      responseStatus: 201, responseBody: { id: 'doc-1' }, expiresAt: new Date(Date.now() + 60_000),
    });
    await expect(service.begin(companyId, key, 'fingerprint-a')).resolves.toEqual({
      mode: 'REPLAY', responseStatus: 201, responseBody: { id: 'doc-1' },
    });
  });

  it('rejects the same key for a different fingerprint', async () => {
    prisma.idempotencyRecord.create.mockRejectedValue({ code: 'P2002' });
    prisma.idempotencyRecord.findUnique.mockResolvedValue({
      fingerprint: 'fingerprint-b', status: IdempotencyStatus.COMPLETED, expiresAt: new Date(Date.now() + 60_000),
    });
    await expect(service.begin(companyId, key, 'fingerprint-a')).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects a concurrent equivalent request still in progress', async () => {
    prisma.idempotencyRecord.create.mockRejectedValue({ code: 'P2002' });
    prisma.idempotencyRecord.findUnique.mockResolvedValue({
      fingerprint: 'fingerprint-a', status: IdempotencyStatus.IN_PROGRESS, expiresAt: new Date(Date.now() + 60_000),
    });
    await expect(service.begin(companyId, key, 'fingerprint-a')).rejects.toBeInstanceOf(ConflictException);
  });

  it('removes an expired record and creates a replacement', async () => {
    prisma.idempotencyRecord.create.mockRejectedValueOnce({ code: 'P2002' }).mockResolvedValueOnce({ id: 'idem-2' });
    prisma.idempotencyRecord.findUnique.mockResolvedValue({ id: 'old', expiresAt: new Date(Date.now() - 1), fingerprint: 'old' });
    await expect(service.begin(companyId, key, 'fingerprint-a')).resolves.toEqual({ mode: 'NEW', recordId: 'idem-2' });
    expect(prisma.idempotencyRecord.delete).toHaveBeenCalledWith({ where: { id: 'old' } });
  });

  it('completes and aborts records without the original key', async () => {
    await service.complete('idem-1', 201, { id: 'doc-1' });
    expect(prisma.idempotencyRecord.update).toHaveBeenCalledWith({
      where: { id: 'idem-1' }, data: { status: IdempotencyStatus.COMPLETED, responseStatus: 201, responseBody: { id: 'doc-1' } },
    });
    await service.abort('idem-1');
    expect(prisma.idempotencyRecord.deleteMany).toHaveBeenCalledWith({ where: { id: 'idem-1', status: IdempotencyStatus.IN_PROGRESS } });
  });

  it('isolates identical keys through the company-scoped unique lookup', async () => {
    prisma.idempotencyRecord.create.mockRejectedValue({ code: 'P2002' });
    prisma.idempotencyRecord.findUnique.mockResolvedValue({ fingerprint: 'fingerprint-a', status: IdempotencyStatus.IN_PROGRESS, expiresAt: new Date(Date.now() + 60_000) });
    await expect(service.begin('company-b', key, 'fingerprint-a')).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.idempotencyRecord.findUnique).toHaveBeenCalledWith({ where: { companyId_keyHash: { companyId: 'company-b', keyHash } } });
  });
});
