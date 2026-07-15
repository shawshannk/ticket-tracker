# 01 — Overview Dashboard

Landing view when a project is selected. Read-only; no forms.

## Layout (from prototype)

1. **KPI cards** (4): Open tickets, Critical open, Avg. resolution days, Created this week
2. **Status breakdown**: horizontal bar/list per status with count + percentage of total
3. **Priority breakdown**: count per priority, color-coded (Critical=red, High=orange, Medium=yellow, Low=slate)
4. **Recent activity**: last 5 tickets by `updated_at`, showing key, title, type badge, status badge, who/when

## API

`GET /projects/:projectId/overview`

Response:
```ts
{
  openCount: number;
  criticalOpen: number;
  avgResolutionDays: number;  // rounded to 1 decimal, 0.0 if no Done tickets yet
  createdThisWeek: number;
  statusBreakdown: { status: string; count: number; pct: number }[];
  priorityBreakdown: { priority: string; count: number }[];
  recentActivity: TicketSummary[]; // 5 items, same shape as list-view row
}
```

Compute all of this in one query (a single `GetOverviewStatsQuery` handler) — don't make the frontend fetch the whole ticket list and compute client-side, since that won't scale once a project has thousands of tickets instead of the prototype's 20 seed rows.

## Frontend

- `TanStack Query` key: `['overview', projectId]`, refetch on project switch and on any ticket mutation (invalidate this key from ticket create/update/delete/move mutations elsewhere in the app).
- No filters, no pagination — this view is intentionally a fixed snapshot.

## Edge cases to handle (prototype didn't need to, but a real app will)

- Empty project (zero tickets): all KPIs show 0 / 0.0, breakdowns show 0% for every status/priority, recent activity shows an empty state message instead of a blank list.
- `avgResolutionDays` divide-by-zero: guard for zero Done tickets (prototype already does this — preserve it).
