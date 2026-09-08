import { Inject } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import { BACKLOG_SPRINT, type BoardQuery, type TicketSummary } from '@ticket-tracker/shared';
import { and, asc, desc, eq, isNull } from 'drizzle-orm';
import type { Db } from '../../db';
import { DB } from '../../db/db.module';
import { tickets } from '../../db/schema';
import { summarySelect, toTicketSummary } from './ticket-summary';

export class GetBoardQuery {
  constructor(
    readonly projectId: string,
    readonly params: BoardQuery,
  ) {}
}

/**
 * `GET /projects/:projectId/board?sprint=&type=` (spec 04). Returns a **flat** list — the
 * columns are a presentation concern, so the frontend groups by status; which columns exist
 * depends on the type filter, which the client already knows from STATUS_BY_TYPE.
 *
 * Not paginated, unlike the list: a board shows every card in its filter by definition.
 */
@QueryHandler(GetBoardQuery)
export class GetBoardHandler implements IQueryHandler<GetBoardQuery, TicketSummary[]> {
  constructor(@Inject(DB) private readonly db: Db) {}

  async execute({ projectId, params }: GetBoardQuery): Promise<TicketSummary[]> {
    const rows = await summarySelect(this.db)
      .where(
        and(
          eq(tickets.projectId, projectId),
          // spec 04: omitted = All; "backlog" = no sprint assigned; otherwise a sprint id.
          params.sprint === BACKLOG_SPRINT
            ? isNull(tickets.sprintId)
            : params.sprint
              ? eq(tickets.sprintId, params.sprint)
              : undefined,
          params.type ? eq(tickets.type, params.type) : undefined,
        ),
      )
      // Stable, meaningful card order within each column once grouped.
      .orderBy(desc(tickets.updatedAt), asc(tickets.id));

    return rows.map(toTicketSummary);
  }
}
