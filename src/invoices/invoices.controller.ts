import { Body, Controller, Post, UseGuards, UseInterceptors } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentCompanyId } from '../api-keys/decorators/current-company-id.decorator';
import { ApiKeyGuard } from '../api-keys/guards/api-key.guard';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { InvoicesService } from './invoices.service';
import { IdempotencyInterceptor } from '../idempotency/idempotency.interceptor';
import { CreatedDocumentResponseDto, toCreatedDocumentResponse } from '../documents/dto/created-document-response.dto';

@ApiTags('Invoices')
@Controller('invoices')
@UseGuards(ApiKeyGuard)
@ApiBearerAuth()
export class InvoicesController {
  constructor(private readonly invoicesService: InvoicesService) {}

  @Post()
  @UseInterceptors(IdempotencyInterceptor)
  @ApiOperation({
    summary: 'Issue an Electronic Invoice (Factura)',
    description: 'Facade endpoint that fixes DocumentType to INVOICE and delegates calculation/persistence to DocumentsService.',
  })
  @ApiCreatedResponse({ type: CreatedDocumentResponseDto, description: 'Invoice registered with status PENDING.' })
  async create(
    @Body() input: CreateInvoiceDto,
    @CurrentCompanyId() companyId?: string,
  ): Promise<CreatedDocumentResponseDto> {
    return toCreatedDocumentResponse(await this.invoicesService.create(input, companyId));
  }
}
