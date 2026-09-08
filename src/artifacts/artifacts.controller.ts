import {
  Controller,
  Get,
  Param,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger';
import { Response } from 'express';
import { CurrentCompanyId } from '../api-keys/decorators/current-company-id.decorator';
import { ApiKeyGuard } from '../api-keys/guards/api-key.guard';
import { ArtifactsService } from './artifacts.service';

@ApiTags('Artifacts')
@Controller('documents')
@UseGuards(ApiKeyGuard)
@ApiBearerAuth()
export class ArtifactsController {
  constructor(private readonly artifactsService: ArtifactsService) {}

  @Get(':id/xml')
  @ApiOperation({
    summary: 'Download generated XML artifact for an electronic document',
    description: 'Retrieves the official signed XML for the document owned by the authenticated company.',
  })
  @ApiParam({ name: 'id', description: 'Internal document UUID' })
  @ApiProduces('application/xml')
  @ApiOkResponse({ description: 'Binary XML document.' })
  async getXml(
    @Param('id') id: string,
    @CurrentCompanyId() companyId: string,
    @Res() res: Response,
  ): Promise<void> {
    const result = await this.artifactsService.getXml(companyId, id);

    res.setHeader('Content-Type', result.mimeType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${result.filename}"`,
    );
    res.setHeader('Content-Length', result.sizeBytes.toString());
    res.setHeader('ETag', `"${result.sha256}"`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, max-age=86400');

    res.send(result.buffer);
  }

  @Get(':id/cdr')
  @ApiOperation({
    summary: 'Download SUNAT CDR (Constancia de Recepción) ZIP artifact',
    description: 'Retrieves the official SUNAT CDR response package for the document owned by the authenticated company.',
  })
  @ApiParam({ name: 'id', description: 'Internal document UUID' })
  @ApiProduces('application/zip')
  @ApiOkResponse({ description: 'Binary CDR ZIP package.' })
  async getCdr(
    @Param('id') id: string,
    @CurrentCompanyId() companyId: string,
    @Res() res: Response,
  ): Promise<void> {
    const result = await this.artifactsService.getCdr(companyId, id);

    res.setHeader('Content-Type', result.mimeType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${result.filename}"`,
    );
    res.setHeader('Content-Length', result.sizeBytes.toString());
    res.setHeader('ETag', `"${result.sha256}"`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, max-age=86400');

    res.send(result.buffer);
  }
}
