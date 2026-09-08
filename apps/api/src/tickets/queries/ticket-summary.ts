import type { TicketSummary } from '@ticket-tracker/shared';
import { eq as eqCol } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { DbExecutor } from '../../db';
import { tickets, users } from '../../db/schema';

/**
 * The one joined select behind every "row of tickets" read — list (M6a), board and the
 * overview's recent activity (M6b). Kept in one place so the three views can't disagree
 * about what a ticket row looks like or which names it carries.
 *
 * Aliases are needed because `epic` and `story` are both self-joins on `tickets`.
 */
export const assignee = alias(users, 'assignee');
export const epic = alias(tickets, 'epic');
export const story = alias(tickets, 'story');

export const summaryColumns = {
  id: tickets.id,
  projectId: tickets.projectId,
  key: tickets.key,
  type: tickets.type,
  title: tickets.title,
  status: tickets.status,
  priority: tickets.priority,
  severity: tickets.severity,
  env: tickets.env,
  labels: tickets.labels,
  sprintId: tickets.sprintId,
  createdAt: tickets.createdAt,
  updatedAt: tickets.updatedAt,
  assigneeId: assignee.id,
  assigneeName: assignee.name,
  epicId: epic.id,
  epicKey: epic.key,
  epicTitle: epic.title,
  storyId: story.id,
  storyKey: story.key,
  storyTitle: story.title,
};

export type SummaryRow = {
  [K in keyof typeof summaryColumns]: (typeof summaryColumns)[K]['_']['data'] | null;
} & {
  // Columns that come from `tickets` itself are never null on a matched row.
  id: string;
  projectId: string;
  key: string;
  type: TicketSummary['type'];
  title: string;
  status: string;
  priority: TicketSummary['priority'];
  createdAt: Date;
  updatedAt: Date;
};

/** `select(summaryColumns).from(tickets)` plus the three left joins. */
export function summarySelect(executor: DbExecutor) {
  return executor
    .select(summaryColumns)
    .from(tickets)
    .leftJoin(assignee, eqCol(tickets.assigneeId, assignee.id))
    .leftJoin(epic, eqCol(tickets.epicId, epic.id))
    .leftJoin(story, eqCol(tickets.storyId, story.id));
}

export function toTicketSummary(row: SummaryRow): TicketSummary {
  return {
    id: row.id,
    projectId: row.projectId,
    key: row.key,
    type: row.type,
    title: row.title,
    status: row.status,
    priority: row.priority,
    severity: row.severity ?? null,
    env: row.env ?? null,
    labels: row.labels ?? [],
    assignee: row.assigneeId && row.assigneeName ? { id: row.assigneeId, name: row.assigneeName } : null,
    epic: row.epicId && row.epicKey && row.epicTitle ? { id: row.epicId, key: row.epicKey, title: row.epicTitle } : null,
    story:
      row.storyId && row.storyKey && row.storyTitle ? { id: row.storyId, key: row.storyKey, title: row.storyTitle } : null,
    sprintId: row.sprintId ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

