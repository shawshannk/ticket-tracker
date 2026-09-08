import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import type { Db, DbExecutor } from '../db';
import { DB } from '../db/db.module';
import { projects } from '../db/schema';

export interface AllocatedKey {
  /** The human-readable ticket key, e.g. `NIM-1`. */
  key: string;
  /** The sequence number inside `key`, for callers that want it separately. */
  seq: number;
  projectId: string;
}

/**
 * Allocates per-project ticket keys (`{key_prefix}-{seq}`, spec 02 / D-key: one sequence
 * per project, type-agnostic).
 *
 * Race safety comes from doing the read and the increment in a single atomic
 * `UPDATE ... RETURNING` — Postgres takes a row lock for the duration, so concurrent
 * allocations against the same project serialize instead of both reading the same value.
 * Never split this into a SELECT followed by an UPDATE.
 */
@Injectable()
export class TicketKeyService {
  constructor(@Inject(DB) private readonly db: Db) {}

  /**
   * @param executor pass a transaction handle to allocate inside the caller's transaction,
   *   so a failed ticket insert rolls the sequence back with it (M5).
   */
  async allocate(projectId: string, executor: DbExecutor = this.db): Promise<AllocatedKey> {
    const [row] = await executor
      .update(projects)
      .set({ nextTicketSeq: sql`${projects.nextTicketSeq} + 1` })
      .where(eq(projects.id, projectId))
      .returning({ keyPrefix: projects.keyPrefix, nextTicketSeq: projects.nextTicketSeq });

    if (!row) {
      throw new NotFoundException(`Project ${projectId} not found`);
    }

    // RETURNING yields post-update values, so the number this call gets to use is one less.
    const seq = row.nextTicketSeq - 1;
    return { key: `${row.keyPrefix}-${seq}`, seq, projectId };
  }
}
