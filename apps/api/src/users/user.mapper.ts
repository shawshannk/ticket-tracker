import type { Department, User, UserRole } from '@ticket-tracker/shared';
import type { users } from '../db/schema';

type UserRow = typeof users.$inferSelect;

/**
 * The columns the DTO is built from — deliberately a *subset* of the row, so callers can pass
 * an explicit projection that never fetches `password_hash` at all (R17), and a full row still
 * satisfies it structurally.
 */
export type UserFields = Pick<UserRow, 'id' | 'name' | 'email' | 'department' | 'role' | 'status' | 'createdAt'>;

/**
 * Drizzle row → the shared `User` DTO. The only difference is `createdAt`, which is a
 * `Date` in the row and an ISO string on the wire.
 *
 * Built field by field on purpose: spreading the row would publish whatever column is added
 * next, including credentials. `user.mapper.spec.ts` locks that down.
 */
export function toUser(row: UserFields): User {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    department: row.department as Department,
    role: row.role,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Whoever is asking. Null only under dev impersonation with no identity supplied. */
export interface EmailViewer {
  id: string;
  role: UserRole;
}

/**
 * Who may read someone's email address (docs/auth-tech-spec.md §4.4).
 *
 * A platform admin manages accounts and cannot do it blind; everyone else sees their own and
 * nobody else's. The directory is otherwise open — names, roles and departments are how the app
 * renders assignees and comment authors — so this is the one field that narrows, and it narrows
 * because an address list is the raw material for phishing the whole company.
 */
export function canSeeEmail(viewer: EmailViewer | null | undefined, subjectId: string): boolean {
  if (!viewer) return false;
  return viewer.role === 'admin' || viewer.id === subjectId;
}

/**
 * Map for a specific viewer, redacting the email when they may not see it.
 *
 * Redacted at the mapper rather than in each query, for the same reason `toUser` is written
 * field by field: the rule has to live where every DTO is built, or the next endpoint that
 * returns a user quietly reintroduces the leak.
 */
export function toUserFor(viewer: EmailViewer | null | undefined, row: UserFields): User {
  const user = toUser(row);
  return canSeeEmail(viewer, row.id) ? user : { ...user, email: null };
}
