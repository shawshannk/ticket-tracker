import 'dotenv/config';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb, type Db } from '../db';
import { projects } from '../db/schema';
import { TicketKeyService } from './ticket-key.service';

// Integration test — needs the Compose Postgres up (`docker compose up -d postgres`).
// Run with `pnpm run test:integration`; it is deliberately excluded from `pnpm run test`
// so the unit suite stays runnable with no database.
describe('TicketKeyService (integration)', () => {
  let db: Db;
  let service: TicketKeyService;
  let projectId: string;

  beforeAll(async () => {
    db = createDb();
    service = new TicketKeyService(db);
    const [row] = await db
      .insert(projects)
      .values({ name: `Race Test ${Date.now()}`, keyPrefix: 'ZZT', nextTicketSeq: 1 })
      .returning();
    projectId = row.id;
  });

  afterAll(async () => {
    if (projectId) {
      await db.delete(projects).where(eq(projects.id, projectId));
    }
  });

  it('allocates the first key as {prefix}-1 and advances the sequence', async () => {
    const first = await service.allocate(projectId);
    expect(first.key).toBe('ZZT-1');
    expect(first.seq).toBe(1);

    const second = await service.allocate(projectId);
    expect(second.key).toBe('ZZT-2');
  });

  it('gives distinct sequential keys to concurrent allocations', async () => {
    const before = await currentSeq();
    const CONCURRENCY = 50;

    const results = await Promise.all(
      Array.from({ length: CONCURRENCY }, () => service.allocate(projectId)),
    );

    const seqs = results.map((r) => r.seq).sort((a, b) => a - b);
    // No duplicates, and no gaps: exactly the run [before, before + CONCURRENCY).
    expect(new Set(seqs).size).toBe(CONCURRENCY);
    expect(seqs).toEqual(Array.from({ length: CONCURRENCY }, (_, i) => before + i));
    expect(new Set(results.map((r) => r.key)).size).toBe(CONCURRENCY);
    expect(await currentSeq()).toBe(before + CONCURRENCY);
  });

  it('throws NotFound for an unknown project', async () => {
    await expect(service.allocate('00000000-0000-4000-8000-000000000009')).rejects.toThrow(
      /not found/i,
    );
  });

  async function currentSeq(): Promise<number> {
    const [row] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
    return row.nextTicketSeq;
  }
});
