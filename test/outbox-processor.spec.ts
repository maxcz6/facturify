import { ConfigService } from '@nestjs/config';
import { OutboxProcessor } from '../src/outbox/outbox.processor';

describe('OutboxProcessor', () => {
  const outbox = { processBatch: jest.fn() };
  const values: Record<string, string> = {};
  const config = { get: jest.fn((key: string) => values[key]) } as unknown as ConfigService;
  let processor: OutboxProcessor;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    for (const key of Object.keys(values)) delete values[key];
    outbox.processBatch.mockResolvedValue({ processed: 0 });
    processor = new OutboxProcessor(outbox as never, config);
  });

  afterEach(() => {
    processor.onModuleDestroy();
    jest.useRealTimers();
  });

  it('processes configured batches on the interval without running immediately', async () => {
    values.OUTBOX_POLL_INTERVAL_MS = '1000';
    values.OUTBOX_BATCH_SIZE = '7';
    processor.onApplicationBootstrap();
    expect(outbox.processBatch).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(1000);
    expect(outbox.processBatch).toHaveBeenCalledWith(7);
  });

  it('prevents overlapping processing cycles', async () => {
    let finish!: () => void;
    outbox.processBatch.mockReturnValue(new Promise<void>((resolve) => { finish = resolve; }));
    const first = processor.tick();
    await processor.tick();
    expect(outbox.processBatch).toHaveBeenCalledTimes(1);
    finish();
    await first;
  });

  it('contains failures and permits the next cycle', async () => {
    outbox.processBatch.mockRejectedValueOnce(new Error('database secret')).mockResolvedValueOnce({ processed: 0 });
    await expect(processor.tick()).resolves.toBeUndefined();
    await expect(processor.tick()).resolves.toBeUndefined();
    expect(outbox.processBatch).toHaveBeenCalledTimes(2);
  });
});
