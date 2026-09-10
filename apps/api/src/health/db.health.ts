import { Inject, Injectable } from '@nestjs/common';
import { HealthCheckError, HealthIndicator, type HealthIndicatorResult } from '@nestjs/terminus';
import { sql } from 'drizzle-orm';
import type { Db } from '../db';
import { DB } from '../db/db.module';

/**
 * The readiness check that `GET /health` never had. Before M22 the endpoint returned
 * `{status:'ok'}` unconditionally and stayed green with Postgres down, so an orchestrator would
 * route traffic to an instance that could not serve a single request.
 */
@Injectable()
export class DatabaseHealthIndicator extends HealthIndicator {
  constructor(@Inject(DB) private readonly db: Db) {
    super();
  }

  async pingCheck(key: string, timeoutMs = 2000): Promise<HealthIndicatorResult> {
    const started = Date.now();
    try {
      // A bounded wait, because an unreachable database fails by hanging far more often than by
      // refusing — and a readiness probe that hangs is indistinguishable from one that passes
      // until the orchestrator's own timeout fires.
      await withTimeout(this.db.execute(sql`select 1`), timeoutMs);
      return this.getStatus(key, true, { durationMs: Date.now() - started });
    } catch (err) {
      const result = this.getStatus(key, false, {
        durationMs: Date.now() - started,
        // Safe: this response is not public — /health/ready is reachable only from inside the
        // deployment — and an operator needs to know *why* readiness failed.
        message: err instanceof Error ? err.message : 'unknown error',
      });
      throw new HealthCheckError('Database check failed', result);
    }
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}
