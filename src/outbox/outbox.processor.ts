import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OutboxService } from './outbox.service';

@Injectable()
export class OutboxProcessor implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(OutboxProcessor.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    private readonly outbox: OutboxService,
    private readonly config: ConfigService,
  ) {}

  onApplicationBootstrap(): void {
    const intervalMs = this.readInteger('OUTBOX_POLL_INTERVAL_MS', 5_000, 1_000, 60_000);
    this.timer = setInterval(() => void this.tick(), intervalMs);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const batchSize = this.readInteger('OUTBOX_BATCH_SIZE', 20, 1, 100);
      await this.outbox.processBatch(batchSize);
    } catch {
      this.logger.error('Outbox processing cycle failed.');
    } finally {
      this.running = false;
    }
  }

  private readInteger(key: string, fallback: number, min: number, max: number): number {
    const parsed = Number(this.config.get<string>(key));
    return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
  }
}
