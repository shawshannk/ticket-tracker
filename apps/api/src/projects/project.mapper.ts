import type { Project } from '@ticket-tracker/shared';
import type { projects } from '../db/schema';

type ProjectRow = typeof projects.$inferSelect;

export function toProject(row: ProjectRow): Project {
  return {
    id: row.id,
    name: row.name,
    keyPrefix: row.keyPrefix,
    nextTicketSeq: row.nextTicketSeq,
    createdAt: row.createdAt.toISOString(),
  };
}
