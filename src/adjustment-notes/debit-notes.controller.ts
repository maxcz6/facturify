import { Body, Controller, Post, UseGuards, UseInterceptors } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiTags } from '@nestjs/swagger';
import { DocumentType } from '@prisma/client';
import { CurrentCompanyId } from '../api-keys/decorators/current-company-id.decorator';
import { ApiKeyGuard } from '../api-keys/guards/api-key.guard';
import { AdjustmentNotesService } from './adjustment-notes.service';
import { CreateAdjustmentNoteDto } from './dto/create-adjustment-note.dto';
import { IdempotencyInterceptor } from '../idempotency/idempotency.interceptor';
import { CreatedDocumentResponseDto, toCreatedDocumentResponse } from '../documents/dto/created-document-response.dto';

@ApiTags('Debit Notes')
@ApiBearerAuth()
@UseGuards(ApiKeyGuard)
@Controller('debit-notes')
export class DebitNotesController {
  constructor(private readonly notes: AdjustmentNotesService) {}

  @Post()
  @UseInterceptors(IdempotencyInterceptor)
  @ApiCreatedResponse({ type: CreatedDocumentResponseDto, description: 'Debit note registered with status PENDING.' })
  async create(@Body() input: CreateAdjustmentNoteDto, @CurrentCompanyId() companyId?: string): Promise<CreatedDocumentResponseDto> {
    return toCreatedDocumentResponse(await this.notes.create(input, companyId, DocumentType.DEBIT_NOTE));
  }
}
