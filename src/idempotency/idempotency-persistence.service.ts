import { ConflictException, Injectable } from '@nestjs/common';
import { IdempotencyStatus, Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';

export type BeginIdempotencyResult =
  | { mode: 'NEW'; recordId: string }
  | { mode: 'REPLAY'; responseStatus: number; responseBody: Prisma.JsonValue | null };

@Injectable()
export class IdempotencyPersistenceService {
  constructor(private readonly prisma: PrismaService) {}

  async begin(companyId: string, key: string, fingerprint: string): Promise<BeginIdempotencyResult> {
    const keyHash = createHash('sha256').update(key).digest('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    try {
      const record = await this.prisma.idempotencyRecord.create({
        data: { companyId, keyHash, fingerprint, expiresAt },
      });
      return { mode: 'NEW' as const, recordId: record.id };
    } catch (error) {
      if (!this.isUniqueConflict(error)) throw error;
    }

    const existing = await this.prisma.idempotencyRecord.findUnique({
      where: { companyId_keyHash: { companyId, keyHash } },
    });
    if (!existing) throw new ConflictException('Idempotency request is being initialized.');
    if (existing.expiresAt <= new Date()) {
      await this.prisma.idempotencyRecord.delete({ where: { id: existing.id } });
      return this.begin(companyId, key, fingerprint);
    }
    if (existing.fingerprint !== fingerprint) {
      throw new ConflictException('Idempotency-Key was already used for a different request.');
    }
    if (existing.status === IdempotencyStatus.IN_PROGRESS) {
      throw new ConflictException('An equivalent request is already in progress.');
    }
    return {
      mode: 'REPLAY' as const,
      responseStatus: existing.responseStatus ?? 200,
      responseBody: existing.responseBody,
    };
  }

  async complete(recordId: string, responseStatus: number, responseBody: unknown): Promise<void> {
    const serialized = JSON.parse(JSON.stringify(responseBody ?? null)) as Prisma.InputJsonValue;
    await this.prisma.idempotencyRecord.update({
      where: { id: recordId },
      data: { status: IdempotencyStatus.COMPLETED, responseStatus, responseBody: serialized },
    });
  }

  async abort(recordId: string): Promise<void> {
    await this.prisma.idempotencyRecord.deleteMany({ where: { id: recordId, status: IdempotencyStatus.IN_PROGRESS } });
  }

  private isUniqueConflict(error: unknown): boolean {
    return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
  }
}
