import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { AdminRole } from '../auth/dto/register-admin.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ApiKeysService } from './api-keys.service';
import { CurrentApiKey } from './decorators/current-api-key.decorator';
import { CurrentCompanyId } from './decorators/current-company-id.decorator';
import { ApiKeyResponseDto } from './dto/api-key-response.dto';
import { CreateApiKeyDto } from './dto/create-api-key.dto';
import { ApiKeyGuard } from './guards/api-key.guard';
import { ApiKeyRecord } from './interfaces/api-key.interface';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { RequestId } from '../http-safety/decorators/request-id.decorator';

@ApiTags('API Keys')
@Controller('api-keys')
export class ApiKeysController {
  constructor(private readonly apiKeysService: ApiKeysService) {}

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(AdminRole.ADMIN, AdminRole.SUPERADMIN)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Generate a new API Key for a company (Admin only)',
    description: 'Requires Facturify Admin JWT. Returns the raw API key prefixed with fact_live_ or fact_test_. Save this key, it will only be shown once.',
  })
  @ApiCreatedResponse({ type: ApiKeyResponseDto })
  async create(@Body() dto: CreateApiKeyDto, @CurrentUser() actor?: JwtPayload, @RequestId() requestId?: string): Promise<ApiKeyResponseDto> {
    return this.apiKeysService.create(dto, actor?.sub, requestId);
  }

  @Get('company/:companyId')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(AdminRole.ADMIN, AdminRole.SUPERADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List all API Keys for a company (Admin only, masked)' })
  @ApiOkResponse({ type: [ApiKeyResponseDto] })
  async findByCompany(@Param('companyId') companyId: string): Promise<ApiKeyResponseDto[]> {
    return this.apiKeysService.findByCompany(companyId);
  }

  @Post(':id/rotate')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(AdminRole.ADMIN, AdminRole.SUPERADMIN)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Rotate an API Key (Admin only)',
    description: 'Immediately revokes the previous key and issues a fresh one.',
  })
  @ApiOkResponse({ type: ApiKeyResponseDto })
  async rotate(@Param('id') id: string, @CurrentUser() actor?: JwtPayload, @RequestId() requestId?: string): Promise<ApiKeyResponseDto> {
    return this.apiKeysService.rotate(id, actor?.sub, requestId);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(AdminRole.ADMIN, AdminRole.SUPERADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Revoke an API Key (Admin only)' })
  @ApiOkResponse({ type: ApiKeyResponseDto })
  async revoke(@Param('id') id: string, @CurrentUser() actor?: JwtPayload, @RequestId() requestId?: string): Promise<ApiKeyResponseDto> {
    return this.apiKeysService.revoke(id, actor?.sub, requestId);
  }

  @Get('verify')
  @UseGuards(ApiKeyGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Validate an API Key via Authorization: Bearer fact_live_...',
  })
  @ApiOkResponse({ description: 'Key is valid and active.' })
  verify(
    @CurrentCompanyId() companyId: string,
    @CurrentApiKey() keyRecord: ApiKeyRecord,
  ) {
    return {
      valid: true,
      companyId,
      keyId: keyRecord.id,
      name: keyRecord.name,
      environment: keyRecord.environment,
    };
  }
}
