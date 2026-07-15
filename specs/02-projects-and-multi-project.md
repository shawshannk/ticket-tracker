# 02 — Projects & Multi-Project Support

This is the biggest functional upgrade over the prototype. In the prototype, the project switcher in the sidebar existed visually but didn't filter any data — every "project" showed the same 20 seed tickets. You confirmed real multi-project support is in scope for v1.

## What changes

- Every ticket, sprint, and the Overview stats are now scoped to a `project_id`.
- The sidebar project switcher actually changes which project's data is displayed everywhere (Overview, List, Board). Switching projects should feel like switching tenants within the same app — no page reload needed, just refetch scoped data.
- The current project selection is kept in the URL (e.g. `/projects/:projectId/overview`) rather than only in client state, so a direct link or refresh lands on the right project. This also makes it shareable/bookmarkable, which the prototype (a single static page) had no concept of.

## Data

Covered in spec 00 — `projects` table with `id`, `name`, `key_prefix`, `next_ticket_seq`.

## Ticket key generation

Each project has its own sequence (`next_ticket_seq`), so keys look like `NIM-1`, `NIM-2`, `ATL-1`, etc. — independent per project, matching the prototype's per-type key prefixes (`EPC-`, `STY-`) but now also per-project.

**Implementation note**: increment `next_ticket_seq` inside the same DB transaction as the ticket insert, using `SELECT ... FOR UPDATE` or an atomic `UPDATE ... RETURNING` to avoid race conditions if two tickets are created concurrently in the same project.

## API

- `GET /projects` — list all projects (for the sidebar switcher)
- `GET /projects/:id` — single project detail
- `POST /projects` — create project (Admin only — not in the original prototype at all, but multi-project support with no way to add a project isn't very useful; **flagging this as an addition, confirm you want it in v1 or want projects seeded/fixed instead**)

## Frontend

- Sidebar project switcher dropdown (as in prototype) — but `onClick` now triggers a route change (`navigate({ to: '/projects/$projectId/overview', params: { projectId } })`) instead of just local state.
- TanStack Router: nest all main views under a `/projects/$projectId` route segment so `projectId` is always available via route params, not prop drilling.

## Open question for you

The prototype's `PROJECTS` array was just 3 hardcoded names with no create/edit/delete UI. Should project creation be a v1 feature (with its own form, likely Admin-only), or should projects stay fixed/seeded for now and you add project CRUD later? I've spec'd the `POST /projects` endpoint above assuming you'll want it, but it's easy to drop if not.
