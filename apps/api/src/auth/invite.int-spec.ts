import 'dotenv/config';
import { UnauthorizedException } from '@nestjs/common';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb, type Db } from '../db';
import { authEvents, invites, users } from '../db/schema';
import { AuditService } from './audit.service';
import { InviteService } from './invite.service';
import { TokenService } from './token.service';

// Integration test — needs the Compose Postgres up.
describe('InviteService (integration)', () => {
  let db: Db;
  let service: InviteService;
  let userId: string;
  let adminId: string;

  beforeAll(async () => {
    db = createDb();
    service = new InviteService(db, new TokenService(), new AuditService(db));

    const stamp = Date.now();
    const [invitee] = await db
      .insert(users)
      .values({
        name: `Invite Test ${stamp}`,
        email: `invite-test-${stamp}@nimbus.io`,
        department: 'Engineering',
        role: 'developer',
      })
      .returning();
    const [admin] = await db
      .insert(users)
      .values({
        name: `Invite Admin ${stamp}`,
        email: `invite-admin-${stamp}@nimbus.io`,
        department: 'Engineering Leadership',
        role: 'admin',
        status: 'active',
      })
      .returning();
    userId = invitee.id;
    adminId = admin.id;
  });

  afterAll(async () => {
    for (const id of [userId, adminId].filter(Boolean)) {
      await db.delete(authEvents).where(eq(authEvents.subjectId, id));
      await db.delete(authEvents).where(eq(authEvents.actorId, id));
      await db.delete(invites).where(eq(invites.userId, id));
      await db.delete(users).where(eq(users.id, id));
    }
  });

  it('issues a token that is stored only as a digest', async () => {
    const { token, expiresAt } = await service.issue(userId, adminId);

    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(expiresAt.getTime()).toBeGreaterThan(Date.now());

    const rows = await db.select().from(invites).where(eq(invites.userId, userId));
    expect(rows).toHaveLength(1);
    expect(rows[0].tokenHash).not.toBe(token);
    expect(rows[0].acceptedAt).toBeNull();
    expect(await service.hasPending(userId)).toBe(true);
  });

  it('records who issued it (R19)', async () => {
    const events = await db
      .select()
      .from(authEvents)
      .where(and(eq(authEvents.subjectId, userId), eq(authEvents.type, 'invite_issued')));
    expect(events.length).toBeGreaterThanOrEqual(1);
    expect(events.at(-1)!.actorId).toBe(adminId);
  });

  it('accepts once, and resolves to the right user', async () => {
    const { token } = await service.issue(userId, adminId);
    expect(await service.accept(token)).toEqual({ userId });

    const [row] = await db
      .select()
      .from(invites)
      .where(eq(invites.userId, userId))
      .orderBy(desc(invites.createdAt))
      .limit(1);
    expect(row.acceptedAt).not.toBeNull();
    expect(await service.hasPending(userId)).toBe(false);
  });

  it('refuses a second use of the same link', async () => {
    const { token } = await service.issue(userId, adminId);
    await service.accept(token);
    await expect(service.accept(token)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  // Spec 10 §4.4: re-issuing is how a lost password is recovered, so the old link must die.
  it('issuing a new invite kills the outstanding one', async () => {
    const first = await service.issue(userId, adminId);
    const second = await service.issue(userId, adminId);

    await expect(service.accept(first.token)).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(service.accept(second.token)).resolves.toEqual({ userId });
  });

  it('refuses an expired link', async () => {
    const { token } = await service.issue(userId, adminId);
    await db
      .update(invites)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(and(eq(invites.userId, userId), isNull(invites.acceptedAt)));

    await expect(service.accept(token)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('gives one neutral message for unknown, expired and used links', async () => {
    // Spec 10 §4.1: distinguishing them would let someone probe which links exist.
    const messages: string[] = [];

    const capture = (promise: Promise<unknown>): Promise<string> =>
      promise.then(() => 'resolved-unexpectedly').catch((e: Error) => e.message);

    messages.push(await capture(service.accept('not-a-real-invite-token')));

    const { token } = await service.issue(userId, adminId);
    await service.accept(token);
    messages.push(await capture(service.accept(token)));

    expect(new Set(messages).size).toBe(1);
    expect(messages[0]).toMatch(/no longer valid/);
  });

  it('concurrent acceptances of one link: exactly one wins', async () => {
    const { token } = await service.issue(userId, adminId);
    const results = await Promise.allSettled([service.accept(token), service.accept(token)]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  });
});
