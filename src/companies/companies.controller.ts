import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiCreatedResponse, ApiTags } from '@nestjs/swagger';
import { AdminRole, Company } from '@prisma/client';
import { CompaniesService } from './companies.service';
import { CreateCompanyDto } from './dto/create-company.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { ApiBearerAuth } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import { RequestId } from '../http-safety/decorators/request-id.decorator';

@ApiTags('Companies')
@Controller('companies')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(AdminRole.ADMIN, AdminRole.SUPERADMIN)
@ApiBearerAuth()
export class CompaniesController {
  constructor(private readonly companies: CompaniesService) {}

  @Post()
  @ApiCreatedResponse({ description: 'Company registered.' })
  create(@Body() input: CreateCompanyDto, @CurrentUser() actor?: JwtPayload, @RequestId() requestId?: string): Promise<Company> {
    return this.companies.create(input, actor?.sub, requestId);
  }

  @Get()
  findAll(): Promise<Company[]> {
    return this.companies.findAll();
  }
}
