import type { Department, User } from '@ticket-tracker/shared';
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
