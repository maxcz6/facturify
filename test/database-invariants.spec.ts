import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

describe('initial database migration invariants', () => {
  let migration: string;

  beforeAll(async () => {
    migration = await readFile(
      join(process.cwd(), 'prisma', 'migrations', '20260907223000_init', 'migration.sql'),
      'utf8',
    );
  });

  it('enforces one active certificate per company at database level', () => {
    expect(migration).toContain('"DigitalCertificate_one_active_per_company_key"');
    expect(migration).toMatch(/ON "DigitalCertificate"\("companyId"\) WHERE "active" = true/);
  });

  it('enforces positive document and line values', () => {
    expect(migration).toContain('"Document_number_positive_check"');
    expect(migration).toContain('"Document_total_consistent_check"');
    expect(migration).toContain('"DocumentItem_quantity_positive_check"');
    expect(migration).toContain('"DocumentItem_unitPrice_positive_check"');
  });

  it('enforces valid polling and outbox counters', () => {
    expect(migration).toContain('"DailySummary_pollAttempt_nonnegative_check"');
    expect(migration).toContain('"VoidCommunication_pollAttempt_nonnegative_check"');
    expect(migration).toContain('"OutboxEvent_maxAttempts_positive_check"');
  });
});
