import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { and, eq, isNull, lte, sql } from 'drizzle-orm';
import type { Db, DbExecutor } from '../db';
import { DB } from '../db/db.module';
import { invites, users } from '../db/schema';
import { AuditService } from './audit.service';
import { TokenService } from './token.service';

export interface IssuedInvite {
  /** The raw token — shown to the admin once and never stored in plaintext (spec 10 §4.1). */
  token: string;
  expiresAt: Date;
}

function parseTtlDays(value: string | undefined, fallbackDays: number): number {
  const match = /^(\d+)d$/.exec(value ?? '');
  return match ? Number(match[1]) : fallbackDays;
}

@Injectable()
export class InviteService {
  private readonly ttlDays = parseTtlDays(process.env.AUTH_INVITE_TTL, 7);

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly tokens: TokenService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Issue an activation link for a user, expiring any outstanding ones.
   *
   * The expiry step is the point: a "password reset" here is a re-issued invite (spec 10 §4.4),
   * so without it a link the user reported as lost would stay usable alongside its replacement.
   */
  async issue(userId: string, createdBy: string, executor: DbExecutor = this.db): Promise<IssuedInvite> {
    const token = randomBytes(32).toString('base64url');
    const tokenHash = this.tokens.hashRefreshToken(token);
    const expiresAt = new Date(Date.now() + this.ttlDays * 24 * 60 * 60 * 1000);

    await executor
      .update(invites)
      .set({ expiresAt: new Date() })
      .where(and(eq(invites.userId, userId), isNull(invites.acceptedAt)));

    await executor.insert(invites).values({ userId, tokenHash, expiresAt, createdBy });

    await this.audit.record(
      { type: 'invite_issued', actorId: createdBy, subjectId: userId },
      executor,
    );

    return { token, expiresAt };
  }

  /**
   * Resolve a presented token to the user it activates, and consume it.
   *
   * Every failure — unknown, expired, already used — raises the same error, because spec 10 §4.1
   * requires one neutral message. Distinguishing them would let someone probe which links exist.
   * Runs in a transaction so a token cannot be accepted twice concurrently.
   */
  async accept(token: string, executor?: DbExecutor): Promise<{ userId: string }> {
    const tokenHash = this.tokens.hashRefreshToken(token);
    const invalid = () =>
      new UnauthorizedException('This invite link is no longer valid. Ask an administrator to send you a new one.');

    const run = async (tx: DbExecutor) => {
      const [row] = await tx
        .select()
        .from(invites)
        .where(eq(invites.tokenHash, tokenHash))
        .limit(1)
        .for('update');

      if (!row || row.acceptedAt || row.expiresAt.getTime() <= Date.now()) {
        throw invalid();
      }

      await tx.update(invites).set({ acceptedAt: new Date() }).where(eq(invites.id, row.id));
      await this.audit.record({ type: 'invite_accepted', actorId: row.userId, subjectId: row.userId }, tx);

      return { userId: row.userId };
    };

    return executor ? run(executor) : this.db.transaction(run);
  }

  /**
   * Read a live invite without consuming it, so the acceptance page can address the person by
   * the email the link was issued for (spec 10 §6).
   *
   * Safe to expose publicly: the token *is* the secret, and anyone holding it is already about
   * to see the address on the next screen. Invalid, expired and already-accepted tokens raise
   * the same neutral error `accept()` uses — the page must not become a probe for which links
   * exist, and a caller who gets past this still has to present the token again to accept.
   */
  async preview(token: string): Promise<{ email: string; name: string }> {
    const tokenHash = this.tokens.hashRefreshToken(token);

    const [row] = await this.db
      .select({
        email: users.email,
        name: users.name,
        acceptedAt: invites.acceptedAt,
        expiresAt: invites.expiresAt,
      })
      .from(invites)
      .innerJoin(users, eq(users.id, invites.userId))
      .where(eq(invites.tokenHash, tokenHash))
      .limit(1);

    if (!row || row.acceptedAt || row.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException(
        'This invite link is no longer valid. Ask an administrator to send you a new one.',
      );
    }

    return { email: row.email, name: row.name };
  }

  /** Housekeeping for the retention gap noted in the tech spec §10; unused until then. */
  async purgeExpired(before: Date = new Date()): Promise<number> {
    const rows = await this.db
      .delete(invites)
      .where(and(lte(invites.expiresAt, before), isNull(invites.acceptedAt)))
      .returning({ id: invites.id });
    return rows.length;
  }

  /** True if the user has a live, unaccepted invite — the People view shows this as "invited". */
  async hasPending(userId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: invites.id })
      .from(invites)
      .where(
        and(
          eq(invites.userId, userId),
          isNull(invites.acceptedAt),
          sql`${invites.expiresAt} > now()`,
        ),
      )
      .limit(1);
    return Boolean(row);
  }
}
