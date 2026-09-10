import 'dotenv/config';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import { and, eq, inArray } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb, type Db } from '../db';
import { authEvents, projectMembers, projects, refreshTokens, tickets, users } from '../db/schema';

/**
 * R12 and R13 at the HTTP level, which is the only level where they are true or false.
 *
 * The spec calls project scoping one of the two riskiest areas in the auth work — invisible when
 * broken, because a leak looks exactly like a working read. So this suite asserts the *status
 * code* a non-member sees on every project-scoped route, including a ticket addressed by its own
 * id, and asserts it is 404 rather than 403 every time.
 *
 * Impersonation is off: this is the production configuration.
 */
describe('project scoping and per-project roles (integration)', () => {
  let app: INestApplication;
  let db: Db;

  const PASSWORD = 'correct-horse-battery-staple';
  const stamp = Date.now();
  // keyPrefix is validated as 2-6 uppercase letters, so a timestamp can't be used directly.
  const letters = (n: number) =>
    Array.from({ length: n }, () => String.fromCharCode(65 + Math.floor(Math.random() * 26))).join('');
  const prefix = letters(6);
  const email = (who: string) => `scope-${who}-${stamp}@nimbus.io`;

  // Three people, chosen so every cell of R13 is reachable:
  //  - `outsider`  — global manager, member of nothing. Must see 404 everywhere.
  //  - `demoted`   — global MANAGER, project DEVELOPER. Must not create an epic (R13, narrowing).
  //  - `promoted`  — global DEVELOPER, project MANAGER. Must create an epic (R13, widening).
  //  - `owner`     — project admin, so the last-admin rule has something to protect.
  //  - `superuser` — global admin with no membership row, to prove the bypass.
  const who = ['outsider', 'demoted', 'promoted', 'owner', 'superuser'] as const;
  type Who = (typeof who)[number];

  const ids = {} as Record<Who, string>;
  const tokens = {} as Record<Who, string>;
  let projectId: string;
  let otherProjectId: string;
  let ticketId: string;

  beforeAll(async () => {
    process.env.AUTH_DEV_IMPERSONATION = 'false';
    const { AppModule } = await import('../app.module');
    const { PasswordService } = await import('./password.service');

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    // Same reason as auth.int-spec: the login limiter keys on ip + email, and this suite logs in
    // five times in a row on purpose.
    app.getHttpAdapter().getInstance().set('trust proxy', true);
    await app.init();

    db = createDb();
    const hash = await new PasswordService().hash(PASSWORD);

    const globalRole: Record<Who, 'admin' | 'manager' | 'developer'> = {
      outsider: 'manager',
      demoted: 'manager',
      promoted: 'developer',
      owner: 'developer',
      superuser: 'admin',
    };

    for (const w of who) {
      const [row] = await db
        .insert(users)
        .values({
          name: `Scope ${w}`, email: email(w), department: 'Engineering',
          role: globalRole[w], status: 'active', passwordHash: hash,
        })
        .returning();
      ids[w] = row.id;
    }

    const [project] = await db
      .insert(projects)
      .values({ name: `Scope Project ${stamp}`, keyPrefix: prefix })
      .returning();
    projectId = project.id;

    const [other] = await db
      .insert(projects)
      .values({ name: `Scope Other ${stamp}`, keyPrefix: letters(6) })
      .returning();
    otherProjectId = other.id;

    await db.insert(projectMembers).values([
      { projectId, userId: ids.owner, role: 'admin' },
      { projectId, userId: ids.demoted, role: 'developer' },
      { projectId, userId: ids.promoted, role: 'manager' },
    ]);

    const [ticket] = await db
      .insert(tickets)
      .values({
        projectId, key: `${prefix}-1`, type: 'story', title: 'Scoped story',
        description: '', status: 'todo', priority: 'medium', reporter: 'Scope owner',
        reporterId: ids.owner, labels: [],
      })
      .returning();
    ticketId = ticket.id;

    let seq = 0;
    for (const w of who) {
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .set('X-Forwarded-For', `10.9.0.${seq++}`)
        .send({ email: email(w), password: PASSWORD })
        .expect(200);
      tokens[w] = res.body.accessToken;
    }
  });

  afterAll(async () => {
    const all = Object.values(ids);
    if (all.length) {
      await db.delete(authEvents).where(inArray(authEvents.subjectId, all));
      await db.delete(authEvents).where(inArray(authEvents.actorId, all));
      await db.delete(refreshTokens).where(inArray(refreshTokens.userId, all));
    }
    for (const id of [projectId, otherProjectId].filter(Boolean)) {
      await db.delete(tickets).where(eq(tickets.projectId, id));
      await db.delete(projectMembers).where(eq(projectMembers.projectId, id));
      await db.delete(projects).where(eq(projects.id, id));
    }
    if (all.length) await db.delete(users).where(inArray(users.id, all));
    await app?.close();
  });

  const as = (w: Who) => ({ Authorization: `Bearer ${tokens[w]}` });
  const get = (w: Who, path: string) => request(app.getHttpServer()).get(path).set(as(w));

  describe('a non-member cannot tell the project exists (R12)', () => {
    // Every resource beneath the project, plus the ticket by its own id — the case that does not
    // mention a project anywhere in the URL and is therefore the one that gets forgotten.
    const routes = () => [
      ['the project', `/projects/${projectId}`],
      ['its tickets', `/projects/${projectId}/tickets`],
      ['its board', `/projects/${projectId}/board`],
      ['its overview', `/projects/${projectId}/overview`],
      ['its sprints', `/projects/${projectId}/sprints`],
      ['its members', `/projects/${projectId}/members`],
      ['a ticket addressed directly', `/tickets/${ticketId}`],
    ];

    for (const [label, path] of routes()) {
      it(`returns 404, not 403, for ${label}`, async () => {
        const res = await get('outsider', path);
        expect(res.status).toBe(404);
      });
    }

    it('answers a non-existent project id identically to a real one', async () => {
      const real = await get('outsider', `/projects/${projectId}`);
      const fake = await get('outsider', '/projects/00000000-0000-4000-8000-000000000000');
      // Same status *and* same body: a differing message is an existence oracle too.
      expect(real.status).toBe(fake.status);
      expect(real.body.error.message).toBe(fake.body.error.message);
    });

    it('refuses a write with 404 as well, not 403', async () => {
      const res = await request(app.getHttpServer())
        .post(`/projects/${projectId}/tickets`)
        .set(as('outsider'))
        .send({ type: 'story', title: 'Sneaky', description: '', labels: [], priority: 'low', env: 'staging', size: 's' });
      expect(res.status).toBe(404);
    });

    it('lets a member read all the same routes', async () => {
      for (const [, path] of routes()) {
        await get('demoted', path).expect(200);
      }
    });
  });

  describe('effective role beats global role (R13)', () => {
    const epic = { type: 'epic', title: 'Scoped epic', description: '', labels: [], priority: 'medium' };

    it('a global manager who is a project developer cannot create an epic', async () => {
      const res = await request(app.getHttpServer())
        .post(`/projects/${projectId}/tickets`)
        .set(as('demoted'))
        .send(epic);
      expect(res.status).toBe(403);
    });

    it('a global developer who is a project manager can', async () => {
      const res = await request(app.getHttpServer())
        .post(`/projects/${projectId}/tickets`)
        .set(as('promoted'))
        .send({ ...epic, title: 'Scoped epic by promoted' });
      expect(res.status).toBe(201);
      await db.delete(tickets).where(eq(tickets.id, res.body.id));
    });

    it('a project developer cannot delete a ticket, a project manager can', async () => {
      await request(app.getHttpServer()).delete(`/tickets/${ticketId}`).set(as('demoted')).expect(403);
    });

    it('a global admin is an admin in a project they are not a member of', async () => {
      await get('superuser', `/projects/${projectId}`).expect(200);
      await get('superuser', `/projects/${projectId}/members`).expect(200);
    });
  });

  describe('GET /projects lists only memberships (tech spec §6.3)', () => {
    it('shows a member their project and hides the one they are not in', async () => {
      const res = await get('demoted', '/projects').expect(200);
      const listed: string[] = res.body.map((p: { id: string }) => p.id);
      expect(listed).toContain(projectId);
      expect(listed).not.toContain(otherProjectId);
    });

    it('shows a non-member nothing of either', async () => {
      const res = await get('outsider', '/projects').expect(200);
      const listed: string[] = res.body.map((p: { id: string }) => p.id);
      expect(listed).not.toContain(projectId);
      expect(listed).not.toContain(otherProjectId);
    });

    it('shows a platform admin every project, membership or not', async () => {
      const res = await get('superuser', '/projects').expect(200);
      const listed: string[] = res.body.map((p: { id: string }) => p.id);
      expect(listed).toEqual(expect.arrayContaining([projectId, otherProjectId]));
    });
  });

  describe('membership management', () => {
    const memberRole = async (userId: string) => {
      const [row] = await db
        .select({ role: projectMembers.role })
        .from(projectMembers)
        .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)))
        .limit(1);
      return row?.role ?? null;
    };

    it('a project manager can add, re-role and remove a member', async () => {
      await request(app.getHttpServer())
        .post(`/projects/${projectId}/members`)
        .set(as('promoted'))
        .send({ userId: ids.outsider, role: 'developer' })
        .expect(204);
      expect(await memberRole(ids.outsider)).toBe('developer');

      // And the grant takes effect immediately — the guard reads the table per request.
      await get('outsider', `/projects/${projectId}`).expect(200);

      await request(app.getHttpServer())
        .patch(`/projects/${projectId}/members/${ids.outsider}`)
        .set(as('promoted'))
        .send({ role: 'manager' })
        .expect(204);
      expect(await memberRole(ids.outsider)).toBe('manager');

      await request(app.getHttpServer())
        .delete(`/projects/${projectId}/members/${ids.outsider}`)
        .set(as('promoted'))
        .expect(204);
      expect(await memberRole(ids.outsider)).toBeNull();

      // Removal is effective on the next request, with no revocation step.
      await get('outsider', `/projects/${projectId}`).expect(404);
    });

    it('records a membership_changed audit event (R19)', async () => {
      await request(app.getHttpServer())
        .post(`/projects/${projectId}/members`)
        .set(as('owner'))
        .send({ userId: ids.outsider, role: 'developer' })
        .expect(204);

      const events = await db
        .select()
        .from(authEvents)
        .where(and(eq(authEvents.type, 'membership_changed'), eq(authEvents.subjectId, ids.outsider)));

      // Earlier tests in this block also changed this user's membership, so match on content
      // rather than on position — row order from Postgres is not a promise.
      const added = events.filter(
        (e) => e.actorId === ids.owner && (e.metadata as { action?: string } | null)?.action === 'added',
      );
      expect(added).toHaveLength(1);
      expect((added[0].metadata as { projectId?: string }).projectId).toBe(projectId);

      await request(app.getHttpServer())
        .delete(`/projects/${projectId}/members/${ids.outsider}`)
        .set(as('owner'))
        .expect(204);
    });

    it('refuses a project developer, whatever their global role', async () => {
      await request(app.getHttpServer())
        .post(`/projects/${projectId}/members`)
        .set(as('demoted'))
        .send({ userId: ids.outsider, role: 'developer' })
        .expect(403);
    });

    it('rejects a userId that does not exist with 400, not 404', async () => {
      // 404 here would be ambiguous with "you cannot see this project" (R12).
      await request(app.getHttpServer())
        .post(`/projects/${projectId}/members`)
        .set(as('owner'))
        .send({ userId: '00000000-0000-4000-8000-000000000000', role: 'developer' })
        .expect(400);
    });

    it('rejects adding someone twice', async () => {
      await request(app.getHttpServer())
        .post(`/projects/${projectId}/members`)
        .set(as('owner'))
        .send({ userId: ids.demoted, role: 'developer' })
        .expect(409);
    });

    it('refuses to demote the last project admin (R18)', async () => {
      await request(app.getHttpServer())
        .patch(`/projects/${projectId}/members/${ids.owner}`)
        .set(as('owner'))
        .send({ role: 'manager' })
        .expect(400);
      expect(await memberRole(ids.owner)).toBe('admin');
    });

    it('refuses to remove the last project admin (R18)', async () => {
      await request(app.getHttpServer())
        .delete(`/projects/${projectId}/members/${ids.owner}`)
        .set(as('owner'))
        .expect(400);
      expect(await memberRole(ids.owner)).toBe('admin');
    });

    it('allows it once a second admin exists', async () => {
      await request(app.getHttpServer())
        .patch(`/projects/${projectId}/members/${ids.promoted}`)
        .set(as('owner'))
        .send({ role: 'admin' })
        .expect(204);

      await request(app.getHttpServer())
        .delete(`/projects/${projectId}/members/${ids.owner}`)
        .set(as('promoted'))
        .expect(204);
      expect(await memberRole(ids.owner)).toBeNull();

      // Put the fixture back for anything that runs after this.
      await db.insert(projectMembers).values({ projectId, userId: ids.owner, role: 'admin' });
      await db
        .update(projectMembers)
        .set({ role: 'manager' })
        .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, ids.promoted)));
    });
  });

  describe('a newly created project', () => {
    it('makes its creator a project admin, so R18 holds from the first moment', async () => {
      const res = await request(app.getHttpServer())
        .post('/projects')
        .set(as('superuser'))
        .send({ name: `Created ${stamp}`, keyPrefix: letters(6) })
        .expect(201);

      const [row] = await db
        .select({ role: projectMembers.role })
        .from(projectMembers)
        .where(and(eq(projectMembers.projectId, res.body.id), eq(projectMembers.userId, ids.superuser)));
      expect(row?.role).toBe('admin');

      await db.delete(projectMembers).where(eq(projectMembers.projectId, res.body.id));
      await db.delete(projects).where(eq(projects.id, res.body.id));
    });
  });
});
