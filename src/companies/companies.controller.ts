import { Body, Controller, Get, Post } from '@nestjs/common';
import { ApiCreatedResponse, ApiTags } from '@nestjs/swagger';
import { Company } from '@prisma/client';
import { CompaniesService } from './companies.service';
import { CreateCompanyDto } from './dto/create-company.dto';

@ApiTags('Companies')
@Controller('companies')
export class CompaniesController {
  constructor(private readonly companies: CompaniesService) {}

  @Post()
  @ApiCreatedResponse({ description: 'Company registered.' })
  create(@Body() input: CreateCompanyDto): Promise<Company> {
    return this.companies.create(input);
  }

  @Get()
  findAll(): Promise<Company[]> {
    return this.companies.findAll();
  }
}
