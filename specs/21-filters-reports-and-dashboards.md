# 21 — Saved Filters, Dashboards, Reports, Export & Import

Everything a saved TQL query (spec 17 §3) makes possible. The Overview view (spec 01) is a fixed set
of KPI cards; this generalises it, and adds the data-portability features that decide whether anyone
can adopt or leave this product.

## 1. Saved filters

```ts
export const savedFilters = pgTable('saved_filters', {
  id, ownerId, name, description, tql, scope, // 'private' | 'project' | 'global'
  projectId, isFavourite, createdAt, updatedAt,
});
```

- CRUD, plus favourite/unfavourite. Favourites appear in the sidebar.
- A shared filter is readable by anyone in its scope but **executes with the caller's permissions** —
  two people opening the same filter see different result counts, and that is correct. A filter is a
  query, never a grant.
- Sharing a `project`-scoped filter requires membership; `global` requires admin.
- Filters are referenced by id from board configs (spec 15 §6), dashboard widgets (§2), scheduled
  reports (§3) and automation triggers (spec 22 §3), so a query is written once.

## 2. Dashboards

```ts
export const dashboards = pgTable('dashboards', { id, ownerId, name, scope, projectId, layout: jsonb });
```

- A responsive grid of widgets; `layout` holds position/size per widget.
- Widget types: filter-result count, filter-result table, pie/bar breakdown by any field, burndown,
  velocity, CFD, cycle-time scatter (all from spec 15 §5), recent activity (spec 12 §3), a two-number
  comparison tile, and a markdown note.
- Each widget names a saved filter or an inline TQL string, plus display options. Widget data is
  fetched per widget so one slow query does not block the page, and cached (spec 25 §1) keyed on
  query + project + latest event id.
- The existing Overview view is re-implemented as a **system dashboard** that a project may replace,
  rather than a parallel code path. Its current KPI definitions become the seeded widget set, so no
  behaviour changes on day one.

## 3. Scheduled reports

A saved filter or dashboard, a cron expression, a recipient list, and a format (HTML email, CSV
attachment). Runs on the M25 job runner.

- Rendered **per recipient, with that recipient's permissions**, for the same reason as §1. A report
  that leaks a row someone cannot open in the app is the obvious failure mode here.
- A report producing zero rows sends nothing unless "send when empty" is set.
- Delivery attempts are recorded and visible on the report's detail page.

## 4. Export

- **Per-filter export**: CSV, JSON or XLSX of any TQL result, with a chosen column set. Runs as a job
  above `EXPORT_SYNC_LIMIT` (default 1000 rows) and delivers a short-lived signed download link.
- **Full project export**: tickets, comments, events, attachments (as a manifest plus objects),
  labels, custom field definitions and values, sprints, workflows, members — a JSON bundle with a
  documented, versioned schema in `packages/shared`.
- CSV writes are injection-safe: a cell beginning `=`, `+`, `-` or `@` is prefixed, or the file is
  quoted such that no spreadsheet interprets it as a formula.
- Exports are audited (`auth_events` gains `data_exported`) — bulk extraction of everything a user can
  see is exactly the event a security review asks about.

## 5. Import

The feature that decides whether anyone can migrate onto this at all.

- Sources: the §4 bundle, generic CSV, Jira (CSV and REST), GitHub Issues, GitLab Issues, Trello.
- A three-stage pipeline: **upload → map → dry-run → commit.** The dry-run reports per-row what will
  be created, what will be skipped and why, and never writes.
- Field mapping UI with sensible per-source defaults, including status → workflow status (spec 19),
  user → user by email with an unmatched list, and unmapped source fields → new custom fields.
- Idempotency: an `externalId`/`externalSource` pair on imported tickets, unique per project, so a
  re-run updates rather than duplicates — an import that half-fails must be safe to repeat, which is
  the situation every real migration is in.
- Imports run as jobs with progress, a per-row error report, and a **rollback** that removes exactly
  the rows a given import batch created.
- Comments, attachments, links and history are imported where the source provides them, with original
  authors and timestamps preserved and a note recording the import.

## Out of scope

A pivot-table builder, cross-project dashboard permissioning beyond scope, and live-refreshing
dashboards (M55 supplies the transport if wanted later).

## Acceptance criteria

- A shared filter returns different row counts for an admin and a single-project developer.
- A dashboard with a failing widget renders the rest of the page.
- The re-implemented Overview produces numbers identical to the current `get-overview-stats.query.ts`
  for the seeded data — asserted by a test comparing both.
- A scheduled report to two recipients with different memberships produces two different CSVs.
- A CSV export of a title beginning `=cmd` opens inert in a spreadsheet.
- Importing the same Jira CSV twice creates N tickets, not 2N.
- Rolling back an import leaves the project exactly as it was, verified by a row-count and checksum
  comparison.
