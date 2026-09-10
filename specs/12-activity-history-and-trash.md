# 12 — Ticket Activity History & Trash

Two data-integrity gaps, specified together because they share one table and one idea: a ticket's
past must survive the present.

`auth_events` (M15) already records everything that grants, uses or removes *authority*. Nothing
records what happens to *work*. Today nobody can answer "who moved this to Done, and when" — and
`DeleteTicketHandler` removes the ticket and its comments in one transaction, permanently.

## 1. The event table

```ts
// apps/api/src/db/schema/ticket-events.ts
export const ticketEvents = pgTable('ticket_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  ticketId: uuid('ticket_id').notNull().references(() => tickets.id),
  projectId: uuid('project_id').notNull().references(() => projects.id), // denormalized: the
  // project feed queries by it, and it must survive the ticket moving projects (M35).
  actorId: uuid('actor_id').references(() => users.id),   // null only for system/automation actors
  type: text('type').notNull(),                            // see TICKET_EVENT_TYPES below
  field: text('field'),                                    // set for 'field_changed'
  fromValue: jsonb('from_value'),
  toValue: jsonb('to_value'),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
```

Indexes: `(ticketId, createdAt desc)` for the detail timeline, `(projectId, createdAt desc)` for the
Overview feed, `(actorId, createdAt desc)` for per-person activity (M62).

**Append-only by convention**, exactly as `auth_events` is — nothing updates or deletes a row. The
retention/purge job in M53 is the single exception and it deletes whole ranges, never edits.

`TICKET_EVENT_TYPES` lives in `packages/shared`: `created`, `field_changed`, `status_changed`,
`assigned`, `commented`, `comment_edited`, `comment_deleted`, `deleted`, `restored`, `linked`,
`unlinked`, `attachment_added`, `attachment_removed`. Later modules extend this union; they must add
to it rather than inventing a parallel table.

## 2. Recording

A `TicketEventService` with `record(input, executor)`. Every call site passes the surrounding
transaction's executor so an event and the change it describes commit together — a change with no
event, or an event with no change, is the failure mode this prevents.

Wire it into the existing handlers: `CreateTicketHandler`, `UpdateTicketHandler` (one
`field_changed` row per changed field, computed by diffing the loaded row against the patch — not
one row for the whole PATCH), `MoveTicketStatusHandler` (`status_changed`), `AddCommentHandler`,
`UpdateCommentHandler`, `DeleteCommentHandler`, `DeleteTicketHandler`.

Assignment emits `assigned`, not a generic `field_changed` — it is the one field with its own
notification semantics in M27, and querying it as a distinct type keeps that simple.

## 3. Reading

- `GET /tickets/:id/events?cursor=&limit=` — the detail-view timeline, newest first, cursor
  paginated. Each row resolves the actor to a `UserSummary` and renders through a shared formatter
  so "Priya changed Priority from Medium to High" is written once, in `packages/shared`, and used by
  the web app, the email digest (M28) and the Slack unfurl (M56).
- `GET /projects/:id/activity?cursor=&limit=&actorId=&type=` — the project feed.
- Both go through `ProjectScopeGuard`. An event is exactly as readable as the ticket it belongs to.

The Overview's `recentActivity` (`get-overview-stats.query.ts`) currently derives from `updatedAt`,
which cannot distinguish a comment from a re-prioritisation and shows one row per ticket rather than
one per change. It switches to this feed.

## 4. Soft delete & trash

Add to `tickets`: `deletedAt timestamptz`, `deletedBy uuid references users(id)`.

- `DELETE /tickets/:id` sets both instead of deleting. Comments are left alone — they are reachable
  only through the ticket and must return intact on restore.
- **Every read path must exclude soft-deleted rows.** This is the whole risk of the module: a missed
  `where` clause leaks deleted tickets into a list, a board column, a count, or a search index. The
  filter belongs in one shared `notDeleted()` predicate applied in `get-tickets.query.ts`,
  `get-board.query.ts`, `get-overview-stats.query.ts`, `get-ticket-detail.query.ts` and the child
  lookups in `ticket-links.ts` — and an integration test enumerates every read endpoint and asserts a
  deleted ticket is absent from each.
- The existing "cannot delete a ticket with children" rule in `DeleteTicketHandler` stands unchanged.
- `GET /projects/:id/trash` lists soft-deleted tickets (admin/manager only) with who deleted them and
  when. `POST /tickets/:id/restore` clears the columns and emits `restored`; it fails with 409 if the
  ticket's epic or story parent is itself deleted, or if its `key` has somehow been reissued.
- A purge job (M25's runner) hard-deletes rows past `TRASH_RETENTION_DAYS` (default 30) and their
  comments and events.

## 5. Frontend

- Ticket detail grows an **Activity** tab beside Comments, merging events and comments into one
  chronological stream (comments already appear as events, so the merge is a render concern, not a
  second fetch).
- A "deleted" banner and Restore button on a soft-deleted ticket for those who may see it.
- Trash view under project settings.

## Out of scope

Reverting a change from the timeline (the data is sufficient, the UX is not designed) and diffing
rich-text descriptions field-by-field — until M33 lands, a description change records only that it
changed, with old and new text stored whole.

## Acceptance criteria

- Each of create, update (multi-field), status move, assign, comment, delete and restore writes the
  expected event rows; asserted by integration test against a real Postgres.
- An event is never written when its transaction rolls back (test: force a constraint failure after
  the record call and assert zero rows).
- A soft-deleted ticket is absent from list, board, overview stats, overview activity, detail (404)
  and its parent's children — one test per endpoint.
- Restore returns the ticket and all its comments intact.
- The purge job removes a ticket deleted 31 days ago and leaves one deleted yesterday.
