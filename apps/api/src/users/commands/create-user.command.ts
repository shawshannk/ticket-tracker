import { ConflictException, Inject } from '@nestjs/common';
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs';
import type { User, UserCreateDto } from '@ticket-tracker/shared';
import type { Db } from '../../db';
import { DB } from '../../db/db.module';
import { users } from '../../db/schema';
import { isUniqueViolation } from '../../common/is-unique-violation';
import { toUser } from '../user.mapper';

export class CreateUserCommand {
  constructor(readonly input: UserCreateDto) {}
}

@CommandHandler(CreateUserCommand)
export class CreateUserHandler implements ICommandHandler<CreateUserCommand, User> {
  constructor(@Inject(DB) private readonly db: Db) {}

  async execute({ input }: CreateUserCommand): Promise<User> {
    try {
      const [row] = await this.db.insert(users).values(input).returning();
      return toUser(row);
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictException(`A user with email ${input.email} already exists`);
      }
      throw err;
    }
  }
}
