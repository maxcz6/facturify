import {
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  DEFAULT_HEALTH_TIMEOUT_MS,
  HealthResponse,
} from './health.constants';

@Injectable()
export class HealthService {
  constructor(private readonly prisma?: PrismaService) {}

  /**
   * Liveness probe:
   * Confirms the node process is alive without querying any external dependencies.
   */
  getLiveness(): HealthResponse {
    return Object.freeze({
      status: 'ok',
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Readiness probe:
   * Verifies connectivity to PostgreSQL via PrismaService using a minimal query (SELECT 1).
   * Applies an internal timeout to avoid hanging connections.
   * If PostgreSQL is unavailable or times out, throws ServiceUnavailableException (HTTP 503)
   * with strictly sanitized public body { status: 'unavailable', timestamp: '...' }.
   * Never leaks host, port, database name, credentials, env vars, paths, or stack traces.
   */
  async getReadiness(timeoutMs: number = DEFAULT_HEALTH_TIMEOUT_MS): Promise<HealthResponse> {
    const timestamp = new Date().toISOString();

    if (!this.prisma) {
      throw new ServiceUnavailableException({
        status: 'unavailable',
        timestamp,
      });
    }

    try {
      await this.executeWithTimeout(
        this.prisma.$queryRaw`SELECT 1`,
        timeoutMs
      );

      return Object.freeze({
        status: 'ok',
        timestamp,
      });
    } catch {
      // Intentionally discard any error object, message, code or stack trace
      throw new ServiceUnavailableException({
        status: 'unavailable',
        timestamp: new Date().toISOString(),
      });
    }
  }

  private async executeWithTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    let timer: NodeJS.Timeout | null = null;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(new Error('TIMEOUT'));
      }, timeoutMs);
    });

    try {
      return await Promise.race([promise, timeoutPromise]);
    } finally {
      if (timer) {
        clearTimeout(timer);
      }
    }
  }
}
