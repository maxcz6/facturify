import { BadRequestException, Injectable } from '@nestjs/common';
import { DocumentStatus, Prisma } from '@prisma/client';
import { DocumentEventType } from '../document-events/document-events.constants';
import { DocumentEventsService } from '../document-events/document-events.service';
import { DocumentInputLike } from '../document-events/document-events.interface';
import { PrismaService } from '../prisma/prisma.service';
import { OutboxService } from './outbox.service';

const EVENT_STATUS: Record<DocumentEventType, readonly DocumentStatus[]> = {
  'document.created': [DocumentStatus.PENDING],
  'document.processing': [DocumentStatus.PROCESSING],
  'document.accepted': [DocumentStatus.ACCEPTED],
  'document.observed': [DocumentStatus.OBSERVED],
  'document.rejected': [DocumentStatus.REJECTED],
  'document.voided': [DocumentStatus.VOIDED],
  'document.error': [DocumentStatus.ERROR],
};

type OutboxTransaction = Pick<Prisma.TransactionClient, 'outboxEvent'>;

@Injectable()
export class DocumentEventOutboxService {
  constructor(
    private readonly events: DocumentEventsService,
    private readonly outbox: OutboxService,
  ) {}

  enqueue(event: DocumentEventType, document: DocumentInputLike, tx: OutboxTransaction) {
    if (!EVENT_STATUS[event].includes(document.status as DocumentStatus)) {
      throw new BadRequestException('Document event is incompatible with its public status.');
    }
    const payload = this.events.buildEvent(event, document);
    return this.outbox.enqueue(payload, tx as Pick<PrismaService, 'outboxEvent'>);
  }
}
