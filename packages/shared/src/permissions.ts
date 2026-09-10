import type { UserRole } from './enums';

/**
 * The permission matrix from specs/10-authentication-and-authorization.md §3.1–3.2, in one
 * place, split by **scope**.
 *
 * Lives in `shared` because both sides need it and they must not drift: the API enforces it in
 * guards (the actual control), and the frontend reads it to hide controls a role can't use.
 * Spec 08 is explicit that hiding a button is UX, never enforcement.
 *
 * Two maps, not one, because the two are answered from different roles. A platform action is
 * decided by `user.role` — the global one. A project action is decided by the *effective* role
 * for the project the request touches, which is usually not the same value (R13). Keeping them
 * in one map made it too easy to hand `can()` whichever role was in scope and be wrong half the
 * time; separate maps and separate decorators make the wrong one a type error.
 */
export const PLATFORM_PERMISSIONS = {
  'user.manage': ['admin'],
  'project.create': ['admin'],
  'directory.readEmails': ['admin'],
} as const satisfies Record<string, readonly UserRole[]>;

export const PROJECT_PERMISSIONS = {
  'project.update': ['admin', 'manager'],
  'project.members.manage': ['admin', 'manager'],
  'ticket.read': ['admin', 'manager', 'developer'],
  'ticket.create': ['admin', 'manager', 'developer'],
  'ticket.createEpic': ['admin', 'manager'],
  'ticket.update': ['admin', 'manager', 'developer'],
  // Developers reach these two through ownership instead (spec 10 §3.3, enforced in M19's
  // handlers) — the matrix answers only the role question.
  'ticket.assign': ['admin', 'manager'],
  'ticket.delete': ['admin', 'manager'],
  'comment.create': ['admin', 'manager', 'developer'],
} as const satisfies Record<string, readonly UserRole[]>;

export type PlatformAction = keyof typeof PLATFORM_PERMISSIONS;
export type ProjectAction = keyof typeof PROJECT_PERMISSIONS;
export type GuardedAction = PlatformAction | ProjectAction;

const ALL_PERMISSIONS: Record<GuardedAction, readonly UserRole[]> = {
  ...PLATFORM_PERMISSIONS,
  ...PROJECT_PERMISSIONS,
};

/**
 * The one rule that makes per-project roles work (spec 10 §3.2).
 *
 * A global admin is a platform superuser: they act as `admin` in every project whether or not a
 * membership row exists. Everyone else is exactly what their membership says, and `null` — no
 * membership — means the project responds 404, not 403, so its existence can't be probed.
 */
export function effectiveRole(
  globalRole: UserRole,
  membershipRole: UserRole | null | undefined,
): UserRole | null {
  if (globalRole === 'admin') return 'admin';
  return membershipRole ?? null;
}

/**
 * Matrix lookup. Pass the *global* role for a `PlatformAction` and the *effective project* role
 * for a `ProjectAction`; a null role (not a member, or not signed in) is always false.
 *
 * Used by guards, by the ownership checks that need the row as well as the role, and by the
 * frontend to decide whether to render a control.
 */
export function can(action: GuardedAction, role: UserRole | null | undefined): boolean {
  return role ? ALL_PERMISSIONS[action].includes(role) : false;
}
