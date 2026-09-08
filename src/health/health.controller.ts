import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiOkResponse, ApiServiceUnavailableResponse, ApiTags } from '@nestjs/swagger';
import { HealthService } from './health.service';
import { HealthResponse } from './health.constants';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  /**
   * Root /health endpoint for backward compatibility
   */
  @Get()
  @ApiOkResponse({
    description: 'API operational status',
    schema: { example: { status: 'ok', timestamp: '2026-09-08T15:00:00.000Z' } },
  })
  getHealth(): HealthResponse {
    return this.healthService.getLiveness();
  }

  /**
   * GET /health/live
   * Liveness check: confirms process is active without querying external dependencies.
   * Public endpoint, no auth required.
   */
  @Get('live')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({
    description: 'Process is alive and running',
    schema: { example: { status: 'ok', timestamp: '2026-09-08T15:00:00.000Z' } },
  })
  getLive(): HealthResponse {
    return this.healthService.getLiveness();
  }

  /**
   * GET /health/ready
   * Readiness check: tests minimal PostgreSQL connectivity via PrismaService with timeout.
   * Public endpoint, no auth required.
   * Returns 200 OK or 503 Service Unavailable.
   */
  @Get('ready')
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({
    description: 'PostgreSQL database connection is ready',
    schema: { example: { status: 'ok', timestamp: '2026-09-08T15:00:00.000Z' } },
  })
  @ApiServiceUnavailableResponse({
    description: 'PostgreSQL database connection is unavailable',
    schema: { example: { status: 'unavailable', timestamp: '2026-09-08T15:00:00.000Z' } },
  })
  async getReady(): Promise<HealthResponse> {
    return this.healthService.getReadiness();
  }
}
