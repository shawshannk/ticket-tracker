import { Inject } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import type { User } from '@ticket-tracker/shared';
import { asc } from 'drizzle-orm';
import type { Db } from '../../db';
import { DB } from '../../db/db.module';
import { users } from '../../db/schema';
import { toUser } from '../user.mapper';

export class GetUsersQuery {}

@QueryHandler(GetUsersQuery)
export class GetUsersHandler implements IQueryHandler<GetUsersQuery, User[]> {
  constructor(@Inject(DB) private readonly db: Db) {}

  async execute(): Promise<User[]> {
    const rows = await this.db.select().from(users).orderBy(asc(users.name));
    return rows.map(toUser);
  }
}
