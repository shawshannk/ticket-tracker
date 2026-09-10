# 26 — Real-time Sync, Chat Integrations & Inbound Email

Flagged out of scope in the README: two open tabs disagree until one is reloaded. This spec closes
that, and connects the tracker to the places people actually talk.

## 1. Real-time transport

**Server-Sent Events**, not WebSockets. The traffic here is server → client broadcast of change
notifications; the client's writes already have a perfectly good REST path. SSE survives proxies,
reconnects natively with `Last-Event-ID`, and needs no new protocol handling on the server. A
WebSocket is only justified if presence (§3) grows into collaborative editing.

- `GET /events/stream?projects=…` — an authenticated SSE endpoint per user.
- Fan-out through Redis pub/sub so any API instance can serve any subscriber.
- The payload is deliberately **thin**: `{ type, ticketId, projectId, eventId, version }` and no
  content. The client invalidates the relevant TanStack Query keys and refetches, which means every
  permission check happens on the ordinary read path. Pushing content would require re-implementing
  authorisation in the broadcast layer, and that is where this kind of feature leaks data.
- Subscriptions are filtered by membership at connect time and re-checked on membership change.
- `Last-Event-ID` on reconnect replays missed events from `ticket_events` within a bounded window;
  beyond it the client is told to refetch wholesale.
- Backpressure: a slow consumer is dropped rather than buffered without limit.

## 2. What updates live

Board columns and cards, list rows, ticket detail fields and comments, the notification bell (spec
14 §3 stops polling), sprint totals, and dashboard widgets when the user opts in.

Rule: a live update **never discards local edits**. A field the user is currently editing shows a
"changed by Priya — review" affordance instead of overwriting, which is the same conflict the dirty
-state logic in spec 05 was designed around, now with a second source.

## 3. Presence & soft locks

- Who is viewing a ticket, as avatars, over the same SSE channel with a heartbeat.
- "Priya is editing the description" while an editor is focused. **Advisory only** — a hard lock in a
  tracker strands documents behind whoever closed their laptop.
- Optimistic concurrency underneath it: a ticket PATCH carries the `updatedAt` it was loaded with and
  returns 409 with a diff when the row moved on. That check is what actually prevents lost updates;
  presence only makes the collision visible earlier.

## 4. Slack & Teams

- Per-project channel subscriptions with a TQL filter, posting the same rendered event text as every
  other channel (spec 12 §3's shared formatter).
- Link unfurling: a pasted ticket URL expands to key, title, status, assignee and priority — resolved
  **per viewer**, so a member of the workspace who cannot read the project gets no preview rather than
  a leaked title.
- Slash command `/ticket create` opening a modal, and a message action "create ticket from this
  message" that carries the thread's text and a permalink into the description.
- Interactive buttons on a posted event: transition, assign to me, comment. Each executes as the
  linked user with their permissions.
- Identity linking between chat user and app user, verified by email, revocable.

## 5. Inbound email

`support@` becomes a ticket source.

- A provider webhook (or IMAP poll) hands each message to a job.
- A new thread creates a ticket in a configured project with a configured type; a reply — matched by
  `In-Reply-To`/`References` against the threading headers spec 14 §3 already sets — appends a comment.
  Subject-line key matching is the fallback, never the primary, because subjects get edited.
- Sender resolution: a known user becomes the reporter; an unknown sender becomes a recorded external
  reporter and the ticket is flagged for triage. **An unknown sender must never be auto-provisioned as
  a user** — that is a free account-creation endpoint on the public internet.
- Attachments are ingested through spec 16 §2 with the same size, type and scan rules.
- Quoted reply text and signatures are stripped; the raw message is retained as an attachment for
  when the stripping is wrong.
- Rate limits per sender, an allow/deny list, SPF/DKIM checks, and an auto-reply loop guard
  (`Auto-Submitted`, `Precedence: bulk`) — two systems auto-replying to each other is the classic
  failure of this feature.

## 6. Comment reactions & threading

Emoji reactions on comments, and one level of replies (`parentCommentId`) — one level, not arbitrary
nesting, which is unreadable in a work context. Both flow through §1 and spec 14.

## Out of scope

Collaborative real-time editing of a description (CRDT), voice/video, and a mobile push transport.

## Acceptance criteria

- Two browser sessions on the same board see a drag by one reflected in the other within a second.
- An SSE payload carries no ticket content, verified by inspecting frames.
- A user whose membership is revoked mid-stream stops receiving that project's events.
- A field being edited is not overwritten by a remote change; the conflicting PATCH returns 409.
- A Slack unfurl for a project the viewer cannot read shows nothing.
- An email reply threads onto the right ticket even with an edited subject line.
- An auto-responder exchange terminates after one message.
