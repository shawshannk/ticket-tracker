import { Inject } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import type { Sprint } from '@ticket-tracker/shared';
import { asc, eq } from 'drizzle-orm';
import type { Db } from '../../db';
import { DB } from '../../db/db.module';
import { sprints } from '../../db/schema';

export class GetSprintsQuery {
  constructor(readonly projectId: string) {}
}

/**
 * `GET /projects/:projectId/sprints` — read-only, added in M6b so the board's Sprint filter
 * (spec 04) has something to populate its dropdown with. Sprint management isn't spec'd
 * anywhere, so there is deliberately no create/edit here.
 */
@QueryHandler(GetSprintsQuery)
export class GetSprintsHandler implements IQueryHandler<GetSprintsQuery, Sprint[]> {
  constructor(@Inject(DB) private readonly db: Db) {}

  async execute({ projectId }: GetSprintsQuery): Promise<Sprint[]> {
    const rows = await this.db
      .select()
      .from(sprints)
      .where(eq(sprints.projectId, projectId))
      .orderBy(asc(sprints.startsOn), asc(sprints.name));

    return rows.map((row) => ({
      id: row.id,
      projectId: row.projectId,
      name: row.name,
      startsOn: row.startsOn ?? null,
      endsOn: row.endsOn ?? null,
    }));
  }
}
