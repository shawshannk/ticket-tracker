import { Inject, NotFoundException } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import type { User } from '@ticket-tracker/shared';
import { eq } from 'drizzle-orm';
import type { Db } from '../../db';
import { DB } from '../../db/db.module';
import { users } from '../../db/schema';
import { toUser } from '../user.mapper';

export class GetUserQuery {
  constructor(readonly id: string) {}
}

@QueryHandler(GetUserQuery)
export class GetUserHandler implements IQueryHandler<GetUserQuery, User> {
  constructor(@Inject(DB) private readonly db: Db) {}

  async execute({ id }: GetUserQuery): Promise<User> {
    const [row] = await this.db.select().from(users).where(eq(users.id, id)).limit(1);
    if (!row) {
      throw new NotFoundException(`User ${id} not found`);
    }
    return toUser(row);
  }
}
