import { index, pgTable, primaryKey, timestamp, uuid } from 'drizzle-orm/pg-core';
import { projects } from './projects';
import { userRoleEnum, users } from './users';

/**
 * Who can see a project, and as what (spec 10 §3.2). Absence of a row means the project does
 * not exist as far as that user is concerned — a non-member gets 404, never 403, so project
 * existence cannot be probed by watching status codes.
 *
 * `role` reuses `userRoleEnum` deliberately: a project role is drawn from the same three
 * values, so the shared permission matrix works unchanged on either scope.
 */
export const projectMembers = pgTable(
  'project_members',
  {
    projectId: uuid('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: userRoleEnum('role').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid('created_by').references(() => users.id),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.projectId, t.userId] }),
    // "Which projects am I a member of" runs on every project-list request (tech spec §6.3).
    byUser: index('project_members_user_idx').on(t.userId),
  }),
);
