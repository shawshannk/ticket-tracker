# 20 — Ticket Model Extensions (links, sub-tasks, labels, templates, custom fields, bulk ops)

The ticket schema in `tickets.ts` is a fixed column set with a three-level hierarchy and a free-form
`text[]` of labels. This spec covers everything that makes the ticket itself extensible.

## 1. Sub-tasks

A fourth rung under Story/Bug: `subtask` joins `TICKET_TYPES`, with `parentId` reusing the existing
self-reference pattern of `epicId`/`storyId`.

- A sub-task cannot have children, cannot be an epic's direct child, and inherits its parent's project
  and (by default) sprint.
- Parent progress ("3 of 5 done") on the card and detail view.
- The epic/story consistency rule (R5) in `ticket-rules.ts` extends to the new level: a sub-task's
  `storyId` must equal its parent's, and the existing unit tests for R5 gain the fourth case.

## 2. Ticket links

```ts
export const ticketLinks = pgTable('ticket_links', {
  id, sourceId, targetId, type, createdBy, createdAt,
}, t => ({ uniq: unique().on(t.sourceId, t.targetId, t.type) }));
```

Types are directional pairs declared in `packages/shared`: `blocks`/`is blocked by`,
`duplicates`/`is duplicated by`, `relates to` (symmetric), `causes`/`is caused by`. One row is
stored; the inverse is derived at read time — storing both directions guarantees they eventually
disagree.

Rules: no self-link; no duplicate pair; cross-project links allowed only when the caller can read
both; a **cycle check on `blocks`** at write time, since a blocking cycle makes the dependency views
in §7 and spec 24 non-terminating.

`ticket_events` gains `linked`/`unlinked`. A ticket blocked by an open ticket shows a blocked badge
on the board, and spec 19 can condition a transition on it.

## 3. Label registry

`labels` is `text[]` today and will contain `bug`, `Bug` and `bugs` within a month.

- A `labels` table per project: name (case-insensitively unique), colour, description, `usageCount`.
- Ticket labels become a join table. Migration reads every distinct existing array value, case-folds
  and de-duplicates them into registry rows, then rewrites the arrays as references — and reports the
  merges it performed rather than doing them silently.
- Rename propagates. Merge moves usages and deletes the loser. Delete requires zero usages or an
  explicit force.
- Creating a label from the ticket form is allowed for any member but marked `adhoc`, so project
  admins can review what accumulated.

## 4. Ticket templates

Per-project, per-type: a name, a pre-filled description (markdown, from spec 16), and default values
for priority, labels, assignee and custom fields. A bug template carrying repro/expected/actual
sections is the single cheapest quality improvement available to a tracker.

`GET /projects/:id/templates`, admin/manager CRUD, and a template picker on the create form. One
template per type may be marked default and is pre-selected.

## 5. Custom fields

```ts
export const customFieldDefs = pgTable('custom_field_defs', {
  id, projectId, key, label, type, options: jsonb, required, appliesToTypes: text[],
  defaultValue: jsonb, order, archivedAt,
});
export const customFieldValues = pgTable('custom_field_values', {
  ticketId, fieldId, value: jsonb,   // pk (ticketId, fieldId)
});
```

Types: `text`, `textarea`, `number`, `date`, `datetime`, `select`, `multiselect`, `checkbox`, `user`,
`url`. A jsonb value column with per-type Zod validation built from the definition — a column per
type is faster to query and unbearable to extend, and a fully generic EAV in text loses ordering and
type safety at the same time; jsonb plus a validating layer is the tolerable middle.

- Definitions are cached per project and invalidated on change, because every ticket read resolves
  them.
- Fields are queryable in TQL by key (spec 17 §3) and expression-indexed where the type allows.
- **Archive, never hard delete**: archiving hides the field everywhere but preserves values, so a
  mis-click cannot destroy data across a whole project.
- `required` is enforced on create and on transitions that declare it (spec 19 §2).

## 6. Bulk operations

`POST /projects/:id/tickets/bulk` `{ ticketIds, operation }` where operation is set-status,
set-assignee, set-sprint, add/remove-label, set-field, move-to-project, or delete.

- Capped at `BULK_MAX` (default 500) per request; anything larger runs as a job with a progress
  endpoint.
- **Per-ticket permission and validity checks** — a bulk operation is a loop of ordinary operations,
  never a shortcut around the rules. An invalid transition on ticket 7 does not silently skip; the
  response reports per-ticket success/failure and the whole request is a partial success (207-style
  body), which is more useful than an all-or-nothing rollback for a 500-ticket grooming pass.
- One ticket event per ticket, tagged with a shared `bulkOperationId` so the timeline can collapse
  them into "Priya changed 40 tickets".

## 7. Clone, convert, move

- **Clone**: copies fields, labels, custom values and optionally sub-tasks and attachments; never
  copies comments, activity or links other than the parent.
- **Convert type**: Bug → Story and similar. Status must be remapped to the target type's workflow
  (spec 19), type-specific fields (`severity`, `env` for bugs) are cleared with a warning listing what
  will be lost, and hierarchy validity is re-checked.
- **Move project**: allocates a new key from the target project's sequence via `TicketKeyService`,
  **retains the old key as `previousKeys text[]`** so old links and commit messages still resolve, and
  clears sprint and project-scoped custom values that do not exist in the target.

## Out of scope

Cross-project epic hierarchies, per-field permissions, and a formula/rollup field type.

## Acceptance criteria

- A `blocks` cycle (A→B→C→A) is rejected at write time.
- The inverse of a stored link renders on the other ticket and disappears when the link is deleted.
- The label migration folds `Bug`/`bug`/`BUG` into one registry row and reports the merge.
- A required custom field blocks create with a 400 naming the field.
- Archiving a field hides it from every read while `custom_field_values` row count is unchanged.
- A 3-ticket bulk status change where one is an invalid transition returns 2 successes, 1 failure with
  a reason, and writes exactly 2 events.
- A moved ticket is reachable by its previous key.
