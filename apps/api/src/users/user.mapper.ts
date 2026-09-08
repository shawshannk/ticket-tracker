import type { Department, User } from '@ticket-tracker/shared';
import type { users } from '../db/schema';

type UserRow = typeof users.$inferSelect;

/**
 * Drizzle row → the shared `User` DTO. The only difference is `createdAt`, which is a
 * `Date` in the row and an ISO string on the wire.
 */
export function toUser(row: UserRow): User {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    department: row.department as Department,
    role: row.role,
    createdAt: row.createdAt.toISOString(),
  };
}
