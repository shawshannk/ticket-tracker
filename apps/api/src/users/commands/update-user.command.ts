import { BadRequestException, ConflictException, Inject, NotFoundException } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import type { User, UserUpdateDto } from '@ticket-tracker/shared';
import { and, eq, ne } from 'drizzle-orm';
import type { Db } from '../../db';
import { DB } from '../../db/db.module';
import { users } from '../../db/schema';
import { AuditService } from '../../auth/audit.service';
import { SessionService } from '../../auth/session.service';
import { isUniqueViolation } from '../../common/is-unique-violation';
import { toUser } from '../user.mapper';

export class UpdateUserCommand {
  constructor(
    readonly id: string,
    readonly input: UserUpdateDto,
    readonly actorId?: string,
  ) {}
}

@CommandHandler(UpdateUserCommand)
export class UpdateUserHandler implements ICommandHandler<UpdateUserCommand, User> {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly sessions: SessionService,
    private readonly audit: AuditService,
  ) {}

  private async anotherActiveAdminExists(excludingId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.role, 'admin'), eq(users.status, 'active'), ne(users.id, excludingId)))
      .limit(1);
    return Boolean(row);
  }

  async execute({ id, input, actorId }: UpdateUserCommand): Promise<User> {
    // An empty PATCH body is a no-op, not an error — Drizzle rejects `set({})`, so read back.
    if (Object.keys(input).length === 0) {
      const [existing] = await this.db.select().from(users).where(eq(users.id, id)).limit(1);
      if (!existing) {
        throw new NotFoundException(`User ${id} not found`);
      }
      return toUser(existing);
    }

    const [before] = await this.db.select().from(users).where(eq(users.id, id)).limit(1);
    if (!before) {
      throw new NotFoundException(`User ${id} not found`);
    }

    // R18: the platform must always keep an active admin. Refuse the edit that would remove the
    // last one, rather than discovering it when nobody can manage users any more.
    const losingAdmin =
      before.role === 'admin' &&
      before.status === 'active' &&
      ((input.role !== undefined && input.role !== 'admin') ||
        (input.status !== undefined && input.status !== 'active'));

    if (losingAdmin && !(await this.anotherActiveAdminExists(id))) {
      throw new BadRequestException('The platform must keep at least one active admin.');
    }

    try {
      const [row] = await this.db.update(users).set(input).where(eq(users.id, id)).returning();
      if (!row) {
        throw new NotFoundException(`User ${id} not found`);
      }

      // R15: revocation is immediate. A disabled account whose token merely expires eventually
      // is not disabled, and a role change must not leave a session running at the old level.
      if (row.status !== 'active') {
        await this.sessions.revokeAllForUser(id);
        await this.audit.record({ type: 'user_disabled', actorId: actorId ?? null, subjectId: id });
      } else if (input.role && input.role !== before.role) {
        await this.sessions.revokeAllForUser(id);
        await this.audit.record({
          type: 'role_changed',
          actorId: actorId ?? null,
          subjectId: id,
          metadata: { from: before.role, to: input.role },
        });
      }

      return toUser(row);
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictException(`A user with email ${input.email} already exists`);
      }
      throw err;
    }
  }
}
