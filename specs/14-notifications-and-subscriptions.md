# 14 — Notifications, Watchers & Mentions

The app has no way to tell anyone that anything happened. Every state change is discovered by
someone reloading a page. This spec turns spec 12's event stream into delivery.

## 1. Model

```ts
export const ticketWatchers = pgTable('ticket_watchers', {
  ticketId: uuid(…).notNull().references(() => tickets.id),
  userId: uuid(…).notNull().references(() => users.id),
  // 'explicit' = the user pressed Watch. 'auto' = they were made assignee/reporter or commented.
  // The distinction matters: un-watching an auto subscription must stick, so a row is written
  // with source 'muted' rather than deleted.
  source: text('source').notNull(),
}, t => ({ pk: primaryKey(t.ticketId, t.userId) }));

export const notifications = pgTable('notifications', {
  id: uuid(…).primaryKey().defaultRandom(),
  userId: uuid(…).notNull().references(() => users.id),
  eventId: uuid(…).references(() => ticketEvents.id),
  ticketId: uuid(…).references(() => tickets.id),
  reason: text('reason').notNull(),   // 'assigned' | 'mentioned' | 'watching' | 'reporter' | 'automation'
  readAt: timestamp(…),
  createdAt: timestamp(…).notNull().defaultNow(),
});

export const notificationPreferences = pgTable('notification_preferences', {
  userId: uuid(…).primaryKey().references(() => users.id),
  // per event-type channel matrix, e.g. { status_changed: { inApp: true, email: 'digest' } }
  channels: jsonb('channels').notNull(),
  digestHourUtc: integer('digest_hour_utc').notNull().default(13),
  timezone: text('timezone').notNull().default('UTC'),
});
```

## 2. Fan-out

A single subscriber on the ticket-event stream (spec 12) resolves recipients for each event:

- watchers with `source != 'muted'`, plus the assignee, plus the reporter, plus anyone `@mentioned`
  in the event's text;
- **minus the actor** — you are never notified of your own action, which is the single most common
  complaint about trackers that get this wrong;
- minus anyone who cannot read the ticket. Permission is re-checked at fan-out time against
  `project_members`, not assumed from the watcher row, because membership may have been revoked
  since. A removed member's pending notifications are dropped.

Fan-out runs as a job, not inline in the request — a ticket with 40 watchers must not slow down a
drag-and-drop.

Reason precedence when several apply: `mentioned` > `assigned` > `reporter` > `watching`. The
strongest reason decides the channel, so a mention still emails someone who has watching set to
digest-only.

## 3. Channels

- **In-app**: `GET /notifications?unread=&cursor=`, `POST /notifications/:id/read`,
  `POST /notifications/read-all`. An unread count badge in the app shell, polled on the existing
  TanStack Query cadence until M55 makes it push.
- **Email, immediate**: rendered from the same shared event formatter as the timeline, threaded by
  `In-Reply-To`/`References` keyed on the ticket so a mail client groups a ticket's mail into one
  conversation.
- **Email, digest**: a repeatable job per `digestHourUtc` batching a user's unsent notifications
  into one message, grouped by ticket. Skipped entirely when there is nothing to send — an empty
  digest is worse than no digest.

Defaults for a new user: assigned and mentioned → email immediately; everything else → in-app only.
Deliberately quiet, because a tracker that emails too much gets filtered and then nothing arrives.

## 4. Mentions

- `@` in a comment or description opens a typeahead over **project members only** — mentioning
  someone who cannot read the ticket must not be possible, so the API rejects a mention of a
  non-member rather than silently dropping the notification.
- Storage is `@[Display Name](userId)` in the markdown source, so a rename does not orphan the link
  and the raw text stays readable. The renderer resolves ids to current names at read time.
- `@project` and `@here` (all members) are admin/manager-only, to keep them from becoming noise.

## 5. Auto-watch rules

You become a watcher (`source: 'auto'`) when you create a ticket, are assigned it, comment on it, or
are mentioned in it. Un-watching writes `source: 'muted'`, which suppresses future auto-subscription
for that ticket permanently.

## 6. Frontend

- Notification bell + panel in the app shell, grouped by ticket, with mark-read on click-through.
- Watch/unwatch toggle and a watcher avatar list on ticket detail.
- A settings page for the preference matrix, reachable from account settings.

## Out of scope

Slack/Teams as channels (M56), push notifications, per-project preference overrides (a global matrix
first; per-project is a schema addition later).

## Acceptance criteria

- An update by user A on a ticket watched by A and B notifies B only.
- A mention of a non-member is rejected with 400 and creates no notification.
- Revoking B's project membership drops B's pending notifications for that project.
- Preference `status_changed: email: 'off'` produces an in-app row and no email.
- The digest job sends one email containing two tickets' worth of changes, and sends nothing when
  the user has no unsent notifications.
- Muting a ticket survives being re-assigned to it.
