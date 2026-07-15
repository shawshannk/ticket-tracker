# 05 — Ticket Detail

## Layout (from prototype)

- Header: breadcrumb (back to Tickets), key + title, type/status/priority badges
- Editable fields: status (options depend on type), priority, assignee, environment, size, start date, estimated end date, sprint, epic (Story/Bug), story link (Bug only, filtered to stories under the selected epic)
- Read-only: description, reporter, labels/tags, created date
- Dirty-state tracking: "Save changes" button is disabled/greyed until something changes, shows "Saved ✓" briefly after a successful save
- Comments: list (author initials, name, relative time, text) + add-comment box
- Delete button — **Admin/Manager only** (Developer role cannot see or use it)

## Fixing the prototype's comment-author bug

The prototype hardcoded every new comment's author to `'Jordan Lee'`, regardless of which demo user was active in the user-switcher. This was a shortcut, not intentional behavior. In this spec: `POST /tickets/:id/comments` uses whichever user is currently "acting as" (see spec 08) as `author_id`. This is a straightforward fix, flagging it so it isn't silently different from what you might expect after using the prototype.

## API

- `GET /tickets/:id` — full ticket detail including `comments[]`, `statusOptions` (computed server-side from type), `storyOptions` (stories under the ticket's current epic)
- `PATCH /tickets/:id` — body is a partial update (status, priority, assignee, env, size, dates, sprint, epic, story). Server validates:
  - status is valid for the ticket's `type`
  - if `story_id` is set, that story's `epic_id` matches this ticket's `epic_id` (see spec 00 constraint)
  - only Admin/Manager/Developer can edit (all three can, per the permission matrix — this endpoint itself isn't role-gated beyond "is a recognized user")
- `DELETE /tickets/:id` — **guard: Admin or Manager only**, 403 for Developer
- `POST /tickets/:id/comments` — body `{ body: string }`, `author_id` taken from the current "acting as" user server-side (not trusted from the request body)

## Frontend

- Keep the prototype's "draft" pattern: local component state holds pending edits, dirty-check compares draft vs. server data field-by-field, only `PATCH` on explicit Save click (not on every field change) — this was a good pattern in the prototype, worth preserving rather than "fixing."
- `TanStack Query` mutation with cache invalidation for: this ticket's detail query, the tickets list query, the board query, and the overview query (since editing status/priority affects all of them).
