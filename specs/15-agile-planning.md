# 15 — Agile Planning (sprints, backlog, estimation, charts)

Sprints exist in the schema and are read-only: `sprints.ts` has four columns, `GET /projects/:id/sprints`
lists them, and rows arrive only from the seed. There is no way to create one, no ordering anywhere in
the product, and `size` is a t-shirt enum that feeds nothing.

## 1. Sprint lifecycle

Add to `sprints`: `state text` (`future` | `active` | `completed`), `goal text`,
`completedAt timestamptz`, `createdBy uuid`.

- `POST /projects/:id/sprints`, `PATCH /sprints/:id`, `DELETE /sprints/:id` (only when it has no
  tickets), all admin/manager.
- `POST /sprints/:id/start` — sets `active`. **At most one active sprint per project**, enforced by a
  partial unique index (`where state = 'active'`), not by a read-then-write check.
- `POST /sprints/:id/complete` — takes `{ moveIncompleteTo: 'backlog' | sprintId }`. Every non-Done
  ticket moves accordingly in one transaction; each move writes a ticket event. Returns a summary
  (completed / carried over / points) which the UI shows as a completion dialog.
- Ticket events gain `sprint_started`, `sprint_completed`, `sprint_changed`.

## 2. Backlog ordering

Nothing in the product has a user-defined order today; the board and list are sorted by column.

Add `rank text` to `tickets`, a **lexicographic rank** (LexoRank-style: a string that always admits a
new value between any two neighbours). A float or an integer position is the obvious alternative and
is wrong — a float runs out of precision after enough drags between the same pair, and an integer
position rewrites every row below the insertion point on every drag.

- `PATCH /tickets/:id/rank` with `{ beforeId?, afterId? }`; the server computes the rank between
  those two neighbours. It never trusts a client-supplied rank string.
- A rebalance job (M25's runner) rewrites a project's ranks when any gap gets pathologically long.
- Rank is per project, shared by the backlog and the board column ordering, so a card dragged
  vertically in a board column keeps that position in the backlog.

## 3. Backlog view

A new fifth view: ranked list of tickets not in an active sprint, with the sprint(s) as drop targets
above it. Multi-select drag. Inline edit of estimate, priority and assignee without leaving the view —
grooming is the one workflow where opening each ticket individually is unacceptable.

## 4. Estimation

- `storyPoints integer` on `tickets`, alongside the existing `size`. Both stay: `size` is the
  gut-feel t-shirt already in the data, `storyPoints` is what charts sum. The Fibonacci-ish allowed
  set lives in `packages/shared`.
- `capacityPoints integer` on `sprints`, plus per-member capacity in a `sprint_capacity` table
  (`sprintId`, `userId`, `points`) for M46's planning view.
- Sprint header shows committed vs completed points, and warns when committed exceeds capacity.

## 5. Charts

All computed from spec 12's event stream, which is what makes them honest — a burndown reconstructed
from `updatedAt` can only ever show the present.

- **Burndown / burnup** — remaining points per day across the sprint, with an ideal line.
- **Velocity** — completed points for the last N completed sprints, with a rolling mean.
- **Cumulative flow** — tickets per status per day over a window.
- **Cycle time / lead time** — per ticket, first `In Progress` to `Done` and created to `Done`;
  displayed as a scatter with a control band, plus percentiles.

`GET /projects/:id/charts/{burndown|velocity|cfd|cycle-time}`. Each is a pure function of events over
a date range, cached in Redis (M58) keyed on project + range + latest event id.

## 6. Board configuration

- `boards` table: multiple named boards per project, each with its own filter (a saved query once M38
  lands; a filter JSON until then), column-to-status mapping, and swimlane setting.
- **Swimlanes**: group rows by epic, assignee, priority or none.
- **WIP limits** per column, with a visual breach state. Advisory, not enforced — blocking a drag
  because a column is full is the kind of rule that teaches people to lie to the tool.

## Out of scope

Cross-project sprints, scrum-of-scrums rollups, and story-point estimation ceremonies (planning poker).

## Acceptance criteria

- Starting a second sprint while one is active fails with 409 at the database level, proven by a
  concurrent integration test.
- Completing a sprint with 3 incomplete tickets moves all 3 and records 3 events, in one transaction.
- 1000 sequential drags between the same two neighbours never produce a duplicate or invalid rank.
- Burndown for a sprint whose tickets were completed on known dates matches a hand-computed series.
- Velocity ignores an in-flight sprint.
- A board with a WIP limit of 3 renders a breach state at 4 and still permits the drop.
