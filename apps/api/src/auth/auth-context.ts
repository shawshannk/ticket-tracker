import type { User, UserRole } from '@ticket-tracker/shared';
import type { Request } from 'express';

/**
 * Everything a request knows about who is making it. Built by AuthGuard, read by the
 * permission guards and by command handlers that enforce ownership (M19).
 */
export interface AuthContext {
  user: User;
  /** The refresh-token family id — the session. Null for a dev-impersonated request. */
  sessionId: string | null;
  /** True when this identity came from the dev impersonation header, not a verified token. */
  impersonated: boolean;
  /**
   * Set by ProjectScopeGuard in M18: the effective role for the project this request touches.
   * Absent on routes that touch no project.
   */
  projectId?: string;
  projectRole?: UserRole;
}

export interface RequestWithAuth extends Request {
  auth?: AuthContext;
  /**
   * Mirror of `auth.user`, kept so the M3-era `@ActingUser()` decorator and `RolesGuard` keep
   * working until M18 replaces them. Remove with RolesGuard.
   */
  actingUser?: User | null;
}
