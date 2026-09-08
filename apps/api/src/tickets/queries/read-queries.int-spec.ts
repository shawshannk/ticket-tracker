import 'dotenv/config';
import { NotFoundException } from '@nestjs/common';
import { ticketListQuerySchema, type TicketCreateDto, type TicketListQueryInput, type User } from '@ticket-tracker/shared';
import { eq, inArray } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb, type Db } from '../../db';
import { comments, projects, tickets, users } from '../../db/schema';
import { TicketKeyService } from '../../projects/ticket-key.service';
import { AddCommentCommand, AddCommentHandler } from '../commands/add-comment.command';
import { CreateTicketCommand, CreateTicketHandler } from '../commands/create-ticket.command';
import { GetTicketDetailHandler, GetTicketDetailQuery } from './get-ticket-detail.query';
import { GetTicketsHandler, GetTicketsQuery } from './get-tickets.query';

// Integration test — needs the Compose Postgres up. The list is all SQL, so the only honest
// way to test filters/search/paging/sort and R2 isolation is against real rows.
describe('ticket read queries (integration)', () => {
  let db: Db;
  let create: CreateTicketHandler;
  let comment: AddCommentHandler;
  let list: GetTicketsHandler;
  let detail: GetTicketDetailHandler;
  let projectA: string;
  let projectB: string;
  let alice: User;
  let bob: User;
  const madeProjects: string[] = [];

  // Fixture ids filled in beforeAll.
  let epic1: string;
  let epic2: string;
  let story1: string; // under epic1, assigned to alice, env staging, status In Review
  let story2: string; // under epic2, assigned to bob, env production
  let bug1: string; // under epic1 → story1, critical, assigned to alice
  let foreign: string; // an epic in project B

  const q = (projectId: string, input: TicketListQueryInput = {}) =>
    list.execute(new GetTicketsQuery(projectId, ticketListQuerySchema.parse(input)));

  beforeAll(async () => {
    db = createDb();
    create = new CreateTicketHandler(db, new TicketKeyService(db));
    comment = new AddCommentHandler(db);
    list = new GetTicketsHandler(db);
    detail = new GetTicketDetailHandler(db);

    const seeded = await db.select().from(users).orderBy(users.name).limit(2);
    const asUser = (r: (typeof seeded)[number]): User => ({
      ...r,
      department: r.department as User['department'],
      createdAt: r.createdAt.toISOString(),
    });
    [alice, bob] = seeded.map(asUser);

    projectA = await makeProject('YRA');
    projectB = await makeProject('YRB');

    const mk = (projectId: string, input: TicketCreateDto, actor: User = alice) =>
      create.execute(new CreateTicketCommand(projectId, input, { ...actor, role: 'manager' }));

    epic1 = (await mk(projectA, { type: 'epic', title: 'Payments platform', description: '', labels: [], priority: 'medium' })).id;
    epic2 = (await mk(projectA, { type: 'epic', title: 'Mobile onboarding', description: '', labels: [], priority: 'high' })).id;
    story1 = (
      await mk(projectA, {
        type: 'story', title: 'Card tokenisation', description: '', labels: ['api'], priority: 'high',
        env: 'staging', size: 'm', epicId: epic1, assigneeId: alice.id,
      } as TicketCreateDto)
    ).id;
    story2 = (
      await mk(projectA, {
        type: 'story', title: 'Signup screen', description: '', labels: [], priority: 'low',
        env: 'production', size: 's', epicId: epic2, assigneeId: bob.id,
      } as TicketCreateDto)
    ).id;
    bug1 = (
      await mk(projectA, {
        type: 'bug', title: 'Token leak on retry', description: '', labels: [], priority: 'critical',
        env: 'production', size: 'xs', severity: '1', epicId: epic1, storyId: story1, assigneeId: alice.id,
      } as TicketCreateDto)
    ).id;
    foreign = (await mk(projectB, { type: 'epic', title: 'Payments platform (B)', description: '', labels: [], priority: 'medium' })).id;

    await db.update(tickets).set({ status: 'In Review' }).where(eq(tickets.id, story1));
  });

  afterAll(async () => {
    const rows = await db.select({ id: tickets.id }).from(tickets).where(inArray(tickets.projectId, madeProjects));
    if (rows.length) await db.delete(comments).where(inArray(comments.ticketId, rows.map((r) => r.id)));
    await db.delete(tickets).where(inArray(tickets.projectId, madeProjects));
    await db.delete(projects).where(inArray(projects.id, madeProjects));
  });

  describe('list', () => {
    it('returns { items, total } scoped to the project, newest first by default', async () => {
      const page = await q(projectA);
      expect(page.total).toBe(5);
      expect(page.items.map((t) => t.key)).toEqual(['YRA-5', 'YRA-4', 'YRA-3', 'YRA-2', 'YRA-1']);
      expect(page.page).toBe(1);
      expect(page.pageSize).toBe(25);
    });

    it('never shows project A tickets in project B (R2)', async () => {
      const b = await q(projectB);
      expect(b.total).toBe(1);
      expect(b.items[0].id).toBe(foreign);
      // …even when a search term would match rows in A.
      const searched = await q(projectB, { search: 'payments' });
      expect(searched.items.map((t) => t.id)).toEqual([foreign]);
    });

    it('carries assignee and Epic ▸ Story breadcrumb names', async () => {
      const { items } = await q(projectA, { type: 'bug' });
      expect(items).toHaveLength(1);
      expect(items[0].assignee).toEqual({ id: alice.id, name: alice.name });
      expect(items[0].epic).toMatchObject({ id: epic1, key: 'YRA-1', title: 'Payments platform' });
      expect(items[0].story).toMatchObject({ id: story1, key: 'YRA-3' });
      const epics = await q(projectA, { type: 'epic' });
      expect(epics.items.every((t) => t.epic === null && t.story === null)).toBe(true);
    });

    it('honors each filter', async () => {
      const ids = async (input: TicketListQueryInput) => (await q(projectA, input)).items.map((t) => t.id).sort();
      expect(await ids({ status: 'In Review' })).toEqual([story1]);
      expect(await ids({ priority: 'critical' })).toEqual([bug1]);
      expect(await ids({ assignee: alice.id })).toEqual([story1, bug1].sort());
      expect(await ids({ env: 'production' })).toEqual([story2, bug1].sort());
      expect(await ids({ epic: epic1 })).toEqual([story1, bug1].sort());
      expect(await ids({ type: 'story' })).toEqual([story1, story2].sort());
      // Filters combine with AND.
      expect(await ids({ epic: epic1, env: 'production' })).toEqual([bug1]);
      expect(await ids({ epic: epic1, env: 'development' })).toEqual([]);
    });

    it('searches title, key and assignee name, case-insensitively', async () => {
      const ids = async (search: string) => (await q(projectA, { search })).items.map((t) => t.id).sort();
      expect(await ids('TOKEN')).toEqual([story1, bug1].sort()); // title, two tickets
      expect(await ids('yra-2')).toEqual([epic2]); // key
      expect(await ids(bob.name.split(' ')[0].toLowerCase())).toEqual([story2]); // assignee name
      expect(await ids('nothing-matches-this')).toEqual([]);
    });

    it('treats LIKE metacharacters in a search literally', async () => {
      expect((await q(projectA, { search: '%' })).total).toBe(0);
      expect((await q(projectA, { search: '_' })).total).toBe(0);
    });

    it('paginates with a stable order and reports the unfiltered total for the filter', async () => {
      const p1 = await q(projectA, { page: 1, pageSize: 2 });
      const p2 = await q(projectA, { page: 2, pageSize: 2 });
      const p3 = await q(projectA, { page: 3, pageSize: 2 });
      expect([p1.total, p2.total, p3.total]).toEqual([5, 5, 5]);
      expect(p1.items).toHaveLength(2);
      expect(p2.items).toHaveLength(2);
      expect(p3.items).toHaveLength(1);
      const all = [...p1.items, ...p2.items, ...p3.items].map((t) => t.key);
      expect(new Set(all).size).toBe(5);
      expect(all).toEqual(['YRA-5', 'YRA-4', 'YRA-3', 'YRA-2', 'YRA-1']);
      expect((await q(projectA, { page: 9, pageSize: 2 })).items).toEqual([]);
    });

    it('sorts by the requested field and direction', async () => {
      const keys = async (input: TicketListQueryInput) => (await q(projectA, input)).items.map((t) => t.key);
      expect(await keys({ sortBy: 'createdAt', sortDir: 'asc' })).toEqual(['YRA-1', 'YRA-2', 'YRA-3', 'YRA-4', 'YRA-5']);
      expect(await keys({ sortBy: 'title', sortDir: 'asc' })).toEqual(['YRA-3', 'YRA-2', 'YRA-1', 'YRA-4', 'YRA-5']);
      // Enum order: critical → high → medium → low.
      const byPriority = (await q(projectA, { sortBy: 'priority', sortDir: 'asc' })).items.map((t) => t.priority);
      expect(byPriority).toEqual(['critical', 'high', 'high', 'medium', 'low']);
    });

    it('applies query defaults and bounds through the shared schema', () => {
      expect(ticketListQuerySchema.parse({})).toMatchObject({ page: 1, pageSize: 25, sortBy: 'createdAt', sortDir: 'desc' });
      expect(ticketListQuerySchema.parse({ page: '3', pageSize: '10' })).toMatchObject({ page: 3, pageSize: 10 });
      expect(() => ticketListQuerySchema.parse({ pageSize: 500 })).toThrow();
      expect(() => ticketListQuerySchema.parse({ sortBy: 'reporter' })).toThrow();
      expect(ticketListQuerySchema.parse({ search: '   ' }).search).toBeUndefined();
    });
  });

  describe('detail', () => {
    it('returns the row with names, status options from its type, and story options for a bug', async () => {
      const d = await detail.execute(new GetTicketDetailQuery(bug1));
      expect(d.key).toBe('YRA-5');
      expect(d.assignee).toEqual({ id: alice.id, name: alice.name });
      expect(d.epic).toMatchObject({ id: epic1, key: 'YRA-1' });
      expect(d.story).toMatchObject({ id: story1, key: 'YRA-3' });
      expect(d.statusOptions).toEqual(['Backlog', 'In Progress', 'In Review', 'Blocked', 'On Hold', 'Done']);
      // Only stories under epic1 — story2 (epic2) must not be offered.
      expect(d.storyOptions).toEqual([{ id: story1, key: 'YRA-3', title: 'Card tokenisation' }]);
    });

    it('gives an epic its own status set and no story options', async () => {
      const d = await detail.execute(new GetTicketDetailQuery(epic1));
      expect(d.statusOptions).toEqual(['Planned', 'In Progress', 'Done']);
      expect(d.storyOptions).toEqual([]);
      expect(d.epic).toBeNull();
      expect(d.assignee).toBeNull();
    });

    it('lists comments oldest-first with their authors', async () => {
      await comment.execute(new AddCommentCommand(story1, { body: 'first' }, alice));
      await comment.execute(new AddCommentCommand(story1, { body: 'second' }, bob));
      const d = await detail.execute(new GetTicketDetailQuery(story1));
      expect(d.comments.map((c) => [c.body, c.author.name])).toEqual([
        ['first', alice.name],
        ['second', bob.name],
      ]);
      expect(d.comments[0].authorId).toBe(alice.id);
    });

    it('404s an unknown ticket', async () => {
      await expect(detail.execute(new GetTicketDetailQuery('00000000-0000-4000-8000-000000000009'))).rejects.toThrow(NotFoundException);
    });
  });

  async function makeProject(prefix: string): Promise<string> {
    const [row] = await db.insert(projects).values({ name: `Read Test ${prefix}`, keyPrefix: prefix, nextTicketSeq: 1 }).returning();
    madeProjects.push(row.id);
    return row.id;
  }
});
