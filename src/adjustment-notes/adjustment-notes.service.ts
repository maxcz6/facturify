import { BadRequestException, Injectable } from '@nestjs/common';
import { Document, DocumentType } from '@prisma/client';
import { DocumentsService } from '../documents/documents.service';
import { CreateAdjustmentNoteDto } from './dto/create-adjustment-note.dto';

@Injectable()
export class AdjustmentNotesService {
  constructor(private readonly documents: DocumentsService) {}

  create(
    input: CreateAdjustmentNoteDto,
    companyId: string | undefined,
    type: Extract<DocumentType, 'CREDIT_NOTE' | 'DEBIT_NOTE'>,
  ): Promise<Document> {
    if (!companyId) throw new BadRequestException('The authenticated API Key is not associated with a company.');
    return this.documents.createAdjustment({
      companyId,
      type,
      referenceDocumentId: input.referenceDocumentId,
      series: input.series,
      number: input.number,
      adjustmentReasonCode: input.reasonCode,
      adjustmentReason: input.reason,
      currency: input.currency,
      items: input.items,
    });
  }
}
