import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { AuthContext, RequestWithAuth } from './auth-context';

/**
 * The authenticated request context. On any route that is not `@Public()`, this is present by
 * the time the handler runs — except while `AUTH_DEV_IMPERSONATION` is on and the caller sent
 * no identity at all, which is why the type admits null.
 */
export const Auth = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthContext | null =>
    ctx.switchToHttp().getRequest<RequestWithAuth>().auth ?? null,
);
