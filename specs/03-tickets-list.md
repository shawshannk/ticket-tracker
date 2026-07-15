# 03 — Tickets List

## Layout (from prototype)

- Filter bar: Status, Priority, Assignee, Environment, Epic, Type — each a dropdown with "All" as default, plus a free-text Search box
- Density toggle: Comfortable / Compact (affects row padding only)
- Result count label: "X of Y tickets"
- Empty state when filters produce zero matches
- Each row: type badge, key, title, breadcrumb (Epic ▸ Story, hidden for Epics), status badge, priority badge, assignee avatar/initials, updated date
- Sorted by `created_at` descending by default

## Search behavior

Matches (case-insensitive, substring) against: `title`, `key`, `assignee.name`. Same three fields as the prototype — not full-text search, not fuzzy matching.

## API

`GET /projects/:projectId/tickets?status=&priority=&assignee=&env=&epic=&type=&search=&page=&pageSize=`

- All filter params optional; omitted = "All"
- **Pagination is new** — the prototype filtered an in-memory array of 20 tickets client-side, which won't work once a real project has hundreds/thousands of tickets. Use TanStack Table's server-side pagination pattern: the API returns `{ items: TicketSummary[], total: number }`, frontend requests pages as needed.
- Sorting: support `sortBy` (default `createdAt`) and `sortDir` (default `desc`) as query params, even if the only UI control initially is the default sort — makes TanStack Table's sortable columns free to wire up later.

## Frontend

- Filters are controlled inputs bound to URL search params (via TanStack Router's search param validation) so a filtered view is a shareable/bookmarkable link — the prototype's filters lived only in transient React state and vanished on refresh.
- Debounce the search input (e.g. 300ms) before triggering a refetch, since this now hits a real API instead of filtering an in-memory array.
- `TanStack Table` for the row rendering — gives you sorting/column definitions for free even though v1 only needs the fixed column set from the prototype.

## Row → navigation

Clicking a row navigates to the Ticket Detail view (spec 05) for that ticket's `id`, within the current project route.
