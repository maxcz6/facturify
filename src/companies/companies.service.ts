import { ConflictException, Injectable } from '@nestjs/common';
import { Company } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCompanyDto } from './dto/create-company.dto';
import { PeruValidationService } from '../peru-validation/peru-validation.service';
import { AuditEventBuilderService } from '../audit-events/audit-events.service';
import { AuditEventWriterService } from '../audit-events/audit-events-writer.service';

@Injectable()
export class CompaniesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly peruValidation?: PeruValidationService,
    private readonly auditBuilder?: AuditEventBuilderService,
    private readonly auditWriter?: AuditEventWriterService,
  ) {}

  async create(input: CreateCompanyDto, actorId?: string, requestId?: string): Promise<Company> {
    this.peruValidation?.assertValidRuc(input.ruc);
    try {
      const company = await this.prisma.company.create({ data: input });
      if (actorId && this.auditBuilder && this.auditWriter) {
        await this.auditWriter.append(this.auditBuilder.buildCompanyCreated({
          actorId, companyId: company.id, requestId,
        }));
      }
      return company;
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
