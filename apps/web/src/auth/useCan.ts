import { can, effectiveRole, type PlatformAction, type ProjectAction, type UserRole } from '@ticket-tracker/shared';
import { useParams } from '@tanstack/react-router';
import { useAuth } from './AuthProvider';

/**
 * Permission helpers for the UI (spec 10 §6).
 *
 * Every one of these is **UX, never enforcement** — exactly as in v1, and for the same reason:
 * the server re-checks all of it. What changed in v2 is that the frontend now has to ask the
 * right question. A project action is decided by the *effective* role for the project on screen,
 * not by the user's global role, so `useCan` and `useCanPlatform` are separate hooks rather than
 * one taking a scope argument — passing the wrong role is then not something a call site can do.
 */

/**
 * The caller's effective role in the project currently on screen, or null outside a project
 * route. Mirrors the server's `effectiveRole()`, including the platform-admin bypass, from the
 * memberships login handed us — no request per project (docs/auth-tech-spec.md §4.1).
 */
export function useEffectiveRole(): UserRole | null {
  const { user, memberships } = useAuth();
  const { projectId } = useParams({ strict: false }) as { projectId?: string };

  if (!user || !projectId) return null;
  return effectiveRole(user.role, memberships.find((m) => m.projectId === projectId)?.role);
}

/** A project-scoped permission, against the effective role for the project on screen (R13). */
export function useCan(action: ProjectAction): boolean {
  return can(action, useEffectiveRole());
}

/** A platform-scoped permission, against the caller's global role. */
export function useCanPlatform(action: PlatformAction): boolean {
  const { user } = useAuth();
  return can(action, user?.role);
}
