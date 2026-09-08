import 'dotenv/config';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import type { TicketCreateDto, User, UserRole } from '@ticket-tracker/shared';
import { eq, inArray } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDb, type Db } from '../../db';
import { comments, projects, tickets, users } from '../../db/schema';
import { TicketKeyService } from '../../projects/ticket-key.service';
import { AddCommentCommand, AddCommentHandler } from './add-comment.command';
import { CreateTicketCommand, CreateTicketHandler } from './create-ticket.command';
import { DeleteTicketCommand, DeleteTicketHandler } from './delete-ticket.command';
import { MoveTicketStatusCommand, MoveTicketStatusHandler } from './move-ticket-status.command';
import { UpdateTicketCommand, UpdateTicketHandler } from './update-ticket.command';

const MISSING = '00000000-0000-4000-8000-000000000009';

// Integration test — needs the Compose Postgres up. Exercises M5b's four commands against
// stored rows, which is where the rules actually have to hold.
describe('ticket write commands (integration)', () => {
  let db: Db;
  let create: CreateTicketHandler;
  let update: UpdateTicketHandler;
  let move: MoveTicketStatusHandler;
  let remove: DeleteTicketHandler;
  let comment: AddCommentHandler;
  let projectId: string;
  let seededUser: User;

  beforeAll(async () => {
    db = createDb();
    create = new CreateTicketHandler(db, new TicketKeyService(db));
    update = new UpdateTicketHandler(db);
    move = new MoveTicketStatusHandler(db);
    remove = new DeleteTicketHandler(db);
    comment = new AddCommentHandler(db);

    const [project] = await db
      .insert(projects)
      .values({ name: 'Write Cmd Test', keyPrefix: 'YYW', nextTicketSeq: 1 })
      .returning();
    projectId = project.id;

    // A real user row — comments.author_id is a FK, so this can't be a fabricated id.
    const [row] = await db.select().from(users).limit(1);
    seededUser = { ...row, department: row.department as User['department'], createdAt: row.createdAt.toISOString() };
  });

  afterAll(async () => {
    const rows = await db.select({ id: tickets.id }).from(tickets).where(eq(tickets.projectId, projectId));
    if (rows.length) {
      await db.delete(comments).where(inArray(comments.ticketId, rows.map((r) => r.id)));
    }
    await db.delete(tickets).where(eq(tickets.projectId, projectId));
    await db.delete(projects).where(eq(projects.id, projectId));
  });

  const actor = (role: UserRole = 'manager'): User => ({ ...seededUser, role });

  const mkEpic = (title = 'Epic') =>
    create.execute(new CreateTicketCommand(projectId, { type: 'epic', title, description: '', labels: [], priority: 'medium' }, actor()));

  const mkStory = (epicId: string) =>
    create.execute(
      new CreateTicketCommand(
        projectId,
        { type: 'story', title: 'Story', description: '', labels: [], priority: 'medium', env: 'staging', size: 'm', epicId } as TicketCreateDto,
        actor(),
      ),
    );

  const mkBug = (epicId: string, storyId?: string) =>
    create.execute(
      new CreateTicketCommand(
        projectId,
        { type: 'bug', title: 'Bug', description: '', labels: [], priority: 'low', env: 'staging', size: 's', severity: '3', epicId, storyId: storyId ?? null } as TicketCreateDto,
        actor(),
      ),
    );

  describe('UpdateTicket', () => {
    it('applies an edit and advances updated_at', async () => {
      const epic = await mkEpic();
      const before = epic.updatedAt;
      await new Promise((r) => setTimeout(r, 5));

      const updated = await update.execute(new UpdateTicketCommand(epic.id, { priority: 'critical', status: 'In Progress' }));
      expect(updated.priority).toBe('critical');
      expect(updated.status).toBe('In Progress');
      expect(new Date(updated.updatedAt).getTime()).toBeGreaterThan(new Date(before).getTime());
      expect(updated.createdAt).toBe(epic.createdAt);
    });

    it('validates status against the stored type, not the request', async () => {
      const epic = await mkEpic();
      const story = await mkStory(epic.id);
      await expect(update.execute(new UpdateTicketCommand(epic.id, { status: 'Backlog' }))).rejects.toThrow(BadRequestException);
      await expect(update.execute(new UpdateTicketCommand(story.id, { status: 'Planned' }))).rejects.toThrow(BadRequestException);
      await expect(update.execute(new UpdateTicketCommand(story.id, { status: 'In Review' }))).resolves.toMatchObject({ status: 'In Review' });
    });

    it('re-checks R5 when either link changes', async () => {
      const epicA = await mkEpic('A');
      const epicB = await mkEpic('B');
      const storyUnderA = await mkStory(epicA.id);
      const bug = await mkBug(epicA.id, storyUnderA.id);

      // Moving the bug to another epic while it still points at a story under the old one.
      await expect(update.execute(new UpdateTicketCommand(bug.id, { epicId: epicB.id }))).rejects.toThrow(/outside its own epic/i);
      // Moving both together is fine.
      const storyUnderB = await mkStory(epicB.id);
      await expect(
        update.execute(new UpdateTicketCommand(bug.id, { epicId: epicB.id, storyId: storyUnderB.id })),
      ).resolves.toMatchObject({ epicId: epicB.id, storyId: storyUnderB.id });
    });

    it('refuses type-inappropriate fields', async () => {
      const epic = await mkEpic();
      await expect(update.execute(new UpdateTicketCommand(epic.id, { severity: '1' }))).rejects.toThrow(BadRequestException);
      await expect(update.execute(new UpdateTicketCommand(epic.id, { env: 'staging' }))).rejects.toThrow(BadRequestException);
    });

    it('treats an empty body as a no-op and 404s an unknown ticket', async () => {
      const epic = await mkEpic();
      await expect(update.execute(new UpdateTicketCommand(epic.id, {}))).resolves.toMatchObject({ id: epic.id });
      await expect(update.execute(new UpdateTicketCommand(MISSING, { priority: 'low' }))).rejects.toThrow(NotFoundException);
    });
  });

  describe('MoveTicketStatus', () => {
    it('moves within the type-valid set and advances updated_at', async () => {
      const epic = await mkEpic();
      const story = await mkStory(epic.id);
      const before = story.updatedAt;
      await new Promise((r) => setTimeout(r, 5));

      const moved = await move.execute(new MoveTicketStatusCommand(story.id, { status: 'Blocked' }));
      expect(moved.status).toBe('Blocked');
      expect(new Date(moved.updatedAt).getTime()).toBeGreaterThan(new Date(before).getTime());
    });

    it('rejects a status outside the ticket type (the spec 04 drag case)', async () => {
      const epic = await mkEpic();
      const bug = await mkBug(epic.id);
      await expect(move.execute(new MoveTicketStatusCommand(bug.id, { status: 'Planned' }))).rejects.toThrow(BadRequestException);
      await expect(move.execute(new MoveTicketStatusCommand(epic.id, { status: 'On Hold' }))).rejects.toThrow(BadRequestException);
    });

    it('404s an unknown ticket', async () => {
      await expect(move.execute(new MoveTicketStatusCommand(MISSING, { status: 'Done' }))).rejects.toThrow(NotFoundException);
    });
  });

  describe('AddComment', () => {
    it('takes author_id from the acting user, not the body (R6)', async () => {
      const epic = await mkEpic();
      const created = await comment.execute(new AddCommentCommand(epic.id, { body: 'Looks good' }, actor()));
      expect(created.authorId).toBe(seededUser.id);
      expect(created.body).toBe('Looks good');

      const [stored] = await db.select().from(comments).where(eq(comments.id, created.id));
      expect(stored.authorId).toBe(seededUser.id);
    });

    it('advances the ticket updated_at', async () => {
      const epic = await mkEpic();
      await new Promise((r) => setTimeout(r, 5));
      await comment.execute(new AddCommentCommand(epic.id, { body: 'ping' }, actor()));
      const [row] = await db.select().from(tickets).where(eq(tickets.id, epic.id));
      expect(row.updatedAt.getTime()).toBeGreaterThan(new Date(epic.updatedAt).getTime());
    });

    it('404s an unknown ticket', async () => {
      await expect(comment.execute(new AddCommentCommand(MISSING, { body: 'x' }, actor()))).rejects.toThrow(NotFoundException);
    });
  });

  describe('DeleteTicket', () => {
    it('deletes a leaf ticket and cascades its comments', async () => {
      const epic = await mkEpic();
      const created = await comment.execute(new AddCommentCommand(epic.id, { body: 'bye' }, actor()));

      await remove.execute(new DeleteTicketCommand(epic.id));

      expect(await db.select().from(tickets).where(eq(tickets.id, epic.id))).toHaveLength(0);
      expect(await db.select().from(comments).where(eq(comments.id, created.id))).toHaveLength(0);
    });

    it('refuses to delete a ticket that still has children, leaving it intact', async () => {
      const epic = await mkEpic();
      const story = await mkStory(epic.id);

      await expect(remove.execute(new DeleteTicketCommand(epic.id))).rejects.toThrow(ConflictException);
      expect(await db.select().from(tickets).where(eq(tickets.id, epic.id))).toHaveLength(1);

      // Once the child is gone the parent can be deleted.
      await remove.execute(new DeleteTicketCommand(story.id));
      await expect(remove.execute(new DeleteTicketCommand(epic.id))).resolves.toBeUndefined();
    });

    it('counts a bug story-link as a child too', async () => {
      const epic = await mkEpic();
      const story = await mkStory(epic.id);
      await mkBug(epic.id, story.id);
      await expect(remove.execute(new DeleteTicketCommand(story.id))).rejects.toThrow(ConflictException);
    });

    it('404s an unknown ticket', async () => {
      await expect(remove.execute(new DeleteTicketCommand(MISSING))).rejects.toThrow(NotFoundException);
    });
  });
});
