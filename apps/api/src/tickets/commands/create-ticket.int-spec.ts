import 'dotenv/config';
import { ForbiddenException } from '@nestjs/common';
import type { TicketCreateDto, User, UserRole } from '@ticket-tracker/shared';
import { eq, inArray } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb, type Db } from '../../db';
import { projects, tickets, users } from '../../db/schema';
import { TicketKeyService } from '../../projects/ticket-key.service';
import { CreateTicketCommand, CreateTicketHandler } from './create-ticket.command';
import { authContextFor } from '../../auth/auth-context.fixture';

// Integration test — needs the Compose Postgres up. Covers the parts of create that only a
// real database can show: the key sequence, the transaction boundary, and the link
// constraints validated against stored rows.
describe('CreateTicketHandler (integration)', () => {
  let db: Db;
  let handler: CreateTicketHandler;
  let projectId: string;
  let otherProjectId: string;
  const createdProjects: string[] = [];

  // A real row, because `tickets.reporter_id` is a foreign key (added in M15) and create now
  // populates it — a synthetic uuid stopped being insertable.
  let actorId: string;

  const actor = (role: UserRole): User => ({
    id: actorId,
    name: role === 'admin' ? 'Ada Admin' : role === 'manager' ? 'Mo Manager' : 'Dev Dever',
    email: `${role}@nimbus.io`,
    department: 'Engineering',
    role,
    status: 'active',
    createdAt: new Date().toISOString(),
  });

  const run = (input: TicketCreateDto, role: UserRole = 'manager', inProject = projectId) =>
    handler.execute(new CreateTicketCommand(inProject, input, authContextFor(actor(role))));

  const epicInput = (title = 'An epic'): TicketCreateDto => ({
    type: 'epic',
    title,
    description: '',
    labels: [],
    priority: 'medium',
  });

  const storyInput = (epicId: string): TicketCreateDto => ({
    type: 'story',
    title: 'A story',
    description: 'details',
    labels: ['api'],
    priority: 'high',
    env: 'staging',
    size: 'm',
    epicId,
  });

  const bugInput = (epicId: string, storyId?: string | null): TicketCreateDto => ({
    type: 'bug',
    title: 'A bug',
    description: '',
    labels: [],
    priority: 'critical',
    env: 'production',
    size: 's',
    severity: '2',
    epicId,
    storyId: storyId ?? null,
  });

  beforeAll(async () => {
    db = createDb();
    const [row] = await db
      .insert(users)
      .values({
        name: 'Create Ticket Actor', email: `create-ticket-${Date.now()}@nimbus.io`,
        department: 'Engineering', role: 'manager', status: 'active',
      })
      .returning();
    actorId = row.id;
    handler = new CreateTicketHandler(db, new TicketKeyService(db));
    projectId = await makeProject('YYA');
    otherProjectId = await makeProject('YYB');
  });

  afterAll(async () => {
    if (createdProjects.length) {
      await db.delete(tickets).where(inArray(tickets.projectId, createdProjects));
      await db.delete(projects).where(inArray(projects.id, createdProjects));
    }
    if (actorId) await db.delete(users).where(eq(users.id, actorId));
  });

  it('allocates sequential keys from the project prefix', async () => {
    const first = await run(epicInput('First epic'));
    const second = await run(epicInput('Second epic'));
    expect(first.key).toBe('YYA-1');
    expect(second.key).toBe('YYA-2');
  });

  it('sets reporter from the acting user, never from the payload', async () => {
    const ticket = await run(epicInput(), 'admin');
    expect(ticket.reporter).toBe('Ada Admin');
    // The FK, not just the display name: M19's ownership rules may read only this column.
    const [stored] = await db.select({ reporterId: tickets.reporterId }).from(tickets).where(eq(tickets.id, ticket.id));
    expect(stored.reporterId).toBe(actorId);
  });

  it('starts each type in its own default status', async () => {
    const epic = await run(epicInput());
    expect(epic.status).toBe('Planned');
    const story = await run(storyInput(epic.id));
    expect(story.status).toBe('Backlog');
    const bug = await run(bugInput(epic.id));
    expect(bug.status).toBe('Backlog');
  });

  it('nulls the story/bug-only fields on an epic', async () => {
    const epic = await run(epicInput());
    expect(epic.severity).toBeNull();
    expect(epic.env).toBeNull();
    expect(epic.size).toBeNull();
    expect(epic.epicId).toBeNull();
    expect(epic.storyId).toBeNull();
  });

  it('keeps severity for bugs and drops it for stories', async () => {
    const epic = await run(epicInput());
    expect((await run(storyInput(epic.id))).severity).toBeNull();
    expect((await run(bugInput(epic.id))).severity).toBe('2');
  });

  it('links a bug to a story under the same epic', async () => {
    const epic = await run(epicInput());
    const story = await run(storyInput(epic.id));
    const bug = await run(bugInput(epic.id, story.id));
    expect(bug.epicId).toBe(epic.id);
    expect(bug.storyId).toBe(story.id);
  });

  it('rejects a bug linked to a story under a different epic (R5)', async () => {
    const epicA = await run(epicInput('Epic A'));
    const epicB = await run(epicInput('Epic B'));
    const storyUnderA = await run(storyInput(epicA.id));
    await expect(run(bugInput(epicB.id, storyUnderA.id))).rejects.toThrow(/cannot link to a story outside/i);
  });

  it('rejects links to tickets in another project (R2)', async () => {
    const foreignEpic = await run(epicInput('Foreign'), 'manager', otherProjectId);
    await expect(run(storyInput(foreignEpic.id))).rejects.toThrow(/different project/i);
  });

  it('rejects an epic link that points at a story', async () => {
    const epic = await run(epicInput());
    const story = await run(storyInput(epic.id));
    await expect(run(storyInput(story.id))).rejects.toThrow(/is a story, not an epic/i);
  });

  it('rejects an unknown epic link', async () => {
    await expect(run(storyInput('00000000-0000-4000-8000-000000000009'))).rejects.toThrow(/not found/i);
  });

  it('forbids a developer from creating an epic but allows a story', async () => {
    await expect(run(epicInput(), 'developer')).rejects.toThrow(ForbiddenException);
    const epic = await run(epicInput());
    await expect(run(storyInput(epic.id), 'developer')).resolves.toMatchObject({ type: 'story' });
  });

  it('does not burn a sequence number when creation fails', async () => {
    const before = await currentSeq();
    await expect(run(storyInput('00000000-0000-4000-8000-000000000009'))).rejects.toThrow();
    expect(await currentSeq()).toBe(before);

    // And the next successful create takes the number the failed one didn't consume.
    const ticket = await run(epicInput());
    expect(ticket.key).toBe(`YYA-${before}`);
  });

  async function makeProject(prefix: string): Promise<string> {
    const [row] = await db
      .insert(projects)
      .values({ name: `Create Test ${prefix}`, keyPrefix: prefix, nextTicketSeq: 1 })
      .returning();
    createdProjects.push(row.id);
    return row.id;
  }

  async function currentSeq(): Promise<number> {
    const [row] = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
    return row.nextTicketSeq;
  }
});
