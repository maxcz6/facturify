import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditEvent } from './audit-events.interface';

@Injectable()
export class AuditEventWriterService {
  constructor(private readonly prisma: PrismaService) {}

  async append(event: Readonly<AuditEvent>): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        eventId: event.eventId,
        event: event.event,
        apiVersion: event.apiVersion,
        occurredAt: new Date(event.occurredAt),
        actorType: event.actorType,
        actorId: event.actorId,
        companyId: event.companyId,
        result: event.result,
        publicCode: event.publicCode,
        requestId: event.requestId,
      },
    });
  }
}
