import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { User } from '@ticket-tracker/shared';
import type { RequestWithActingUser } from './acting-user.guard';

/**
 * Injects the user resolved from `X-Acting-User-Id`. Null on routes that don't require
 * one; on a @Roles-guarded route it is always present by the time the handler runs.
 */
export const ActingUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): User | null =>
    ctx.switchToHttp().getRequest<RequestWithActingUser>().actingUser ?? null,
);
