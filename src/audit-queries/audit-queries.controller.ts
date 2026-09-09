import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuditQueriesService } from './audit-queries.service';
import {
  ListAuditEventsQuery,
  PaginatedAuditEventsResponseDto,
} from './dto/audit-event-query.dto';

@ApiTags('Audit Queries')
@Controller('audit-events')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(AdminRole.ADMIN, AdminRole.SUPERADMIN)
@ApiBearerAuth()
export class AuditQueriesController {
  constructor(private readonly auditQueriesService: AuditQueriesService) {}

  @Get()
  @ApiOperation({
    summary: 'Query administrative audit events with cursor-based pagination and safe filters',
    description:
      'Protected by JwtAuthGuard and RolesGuard (ADMIN/SUPERADMIN). Never leaks internal database IDs, IP addresses, credentials or request bodies.',
  })
  @ApiOkResponse({
    description: 'Paginated list of administrative audit events with opaque nextCursor.',
  })
  async listAuditEvents(
    @Query() query: ListAuditEventsQuery,
  ): Promise<PaginatedAuditEventsResponseDto> {
    return this.auditQueriesService.listAuditEvents(query);
  }
}
