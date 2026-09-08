import { CanActivate, ExecutionContext, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import type { User } from '@ticket-tracker/shared';
import { eq } from 'drizzle-orm';
import type { Request } from 'express';
import { DB } from '../db/db.module';
import type { Db } from '../db';
import { users } from '../db/schema';
import { toUser } from '../users/user.mapper';

export const ACTING_USER_HEADER = 'x-acting-user-id';

export interface RequestWithActingUser extends Request {
  actingUser?: User | null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Resolves the `X-Acting-User-Id` header into `req.actingUser`. See specs/08 for why this
 * is role simulation, not authentication: the header is self-reported and unverified.
 *
 * Never rejects for a *missing* header — that leaves `actingUser` null and lets RolesGuard
 * answer with 403 on guarded routes, while unguarded reads (GET /users) stay open. A header
 * that is present but unresolvable is a client bug, so it fails loudly with 401.
 */
@Injectable()
export class ActingUserGuard implements CanActivate {
  constructor(@Inject(DB) private readonly db: Db) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<RequestWithActingUser>();
    const headerValue = req.headers[ACTING_USER_HEADER];
    const id = Array.isArray(headerValue) ? headerValue[0] : headerValue;

    if (!id) {
      req.actingUser = null;
      return true;
    }

    if (!UUID_RE.test(id)) {
      throw new UnauthorizedException(`${ACTING_USER_HEADER} is not a valid user id`);
    }

    const [row] = await this.db.select().from(users).where(eq(users.id, id)).limit(1);
    if (!row) {
      throw new UnauthorizedException(`No user matches ${ACTING_USER_HEADER}`);
    }

    req.actingUser = toUser(row);
    return true;
  }
}
