import { Inject } from '@nestjs/common';
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';
import {
  ALL_STATUSES,
  TICKET_PRIORITIES,
  type OverviewStats,
  type TicketPriority,
} from '@ticket-tracker/shared';
import { desc, eq, sql } from 'drizzle-orm';
import type { Db } from '../../db';
import { DB } from '../../db/db.module';
import { tickets } from '../../db/schema';
import { summarySelect, toTicketSummary } from './ticket-summary';

export class GetOverviewStatsQuery {
  constructor(readonly projectId: string) {}
}

type AggregateRow = {
  open_count: number;
  critical_open: number;
  avg_resolution_days: number | null;
  created_this_week: number;
  total: number;
  status_counts: Record<string, number> | null;
  priority_counts: Record<string, number> | null;
};

/**
 * `GET /projects/:projectId/overview` (spec 01). Every figure is computed in the database —
 * the frontend must never fetch the ticket list and total it up, which is exactly what the
 * prototype did with its 20 in-memory rows.
 *
 * Definitions are spec 00's, verbatim: `openCount` = status != 'Done'; `criticalOpen` adds
 * priority = 'critical'; `avgResolutionDays` averages (updated_at - created_at) over Done
 * tickets; `createdThisWeek` = created in the last 7 days.
 */
@QueryHandler(GetOverviewStatsQuery)
export class GetOverviewStatsHandler implements IQueryHandler<GetOverviewStatsQuery, OverviewStats> {
  constructor(@Inject(DB) private readonly db: Db) {}

  async execute({ projectId }: GetOverviewStatsQuery): Promise<OverviewStats> {
    const [aggregates, recentRows] = await Promise.all([
      this.loadAggregates(projectId),
      // Reuses M6a's joined select so a recent-activity row is identical to a list row.
      summarySelect(this.db)
        .where(eq(tickets.projectId, projectId))
        .orderBy(desc(tickets.updatedAt), desc(tickets.id))
        .limit(5),
    ]);

    const total = Number(aggregates.total);
    const statusCounts = aggregates.status_counts ?? {};
    const priorityCounts = aggregates.priority_counts ?? {};

    return {
      openCount: Number(aggregates.open_count),
      criticalOpen: Number(aggregates.critical_open),
      // COALESCE in SQL already guards the no-Done-tickets case; this is belt and braces.
      avgResolutionDays: round1(Number(aggregates.avg_resolution_days ?? 0)),
      createdThisWeek: Number(aggregates.created_this_week),
      // Every status and priority is always present, at 0 when unused, so the dashboard's
      // rows don't appear and disappear as a project fills up (spec 01's empty-project case).
      statusBreakdown: ALL_STATUSES.map((status) => {
        const count = Number(statusCounts[status] ?? 0);
        return { status, count, pct: total === 0 ? 0 : round1((count / total) * 100) };
      }),
      priorityBreakdown: TICKET_PRIORITIES.map((priority: TicketPriority) => ({
        priority,
        count: Number(priorityCounts[priority] ?? 0),
      })),
      recentActivity: recentRows.map(toTicketSummary),
    };
  }

  /**
   * One statement for every scalar and both breakdowns: FILTER for the counts, and
   * jsonb_object_agg over two small GROUP BYs so the whole dashboard is a single round trip
   * regardless of how many tickets the project has.
   */
  private async loadAggregates(projectId: string): Promise<AggregateRow> {
    const result = await this.db.execute<AggregateRow>(sql`
      with scoped as (
        select status, priority, created_at, updated_at
        from ${tickets}
        where ${tickets.projectId} = ${projectId}
      ),
      by_status as (
        select status, count(*)::int as count from scoped group by status
      ),
      by_priority as (
        select priority, count(*)::int as count from scoped group by priority
      )
      select
        (select count(*)::int from scoped where status <> 'Done') as open_count,
        (select count(*)::int from scoped where status <> 'Done' and priority = 'critical') as critical_open,
        (select coalesce(avg(extract(epoch from (updated_at - created_at)) / 86400.0), 0)
           from scoped where status = 'Done') as avg_resolution_days,
        (select count(*)::int from scoped where created_at >= now() - interval '7 days') as created_this_week,
        (select count(*)::int from scoped) as total,
        (select jsonb_object_agg(status, count) from by_status) as status_counts,
        (select jsonb_object_agg(priority, count) from by_priority) as priority_counts
    `);

    // postgres-js returns the rows array directly; drizzle's pg driver wraps them in `.rows`.
    const rows = (Array.isArray(result) ? result : (result as { rows: AggregateRow[] }).rows) ?? [];
    return rows[0];
  }
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}
