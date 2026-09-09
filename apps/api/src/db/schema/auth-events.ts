import { index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from './users';

/**
 * Audit trail for anything that grants, uses or removes authority (R19). Append-only by
 * convention — no update or delete path is written against it.
 *
 * `type` is plain text rather than a pg enum on purpose: new event types will be added by later
 * modules, and a migration per event type is friction with no safety payoff for a log.
 *
 * `metadata` must never carry credentials. For `login_failed` it holds the attempted email and
 * nothing else (R17).
 */
export const authEvents = pgTable(
  'auth_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    type: text('type').notNull(),
    /** Who acted. Null for anonymous events such as a failed login. */
    actorId: uuid('actor_id').references(() => users.id, { onDelete: 'set null' }),
    /** Who it was done to. Equals `actorId` for self-service actions. */
    subjectId: uuid('subject_id').references(() => users.id, { onDelete: 'set null' }),
    ip: text('ip'),
    userAgent: text('user_agent'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ bySubject: index('auth_events_subject_idx').on(t.subjectId, t.createdAt) }),
);
