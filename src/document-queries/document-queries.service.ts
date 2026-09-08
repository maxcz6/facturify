import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Document, DocumentItem, DocumentStatus, DocumentType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  DocumentQueryResponseDto,
  PaginatedDocumentsResponseDto,
} from './dto/document-query-response.dto';
import { ListDocumentsQueryDto } from './dto/list-documents-query.dto';

type DocumentWithItems = Document & {
  items: DocumentItem[];
};

@Injectable()
export class DocumentQueriesService {
  constructor(private readonly prisma: PrismaService) {}

  async findById(
    companyId: string,
    id: string,
  ): Promise<DocumentQueryResponseDto> {
    this.assertValidId(companyId, 'companyId');
    this.assertValidId(id, 'id');

    const document = await this.prisma.document.findFirst({
      where: {
        id,
        companyId,
      },
      include: {
        items: true,
      },
    });

    if (!document) {
      throw new NotFoundException(`Document '${id}' not found.`);
    }

    return this.mapToDto(document);
  }

  async findMany(
    companyId: string,
    query: ListDocumentsQueryDto,
  ): Promise<PaginatedDocumentsResponseDto> {
    this.assertValidId(companyId, 'companyId');

    // 1. Limit validation (1 to 100, default 20)
    const limit = query.limit !== undefined ? Number(query.limit) : 20;
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw new BadRequestException(
        'limit must be an integer between 1 and 100.',
      );
    }

    // 2. Filter validations
    if (query.status && !Object.values(DocumentStatus).includes(query.status)) {
      throw new BadRequestException(`Invalid document status '${query.status}'.`);
    }

    if (query.type && !Object.values(DocumentType).includes(query.type)) {
      throw new BadRequestException(`Invalid document type '${query.type}'.`);
    }

    if (query.series && !/^[a-zA-Z0-9_-]{1,10}$/.test(query.series)) {
      throw new BadRequestException(
        'Invalid series format. Must be alphanumeric up to 10 characters.',
      );
    }

    let fromDate: Date | undefined;
    let untilDate: Date | undefined;

    if (query.createdFrom) {
      fromDate = new Date(query.createdFrom);
      if (isNaN(fromDate.getTime())) {
        throw new BadRequestException(
          'Invalid date format for createdFrom parameter.',
        );
      }
    }

    if (query.createdUntil) {
      untilDate = new Date(query.createdUntil);
      if (isNaN(untilDate.getTime())) {
        throw new BadRequestException(
          'Invalid date format for createdUntil parameter.',
        );
      }
    }

    if (fromDate && untilDate && fromDate > untilDate) {
      throw new BadRequestException(
        'createdFrom timestamp must be earlier than or equal to createdUntil.',
      );
    }

    // 3. Cursor validation (must be valid format and belong to this company)
    if (query.cursor) {
      this.assertValidId(query.cursor, 'cursor');

      const cursorDoc = await this.prisma.document.findFirst({
        where: {
          id: query.cursor,
          companyId,
        },
        select: {
          id: true,
        },
      });

      if (!cursorDoc) {
        throw new BadRequestException(
          'Invalid cursor: document does not exist for this company.',
        );
      }
    }

    // 4. Build where filter scoped to authenticated company
    const where: any = {
      companyId,
    };

    if (query.status) {
      where.status = query.status;
    }

    if (query.type) {
      where.type = query.type;
    }

    if (query.series) {
      where.series = query.series;
    }

    if (fromDate || untilDate) {
      where.createdAt = {};
      if (fromDate) {
        where.createdAt.gte = fromDate;
      }
      if (untilDate) {
        where.createdAt.lte = untilDate;
      }
    }

    // 5. Query Prisma with cursor pagination
    const take = limit + 1;
    const documents = (await this.prisma.document.findMany({
      where,
      take,
      cursor: query.cursor ? { id: query.cursor } : undefined,
      skip: query.cursor ? 1 : 0,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      include: {
        items: true,
      },
    })) as DocumentWithItems[];

    const hasMore = documents.length > limit;
    const records = hasMore ? documents.slice(0, limit) : documents;
    const nextCursor = hasMore ? records[records.length - 1].id : null;

    return {
      items: records.map((doc) => this.mapToDto(doc)),
      nextCursor,
      hasMore,
      limit,
    };
  }

  private mapToDto(doc: DocumentWithItems): DocumentQueryResponseDto {
    return {
      id: doc.id,
      companyId: doc.companyId,
      type: doc.type,
      series: doc.series,
      number: doc.number,
      status: doc.status,
      customerDocumentType: doc.customerDocumentType,
      customerDocumentNumber: doc.customerDocumentNumber,
      customerName: doc.customerName,
      currency: doc.currency,
      subtotal: Number(doc.subtotal),
      tax: Number(doc.tax),
      total: Number(doc.total),
      sunatCode: doc.sunatCode,
      sunatMessage: doc.sunatMessage,
      referenceDocumentId: doc.referenceDocumentId,
      adjustmentReasonCode: doc.adjustmentReasonCode,
      adjustmentReason: doc.adjustmentReason,
      issuedAt: doc.issuedAt,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
      xmlAvailable: Boolean(doc.xmlArtifactId),
      zipAvailable: Boolean(doc.zipArtifactId),
      cdrAvailable: Boolean(doc.cdrArtifactId),
      items: (doc.items || []).map((item) => ({
        id: item.id,
        description: item.description,
        quantity: Number(item.quantity),
        unitPrice: Number(item.unitPrice),
        subtotal: Number(item.subtotal),
        tax: Number(item.tax),
        total: Number(item.total),
      })),
    };
  }

  private assertValidId(id: string, name: string): void {
    if (!id || typeof id !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(id)) {
      throw new BadRequestException(`Invalid ${name} format.`);
    }
  }
}
