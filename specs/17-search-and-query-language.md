# 17 — Search & the Ticket Query Language

Two limits today. Every query in `apps/api/src/tickets/queries/` is scoped to exactly one project —
there is no way to search across projects at all. And `searchClause()` in `get-tickets.query.ts` is
`ilike` over title, key and assignee name: it cannot match description or comment text, and a leading
wildcard `ilike` cannot use an index, so it degrades linearly with the table.

## 1. Full-text search

Postgres first — no new infrastructure until the data justifies it.

- A generated `searchVector tsvector` column on `tickets`, `setweight`ed: key A, title A,
  description B, labels C. GIN index. Maintained by a trigger so no write path can forget it.
- Comments get their own `tsvector` and are searched as a second source, returning their parent
  ticket with the matching comment as context.
- Ranking: `ts_rank_cd`, with recency and a small boost for exact key matches. A user typing `NIM-42`
  gets that ticket first, always — an exact key match short-circuits ranking entirely.
- Highlighted snippets via `ts_headline`.
- Trigram index (`pg_trgm`) alongside, for typo tolerance and partial-word matching that `tsvector`
  alone handles badly.

An external engine (Meilisearch/OpenSearch) stays behind the same `SearchService` interface, adopted
only when p95 exceeds the budget in spec 25. The interface is defined now so that swap is a module,
not a rewrite.

## 2. Cross-project search

`GET /search?q=&projects=&type=&status=&assignee=&cursor=`.

**The scope rule is the whole risk of this module.** Results are restricted to projects the caller is
a member of, resolved from `project_members` (and every project for a global admin, per spec 10
§3.2's rule). The restriction is applied as a `where projectId in (...)` inside the query, never as a
post-filter over a full-corpus result — a post-filter leaks existence through result counts, pagination
and timing. Soft-deleted tickets (spec 12) are excluded here too.

Also searchable: projects, users, comments. Grouped in the response by entity type.

## 3. TQL — the query language

`assignee = me AND status != Done AND labels in (auth, urgent) ORDER BY priority DESC`

This is the highest-leverage item in the phase: saved filters (M39), board configurations (spec 15
§6), dashboard widgets (M39), automation conditions (spec 22) and scheduled reports (M41) are all the
same problem, and each one implemented separately is a different subset of the same bugs.

- Grammar in `packages/shared` — one parser, used by the API to execute and by the web app for
  syntax highlighting, autocomplete and error underlining.
- Fields: every ticket column, plus `project`, `sprint`, `epic`, `story`, `labels`, `comment`,
  `watcher`, `created`, `updated`, `resolved`, `points`, and every custom field (spec 20) by name.
- Operators: `=`, `!=`, `>`, `>=`, `<`, `<=`, `in`, `not in`, `~` (contains), `is empty`,
  `is not empty`, `changed to X after <date>` (reading spec 12's events).
- Functions: `me()`, `now()`, `startOfSprint()`, `-7d` style relative dates.
- Boolean composition with `AND` / `OR` / `NOT` and parentheses.
- Compiles to a Drizzle `SQL` predicate. **Never to a string.** The parser emits a typed AST and the
  compiler emits parameterised fragments; there is no code path where user text reaches SQL text.
- A depth/clause-count limit and a query timeout, so a pathological expression cannot be a denial of
  service.
- `POST /search/tql` `{ query, cursor, limit }` and `GET /projects/:id/tickets?tql=…`.

Parse errors return the offending position and a readable message — the difference between a query
language people use and one they abandon.

## 4. Frontend

- A global search palette on `Cmd/Ctrl-K`: recent tickets, fuzzy key jump, full-text results, grouped
  by project.
- A TQL editor on the list view with autocomplete for field names, operators and values, sitting
  behind the existing simple filter bar — the simple filters remain and compile to TQL, so switching
  to advanced mode shows the query the filters represent.

## Out of scope

Semantic/vector search (M60 owns that, over the same interface), search across attachment contents.

## Acceptance criteria

- Searching a term present only in a description returns the ticket; the old `ilike` path could not.
- A user who is a member of project A but not B never sees a B ticket in cross-project results, and
  the result count is identical to a run where B does not exist.
- `NIM-42` as a query returns that ticket first.
- Every TQL operator has a unit test asserting the compiled predicate, and a fuzz test asserts no
  input produces a SQL error or a query exceeding the clause limit.
- `assignee = me() AND status != Done` returns the same set as the equivalent hand-written query.
- A malformed query returns 400 with the character offset of the error.
