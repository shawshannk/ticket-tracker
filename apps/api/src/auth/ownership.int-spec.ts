import 'dotenv/config';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import { eq, inArray } from 'drizzle-orm';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb, type Db } from '../db';
import { authEvents, comments, projectMembers, projects, refreshTokens, tickets, users } from '../db/schema';

/**
 * R14 over HTTP. The unit tests in `ownership.spec.ts` prove the rules; this proves they are
 * actually *reached* — that the route gates were loosened where ownership took over and not
 * anywhere else, and that a developer who owns a record really can act on it end to end.
 *
 * Impersonation off: the production configuration.
 */
describe('record-level ownership (integration)', () => {
  let app: INestApplication;
  let db: Db;

  const PASSWORD = 'correct-horse-battery-staple';
  const stamp = Date.now();
  const email = (who: string) => `own-${who}-${stamp}@nimbus.io`;
  const letters = (n: number) =>
    Array.from({ length: n }, () => String.fromCharCode(65 + Math.floor(Math.random() * 26))).join('');
  const prefix = letters(6);

  // Everyone is a *global developer* on purpose: it forces every assertion below to be decided
  // by the project role and the relationship, never by an accidental global privilege.
  const who = ['dev', 'other', 'manager', 'admin', 'outsider'] as const;
  type Who = (typeof who)[number];

  const projectRole: Record<Who, 'admin' | 'manager' | 'developer' | null> = {
    dev: 'developer',
    other: 'developer',
    manager: 'manager',
    admin: 'admin',
    outsider: null,
  };

  const ids = {} as Record<Who, string>;
  const tokens = {} as Record<Who, string>;
  let projectId: string;
  let seq = 0;

  beforeAll(async () => {
    process.env.AUTH_DEV_IMPERSONATION = 'false';
    const { AppModule } = await import('../app.module');
    const { PasswordService } = await import('./password.service');

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.getHttpAdapter().getInstance().set('trust proxy', true);
    await app.init();

    db = createDb();
    const hash = await new PasswordService().hash(PASSWORD);

    for (const w of who) {
      const [row] = await db
        .insert(users)
        .values({
          name: `Own ${w}`, email: email(w), department: 'Engineering',
          role: 'developer', status: 'active', passwordHash: hash,
        })
        .returning();
      ids[w] = row.id;
    }

    const [project] = await db
      .insert(projects)
      .values({ name: `Own Project ${stamp}`, keyPrefix: prefix })
      .returning();
    projectId = project.id;

    await db.insert(projectMembers).values(
      who
        .filter((w) => projectRole[w] !== null)
        .map((w) => ({ projectId, userId: ids[w], role: projectRole[w]! })),
    );

    let ip = 0;
    for (const w of who) {
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .set('X-Forwarded-For', `10.8.0.${ip++}`)
        .send({ email: email(w), password: PASSWORD })
        .expect(200);
      tokens[w] = res.body.accessToken;
    }
  });

  afterAll(async () => {
    const all = Object.values(ids);
    const rows = await db.select({ id: tickets.id }).from(tickets).where(eq(tickets.projectId, projectId));
    if (rows.length) await db.delete(comments).where(inArray(comments.ticketId, rows.map((r) => r.id)));
    await db.delete(tickets).where(eq(tickets.projectId, projectId));
    await db.delete(projectMembers).where(eq(projectMembers.projectId, projectId));
    await db.delete(projects).where(eq(projects.id, projectId));
    if (all.length) {
      await db.delete(authEvents).where(inArray(authEvents.subjectId, all));
      await db.delete(authEvents).where(inArray(authEvents.actorId, all));
      await db.delete(refreshTokens).where(inArray(refreshTokens.userId, all));
      await db.delete(users).where(inArray(users.id, all));
    }
    await app?.close();
  });

  const as = (w: Who) => ({ Authorization: `Bearer ${tokens[w]}` });

  /** A ticket inserted directly, so its reporter and assignee can be set per test. */
  const makeTicket = async (reporter: Who | null, assignee: Who | null = null) => {
    const [row] = await db
      .insert(tickets)
      .values({
        projectId, key: `${prefix}-${++seq}`, type: 'story', title: 'Owned story',
        description: '', status: 'Backlog', priority: 'medium',
        reporter: reporter ? `Own ${reporter}` : 'Nobody',
        reporterId: reporter ? ids[reporter] : null,
        assigneeId: assignee ? ids[assignee] : null,
        labels: [],
      })
      .returning();
    return row.id;
  };

  const makeComment = async (ticketId: string, author: Who) => {
    const [row] = await db
      .insert(comments)
      .values({ ticketId, authorId: ids[author], body: 'original text' })
      .returning();
    return row.id;
  };

  describe('deleting a ticket (spec 10 §3.3)', () => {
    it('lets a project developer delete a ticket they reported', async () => {
      const id = await makeTicket('dev');
      await request(app.getHttpServer()).delete(`/tickets/${id}`).set(as('dev')).expect(204);
      expect(await db.select().from(tickets).where(eq(tickets.id, id))).toHaveLength(0);
    });

    it('refuses a project developer a ticket someone else reported', async () => {
      const id = await makeTicket('other');
      await request(app.getHttpServer()).delete(`/tickets/${id}`).set(as('dev')).expect(403);
      expect(await db.select().from(tickets).where(eq(tickets.id, id))).toHaveLength(1);
    });

    it('lets a project manager delete a ticket they did not report', async () => {
      const id = await makeTicket('other');
      await request(app.getHttpServer()).delete(`/tickets/${id}`).set(as('manager')).expect(204);
    });

    it('refuses a developer a ticket whose reporter_id is null, even if the name matches', async () => {
      // The display name is deliberately set to this developer's. Authorization must read the FK
      // and nothing else — matching on the name is how a rename silently moves delete rights.
      const [row] = await db
        .insert(tickets)
        .values({
          projectId, key: `${prefix}-${++seq}`, type: 'story', title: 'Nameless reporter',
          description: '', status: 'Backlog', priority: 'medium',
          reporter: 'Own dev', reporterId: null, labels: [],
        })
        .returning();

      await request(app.getHttpServer()).delete(`/tickets/${row.id}`).set(as('dev')).expect(403);
      await request(app.getHttpServer()).delete(`/tickets/${row.id}`).set(as('manager')).expect(204);
    });

    it('still 404s a non-member rather than 403', async () => {
      // Loosening the route gate must not have leaked existence to people outside the project.
      const id = await makeTicket('dev');
      await request(app.getHttpServer()).delete(`/tickets/${id}`).set(as('outsider')).expect(404);
    });
  });

  describe('reassigning a ticket (R14)', () => {
    const reassign = (id: string, w: Who, assigneeId: string | null) =>
      request(app.getHttpServer()).patch(`/tickets/${id}`).set(as(w)).send({ assigneeId });

    it('lets a developer reassign a ticket they reported', async () => {
      const id = await makeTicket('dev', 'other');
      await reassign(id, 'dev', ids.other).expect(200);
    });

    it('lets a developer reassign a ticket assigned to them', async () => {
      const id = await makeTicket('other', 'dev');
      await reassign(id, 'dev', ids.other).expect(200);
    });

    it('refuses a developer who is neither reporter nor assignee', async () => {
      const id = await makeTicket('other', 'other');
      await reassign(id, 'dev', ids.dev).expect(403);
    });

    it('lets a project manager reassign anything', async () => {
      const id = await makeTicket('other', 'other');
      await reassign(id, 'manager', ids.dev).expect(200);
    });

    it('lets any member edit other fields on a ticket they do not own', async () => {
      // The rule is narrow on purpose: assignment is gated, ordinary editing is not.
      const id = await makeTicket('other', 'other');
      await request(app.getHttpServer())
        .patch(`/tickets/${id}`)
        .set(as('dev'))
        .send({ priority: 'critical', labels: ['triage'] })
        .expect(200);
    });

    it('does not treat a resent, unchanged assignee as a reassignment', async () => {
      // The detail view sends the whole form on Save, so an unchanged assigneeId arrives on every
      // edit. Refusing that would make the ticket uneditable by everyone but its owner.
      const id = await makeTicket('other', 'other');
      await request(app.getHttpServer())
        .patch(`/tickets/${id}`)
        .set(as('dev'))
        .send({ assigneeId: ids.other, priority: 'low' })
        .expect(200);
    });
  });

  describe('editing a comment — author only, admins included', () => {
    it('lets the author edit their own', async () => {
      const ticketId = await makeTicket('other');
      const id = await makeComment(ticketId, 'dev');

      const res = await request(app.getHttpServer())
        .patch(`/comments/${id}`)
        .set(as('dev'))
        .send({ body: 'edited text' })
        .expect(200);
      expect(res.body.body).toBe('edited text');
    });

    it.each(['other', 'manager', 'admin'] as const)('refuses a project %s editing another person\'s', async (w) => {
      const ticketId = await makeTicket('other');
      const id = await makeComment(ticketId, 'dev');

      await request(app.getHttpServer()).patch(`/comments/${id}`).set(as(w)).send({ body: 'not yours' }).expect(403);

      const [row] = await db.select().from(comments).where(eq(comments.id, id));
      expect(row.body).toBe('original text');
    });

    it('404s a non-member addressing a comment by id', async () => {
      const ticketId = await makeTicket('other');
      const id = await makeComment(ticketId, 'dev');
      await request(app.getHttpServer()).patch(`/comments/${id}`).set(as('outsider')).send({ body: 'x' }).expect(404);
    });

    it('rejects an empty body', async () => {
      const ticketId = await makeTicket('other');
      const id = await makeComment(ticketId, 'dev');
      await request(app.getHttpServer()).patch(`/comments/${id}`).set(as('dev')).send({ body: '' }).expect(400);
    });
  });

  describe('deleting a comment — author or project admin', () => {
    it('lets the author delete their own', async () => {
      const ticketId = await makeTicket('other');
      const id = await makeComment(ticketId, 'dev');
      await request(app.getHttpServer()).delete(`/comments/${id}`).set(as('dev')).expect(204);
      expect(await db.select().from(comments).where(eq(comments.id, id))).toHaveLength(0);
    });

    it('lets a project admin delete it as moderation', async () => {
      const ticketId = await makeTicket('other');
      const id = await makeComment(ticketId, 'dev');
      await request(app.getHttpServer()).delete(`/comments/${id}`).set(as('admin')).expect(204);
    });

    it('refuses a project manager — moderation is admin-only here', async () => {
      const ticketId = await makeTicket('other');
      const id = await makeComment(ticketId, 'dev');
      await request(app.getHttpServer()).delete(`/comments/${id}`).set(as('manager')).expect(403);
      expect(await db.select().from(comments).where(eq(comments.id, id))).toHaveLength(1);
    });

    it('refuses another developer', async () => {
      const ticketId = await makeTicket('other');
      const id = await makeComment(ticketId, 'dev');
      await request(app.getHttpServer()).delete(`/comments/${id}`).set(as('other')).expect(403);
    });

    it('404s a comment that does not exist', async () => {
      await request(app.getHttpServer())
        .delete('/comments/00000000-0000-4000-8000-000000000000')
        .set(as('dev'))
        .expect(404);
    });
  });
});
