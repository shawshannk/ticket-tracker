import type { UserRole } from '@ticket-tracker/shared';

/**
 * The role permission matrix from specs/00-architecture-and-data-model.md, in one place.
 * Actions absent from this map are open to every role (create Story/Bug, edit any ticket,
 * comment). Guarded actions are declared on handlers with `@Roles(...PERMISSIONS.x)`.
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
 * Matrix lookup for checks that can't be a route-level `@Roles` — e.g. epic creation, which
 * depends on the request body's `type` rather than the route (spec 06).
 */
export function can(action: GuardedAction, role: UserRole): boolean {
  return (PERMISSIONS[action] as readonly UserRole[]).includes(role);
}
