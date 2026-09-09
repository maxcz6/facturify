import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  ListAuditEventsQuery,
  PaginatedAuditEventsResponseDto,
  AuditEventItemDto,
} from './dto/audit-event-query.dto';
import {
  parsePaginationLimit,
  parseFilterDate,
  validateAuditAction,
  validateAuditResult,
  isValidUuid,
  decodeCursor,
  encodeCursor,
} from './audit-queries.util';
import { AUDIT_EVENTS_API_VERSION } from './audit-queries.constants';

@Injectable()
export class AuditQueriesService {
  private readonly cursorSigningKey: Buffer;

  constructor(private readonly prisma: PrismaService, config: ConfigService) {
    const jwtSecret = config.get<string>('JWT_SECRET');
    if (!jwtSecret) throw new Error('Audit cursor signing configuration is unavailable.');
    this.cursorSigningKey = createHmac('sha256', jwtSecret)
      .update('facturify:audit-cursor:v1')
      .digest();
  }

  /**
   * Queries the AuditLog table using PrismaService.
   * Enforces cursor-based pagination (occurredAt + id DESC) and sanitized filters.
   * Returns clean items and an opaque nextCursor, strictly omitting internal IDs or secrets.
   */
  public async listAuditEvents(
    query: ListAuditEventsQuery,
  ): Promise<PaginatedAuditEventsResponseDto> {
    const limit = parsePaginationLimit(query.limit);

    // 1. Validate companyId filter if present
    let companyIdFilter: string | undefined;
    if (query.companyId !== undefined && query.companyId !== null && query.companyId !== '') {
      if (!isValidUuid(query.companyId)) {
        throw new BadRequestException('companyId debe ser un UUID valido.');
      }
      companyIdFilter = query.companyId.toLowerCase();
    }

    // 2. Validate actorId filter if present
    let actorIdFilter: string | undefined;
    if (query.actorId !== undefined && query.actorId !== null && query.actorId !== '') {
      if (!isValidUuid(query.actorId)) {
        throw new BadRequestException('actorId debe ser un UUID valido.');
      }
      actorIdFilter = query.actorId.toLowerCase();
    }

    // 3. Validate event and result filters
    const eventFilter = validateAuditAction(query.event);
    const resultFilter = validateAuditResult(query.result);

    // 4. Validate from and to dates
    const fromDate = parseFilterDate(query.from, 'from');
    const toDate = parseFilterDate(query.to, 'to');

    if (fromDate && toDate && fromDate > toDate) {
      throw new BadRequestException('La fecha from debe ser anterior o igual a to.');
    }

    // 5. Build base WHERE clause
    const where: Prisma.AuditLogWhereInput = {};

    if (companyIdFilter) {
      where.companyId = companyIdFilter;
    }

    if (actorIdFilter) {
      where.actorId = actorIdFilter;
    }

    if (eventFilter) {
      where.event = eventFilter;
    }

    if (resultFilter) {
      where.result = resultFilter;
    }

    if (fromDate || toDate) {
      where.occurredAt = {};
      if (fromDate) {
        where.occurredAt.gte = fromDate;
      }
      if (toDate) {
        where.occurredAt.lte = toDate;
      }
    }

    // 6. Handle cursor pagination (stable tie-breaker: occurredAt DESC, id DESC)
    if (query.cursor) {
      const decoded = decodeCursor(query.cursor, this.cursorSigningKey);

      // (occurredAt < decoded.occurredAt) OR (occurredAt = decoded.occurredAt AND id < decoded.id)
      const cursorCondition = {
        OR: [
          { occurredAt: { lt: decoded.occurredAt } },
          {
            occurredAt: decoded.occurredAt,
            id: { lt: decoded.id },
          },
        ],
      };

      where.AND = [cursorCondition];
    }

    // 7. Execute Prisma query with limit + 1 to detect next page
    const take = limit + 1;
    const auditLogs = await this.prisma.auditLog.findMany({
      where,
      take,
      orderBy: [
        { occurredAt: 'desc' },
        { id: 'desc' },
      ],
      select: {
        id: true,
        eventId: true,
        event: true,
        occurredAt: true,
        actorType: true,
        actorId: true,
        companyId: true,
        result: true,
        publicCode: true,
        requestId: true,
      },
    });

    const hasNextPage = auditLogs.length > limit;
    const pageItems = hasNextPage ? auditLogs.slice(0, limit) : auditLogs;

    // 8. Compute nextCursor using the last item of the page
    let nextCursor: string | null = null;
    if (hasNextPage && pageItems.length > 0) {
      const lastItem = pageItems[pageItems.length - 1];
      nextCursor = encodeCursor(lastItem.occurredAt, lastItem.id, this.cursorSigningKey);
    }

    // 9. Map and sanitize items: NEVER return internal id, createdAt, or prisma internals
    const sanitizedItems: AuditEventItemDto[] = pageItems.map((log) => ({
      eventId: log.eventId,
      event: log.event as AuditEventItemDto['event'],
      apiVersion: AUDIT_EVENTS_API_VERSION,
      occurredAt: log.occurredAt instanceof Date ? log.occurredAt.toISOString() : new Date(log.occurredAt).toISOString(),
      actorType: log.actorType as AuditEventItemDto['actorType'],
      actorId: log.actorId ?? null,
      companyId: log.companyId ?? null,
      result: log.result as AuditEventItemDto['result'],
      publicCode: log.publicCode ?? null,
      requestId: log.requestId ?? null,
    }));

    return {
      items: Object.freeze(sanitizedItems),
      nextCursor,
    };
  }
}
