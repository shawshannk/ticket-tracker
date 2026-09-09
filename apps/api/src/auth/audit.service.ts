import { Inject, Injectable } from '@nestjs/common';
import type { Db, DbExecutor } from '../db';
import { DB } from '../db/db.module';
import { authEvents } from '../db/schema';

/**
 * R19: everything that grants, uses or removes authority leaves a trace. The table is
 * append-only by convention — nothing here updates or deletes.
 */
export type AuthEventType =
  | 'login'
  | 'login_failed'
  | 'logout'
  | 'invite_issued'
  | 'invite_accepted'
  | 'password_changed'
  | 'role_changed'
  | 'membership_changed'
  | 'user_disabled'
  | 'refresh_reuse';

export interface AuthEventInput {
  type: AuthEventType;
  /** Who acted. Null for anonymous events such as a failed login. */
  actorId?: string | null;
  /** Who it was done to. Equals actorId for self-service actions. */
  subjectId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  /** Never credentials (R17). For `login_failed`, the attempted email and nothing else. */
  metadata?: Record<string, unknown>;
}

@Injectable()
export class AuditService {
  constructor(@Inject(DB) private readonly db: Db) {}

  /**
   * Accepts an executor so a caller can enlist the event in its own transaction — reuse
   * detection must record and revoke atomically, or a rollback would hide the attack.
   */
  async record(input: AuthEventInput, executor: DbExecutor = this.db): Promise<void> {
    await executor.insert(authEvents).values({
      type: input.type,
      actorId: input.actorId ?? null,
      subjectId: input.subjectId ?? null,
      ip: input.ip ?? null,
      userAgent: input.userAgent ?? null,
      metadata: input.metadata ?? null,
    });
  }
}
