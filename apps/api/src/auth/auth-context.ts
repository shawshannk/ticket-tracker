import type { User, UserRole } from '@ticket-tracker/shared';
import type { Request } from 'express';

/**
 * Everything a request knows about who is making it. Built by AuthGuard, extended by
 * ProjectScopeGuard, read by PermissionGuard and by command handlers.
 */
export interface AuthContext {
  user: User;
  /** The refresh-token family id — the session. Null for a dev-impersonated request. */
  sessionId: string | null;
  /** True when this identity came from the dev impersonation header, not a verified token. */
  impersonated: boolean;
  /**
   * Set by ProjectScopeGuard on `@ProjectScope` routes: the project this request touches and
   * the caller's effective role in it (spec 10 §3.2). Absent on routes that touch no project,
   * and — while AUTH_DEV_IMPERSONATION is on — on a request that carried no identity.
   */
  projectId?: string;
  projectRole?: UserRole;
}

export interface RequestWithAuth extends Request {
  auth?: AuthContext;
}
