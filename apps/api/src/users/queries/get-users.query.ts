import { Inject } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import type { User } from '@ticket-tracker/shared';
import { asc } from 'drizzle-orm';
import type { Db } from '../../db';
import { DB } from '../../db/db.module';
import { users } from '../../db/schema';
import { toUserFor, type EmailViewer } from '../user.mapper';

export class GetUsersQuery {
  /** Who is asking — decides whether each row's email is returned (tech spec §4.4). */
  constructor(readonly viewer: EmailViewer | null) {}
}

@QueryHandler(GetUsersQuery)
export class GetUsersHandler implements IQueryHandler<GetUsersQuery, User[]> {
  constructor(@Inject(DB) private readonly db: Db) {}

  async execute({ viewer }: GetUsersQuery): Promise<User[]> {
    const rows = await this.db.select().from(users).orderBy(asc(users.name));
    return rows.map((row) => toUserFor(viewer, row));
  }
}
