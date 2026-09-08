import { Controller, HttpCode, HttpStatus, Param, Post, UseGuards, UseInterceptors } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { CurrentCompanyId } from '../api-keys/decorators/current-company-id.decorator';
import { ApiKeyGuard } from '../api-keys/guards/api-key.guard';
import { DocumentIssuanceService } from './document-issuance.service';
import { DailySummaryService } from './daily-summary.service';
import { CreateDailySummaryDto } from './dto/create-daily-summary.dto';
import { Body } from '@nestjs/common';
import { CreateVoidCommunicationDto } from './dto/create-void-communication.dto';
import { VoidCommunicationService } from './void-communication.service';
import { IdempotencyInterceptor } from '../idempotency/idempotency.interceptor';

@ApiTags('Document Processing')
@Controller('documents')
@UseGuards(ApiKeyGuard)
@ApiBearerAuth()
export class ProcessingController {
  constructor(
    private readonly issuance: DocumentIssuanceService,
    private readonly summaries: DailySummaryService,
    private readonly voids: VoidCommunicationService,
  ) {}

  @Post(':id/send')
  @UseInterceptors(IdempotencyInterceptor)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Sign and submit an existing document to SUNAT' })
  @ApiParam({ name: 'id', description: 'Internal document identifier' })
  @ApiOkResponse({ description: 'Final SUNAT response and document status.' })
  issue(@Param('id') id: string, @CurrentCompanyId() companyId: string) {
    return this.issuance.issue(companyId, id);
  }

  @Post('daily-summaries')
  @UseInterceptors(IdempotencyInterceptor)
  createSummary(@Body() dto: CreateDailySummaryDto, @CurrentCompanyId() companyId: string) {
    return this.summaries.createAndSend(companyId, dto.referenceDate);
  }

  @Post('daily-summaries/:id/status')
  refreshSummary(@Param('id') id: string, @CurrentCompanyId() companyId: string) {
    return this.summaries.refreshStatus(companyId, id);
  }

  @Post('void-communications')
  @UseInterceptors(IdempotencyInterceptor)
  createVoid(@Body() dto: CreateVoidCommunicationDto, @CurrentCompanyId() companyId: string) {
    return this.voids.createAndSend(companyId, dto.referenceDate, dto.documents);
  }

  @Post('void-communications/:id/status')
  refreshVoid(@Param('id') id: string, @CurrentCompanyId() companyId: string) {
    return this.voids.refreshStatus(companyId, id);
  }
}
