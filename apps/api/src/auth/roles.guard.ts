import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { UserRole } from '@ticket-tracker/shared';
import { ACTING_USER_HEADER, type RequestWithActingUser } from './acting-user.guard';
import { ROLES_KEY } from './roles.decorator';

/**
 * Enforces the spec 00 role matrix against the acting user resolved by ActingUserGuard.
 * Routes with no @Roles metadata are open. Runs after ActingUserGuard (registration order
 * in AuthModule).
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<UserRole[] | undefined>(ROLES_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);

    if (!required || required.length === 0) {
      return true;
    }

    const { actingUser } = ctx.switchToHttp().getRequest<RequestWithActingUser>();

    if (!actingUser) {
      throw new ForbiddenException(`This action requires the ${ACTING_USER_HEADER} header`);
    }

    if (!required.includes(actingUser.role)) {
      throw new ForbiddenException(
        `Role "${actingUser.role}" cannot perform this action (requires: ${required.join(', ')})`,
      );
    }

    return true;
  }
}
