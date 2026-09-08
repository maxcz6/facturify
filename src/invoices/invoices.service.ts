import { BadRequestException, Injectable } from '@nestjs/common';
import { Document, DocumentType } from '@prisma/client';
import { DocumentsService } from '../documents/documents.service';
import { CreateInvoiceDto } from './dto/create-invoice.dto';

@Injectable()
export class InvoicesService {
  constructor(private readonly documentsService: DocumentsService) {}

  async create(input: CreateInvoiceDto, authenticatedCompanyId?: string): Promise<Document> {
    const companyId = authenticatedCompanyId;
    if (!companyId) {
      throw new BadRequestException('The authenticated API Key is not associated with a company.');
    }

    return this.documentsService.create({
      ...input,
      companyId,
      type: DocumentType.INVOICE,
    });
  }
}
