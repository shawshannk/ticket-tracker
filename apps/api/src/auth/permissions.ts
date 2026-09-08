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
} as const satisfies Record<string, readonly UserRole[]>;

export type GuardedAction = keyof typeof PERMISSIONS;
