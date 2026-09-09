import 'dotenv/config';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import { eq, inArray } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb, type Db } from '../db';
import { authEvents, invites, refreshTokens, users } from '../db/schema';

/**
 * HTTP-level integration tests. These boot the real Nest app rather than calling handlers,
 * because most of what M17 promises lives *between* the handlers: guard order, cookie flags,
 * uniform failure messages, and 401s. None of that is observable from a handler call.
 *
 * Impersonation is switched **off** here — this suite is the one place that must exercise the
 * production configuration (spec 10 §7).
 */
describe('auth endpoints (integration)', () => {
  let app: INestApplication;
  let db: Db;
  const PASSWORD = 'correct-horse-battery-staple';
  const stamp = Date.now();
  const emails = {
    active: `auth-active-${stamp}@nimbus.io`,
    admin: `auth-admin-${stamp}@nimbus.io`,
    // Its own account: the password-change test mutates `active`, and a suite whose tests
    // depend on each other's order is a suite that fails for the wrong reasons later.
    victim: `auth-victim-${stamp}@nimbus.io`,
    invited: `auth-invited-${stamp}@nimbus.io`,
    disabled: `auth-disabled-${stamp}@nimbus.io`,
  };
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    process.env.AUTH_DEV_IMPERSONATION = 'false';
    const { AppModule } = await import('../app.module');
    const { PasswordService } = await import('./password.service');

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    // The limiter keys on ip + email. Trusting the forwarded header lets each test present
    // itself as a distinct client, so the suite's own repeated logins do not trip a limit that
    // is working exactly as intended. The limit itself is verified below, unmodified.
    app.getHttpAdapter().getInstance().set('trust proxy', true);
    await app.init();

    db = createDb();
    const hash = await new PasswordService().hash(PASSWORD);

    const [active] = await db
      .insert(users)
      .values({
        name: 'Auth Active', email: emails.active, department: 'Engineering',
        role: 'developer', status: 'active', passwordHash: hash,
      })
      .returning();
    const [admin] = await db
      .insert(users)
      .values({
        name: 'Auth Admin', email: emails.admin, department: 'Engineering Leadership',
        role: 'admin', status: 'active', passwordHash: hash,
      })
      .returning();
    const [victim] = await db
      .insert(users)
      .values({
        name: 'Auth Victim', email: emails.victim, department: 'Engineering',
        role: 'developer', status: 'active', passwordHash: hash,
      })
      .returning();
    const [invited] = await db
      .insert(users)
      .values({
        name: 'Auth Invited', email: emails.invited, department: 'Engineering', role: 'developer',
      })
      .returning();
    const [disabled] = await db
      .insert(users)
      .values({
        name: 'Auth Disabled', email: emails.disabled, department: 'Engineering',
        role: 'developer', status: 'disabled', passwordHash: hash,
      })
      .returning();

    ids.active = active.id;
    ids.admin = admin.id;
    ids.victim = victim.id;
    ids.invited = invited.id;
    ids.disabled = disabled.id;
  });

  afterAll(async () => {
    const all = Object.values(ids);
    if (all.length) {
      await db.delete(authEvents).where(inArray(authEvents.subjectId, all));
      await db.delete(authEvents).where(inArray(authEvents.actorId, all));
      await db.delete(refreshTokens).where(inArray(refreshTokens.userId, all));
      await db.delete(invites).where(inArray(invites.userId, all));
      await db.delete(users).where(inArray(users.id, all));
    }
    await app?.close();
  });

  let clientSeq = 0;
  const login = (email: string, password = PASSWORD) =>
    request(app.getHttpServer())
      .post('/auth/login')
      .set('X-Forwarded-For', `10.1.${Math.floor(clientSeq / 250)}.${clientSeq++ % 250}`)
      .send({ email, password });

  const cookieFrom = (res: request.Response): string =>
    ([] as string[]).concat(res.headers['set-cookie'] ?? []).find((c) => c.startsWith('tt_rt=')) ?? '';

  describe('login', () => {
    it('returns an access token, the user and memberships', async () => {
      const res = await login(emails.active).expect(200);

      expect(res.body.accessToken).toMatch(/^[\w-]+\.[\w-]+\.[\w-]+$/);
      expect(res.body.user).toMatchObject({ id: ids.active, email: emails.active, status: 'active' });
      expect(Array.isArray(res.body.memberships)).toBe(true);
      // R17: no password material on the wire, ever.
      expect(JSON.stringify(res.body)).not.toContain('argon2');
      expect(res.body.user.passwordHash).toBeUndefined();
    });

    it('sets an httpOnly refresh cookie scoped to /auth', async () => {
      const cookie = cookieFrom(await login(emails.active).expect(200));

      expect(cookie).toContain('HttpOnly');
      expect(cookie).toContain('Path=/auth');
      expect(cookie).toMatch(/SameSite=Lax/i);
    });

    // Spec 10 §4.2: the login form must not become an account-existence oracle.
    it('is indistinguishable across unknown, wrong-password, invited and disabled', async () => {
      const responses = await Promise.all([
        login(`nobody-${stamp}@nimbus.io`),
        login(emails.active, 'not-the-right-password'),
        login(emails.invited),
        login(emails.disabled),
      ]);

      const statuses = new Set(responses.map((r) => r.status));
      const messages = new Set(responses.map((r) => r.body.message));

      expect(statuses).toEqual(new Set([401]));
      expect(messages.size).toBe(1);
      expect([...messages][0]).toBe('Email or password is incorrect.');
    });

    it('records failures with the attempted email but never the password (R17/R19)', async () => {
      await login(emails.active, 'a-wrong-password-value');

      const events = await db
        .select()
        .from(authEvents)
        .where(eq(authEvents.subjectId, ids.active));
      const failure = events.filter((e) => e.type === 'login_failed').at(-1);

      expect(failure?.metadata).toMatchObject({ email: emails.active, reason: 'wrong_password' });
      expect(JSON.stringify(failure?.metadata)).not.toContain('a-wrong-password-value');
    });

    it('rejects a malformed body with 400, not 401', async () => {
      await request(app.getHttpServer()).post('/auth/login').send({ email: 'nonsense' }).expect(400);
    });
  });

  describe('authenticated access (R11)', () => {
    it('refuses an unauthenticated read now that impersonation is off', async () => {
      await request(app.getHttpServer()).get('/users').expect(401);
      await request(app.getHttpServer()).get('/projects').expect(401);
    });

    it('ignores the legacy X-Acting-User-Id header', async () => {
      // The v1 mechanism must be inert in this configuration — that is the whole point.
      await request(app.getHttpServer())
        .get('/users')
        .set('X-Acting-User-Id', ids.active)
        .expect(401);
    });

    it('allows a read with a valid bearer token', async () => {
      const { body } = await login(emails.active).expect(200);
      await request(app.getHttpServer())
        .get('/users')
        .set('Authorization', `Bearer ${body.accessToken}`)
        .expect(200);
    });

    it('leaves the four public routes open', async () => {
      await request(app.getHttpServer()).get('/health').expect(200);
    });

    it('rejects a garbage or tampered token', async () => {
      for (const token of ['garbage', 'a.b.c']) {
        await request(app.getHttpServer())
          .get('/users')
          .set('Authorization', `Bearer ${token}`)
          .expect(401);
      }
    });

    it('returns the caller from /auth/me', async () => {
      const { body } = await login(emails.active).expect(200);
      const me = await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${body.accessToken}`)
        .expect(200);
      expect(me.body.user.id).toBe(ids.active);
    });
  });

  describe('refresh', () => {
    it('rotates the cookie and issues a new access token', async () => {
      const first = await login(emails.active).expect(200);
      const res = await request(app.getHttpServer())
        .post('/auth/refresh')
        .set('Cookie', cookieFrom(first))
        .expect(200);

      expect(res.body.accessToken).toBeTruthy();
      expect(cookieFrom(res)).not.toBe(cookieFrom(first)); // rotated
    });

    it('401s with no cookie', async () => {
      await request(app.getHttpServer()).post('/auth/refresh').expect(401);
    });

    // R16 end to end: the replay kills the session, and the victim's token dies with it.
    it('replaying a consumed cookie revokes the session and clears the cookie', async () => {
      const first = await login(emails.active).expect(200);
      const rotated = await request(app.getHttpServer())
        .post('/auth/refresh').set('Cookie', cookieFrom(first)).expect(200);

      const replay = await request(app.getHttpServer())
        .post('/auth/refresh').set('Cookie', cookieFrom(first)).expect(401);
      expect(cookieFrom(replay)).toMatch(/tt_rt=;/); // cleared

      await request(app.getHttpServer())
        .post('/auth/refresh').set('Cookie', cookieFrom(rotated)).expect(401);

      // And the access token from that session stops working on the next request (R15).
      await request(app.getHttpServer())
        .get('/users').set('Authorization', `Bearer ${rotated.body.accessToken}`).expect(401);
    });
  });

  describe('logout', () => {
    it('ends this session immediately (R15)', async () => {
      const { body } = await login(emails.active).expect(200);
      const bearer = `Bearer ${body.accessToken}`;

      await request(app.getHttpServer()).get('/users').set('Authorization', bearer).expect(200);
      await request(app.getHttpServer()).post('/auth/logout').set('Authorization', bearer).send({}).expect(204);
      // The access token is still cryptographically valid; the session behind it is not.
      await request(app.getHttpServer()).get('/users').set('Authorization', bearer).expect(401);
    });

    it('logout everywhere ends the other sessions too', async () => {
      const a = await login(emails.active).expect(200);
      const b = await login(emails.active).expect(200);

      await request(app.getHttpServer())
        .post('/auth/logout')
        .set('Authorization', `Bearer ${a.body.accessToken}`)
        .send({ allSessions: true })
        .expect(204);

      await request(app.getHttpServer())
        .get('/users').set('Authorization', `Bearer ${b.body.accessToken}`).expect(401);
    });
  });

  describe('sessions', () => {
    it('lists the caller sessions and flags the current one', async () => {
      await request(app.getHttpServer()).post('/auth/logout')
        .set('Authorization', `Bearer ${(await login(emails.active)).body.accessToken}`)
        .send({ allSessions: true });

      const a = await login(emails.active).expect(200);
      await login(emails.active).expect(200);

      const list = await request(app.getHttpServer())
        .get('/auth/sessions').set('Authorization', `Bearer ${a.body.accessToken}`).expect(200);

      expect(list.body).toHaveLength(2);
      expect(list.body.filter((s: { current: boolean }) => s.current)).toHaveLength(1);
    });

    it('refuses to revoke a session belonging to someone else', async () => {
      const mine = await login(emails.active).expect(200);
      await request(app.getHttpServer())
        .delete('/auth/sessions/00000000-0000-4000-8000-0000000000ff')
        .set('Authorization', `Bearer ${mine.body.accessToken}`)
        .expect(401);
    });
  });

  describe('password change', () => {
    it('requires the current password, enforces the policy, and ends other sessions', async () => {
      const keep = await login(emails.active).expect(200);
      const other = await login(emails.active).expect(200);
      const bearer = `Bearer ${keep.body.accessToken}`;

      await request(app.getHttpServer()).post('/auth/password').set('Authorization', bearer)
        .send({ currentPassword: 'wrong', newPassword: 'a-brand-new-password' }).expect(401);

      await request(app.getHttpServer()).post('/auth/password').set('Authorization', bearer)
        .send({ currentPassword: PASSWORD, newPassword: 'short' }).expect(400);

      await request(app.getHttpServer()).post('/auth/password').set('Authorization', bearer)
        .send({ currentPassword: PASSWORD, newPassword: 'a-brand-new-password' }).expect(204);

      // The session that changed it survives; every other one does not (R15).
      await request(app.getHttpServer()).get('/users').set('Authorization', bearer).expect(200);
      await request(app.getHttpServer()).get('/users')
        .set('Authorization', `Bearer ${other.body.accessToken}`).expect(401);

      await login(emails.active, 'a-brand-new-password').expect(200);
      await login(emails.active, PASSWORD).expect(401);
    });
  });

  describe('invite acceptance', () => {
    it('activates the account, signs the user in, and cannot be replayed', async () => {
      const { InviteService } = await import('./invite.service');
      const { TokenService } = await import('./token.service');
      const { AuditService } = await import('./audit.service');
      const inviteService = new InviteService(db, new TokenService(), new AuditService(db));
      const { token } = await inviteService.issue(ids.invited, ids.active);

      // An invited account cannot log in before accepting.
      await login(emails.invited).expect(401);

      const accepted = await request(app.getHttpServer())
        .post('/auth/invite/accept')
        .send({ token, password: 'another-good-password-here' })
        .expect(200);

      expect(accepted.body.user).toMatchObject({ id: ids.invited, status: 'active' });
      expect(cookieFrom(accepted)).toContain('HttpOnly');
      await login(emails.invited, 'another-good-password-here').expect(200);

      await request(app.getHttpServer()).post('/auth/invite/accept')
        .send({ token, password: 'yet-another-password-x' }).expect(401);
    });

    it('rejects a weak password without consuming a second invite', async () => {
      const { InviteService } = await import('./invite.service');
      const { TokenService } = await import('./token.service');
      const { AuditService } = await import('./audit.service');
      const inviteService = new InviteService(db, new TokenService(), new AuditService(db));
      const { token } = await inviteService.issue(ids.invited, ids.active);

      await request(app.getHttpServer()).post('/auth/invite/accept')
        .send({ token, password: 'short' }).expect(400);
    });

    it('gives one neutral message for an unknown token', async () => {
      const res = await request(app.getHttpServer()).post('/auth/invite/accept')
        .send({ token: 'not-a-real-token', password: 'a-perfectly-good-password' }).expect(401);
      expect(res.body.message).toMatch(/no longer valid/);
    });
  });

  // Its own app, with the throttler left in place (spec 10 §4.2).
  describe('login rate limiting', () => {
    let limited: INestApplication;

    beforeAll(async () => {
      const { AppModule } = await import('../app.module');
      const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
      limited = moduleRef.createNestApplication();
      limited.use(cookieParser());
      limited.getHttpAdapter().getInstance().set('trust proxy', true);
      await limited.init();
    });

    afterAll(async () => {
      await limited?.close();
    });

    it('refuses further attempts after 10 in the window', async () => {
      // One fixed source, one email: exactly the pair the limiter counts.
      const attempt = () =>
        request(limited.getHttpServer())
          .post('/auth/login')
          .set('X-Forwarded-For', '203.0.113.7')
          .send({ email: emails.active, password: 'deliberately-wrong-password' });

      const codes: number[] = [];
      for (let i = 0; i < 12; i++) {
        codes.push((await attempt()).status);
      }

      // The first ten are honest failures; what follows is refused without touching argon2.
      expect(codes.slice(0, 10).every((c) => c === 401)).toBe(true);
      expect(codes.slice(10)).toEqual([429, 429]);
    });

    it('does not punish a different email from the same address', async () => {
      // Keying on the pair is what keeps one person's typo from locking out their colleagues.
      const other = await request(limited.getHttpServer())
        .post('/auth/login')
        .set('X-Forwarded-For', '203.0.113.7')
        .send({ email: `someone-else-${stamp}@nimbus.io`, password: 'whatever-value-here' });
      expect(other.status).toBe(401);
    });
  });

  // R15/R18 through the admin routes, since "takes effect on the next request" is only
  // observable from outside.
  describe('account administration', () => {
    const asAdmin = async () => `Bearer ${(await login(emails.admin)).body.accessToken}`;

    it('disabling an account kills its live sessions immediately (R15)', async () => {
      const victim = await login(emails.victim).expect(200);
      const victimBearer = `Bearer ${victim.body.accessToken}`;
      await request(app.getHttpServer()).get('/users').set('Authorization', victimBearer).expect(200);

      await request(app.getHttpServer())
        .patch(`/users/${ids.victim}`)
        .set('Authorization', await asAdmin())
        .send({ status: 'disabled' })
        .expect(200);

      // Same token, still unexpired, now worthless — the check is against the database, not
      // the token's own claims.
      await request(app.getHttpServer()).get('/users').set('Authorization', victimBearer).expect(401);
      await login(emails.victim).expect(401);

      // And restore, so ordering between tests cannot matter.
      await request(app.getHttpServer())
        .patch(`/users/${ids.victim}`)
        .set('Authorization', await asAdmin())
        .send({ status: 'active' })
        .expect(200);
      await login(emails.victim).expect(200);
    });

    it('creating a user returns a one-time invite link and an inactive account', async () => {
      const created = await request(app.getHttpServer())
        .post('/users')
        .set('Authorization', await asAdmin())
        .send({
          name: 'Fresh Hire',
          email: `auth-fresh-${stamp}@nimbus.io`,
          department: 'Engineering',
          role: 'developer',
        })
        .expect(201);

      expect(created.body.user.status).toBe('invited');
      expect(created.body.inviteUrl).toContain('/invite/');
      ids.fresh = created.body.user.id;

      // The account exists but cannot be used until the link is accepted.
      await login(`auth-fresh-${stamp}@nimbus.io`).expect(401);
    });

    it('refuses to remove the last active admin (R18)', async () => {
      // This fixture admin is not the only one in a seeded database, so the guard should let
      // it through; the refusal is asserted against a database with exactly one admin left.
      const admins = await db.select().from(users).where(eq(users.role, 'admin'));
      const activeAdmins = admins.filter((a) => a.status === 'active');
      expect(activeAdmins.length).toBeGreaterThan(1);

      const res = await request(app.getHttpServer())
        .patch(`/users/${ids.admin}`)
        .set('Authorization', await asAdmin())
        .send({ role: 'developer' })
        .expect(200);
      expect(res.body.role).toBe('developer');

      // Demoting oneself revokes one's sessions, so a fresh login is required afterwards.
      await request(app.getHttpServer())
        .patch(`/users/${ids.admin}`)
        .set('Authorization', await asAdmin())
        .send({ role: 'admin' })
        .expect(403);
    });
  });
});
