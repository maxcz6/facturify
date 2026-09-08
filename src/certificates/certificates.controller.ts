import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { AdminRole } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CertificateResponseDto } from './dto/certificate-response.dto';
import { RegisterCertificateDto } from './dto/register-certificate.dto';
import { CertificatesService } from './certificates.service';

@ApiTags('Certificates')
@Controller('certificates')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(AdminRole.ADMIN, AdminRole.SUPERADMIN)
@ApiBearerAuth()
export class CertificatesController {
  constructor(private readonly certificatesService: CertificatesService) {}

  @Post()
  @ApiOperation({
    summary: 'Register and activate a digital certificate for a company (Admin only)',
    description:
      'Stores encrypted PKCS#12 bundle and password via AES-256-GCM. Deactivates previous active certificate atomically.',
  })
  @ApiCreatedResponse({
    type: CertificateResponseDto,
    description: 'Certificate successfully registered. Only safe metadata is returned.',
  })
  async register(
    @Body() dto: RegisterCertificateDto,
  ): Promise<CertificateResponseDto> {
    return this.certificatesService.register(dto);
  }

  @Post('company/:companyId')
  @ApiOperation({
    summary: 'Register and activate a digital certificate for a company with URL companyId',
  })
  @ApiParam({ name: 'companyId', description: 'Company UUID' })
  @ApiCreatedResponse({ type: CertificateResponseDto })
  async registerForCompany(
    @Param('companyId') companyId: string,
    @Body() dto: RegisterCertificateDto,
  ): Promise<CertificateResponseDto> {
    return this.certificatesService.register({ ...dto, companyId });
  }

  @Get('company/:companyId')
  @ApiOperation({
    summary: 'List all digital certificates for a company (Admin only)',
    description: 'Returns safe metadata only. Secrets are never exposed.',
  })
  @ApiParam({ name: 'companyId', description: 'Company UUID' })
  @ApiOkResponse({
    type: [CertificateResponseDto],
    description: 'List of certificates for the specified company.',
  })
  async listByCompany(
    @Param('companyId') companyId: string,
  ): Promise<CertificateResponseDto[]> {
    return this.certificatesService.listByCompany(companyId);
  }

  @Patch(':id/deactivate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Deactivate a digital certificate (Admin only)',
  })
  @ApiParam({ name: 'id', description: 'Certificate UUID' })
  @ApiOkResponse({
    type: CertificateResponseDto,
    description: 'Certificate marked as inactive.',
  })
  async deactivate(
    @Param('id') id: string,
    @Query('companyId') queryCompanyId?: string,
    @Body('companyId') bodyCompanyId?: string,
  ): Promise<CertificateResponseDto> {
    const companyId = queryCompanyId || bodyCompanyId;
    return this.certificatesService.deactivate(id, companyId);
  }

  @Patch('company/:companyId/:id/deactivate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Deactivate a digital certificate with company isolation in URL',
  })
  @ApiParam({ name: 'companyId', description: 'Company UUID' })
  @ApiParam({ name: 'id', description: 'Certificate UUID' })
  @ApiOkResponse({ type: CertificateResponseDto })
  async deactivateWithCompany(
    @Param('companyId') companyId: string,
    @Param('id') id: string,
  ): Promise<CertificateResponseDto> {
    return this.certificatesService.deactivate(id, companyId);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Deactivate a digital certificate via DELETE (Admin only alias)',
  })
  @ApiParam({ name: 'id', description: 'Certificate UUID' })
  @ApiOkResponse({ type: CertificateResponseDto })
  async delete(
    @Param('id') id: string,
    @Query('companyId') queryCompanyId?: string,
  ): Promise<CertificateResponseDto> {
    return this.certificatesService.deactivate(id, queryCompanyId);
  }
}
