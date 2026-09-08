import { Inject } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import type { Paged, TicketListQuery, TicketSortField, TicketSummary } from '@ticket-tracker/shared';
import { and, asc, count, desc, eq, ilike, or, type SQL } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import type { Db } from '../../db';
import { DB } from '../../db/db.module';
import { tickets } from '../../db/schema';
import { assignee, summarySelect, toTicketSummary } from './ticket-summary';

export class GetTicketsQuery {
  constructor(
    readonly projectId: string,
    readonly params: TicketListQuery,
  ) {}
}

const SORT_COLUMNS: Record<TicketSortField, AnyPgColumn> = {
  createdAt: tickets.createdAt,
  updatedAt: tickets.updatedAt,
  key: tickets.key,
  title: tickets.title,
  status: tickets.status,
  // Postgres orders an enum by declaration order, which for ticket_priority is
  // critical → high → medium → low, so `asc` means most urgent first.
  priority: tickets.priority,
};

/**
 * `GET /projects/:projectId/tickets` (spec 03). Filtering, search, sort and pagination all
 * happen in SQL (R8) — never by loading the project's tickets and filtering in memory.
 * `projectId` is always in the WHERE clause, so the list can't leak across projects (R2).
 */
@QueryHandler(GetTicketsQuery)
export class GetTicketsHandler implements IQueryHandler<GetTicketsQuery, Paged<TicketSummary>> {
  constructor(@Inject(DB) private readonly db: Db) {}

  async execute({ projectId, params }: GetTicketsQuery): Promise<Paged<TicketSummary>> {
    const where = and(
      eq(tickets.projectId, projectId),
      params.status ? eq(tickets.status, params.status) : undefined,
      params.priority ? eq(tickets.priority, params.priority) : undefined,
      params.assignee ? eq(tickets.assigneeId, params.assignee) : undefined,
      params.env ? eq(tickets.env, params.env) : undefined,
      params.epic ? eq(tickets.epicId, params.epic) : undefined,
      params.type ? eq(tickets.type, params.type) : undefined,
      // Spec 03: case-insensitive substring over title, key and assignee name — no more.
      params.search ? searchClause(params.search) : undefined,
    );

    const order = params.sortDir === 'asc' ? asc : desc;
    const offset = (params.page - 1) * params.pageSize;

    const [rows, [{ total }]] = await Promise.all([
      summarySelect(this.db)
        .where(where)
        // Secondary key so pagination is stable when the sort column has ties.
        .orderBy(order(SORT_COLUMNS[params.sortBy]), desc(tickets.createdAt), asc(tickets.id))
        .limit(params.pageSize)
        .offset(offset),
      this.db
        .select({ total: count() })
        .from(tickets)
        .leftJoin(assignee, eq(tickets.assigneeId, assignee.id))
        .where(where),
    ]);

    return {
      items: rows.map(toTicketSummary),
      total,
      page: params.page,
      pageSize: params.pageSize,
    };
  }
}

function searchClause(term: string): SQL | undefined {
  // Escape LIKE metacharacters so a search for "50%" means a literal percent sign.
  const pattern = `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  return or(ilike(tickets.title, pattern), ilike(tickets.key, pattern), ilike(assignee.name, pattern));
}
