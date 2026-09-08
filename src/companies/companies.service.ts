import { ConflictException, Injectable } from '@nestjs/common';
import { Company } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCompanyDto } from './dto/create-company.dto';
import { PeruValidationService } from '../peru-validation/peru-validation.service';

@Injectable()
export class CompaniesService {
  constructor(private readonly prisma: PrismaService, private readonly peruValidation?: PeruValidationService) {}

  async create(input: CreateCompanyDto): Promise<Company> {
    this.peruValidation?.assertValidRuc(input.ruc);
    try {
      return await this.prisma.company.create({ data: input });
    } catch (error: unknown) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002') {
        throw new ConflictException('A company with this RUC already exists.');
      }
      throw error;
    }
  }

  findAll(): Promise<Company[]> {
    return this.prisma.company.findMany({ orderBy: { createdAt: 'desc' } });
  }
}
