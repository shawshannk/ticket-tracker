import 'dotenv/config';
import { UnauthorizedException } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb, type Db } from '../db';
import { authEvents, refreshTokens, users } from '../db/schema';
import { AuditService } from './audit.service';
import { SessionService } from './session.service';
import { TokenService } from './token.service';

// Integration test — needs the Compose Postgres up. R16 (refresh rotation with reuse
// detection) is one of the two riskiest rules in this phase, per the tech spec's test plan:
// when it breaks it is completely invisible from the outside.
describe('SessionService (integration)', () => {
  let db: Db;
  let sessions: SessionService;
  let userId: string;

  beforeAll(async () => {
    db = createDb();
    const tokens = new TokenService();
    sessions = new SessionService(db, tokens, new AuditService(db));

    const [row] = await db
      .insert(users)
      .values({
        name: `Session Test ${Date.now()}`,
        email: `session-test-${Date.now()}@nimbus.io`,
        department: 'Engineering',
        role: 'developer',
        status: 'active',
      })
      .returning();
    userId = row.id;
  });

  afterAll(async () => {
    if (userId) {
      await db.delete(authEvents).where(eq(authEvents.subjectId, userId));
      await db.delete(refreshTokens).where(eq(refreshTokens.userId, userId));
      await db.delete(users).where(eq(users.id, userId));
    }
  });

  const liveTokens = (familyId: string) =>
    db
      .select()
      .from(refreshTokens)
      .where(and(eq(refreshTokens.familyId, familyId), eq(refreshTokens.userId, userId)));

  it('issues a session whose raw token is never stored', async () => {
    const session = await sessions.issue(userId, { ip: '10.0.0.1', userAgent: 'vitest' });

    const rows = await liveTokens(session.familyId);
    expect(rows).toHaveLength(1);
    expect(rows[0].tokenHash).not.toBe(session.refreshToken);
    expect(rows[0].usedAt).toBeNull();
    expect(rows[0].revokedAt).toBeNull();
    expect(await sessions.isFamilyActive(session.familyId)).toBe(true);
  });

  it('rotates: the old token is consumed and a new one joins the same family', async () => {
    const first = await sessions.issue(userId);
    const second = await sessions.rotate(first.refreshToken);

    expect(second.familyId).toBe(first.familyId); // same session
    expect(second.refreshToken).not.toBe(first.refreshToken); // new credential
    expect(second.userId).toBe(userId);

    const rows = await liveTokens(first.familyId);
    expect(rows).toHaveLength(2);
    expect(rows.filter((r) => r.usedAt !== null)).toHaveLength(1);
  });

  it('rotates repeatedly, keeping one live token per session', async () => {
    let current = await sessions.issue(userId);
    for (let i = 0; i < 5; i++) {
      current = { ...current, ...(await sessions.rotate(current.refreshToken)) };
    }
    const rows = await liveTokens(current.familyId);
    expect(rows).toHaveLength(6);
    expect(rows.filter((r) => r.usedAt === null && r.revokedAt === null)).toHaveLength(1);
    expect(await sessions.isFamilyActive(current.familyId)).toBe(true);
  });

  // R16, the heart of it.
  it('treats a replayed token as theft: revokes the whole family and audits it', async () => {
    const first = await sessions.issue(userId);
    const second = await sessions.rotate(first.refreshToken);

    // The attacker replays the token they stole before the victim rotated it.
    await expect(sessions.rotate(first.refreshToken)).rejects.toBeInstanceOf(UnauthorizedException);

    const rows = await liveTokens(first.familyId);
    expect(rows.every((r) => r.revokedAt !== null)).toBe(true);
    expect(await sessions.isFamilyActive(first.familyId)).toBe(false);

    // The victim's freshly-rotated token dies too — that is the point, not a side effect.
    await expect(sessions.rotate(second.refreshToken)).rejects.toBeInstanceOf(UnauthorizedException);

    const events = await db
      .select()
      .from(authEvents)
      .where(and(eq(authEvents.subjectId, userId), eq(authEvents.type, 'refresh_reuse')));
    expect(events.length).toBeGreaterThanOrEqual(1);
    expect(events.at(-1)!.metadata).toMatchObject({ familyId: first.familyId });
  });

  it('rejects an unknown token', async () => {
    await expect(sessions.rotate('not-a-real-token')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects a revoked session', async () => {
    const session = await sessions.issue(userId);
    await sessions.revokeFamily(session.familyId);

    await expect(sessions.rotate(session.refreshToken)).rejects.toThrow(/revoked/);
    expect(await sessions.isFamilyActive(session.familyId)).toBe(false);
  });

  it('rejects an expired token without calling it reuse', async () => {
    const session = await sessions.issue(userId);
    await db
      .update(refreshTokens)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(refreshTokens.familyId, session.familyId));

    await expect(sessions.rotate(session.refreshToken)).rejects.toThrow(/expired/);
  });

  // R15: revocation must be immediate, not "when the token expires".
  it('revokeAllForUser ends every session, optionally sparing the current one', async () => {
    const a = await sessions.issue(userId);
    const b = await sessions.issue(userId);
    const keep = await sessions.issue(userId);

    await sessions.revokeAllForUser(userId, keep.familyId);

    expect(await sessions.isFamilyActive(a.familyId)).toBe(false);
    expect(await sessions.isFamilyActive(b.familyId)).toBe(false);
    expect(await sessions.isFamilyActive(keep.familyId)).toBe(true);

    await sessions.revokeAllForUser(userId);
    expect(await sessions.isFamilyActive(keep.familyId)).toBe(false);
  });

  it('lists one row per session, newest first, flagging the current one', async () => {
    await sessions.revokeAllForUser(userId);
    const older = await sessions.issue(userId, { ip: '10.0.0.1', userAgent: 'browser-a' });
    await sessions.rotate(older.refreshToken); // rotation must not create a second row
    const newer = await sessions.issue(userId, { ip: '10.0.0.2', userAgent: 'browser-b' });

    const list = await sessions.listForUser(userId, newer.familyId);

    expect(list).toHaveLength(2);
    expect(list[0]).toMatchObject({ id: newer.familyId, userAgent: 'browser-b', current: true });
    expect(list[1]).toMatchObject({ id: older.familyId, userAgent: 'browser-a', current: false });
  });

  it('concurrent rotations of the same token do not both succeed', async () => {
    // Two tabs refreshing at once. The row lock must serialise them: one wins, and the loser
    // must not be able to also rotate — otherwise a session could fork in two.
    const session = await sessions.issue(userId);
    const results = await Promise.allSettled([
      sessions.rotate(session.refreshToken),
      sessions.rotate(session.refreshToken),
    ]);

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
  });
});
