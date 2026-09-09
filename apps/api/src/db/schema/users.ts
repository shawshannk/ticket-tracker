import { USER_ROLES, USER_STATUSES } from '@ticket-tracker/shared';
import { pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const userRoleEnum = pgEnum('user_role', [...USER_ROLES]);
export const userStatusEnum = pgEnum('user_status', [...USER_STATUSES]);

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  department: text('department').notNull(),
  /**
   * The **global** role (spec 10 §3.1): it governs platform-level actions only. Inside a
   * project, `project_members.role` overrides it — except for `admin`, which is a platform
   * superuser everywhere.
   */
  role: userRoleEnum('role').notNull(),
  status: userStatusEnum('status').notNull().default('invited'),
  /**
   * Null until an invite is accepted, and a hard "cannot log in" — checked before any hash
   * comparison so an invited account never reaches argon2 at all. Never select this into a
   * DTO (R17); prefer explicit projections over `select()` in every users query.
   */
  passwordHash: text('password_hash'),
  passwordChangedAt: timestamp('password_changed_at', { withTimezone: true }),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
