import { Body, Controller, Post, UseGuards, UseInterceptors } from '@nestjs/common';
import { ApiBearerAuth, ApiCreatedResponse, ApiTags } from '@nestjs/swagger';
import { Document, DocumentType } from '@prisma/client';
import { CurrentCompanyId } from '../api-keys/decorators/current-company-id.decorator';
import { ApiKeyGuard } from '../api-keys/guards/api-key.guard';
import { AdjustmentNotesService } from './adjustment-notes.service';
import { CreateAdjustmentNoteDto } from './dto/create-adjustment-note.dto';
import { IdempotencyInterceptor } from '../idempotency/idempotency.interceptor';

@ApiTags('Credit Notes')
@ApiBearerAuth()
@UseGuards(ApiKeyGuard)
@Controller('credit-notes')
export class CreditNotesController {
  constructor(private readonly notes: AdjustmentNotesService) {}

  @Post()
  @UseInterceptors(IdempotencyInterceptor)
  @ApiCreatedResponse({ description: 'Credit note registered with status PENDING.' })
  create(@Body() input: CreateAdjustmentNoteDto, @CurrentCompanyId() companyId?: string): Promise<Document> {
    return this.notes.create(input, companyId, DocumentType.CREDIT_NOTE);
  }
}
