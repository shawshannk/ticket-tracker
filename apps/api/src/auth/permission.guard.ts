import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { can, type PlatformAction, type ProjectAction } from '@ticket-tracker/shared';
import type { RequestWithAuth } from './auth-context';
import { PROJECT_SCOPE_KEY, type ProjectScopeMeta } from './project-scope.decorator';
import { REQUIRE_PLATFORM_KEY, REQUIRE_PROJECT_KEY } from './require.decorator';

/**
 * Enforces the permission matrix. Replaces M3's RolesGuard, which knew only one role per user.
 *
 * The difference that matters is which role each check reads: a platform action reads the
 * caller's global role, a project action reads the effective role ProjectScopeGuard resolved for
 * *this* project. A global manager who is a developer on this project cannot create an epic
 * here, and a global developer who is a project manager can (R13).
 *
 * Routes carrying neither decorator are open to any caller AuthGuard let through, which is how
 * project reads work: ProjectScopeGuard's 404 is the whole control there.
 */
@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const platform = this.reflector.getAllAndOverride<PlatformAction | undefined>(REQUIRE_PLATFORM_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    const project = this.reflector.getAllAndOverride<ProjectAction | undefined>(REQUIRE_PROJECT_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);

    if (!platform && !project) {
      return true;
    }

    const { auth } = ctx.switchToHttp().getRequest<RequestWithAuth>();
    if (!auth) {
      // Only reachable under AUTH_DEV_IMPERSONATION with no identity supplied — v1's behaviour,
      // where an anonymous caller could read but never write.
      throw new ForbiddenException('This action requires an authenticated user');
    }

    if (platform && !can(platform, auth.user.role)) {
      throw new ForbiddenException(`Role "${auth.user.role}" cannot perform this action (${platform})`);
    }

    if (project) {
      const scoped = this.reflector.getAllAndOverride<ProjectScopeMeta | undefined>(PROJECT_SCOPE_KEY, [
        ctx.getHandler(),
        ctx.getClass(),
      ]);
      if (!scoped) {
        // A @RequireProject route with no @ProjectScope has no effective role to check. Failing
        // loudly beats a 403 that looks like policy and hides a route nobody is scoping.
        throw new InternalServerErrorException(
          `Route requires project permission "${project}" but is not marked @ProjectScope`,
        );
      }
      if (!can(project, auth.projectRole)) {
        throw new ForbiddenException(
          `Project role "${auth.projectRole ?? 'none'}" cannot perform this action (${project})`,
        );
      }
    }

    return true;
  }
}
