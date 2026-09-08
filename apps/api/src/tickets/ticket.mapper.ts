import type { Ticket } from '@ticket-tracker/shared';
import type { tickets } from '../db/schema';

type TicketRow = typeof tickets.$inferSelect;

/**
 * Drizzle row → the shared `Ticket` DTO. Timestamps become ISO strings; `startDate` /
 * `estimatedEndDate` are `date` columns, which postgres-js already hands back as
 * `YYYY-MM-DD` strings.
 */
export function toTicket(row: TicketRow): Ticket {
  return {
    id: row.id,
    projectId: row.projectId,
    key: row.key,
    type: row.type,
    title: row.title,
    description: row.description,
    status: row.status,
    priority: row.priority,
    severity: row.severity ?? null,
    assigneeId: row.assigneeId ?? null,
    reporter: row.reporter,
    labels: row.labels ?? [],
    env: row.env ?? null,
    size: row.size ?? null,
    epicId: row.epicId ?? null,
    storyId: row.storyId ?? null,
    sprintId: row.sprintId ?? null,
    startDate: row.startDate ?? null,
    estimatedEndDate: row.estimatedEndDate ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
