import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ApiKey,
  ApiKeyEnvironment,
  ApiKeyStatus,
} from '@prisma/client';
import * as crypto from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { CreateApiKeyDto } from './dto/create-api-key.dto';
import { AuditEventBuilderService } from '../audit-events/audit-events.service';
import { AuditEventWriterService } from '../audit-events/audit-events-writer.service';
import {
  ApiKeyRecord,
  CreatedApiKeyResult,
} from './interfaces/api-key.interface';

@Injectable()
export class ApiKeysService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditBuilder?: AuditEventBuilderService,
    private readonly auditWriter?: AuditEventWriterService,
  ) {}

  async create(dto: CreateApiKeyDto, actorId?: string, requestId?: string): Promise<CreatedApiKeyResult> {
    const company = await this.prisma.company.findUnique({
      where: { id: dto.companyId },
    });
    if (!company) {
      throw new NotFoundException('Company not found.');
    }

    const envEnum =
      dto.environment === 'test'
        ? ApiKeyEnvironment.TEST
        : ApiKeyEnvironment.LIVE;

    const prefix = envEnum === ApiKeyEnvironment.TEST ? 'fact_test_' : 'fact_live_';
    const randomPart = crypto.randomBytes(24).toString('base64url');
    const rawKey = `${prefix}${randomPart}`;
    const keyHash = this.hashKey(rawKey);
    const lastFour = rawKey.slice(-4);

    const record = await this.prisma.apiKey.create({
      data: {
        companyId: dto.companyId,
        name: dto.name,
        keyHash,
        prefix,
        lastFour,
        environment: envEnum,
        status: ApiKeyStatus.ACTIVE,
      },
    });
    await this.appendAudit('api_key.created', actorId, record.companyId, requestId);

    return {
      id: record.id,
      companyId: record.companyId,
      name: record.name,
      apiKey: rawKey,
      prefix: record.prefix,
      lastFour: record.lastFour,
      environment: record.environment.toLowerCase() as 'live' | 'test',
      status: record.status as 'ACTIVE' | 'REVOKED',
      createdAt: record.createdAt,
    };
  }

  async validateKey(rawKey: string): Promise<ApiKeyRecord | null> {
    if (!rawKey.startsWith('fact_live_') && !rawKey.startsWith('fact_test_')) {
      return null;
    }

    const keyHash = this.hashKey(rawKey);
    const record = await this.prisma.apiKey.findUnique({
      where: { keyHash },
    });

    if (!record || record.status !== ApiKeyStatus.ACTIVE) {
      return null;
    }

    if (record.expiresAt && record.expiresAt < new Date()) {
      return null;
    }

    // Update last used timestamp
    const updated = await this.prisma.apiKey.update({
      where: { id: record.id },
      data: { lastUsedAt: new Date() },
    });

    return this.mapToRecord(updated);
  }

  async rotate(id: string, actorId?: string, requestId?: string): Promise<CreatedApiKeyResult> {
    const existing = await this.prisma.apiKey.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('API Key not found.');
    }

    const prefix = existing.environment === ApiKeyEnvironment.TEST ? 'fact_test_' : 'fact_live_';
    const rawKey = `${prefix}${crypto.randomBytes(24).toString('base64url')}`;
    const created = await this.prisma.$transaction(async (tx) => {
      await tx.apiKey.update({ where: { id }, data: { status: ApiKeyStatus.REVOKED, revokedAt: new Date() } });
      return tx.apiKey.create({ data: {
        companyId: existing.companyId, name: `${existing.name} (Rotated)`,
        keyHash: this.hashKey(rawKey), prefix, lastFour: rawKey.slice(-4),
        environment: existing.environment, status: ApiKeyStatus.ACTIVE,
      } });
    });
    await this.appendAudit('api_key.rotated', actorId, created.companyId, requestId);
    return {
      id: created.id, companyId: created.companyId, name: created.name, apiKey: rawKey,
      prefix: created.prefix, lastFour: created.lastFour,
      environment: created.environment.toLowerCase() as 'live' | 'test',
      status: created.status as 'ACTIVE' | 'REVOKED', createdAt: created.createdAt,
    };
  }

  async revoke(id: string, actorId?: string, requestId?: string): Promise<ApiKeyRecord> {
    const existing = await this.prisma.apiKey.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundException('API Key not found.');
    }

    const updated = await this.prisma.apiKey.update({
      where: { id },
      data: {
        status: ApiKeyStatus.REVOKED,
        revokedAt: new Date(),
      },
    });
    await this.appendAudit('api_key.revoked', actorId, updated.companyId, requestId);

    return this.mapToRecord(updated);
  }

  async findByCompany(companyId: string): Promise<ApiKeyRecord[]> {
    const records = await this.prisma.apiKey.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
    });

    return records.map((r) => this.mapToRecord(r));
  }

  async findById(id: string): Promise<ApiKeyRecord> {
    const record = await this.prisma.apiKey.findUnique({ where: { id } });
    if (!record) {
      throw new NotFoundException('API Key not found.');
    }
    return this.mapToRecord(record);
  }

  private hashKey(key: string): string {
    return crypto.createHash('sha256').update(key).digest('hex');
  }

  private mapToRecord(record: ApiKey): ApiKeyRecord {
    return {
      id: record.id,
      companyId: record.companyId,
      name: record.name,
      prefix: record.prefix,
      lastFour: record.lastFour,
      environment: record.environment.toLowerCase() as 'live' | 'test',
      status: record.status as 'ACTIVE' | 'REVOKED',
      createdAt: record.createdAt,
      lastUsedAt: record.lastUsedAt ?? undefined,
      revokedAt: record.revokedAt ?? undefined,
    };
  }

  private async appendAudit(
    action: 'api_key.created' | 'api_key.rotated' | 'api_key.revoked',
    actorId: string | undefined,
    companyId: string,
    requestId?: string,
  ): Promise<void> {
    if (!actorId || !this.auditBuilder || !this.auditWriter) return;
    await this.auditWriter.append(this.auditBuilder.buildApiKeyAction({
      action, actorId, companyId, requestId,
    }));
  }
}
