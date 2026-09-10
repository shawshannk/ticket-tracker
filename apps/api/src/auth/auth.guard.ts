import { CanActivate, ExecutionContext, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { eq } from 'drizzle-orm';
import type { Db } from '../db';
import { DB } from '../db/db.module';
import { users } from '../db/schema';
import { toUser } from '../users/user.mapper';
import type { RequestWithAuth } from './auth-context';
import { ACTING_USER_HEADER, DEV_IMPERSONATION_ENABLED } from './dev-impersonation';
import { IS_PUBLIC_KEY } from './public.decorator';
import { SessionService } from './session.service';
import { TokenService } from './token.service';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Resolves the caller's identity. Replaces M3's ActingUserGuard, which trusted a header.
 *
 * **Why it re-reads the user on every request.** The access token carries `sub`, `sid` and
 * `role`, and it would be cheaper to trust them for 15 minutes. But R15 requires that disabling
 * an account or changing a password ends access *now*, not when the token happens to expire.
 * So each request costs one indexed user lookup and one session check, and the database wins
 * over the token on any disagreement. Do not cache this across requests without re-deriving R15.
 *
 * **Dev impersonation.** With `AUTH_DEV_IMPERSONATION=true` the guard also accepts
 * `X-Acting-User-Id`, and — deliberately — lets a request with *no* credentials through as
 * anonymous, exactly as v1 behaved. That keeps the pre-M20 web app and the e2e suite working
 * while the frontend still has no login screen. With the flag off, which is the only supported
 * production configuration, R11 applies: every non-public route needs a verified token.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly reflector: Reflector,
    private readonly tokens: TokenService,
    private readonly sessions: SessionService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const req = ctx.switchToHttp().getRequest<RequestWithAuth>();

    const bearer = this.bearerToken(req);
    if (bearer) {
      await this.authenticateWithToken(req, bearer);
      return true;
    }

    if (DEV_IMPERSONATION_ENABLED) {
      return this.authenticateWithHeader(req);
    }

    throw new UnauthorizedException('Authentication required');
  }

  private bearerToken(req: RequestWithAuth): string | null {
    const header = req.headers.authorization;
    if (!header) return null;
    const [scheme, value] = header.split(' ');
    return scheme?.toLowerCase() === 'bearer' && value ? value : null;
  }

  private async authenticateWithToken(req: RequestWithAuth, token: string): Promise<void> {
    // Throws 401 on a bad signature, wrong issuer/audience, or expiry.
    const claims = this.tokens.verifyAccessToken(token);

    const user = await this.loadActiveUser(claims.sub);
    if (!user) {
      // The account was disabled or deleted since the token was issued (R15).
      throw new UnauthorizedException('Account is no longer active');
    }

    // The session may have been revoked — logout, "log out everywhere", a password change, or
    // reuse detection killing the family. An unexpired token must not outlive its session.
    if (!(await this.sessions.isFamilyActive(claims.sid))) {
      throw new UnauthorizedException('Session is no longer active');
    }

    req.auth = { user, sessionId: claims.sid, impersonated: false };
  }

  private async authenticateWithHeader(req: RequestWithAuth): Promise<boolean> {
    const raw = req.headers[ACTING_USER_HEADER];
    const id = Array.isArray(raw) ? raw[0] : raw;

    if (!id) {
      // v1 semantics: no identity, request proceeds, and PermissionGuard answers 403 on any
      // guarded route while open reads stay open.
      req.auth = undefined;
      return true;
    }

    if (!UUID_RE.test(id)) {
      throw new UnauthorizedException(`${ACTING_USER_HEADER} is not a valid user id`);
    }

    const user = await this.loadActiveUser(id);
    if (!user) {
      throw new UnauthorizedException(`No active user matches ${ACTING_USER_HEADER}`);
    }

    req.auth = { user, sessionId: null, impersonated: true };
    return true;
  }

  /**
   * Explicit projection, never `select()`: R17 says password material must not leave the
   * database layer, and the cheapest way to keep that true is to never fetch it.
   */
  private async loadActiveUser(id: string) {
    const [row] = await this.db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        department: users.department,
        role: users.role,
        status: users.status,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(eq(users.id, id))
      .limit(1);

    // `invited` counts as inactive here: an account with no password must not be reachable
    // through a stale token or an impersonation header either.
    return row && row.status === 'active' ? toUser(row) : null;
  }
}
