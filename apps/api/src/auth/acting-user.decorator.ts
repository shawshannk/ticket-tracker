import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { User } from '@ticket-tracker/shared';
import type { RequestWithAuth } from './auth-context';

/**
 * Injects the authenticated user. Superseded by `@Auth()`, which carries the session and (from
 * M18) the project role too; kept until M18 finishes migrating the ticket routes off it.
 *
 * Reads `req.actingUser`, which AuthGuard sets as a mirror of `req.auth.user`.
 */
export const ActingUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): User | null =>
    ctx.switchToHttp().getRequest<RequestWithAuth>().actingUser ?? null,
);
