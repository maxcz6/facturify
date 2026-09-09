import { Body, Controller, Post, UseGuards, UseInterceptors } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentCompanyId } from '../api-keys/decorators/current-company-id.decorator';
import { ApiKeyGuard } from '../api-keys/guards/api-key.guard';
import { CreateReceiptDto } from './dto/create-receipt.dto';
import { ReceiptsService } from './receipts.service';
import { IdempotencyInterceptor } from '../idempotency/idempotency.interceptor';
import { CreatedDocumentResponseDto, toCreatedDocumentResponse } from '../documents/dto/created-document-response.dto';

@ApiTags('Receipts')
@Controller('receipts')
@UseGuards(ApiKeyGuard)
@ApiBearerAuth()
export class ReceiptsController {
  constructor(private readonly receiptsService: ReceiptsService) {}

  @Post()
  @UseInterceptors(IdempotencyInterceptor)
  @ApiOperation({
    summary: 'Issue an Electronic Receipt (Boleta de Venta)',
    description: 'Facade endpoint that fixes DocumentType to RECEIPT and delegates calculation/persistence to DocumentsService.',
  })
  @ApiCreatedResponse({ type: CreatedDocumentResponseDto, description: 'Receipt registered with status PENDING.' })
  async create(
    @Body() input: CreateReceiptDto,
    @CurrentCompanyId() companyId?: string,
  ): Promise<CreatedDocumentResponseDto> {
    return toCreatedDocumentResponse(await this.receiptsService.create(input, companyId));
  }
}
