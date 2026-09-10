# 25 — Scale, Caching & Performance

Nothing in the product has been measured under load. Several known shapes will not hold: the Overview
recomputes every aggregate on each dashboard load, and `get-tickets.query.ts` paginates with `offset`.

## 1. Caching

Redis is already in the stack for jobs (spec 13 §1).

- Cache read-heavy derived data: overview aggregates, chart series (spec 15 §5), dashboard widget
  results (spec 21 §2), custom field definitions (spec 20 §5), permission resolution (spec 23 §4),
  project membership lookups.
- **Key on the data's version, not on a timer**: `project:{id}:overview:{latestEventId}`. Spec 12's
  event stream gives every project a monotonic version, so a stale read is structurally impossible and
  invalidation is a non-event — no TTL guessing, no invalidation bugs. A short TTL remains as a
  safety net for memory reclamation only.
- A cache miss must always be correct and merely slower; no code path may depend on the cache being
  present, and the whole layer must be disableable with `CACHE_ENABLED=false` for debugging.
- Per-request memoisation (DataLoader-style) for the N+1 shapes in the mappers — resolving assignee,
  reporter and epic per row is the obvious one.

## 2. Indexes and query budgets

- An audit of every filter/sort combination the list, board and search views can produce, with
  `EXPLAIN` evidence that each is index-backed. Composite indexes for the common shapes
  (`projectId, status, priority`, `projectId, assigneeId, updatedAt`, `projectId, sprintId`), partial
  indexes excluding soft-deleted rows.
- A **slow-query log** at `SLOW_QUERY_MS` (default 200) with the query, the duration and spec 11's
  `requestId`.
- A seeded large dataset (`db:seed:large` — 3 projects, 100k tickets, 500k comments, 1M events) so
  performance work has something honest to run against. Every claim in this spec is measured on it.

## 3. Pagination

`offset` degrades linearly with depth. Move every list endpoint to **keyset/cursor pagination** with
an opaque base64 cursor encoding the sort key and id tiebreaker — the secondary `id` ordering already
present in `get-tickets.query.ts` is exactly what makes this safe.

The response envelope becomes `{ items, nextCursor, hasMore }` uniformly, with `totalCount` optional
and computed only when asked (an exact count over a large filtered set is often more expensive than
the page itself; an estimate from the planner is offered instead).

Page-number pagination stays available on the list view UI, implemented over cursors, capped at a
maximum depth beyond which the UI asks for a narrower filter.

## 4. Connection & database hygiene

- Pool sizing from config, with a documented relationship to worker count and Postgres `max_connections`;
  PgBouncer in transaction mode for deployments that need it.
- `statement_timeout` and `idle_in_transaction_session_timeout` set at the connection level — one
  runaway query must not hold a connection indefinitely.
- Read-replica routing for the heavy read paths (charts, exports, search) behind a `@ReadOnly()`
  marker, so adopting a replica later is a configuration change rather than a query rewrite.

## 5. Frontend performance

- Route-level code splitting; the board and roadmap views are the heavy ones.
- Virtualised lists (TanStack Virtual) for the list view, backlog and board columns beyond ~100 rows.
- A bundle-size budget enforced in CI, failing the build on a regression beyond a threshold.
- Optimistic updates already used for drag-and-drop (spec 04) extended to inline edits, with a single
  shared rollback pattern rather than per-mutation handling.

## 6. Load testing, metrics and SLOs

- k6 scenarios for the realistic mixes: board load, list with filters, ticket detail, create, search,
  bulk update. Run against the large seed in CI nightly, failing on a regression against a committed
  baseline.
- **Prometheus metrics** (`prom-client`) on `/metrics`, protected: request rate/latency/error by
  route, DB pool saturation, job queue depth and age, cache hit rate. Deferred here from spec 11
  deliberately, because a metric with no load test behind it has no threshold worth alerting on.
- **OpenTelemetry** tracing with the `requestId` as a correlated attribute, spanning HTTP → handler →
  SQL → job.
- Published SLOs (p95 board load, p95 search, p99 write) with alert rules, and a documented capacity
  model: tickets per project, projects per instance, events per second.

## Out of scope

Sharding, multi-region active-active, and CQRS read-model materialisation into separate tables (the
cache in §1 is the cheaper answer until measurement says otherwise).

## Acceptance criteria

- Overview p95 on the large seed improves by an order of magnitude with cache on, and returns
  identical numbers with cache off.
- A cached value is never stale after a write — a test writes, immediately reads, and asserts fresh.
- Cursor pagination through 100k tickets keeps constant page latency; offset pagination is shown to
  degrade on the same data.
- Every list endpoint returns the uniform envelope, asserted by a contract test over the OpenAPI doc.
- No query in the k6 mix exceeds the slow-query threshold on the large seed.
- The nightly load job fails when a deliberately introduced N+1 is committed.
