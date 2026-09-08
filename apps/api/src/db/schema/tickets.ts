import { TICKET_ENVS, TICKET_PRIORITIES, TICKET_SEVERITIES, TICKET_SIZES, TICKET_TYPES } from '@ticket-tracker/shared';
import { type AnyPgColumn, date, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { projects } from './projects';
import { sprints } from './sprints';
import { users } from './users';

export const ticketTypeEnum = pgEnum('ticket_type', [...TICKET_TYPES]);
export const ticketPriorityEnum = pgEnum('ticket_priority', [...TICKET_PRIORITIES]);
export const ticketSeverityEnum = pgEnum('ticket_severity', [...TICKET_SEVERITIES]);
export const ticketEnvEnum = pgEnum('ticket_env', [...TICKET_ENVS]);
export const ticketSizeEnum = pgEnum('ticket_size', [...TICKET_SIZES]);

// `status` is plain text, not a Postgres enum — its valid values depend on the ticket's
// `type` (see STATUS_BY_TYPE in packages/shared) and are enforced server-side, per specs/00.
export const tickets = pgTable('tickets', {
  id: uuid('id').primaryKey().defaultRandom(),
  projectId: uuid('project_id')
    .notNull()
    .references(() => projects.id),
  key: text('key').notNull(),
  type: ticketTypeEnum('type').notNull(),
  title: text('title').notNull(),
  description: text('description').notNull().default(''),
  status: text('status').notNull(),
  priority: ticketPriorityEnum('priority').notNull(),
  severity: ticketSeverityEnum('severity'),
  assigneeId: uuid('assignee_id').references(() => users.id),
  reporter: text('reporter').notNull(),
  labels: text('labels').array().notNull().default([]),
  env: ticketEnvEnum('env'),
  size: ticketSizeEnum('size'),
  epicId: uuid('epic_id').references((): AnyPgColumn => tickets.id),
  storyId: uuid('story_id').references((): AnyPgColumn => tickets.id),
  sprintId: uuid('sprint_id').references(() => sprints.id),
  startDate: date('start_date'),
  estimatedEndDate: date('estimated_end_date'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
