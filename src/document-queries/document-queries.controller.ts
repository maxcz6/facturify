import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentCompanyId } from '../api-keys/decorators/current-company-id.decorator';
import { ApiKeyGuard } from '../api-keys/guards/api-key.guard';
import { DocumentQueriesService } from './document-queries.service';
import {
  DocumentQueryResponseDto,
  PaginatedDocumentsResponseDto,
} from './dto/document-query-response.dto';
import { ListDocumentsQueryDto } from './dto/list-documents-query.dto';

@ApiTags('Document Queries')
@Controller('documents')
@UseGuards(ApiKeyGuard)
@ApiBearerAuth()
export class DocumentQueriesController {
  constructor(
    private readonly documentQueriesService: DocumentQueriesService,
  ) {}

  @Get(':id')
  @ApiOperation({
    summary: 'Retrieve electronic document by ID with items and artifact availability',
    description:
      'Company is strictly derived from the authenticated API Key. Never returns internal artifact IDs or filesystem paths.',
  })
  @ApiParam({ name: 'id', description: 'Internal document UUID' })
  @ApiOkResponse({
    type: DocumentQueryResponseDto,
    description: 'Document details and calculated amounts.',
  })
  async findOne(
    @Param('id') id: string,
    @CurrentCompanyId() companyId: string,
  ): Promise<DocumentQueryResponseDto> {
    return this.documentQueriesService.findById(companyId, id);
  }

  @Get()
  @ApiOperation({
    summary: 'Query and list electronic documents with cursor-based pagination and safe filters',
    description:
      'Company is strictly derived from the authenticated API Key. Supports cursor pagination and filters by status, type, series, and creation date range.',
  })
  @ApiOkResponse({
    type: PaginatedDocumentsResponseDto,
    description: 'Paginated list of documents with cursor and availability flags.',
  })
  async findMany(
    @CurrentCompanyId() companyId: string,
    @Query() query: ListDocumentsQueryDto,
  ): Promise<PaginatedDocumentsResponseDto> {
    return this.documentQueriesService.findMany(companyId, query);
  }
}
