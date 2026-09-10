import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { SessionSummary } from '@ticket-tracker/shared';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import type { Db } from '../db';
import { DB } from '../db/db.module';
import { refreshTokens } from '../db/schema';
import { AuditService } from './audit.service';
import { TokenService } from './token.service';

/** Where the request came from, recorded on each token so the sessions view is useful. */
export interface SessionContext {
  ip?: string | null;
  userAgent?: string | null;
}

export interface IssuedSession {
  /** The raw token — returned once, to be set as a cookie. Only its hash is stored. */
  refreshToken: string;
  /** The session id: constant across every rotation, and the access token's `sid`. */
  familyId: string;
  expiresAt: Date;
}

function parseTtlDays(value: string | undefined, fallbackDays: number): number {
  const match = /^(\d+)d$/.exec(value ?? '');
  return match ? Number(match[1]) : fallbackDays;
}

/**
 * How long after a refresh token is consumed a re-presentation of it is still forgiven, rather
 * than read as theft (see the long note in `rotate`).
 *
 * Ten seconds is chosen to cover a lost `Set-Cookie` — a request the server completed but the
 * browser abandoned mid-navigation — and nothing longer. A stolen token is not replayed inside
 * ten seconds of the victim's own use by accident; if it is, the attacker still has to win a
 * race for a single live token and trips detection on the next round.
 */
const REPLAY_GRACE_MS = Number(process.env.AUTH_REFRESH_GRACE_MS ?? 10_000);

@Injectable()
export class SessionService {
  private readonly refreshTtlDays = parseTtlDays(process.env.AUTH_REFRESH_TTL, 30);

  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly tokens: TokenService,
    private readonly audit: AuditService,
  ) {}

  private expiry(): Date {
    return new Date(Date.now() + this.refreshTtlDays * 24 * 60 * 60 * 1000);
  }

  /** Starts a new session (a new family). Called on login and on invite acceptance. */
  async issue(userId: string, ctx: SessionContext = {}): Promise<IssuedSession> {
    const { token, tokenHash } = this.tokens.generateRefreshToken();
    const familyId = randomUUID();
    const expiresAt = this.expiry();

    await this.db.insert(refreshTokens).values({
      userId,
      familyId,
      tokenHash,
      expiresAt,
      ip: ctx.ip ?? null,
      userAgent: ctx.userAgent ?? null,
    });

    return { refreshToken: token, familyId, expiresAt };
  }

  /**
   * Consume one refresh token and issue its successor (R16).
   *
   * The whole decision runs in a single transaction that takes a row lock on the presented
   * token. Without the lock, two tabs refreshing at the same moment could both read the token
   * as unused, both rotate it, and the session would fork in two.
   *
   * **The transaction returns a verdict; it never throws.** Throwing inside `db.transaction`
   * rolls the transaction back — which on the reuse path would undo the very revocation and
   * audit record that make reuse detection meaningful, leaving a stolen session alive while the
   * response still said 401. So the failure is decided inside and raised after the commit.
   */
  /**
   * Consume `current` and issue its successor in the same family. Extracted because rotation now
   * happens from two places: the ordinary path, and the forgiven-replay path, which rotates from
   * the family's live head rather than from the token the caller presented.
   */
  private async issueSuccessor(
    tx: Parameters<Parameters<Db['transaction']>[0]>[0],
    current: { id: string; userId: string; familyId: string },
    ctx: SessionContext,
  ): Promise<{ refreshToken: string; expiresAt: Date }> {
    const { token, tokenHash } = this.tokens.generateRefreshToken();
    const expiresAt = this.expiry();

    await tx.update(refreshTokens).set({ usedAt: new Date() }).where(eq(refreshTokens.id, current.id));

    // Same family: the rolling window means continuous use never expires, but 30 days of
    // silence does (spec 10 §4.3).
    await tx.insert(refreshTokens).values({
      userId: current.userId,
      familyId: current.familyId,
      tokenHash,
      expiresAt,
      ip: ctx.ip ?? null,
      userAgent: ctx.userAgent ?? null,
    });

    return { refreshToken: token, expiresAt };
  }

  async rotate(
    presentedToken: string,
    ctx: SessionContext = {},
  ): Promise<{ userId: string; familyId: string } & IssuedSession> {
    const tokenHash = this.tokens.hashRefreshToken(presentedToken);

    type Verdict =
      | { ok: true; value: { userId: string; familyId: string } & IssuedSession }
      | { ok: false; reason: 'unknown' | 'reuse' | 'revoked' | 'expired' };

    const verdict: Verdict = await this.db.transaction(async (tx) => {
      const [row] = await tx
        .select()
        .from(refreshTokens)
        .where(eq(refreshTokens.tokenHash, tokenHash))
        .limit(1)
        .for('update');

      if (!row) {
        return { ok: false, reason: 'unknown' };
      }

      // This token was already exchanged. Two very different things look identical here.
      //
      // **The benign one, and why it is not rare.** The web app holds its access token in memory
      // only, so every full page load exchanges the refresh cookie for a new one. If the page
      // navigates away while that request is in flight, the server has already rotated but the
      // browser never receives the `Set-Cookie` — so the *next* page load presents the token
      // that was just consumed, through no fault of anyone. Reloading during startup or opening
      // two tabs at once does it. Treating that as theft logs the person out of every device for
      // pressing F5 at the wrong moment.
      //
      // **The dangerous one** is a token replayed later, by someone who kept a copy. That is
      // what R16 is for, and it stays fully covered: only a replay within GRACE_MS of the
      // token's own use, on a family that still has a live token, is forgiven — and forgiving it
      // *consumes* that live token, so a thief racing inside the window still ends up fighting
      // the real client for a single valid token and trips detection on the next round.
      if (row.usedAt) {
        const withinGrace = Date.now() - row.usedAt.getTime() <= REPLAY_GRACE_MS;

        const [live] = withinGrace
          ? await tx
              .select()
              .from(refreshTokens)
              .where(
                and(
                  eq(refreshTokens.familyId, row.familyId),
                  isNull(refreshTokens.usedAt),
                  isNull(refreshTokens.revokedAt),
                ),
              )
              .limit(1)
              .for('update')
          : [];

        if (live && live.expiresAt.getTime() > Date.now()) {
          // Re-rotate from the family's current head, so the caller leaves with a cookie it
          // actually received. Audited as its own event type — indistinguishable from theft in
          // the moment, so it must not be invisible afterwards.
          const replacement = await this.issueSuccessor(tx, live, ctx);

          await this.audit.record(
            {
              type: 'refresh_replay_forgiven',
              subjectId: row.userId,
              ip: ctx.ip,
              userAgent: ctx.userAgent,
              metadata: { familyId: row.familyId, tokenId: row.id, graceMs: REPLAY_GRACE_MS },
            },
            tx,
          );

          return { ok: true, value: { userId: row.userId, familyId: row.familyId, ...replacement } };
        }

        // Outside the window, or the family has nothing live left: read it as theft and revoke
        // the entire family, so the thief and the victim both have to log in again.
        await tx
          .update(refreshTokens)
          .set({ revokedAt: new Date() })
          .where(and(eq(refreshTokens.familyId, row.familyId), isNull(refreshTokens.revokedAt)));

        await this.audit.record(
          {
            type: 'refresh_reuse',
            subjectId: row.userId,
            ip: ctx.ip,
            userAgent: ctx.userAgent,
            metadata: { familyId: row.familyId, tokenId: row.id },
          },
          tx,
        );

        return { ok: false, reason: 'reuse' };
      }

      if (row.revokedAt) {
        return { ok: false, reason: 'revoked' };
      }

      if (row.expiresAt.getTime() <= Date.now()) {
        return { ok: false, reason: 'expired' };
      }

      const issued = await this.issueSuccessor(tx, row, ctx);

      return {
        ok: true,
        value: { userId: row.userId, familyId: row.familyId, ...issued },
      };
    });

    if (verdict.ok) {
      return verdict.value;
    }

    switch (verdict.reason) {
      case 'reuse':
        throw new UnauthorizedException('Refresh token has already been used');
      case 'revoked':
        throw new UnauthorizedException('Session has been revoked');
      case 'expired':
        throw new UnauthorizedException('Session has expired');
      default:
        throw new UnauthorizedException('Invalid refresh token');
    }
  }

  /** True while the session has at least one live token — what AuthGuard checks per request. */
  async isFamilyActive(familyId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: refreshTokens.id })
      .from(refreshTokens)
      .where(
        and(
          eq(refreshTokens.familyId, familyId),
          isNull(refreshTokens.revokedAt),
          sql`${refreshTokens.expiresAt} > now()`,
        ),
      )
      .limit(1);
    return Boolean(row);
  }

  /** Ends one session. */
  async revokeFamily(familyId: string): Promise<void> {
    await this.db
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(and(eq(refreshTokens.familyId, familyId), isNull(refreshTokens.revokedAt)));
  }

  /**
   * Ends every session for a user. This is what makes R15 true: disabling an account or
   * changing a password must not wait for a token to expire.
   */
  async revokeAllForUser(userId: string, exceptFamilyId?: string): Promise<void> {
    const conditions = [eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt)];
    if (exceptFamilyId) {
      conditions.push(sql`${refreshTokens.familyId} <> ${exceptFamilyId}`);
    }
    await this.db.update(refreshTokens).set({ revokedAt: new Date() }).where(and(...conditions));
  }

  /**
   * One row per *session*, not per token — a family that has rotated fifty times is still one
   * place you are signed in. Reports the family's first issuance and its latest activity.
   */
  async listForUser(userId: string, currentFamilyId?: string): Promise<SessionSummary[]> {
    const rows = await this.db
      .select({
        familyId: refreshTokens.familyId,
        issuedAt: sql<Date>`min(${refreshTokens.issuedAt})`,
        lastSeenAt: sql<Date>`max(${refreshTokens.issuedAt})`,
        // FILTER skips nulls: a rotation need not carry the request context, and a session
        // whose newest row happens to lack one must still report the device it was last known
        // to be on rather than "unknown".
        userAgent: sql<string | null>`(array_agg(${refreshTokens.userAgent} ORDER BY ${refreshTokens.issuedAt} DESC) FILTER (WHERE ${refreshTokens.userAgent} IS NOT NULL))[1]`,
        ip: sql<string | null>`(array_agg(${refreshTokens.ip} ORDER BY ${refreshTokens.issuedAt} DESC) FILTER (WHERE ${refreshTokens.ip} IS NOT NULL))[1]`,
      })
      .from(refreshTokens)
      .where(
        and(
          eq(refreshTokens.userId, userId),
          isNull(refreshTokens.revokedAt),
          sql`${refreshTokens.expiresAt} > now()`,
        ),
      )
      .groupBy(refreshTokens.familyId)
      .orderBy(desc(sql`max(${refreshTokens.issuedAt})`));

    return rows.map((row) => ({
      id: row.familyId,
      userAgent: row.userAgent,
      ip: row.ip,
      issuedAt: new Date(row.issuedAt).toISOString(),
      current: row.familyId === currentFamilyId,
    }));
  }
}
