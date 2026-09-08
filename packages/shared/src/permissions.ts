import type { UserRole } from './enums';

/**
 * The role permission matrix from specs/00-architecture-and-data-model.md, in one place.
 *
 * Lives in `shared` because **both** sides need it and they must not drift: the API enforces
 * it in guards (the actual control), and the frontend reads it to hide controls a role can't
 * use. Spec 08 is explicit that hiding a button is UX, never enforcement — a check here is
 * never a substitute for the server's.
 *
 * Actions absent from this map are open to every role (create Story/Bug, edit any ticket,
 * comment).
 */
export const PERMISSIONS = {
  manageUsers: ['admin'],
  manageProjects: ['admin'],
  createEpic: ['admin', 'manager'],
  deleteTicket: ['admin', 'manager'],
  // The matrix's "all three roles" row — used to require *a* recognized acting user on
  // ticket writes, where the reporter/comment author has to come from somewhere.
  writeTicket: ['admin', 'manager', 'developer'],
} as const satisfies Record<string, readonly UserRole[]>;

export type GuardedAction = keyof typeof PERMISSIONS;

/**
 * Matrix lookup for checks that can't be expressed as a route-level guard — e.g. epic
 * creation, which depends on the request body's `type` (spec 06), or the frontend deciding
 * whether to render a Delete button.
 */
export function can(action: GuardedAction, role: UserRole | null | undefined): boolean {
  return role ? (PERMISSIONS[action] as readonly UserRole[]).includes(role) : false;
}
