import { ConflictException, Inject, NotFoundException } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import type { User, UserUpdateDto } from '@ticket-tracker/shared';
import { eq } from 'drizzle-orm';
import type { Db } from '../../db';
import { DB } from '../../db/db.module';
import { users } from '../../db/schema';
import { isUniqueViolation } from '../is-unique-violation';
import { toUser } from '../user.mapper';

export class UpdateUserCommand {
  constructor(
    readonly id: string,
    readonly input: UserUpdateDto,
  ) {}
}

@CommandHandler(UpdateUserCommand)
export class UpdateUserHandler implements ICommandHandler<UpdateUserCommand, User> {
  constructor(@Inject(DB) private readonly db: Db) {}

  async execute({ id, input }: UpdateUserCommand): Promise<User> {
    // An empty PATCH body is a no-op, not an error — Drizzle rejects `set({})`, so read back.
    if (Object.keys(input).length === 0) {
      const [existing] = await this.db.select().from(users).where(eq(users.id, id)).limit(1);
      if (!existing) {
        throw new NotFoundException(`User ${id} not found`);
      }
      return toUser(existing);
    }

    try {
      const [row] = await this.db.update(users).set(input).where(eq(users.id, id)).returning();
      if (!row) {
        throw new NotFoundException(`User ${id} not found`);
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
