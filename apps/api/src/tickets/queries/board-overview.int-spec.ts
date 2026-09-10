import 'dotenv/config';
import { boardQuerySchema, type TicketCreateDto, type User } from '@ticket-tracker/shared';
import { eq, inArray } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb, type Db } from '../../db';
import { comments, projects, sprints, tickets, users } from '../../db/schema';
import { GetSprintsHandler, GetSprintsQuery } from '../../projects/queries/get-sprints.query';
import { TicketKeyService } from '../../projects/ticket-key.service';
import { CreateTicketCommand, CreateTicketHandler } from '../commands/create-ticket.command';
import { GetBoardHandler, GetBoardQuery } from './get-board.query';
import { GetOverviewStatsHandler, GetOverviewStatsQuery } from './get-overview-stats.query';
import { authContextFor } from '../../auth/auth-context.fixture';

// Integration test — needs the Compose Postgres up. The overview is a raw aggregation and the
// board is a filtered join, so both are only meaningfully testable against real rows.
describe('board + overview queries (integration)', () => {
  let db: Db;
  let create: CreateTicketHandler;
  let board: GetBoardHandler;
  let overview: GetOverviewStatsHandler;
  let sprintsHandler: GetSprintsHandler;
  let projectA: string;
  let projectB: string;
  let emptyProject: string;
  let sprint1: string;
  let sprint2: string;
  let actor: User;
  const madeProjects: string[] = [];

  let epicA: string;
  let doneStory: string;
  let backlogBug: string;

  const askBoard = (projectId: string, input: Record<string, unknown> = {}) =>
    board.execute(new GetBoardQuery(projectId, boardQuerySchema.parse(input)));

  beforeAll(async () => {
    db = createDb();
    create = new CreateTicketHandler(db, new TicketKeyService(db));
    board = new GetBoardHandler(db);
    overview = new GetOverviewStatsHandler(db);
    sprintsHandler = new GetSprintsHandler(db);

    const [row] = await db.select().from(users).limit(1);
    actor = { ...row, department: row.department as User['department'], role: 'manager', createdAt: row.createdAt.toISOString() };

    projectA = await makeProject('YBA');
    projectB = await makeProject('YBB');
    emptyProject = await makeProject('YBE');

    const [s1, s2] = await db
      .insert(sprints)
      .values([
        { projectId: projectA, name: 'Sprint 1', startsOn: '2026-06-01', endsOn: '2026-06-12' },
        { projectId: projectA, name: 'Sprint 2', startsOn: '2026-06-15', endsOn: '2026-06-26' },
      ])
      .returning();
    sprint1 = s1.id;
    sprint2 = s2.id;

    const mk = (projectId: string, input: TicketCreateDto) =>
      create.execute(new CreateTicketCommand(projectId, input, authContextFor(actor)));

    epicA = (await mk(projectA, { type: 'epic', title: 'Epic A', description: '', labels: [], priority: 'medium' })).id;
    const story1 = await mk(projectA, {
      type: 'story', title: 'In sprint 1', description: '', labels: [], priority: 'high',
      env: 'staging', size: 'm', epicId: epicA, sprintId: sprint1,
    } as TicketCreateDto);
    await mk(projectA, {
      type: 'story', title: 'In sprint 2', description: '', labels: [], priority: 'low',
      env: 'staging', size: 's', epicId: epicA, sprintId: sprint2,
    } as TicketCreateDto);
    backlogBug = (
      await mk(projectA, {
        type: 'bug', title: 'No sprint', description: '', labels: [], priority: 'critical',
        env: 'production', size: 'xs', severity: '1', epicId: epicA,
      } as TicketCreateDto)
    ).id;
    await mk(projectB, { type: 'epic', title: 'Epic B', description: '', labels: [], priority: 'critical' });

    // One Done ticket with a known age, so avgResolutionDays has something exact to average.
    doneStory = story1.id;
    await db
      .update(tickets)
      .set({ status: 'Done', createdAt: new Date('2026-06-01T00:00:00Z'), updatedAt: new Date('2026-06-04T00:00:00Z') })
      .where(eq(tickets.id, doneStory));
  });

  afterAll(async () => {
    const rows = await db.select({ id: tickets.id }).from(tickets).where(inArray(tickets.projectId, madeProjects));
    if (rows.length) await db.delete(comments).where(inArray(comments.ticketId, rows.map((r) => r.id)));
    await db.delete(tickets).where(inArray(tickets.projectId, madeProjects));
    await db.delete(sprints).where(inArray(sprints.projectId, madeProjects));
    await db.delete(projects).where(inArray(projects.id, madeProjects));
  });

  describe('sprints', () => {
    it('lists a project\'s sprints in start-date order, scoped to that project', async () => {
      const list = await sprintsHandler.execute(new GetSprintsQuery(projectA));
      expect(list.map((s) => s.name)).toEqual(['Sprint 1', 'Sprint 2']);
      expect(list[0]).toMatchObject({ projectId: projectA, startsOn: '2026-06-01', endsOn: '2026-06-12' });
      expect(await sprintsHandler.execute(new GetSprintsQuery(projectB))).toEqual([]);
    });
  });

  describe('board', () => {
    it('returns every card in the project, flat, with summary shape', async () => {
      const cards = await askBoard(projectA);
      expect(cards).toHaveLength(4);
      const bug = cards.find((c) => c.id === backlogBug);
      expect(bug?.epic).toMatchObject({ id: epicA, key: 'YBA-1' });
      expect(bug?.severity).toBe('1');
    });

    it('never shows another project\'s cards (R2)', async () => {
      const cards = await askBoard(projectB);
      expect(cards).toHaveLength(1);
      expect(cards.every((c) => c.projectId === projectB)).toBe(true);
      expect(await askBoard(emptyProject)).toEqual([]);
    });

    it('filters by a specific sprint', async () => {
      expect((await askBoard(projectA, { sprint: sprint1 })).map((c) => c.title)).toEqual(['In sprint 1']);
      expect((await askBoard(projectA, { sprint: sprint2 })).map((c) => c.title)).toEqual(['In sprint 2']);
    });

    it('treats sprint=backlog as "no sprint assigned"', async () => {
      const cards = await askBoard(projectA, { sprint: 'backlog' });
      expect(cards.every((c) => c.sprintId === null)).toBe(true);
      expect(cards.map((c) => c.title).sort()).toEqual(['Epic A', 'No sprint']);
    });

    it('filters by type, and combines sprint with type', async () => {
      expect((await askBoard(projectA, { type: 'epic' })).map((c) => c.title)).toEqual(['Epic A']);
      expect(await askBoard(projectA, { type: 'bug', sprint: sprint1 })).toEqual([]);
      expect((await askBoard(projectA, { type: 'bug', sprint: 'backlog' })).map((c) => c.title)).toEqual(['No sprint']);
    });

    it('rejects a sprint value that is neither "backlog" nor a uuid', () => {
      expect(() => boardQuerySchema.parse({ sprint: 'sprint-one' })).toThrow();
      expect(boardQuerySchema.parse({})).toEqual({});
    });
  });

  describe('overview', () => {
    it('computes the KPIs from spec 00\'s definitions', async () => {
      const stats = await overview.execute(new GetOverviewStatsQuery(projectA));
      // 4 tickets, one of them Done.
      expect(stats.openCount).toBe(3);
      expect(stats.criticalOpen).toBe(1);
      // The single Done ticket spans 2026-06-01 → 2026-06-04.
      expect(stats.avgResolutionDays).toBe(3);
      // Three tickets were created just now; the Done one was backdated to June.
      expect(stats.createdThisWeek).toBe(3);
    });

    it('breaks down status and priority over every value, with percentages', async () => {
      const stats = await overview.execute(new GetOverviewStatsQuery(projectA));
      const byStatus = Object.fromEntries(stats.statusBreakdown.map((s) => [s.status, s]));
      expect(byStatus['Backlog'].count).toBe(2);
      expect(byStatus['Planned'].count).toBe(1);
      expect(byStatus['Done'].count).toBe(1);
      expect(byStatus['Blocked']).toMatchObject({ count: 0, pct: 0 });
      expect(byStatus['Backlog'].pct).toBe(50);
      expect(stats.statusBreakdown.map((s) => s.status)).toEqual([
        'Backlog', 'Planned', 'In Progress', 'In Review', 'Blocked', 'On Hold', 'Done',
      ]);
      expect(stats.priorityBreakdown).toEqual([
        { priority: 'critical', count: 1 },
        { priority: 'high', count: 1 },
        { priority: 'medium', count: 1 },
        { priority: 'low', count: 1 },
      ]);
      // Percentages of the project's whole ticket set.
      expect(stats.statusBreakdown.reduce((sum, s) => sum + s.count, 0)).toBe(4);
    });

    it('returns the 5 most recently updated tickets as list-shaped rows', async () => {
      const stats = await overview.execute(new GetOverviewStatsQuery(projectA));
      expect(stats.recentActivity).toHaveLength(4);
      const updatedAts = stats.recentActivity.map((t) => t.updatedAt);
      expect([...updatedAts].sort().reverse()).toEqual(updatedAts);
      // The backdated Done ticket sorts last.
      expect(stats.recentActivity.at(-1)?.id).toBe(doneStory);
      expect(stats.recentActivity[0].epic !== undefined).toBe(true);
    });

    it('handles an empty project with zeros and no divide-by-zero', async () => {
      const stats = await overview.execute(new GetOverviewStatsQuery(emptyProject));
      expect(stats).toMatchObject({ openCount: 0, criticalOpen: 0, avgResolutionDays: 0, createdThisWeek: 0 });
      expect(stats.recentActivity).toEqual([]);
      expect(stats.statusBreakdown).toHaveLength(7);
      expect(stats.statusBreakdown.every((s) => s.count === 0 && s.pct === 0)).toBe(true);
      expect(stats.priorityBreakdown.every((p) => p.count === 0)).toBe(true);
      expect(Number.isNaN(stats.avgResolutionDays)).toBe(false);
    });

    it('never counts another project\'s tickets (R2)', async () => {
      const stats = await overview.execute(new GetOverviewStatsQuery(projectB));
      expect(stats.openCount).toBe(1);
      expect(stats.criticalOpen).toBe(1);
      expect(stats.recentActivity.every((t) => t.projectId === projectB)).toBe(true);
      expect(stats.statusBreakdown.reduce((sum, s) => sum + s.count, 0)).toBe(1);
    });
  });

  async function makeProject(prefix: string): Promise<string> {
    const [row] = await db.insert(projects).values({ name: `Board Test ${prefix}`, keyPrefix: prefix, nextTicketSeq: 1 }).returning();
    madeProjects.push(row.id);
    return row.id;
  }
});
