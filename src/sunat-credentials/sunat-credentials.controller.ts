import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Put,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { AdminRole } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { SaveSunatCredentialsDto } from './dto/save-sunat-credentials.dto';
import {
  DeleteSunatCredentialsResponseDto,
  SunatCredentialsStatusResponseDto,
} from './dto/sunat-credentials-response.dto';
import { SunatCredentialsService } from './sunat-credentials.service';

@ApiTags('Companies - SUNAT Credentials')
@Controller('companies/:companyId/sunat-credentials')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(AdminRole.ADMIN, AdminRole.SUPERADMIN)
@ApiBearerAuth()
export class SunatCredentialsController {
  constructor(private readonly sunatCredentialsService: SunatCredentialsService) {}

  @Put()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Register or update SUNAT SOL credentials for a company (Admin only)',
    description:
      'Stores credentials encrypted at rest using AES-256-GCM. Never exposes passwords, ciphertext, IV, or auth tag.',
  })
  @ApiParam({ name: 'companyId', description: 'Company UUID' })
  @ApiOkResponse({
    type: SunatCredentialsStatusResponseDto,
    description: 'Credentials successfully configured. Safe status metadata is returned.',
  })
  async update(
    @Param('companyId') companyId: string,
    @Body() dto: SaveSunatCredentialsDto,
  ): Promise<SunatCredentialsStatusResponseDto> {
    return this.sunatCredentialsService.upsert(companyId, dto);
  }

  @Get('status')
  @ApiOperation({
    summary: 'Get configuration status of SUNAT SOL credentials for a company (Admin only)',
    description:
      'Returns whether credentials are configured and a masked username. Never reveals secrets.',
  })
  @ApiParam({ name: 'companyId', description: 'Company UUID' })
  @ApiOkResponse({
    type: SunatCredentialsStatusResponseDto,
    description: 'Configuration status and safe metadata.',
  })
  async getStatus(
    @Param('companyId') companyId: string,
  ): Promise<SunatCredentialsStatusResponseDto> {
    return this.sunatCredentialsService.getStatus(companyId);
  }

  @Delete()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Delete SUNAT SOL credentials for a company (Admin only)',
    description:
      'Deletes stored credentials and responds with { configured: false }.',
  })
  @ApiParam({ name: 'companyId', description: 'Company UUID' })
  @ApiOkResponse({
    type: DeleteSunatCredentialsResponseDto,
    description: 'Credentials deleted successfully.',
  })
  async delete(
    @Param('companyId') companyId: string,
  ): Promise<DeleteSunatCredentialsResponseDto> {
    return this.sunatCredentialsService.delete(companyId);
  }
}
