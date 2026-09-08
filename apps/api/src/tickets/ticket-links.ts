import { BadRequestException } from '@nestjs/common';
import type { TicketType } from '@ticket-tracker/shared';
import { eq } from 'drizzle-orm';
import type { DbExecutor } from '../db';
import { tickets } from '../db/schema';
import { assertEpicStoryConsistency, assertStoryLinkAllowed } from './ticket-rules';

export interface ParentLinks {
  projectId: string;
  type: TicketType;
  epicId?: string | null;
  storyId?: string | null;
}

/**
 * Validates a ticket's `epic_id` / `story_id` against what is actually stored: each link must
 * exist, be of the right type, live in the same project (R2 — a link across projects would
 * punch a hole straight through tenancy isolation), and satisfy R5.
 *
 * The pure predicates live in `ticket-rules.ts`; this is the part that needs the database, so
 * it takes an executor and can run inside the caller's transaction. Shared by create (M5a) and
 * update (M5b), where the same links can change.
 */
export async function assertParentLinks(executor: DbExecutor, links: ParentLinks): Promise<void> {
  const { projectId, type, epicId, storyId } = links;

  assertStoryLinkAllowed(type, storyId);

  if (epicId) {
    const epic = await loadTicket(executor, epicId);
    if (!epic) {
      throw new BadRequestException(`Epic ${epicId} not found`);
    }
    if (epic.type !== 'epic') {
      throw new BadRequestException(`Ticket ${epicId} is a ${epic.type}, not an epic`);
    }
    if (epic.projectId !== projectId) {
      throw new BadRequestException(`Epic ${epicId} belongs to a different project`);
    }
  }

  if (storyId) {
    const story = await loadTicket(executor, storyId);
    if (!story) {
      throw new BadRequestException(`Story ${storyId} not found`);
    }
    if (story.type !== 'story') {
      throw new BadRequestException(`Ticket ${storyId} is a ${story.type}, not a story`);
    }
    if (story.projectId !== projectId) {
      throw new BadRequestException(`Story ${storyId} belongs to a different project`);
    }
    assertEpicStoryConsistency(epicId, storyId, story.epicId);
  }
}

async function loadTicket(executor: DbExecutor, id: string) {
  const [row] = await executor
    .select({ id: tickets.id, type: tickets.type, projectId: tickets.projectId, epicId: tickets.epicId })
    .from(tickets)
    .where(eq(tickets.id, id))
    .limit(1);
  return row;
}
