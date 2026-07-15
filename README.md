# Ticket Tracker — Web App

A full-stack rebuild of the static ticket-tracking dashboard prototype (`Ticket Dashboard.dc.html`), turning it into a real, persisted, multi-project ticket/issue tracker with Epic → Story → Bug hierarchy, a Kanban board, and team management.

This repo is a spec-first handoff: read `specs/00-architecture-and-data-model.md` first, then the per-feature specs. Each spec is self-contained enough to implement independently once the data model is in place.

## Tech stack

| Layer | Choice | Why |
|---|---|---|
| Backend framework | NestJS (Node/TypeScript) | Modular, DI-based, first-class CQRS support (`@nestjs/cqrs`) — mirrors your MediatR habit |
| ORM | Drizzle ORM | Type-safe, SQL-close, no runtime query engine |
| Database | PostgreSQL | Most mature Drizzle dialect; best migration/tooling story |
| Frontend | React | Component model matches the original prototype closely |
| Routing | TanStack Router | Type-safe routes, matches the view-based navigation in the prototype |
| Server state | TanStack Query | Caching, invalidation, optimistic updates for ticket edits |
| Tables | TanStack Table | Powers the Tickets List view (sort, filter, pagination) |
| Drag-and-drop | `@dnd-kit/core` | Accessible, touch-friendly board drag-and-drop (prototype used raw HTML5 DnD) |
| Styling | Tailwind CSS | Fast to build, easy to keep visually close to the prototype |
| Validation | Zod | Shared schemas between API DTOs and frontend forms |
| Monorepo | Turborepo | `apps/api`, `apps/web`, `packages/shared` (Zod schemas + types) |
| Testing | Vitest (unit/integration) + Playwright (e2e) | |
| CI | GitHub Actions | |
| Local infra | Docker Compose | Postgres + API + web, one `docker compose up` |

**Not decided yet (explicitly out of scope for this spec, flagged for later):**
- Cloud hosting target (AWS/other) — you said decide later
- Real authentication (JWT/SSO) — v1 uses an "acting as" user selector instead; see `specs/08-current-user-and-permissions.md` for exactly what that does and does not protect against
- File attachments on tickets
- Email/notification delivery
- Real-time sync (websockets) between multiple open browser tabs/users

## Repo structure

```
ticket-tracker-webapp/
├── apps/
│   ├── api/            # NestJS backend
│   └── web/             # React frontend
├── packages/
│   └── shared/          # Zod schemas, shared TS types, constants (statuses, roles, etc.)
├── docker-compose.yml
├── specs/                # This handoff's feature specs — read before coding
└── README.md
```

## Specs index

1. `specs/00-architecture-and-data-model.md` — **read this first.** Entities, relationships, enums, computed fields.
2. `specs/01-overview-dashboard.md` — KPI cards, breakdowns, recent activity
3. `specs/02-projects-and-multi-project.md` — project switcher, per-project scoping, ticket key sequences
4. `specs/03-tickets-list.md` — filters, search, density toggle
5. `specs/04-board-view.md` — Kanban, drag-and-drop, sprint/type scoping
6. `specs/05-ticket-detail.md` — inline editing, dirty-state, comments, delete
7. `specs/06-create-ticket.md` — type-aware creation form, Epic/Story/Bug linking
8. `specs/07-people-and-users.md` — team list, add/edit member
9. `specs/08-current-user-and-permissions.md` — the "acting as" selector and what it does/doesn't secure
10. `specs/09-testing-and-devops.md` — test strategy, Docker Compose, CI pipeline

## Local development (once scaffolded)

```bash
docker compose up -d postgres        # start just the DB
cd apps/api && npm run db:migrate    # apply Drizzle migrations
npm run dev                          # from repo root via Turborepo, runs api + web
```

## Known gaps carried over from the prototype (things it faked)

- The prototype's "switch user" dropdown is not authentication — it's a demo convenience. This spec keeps that *pattern* deliberately (see spec 08) but is explicit that it provides no real access control until real auth is added.
- The prototype's project switcher didn't actually filter data — this spec fixes that (see spec 02).
- Comments were hardcoded to author "Jordan Lee" regardless of which demo user was active — this spec fixes that (see spec 05).
- All prototype state lived in React memory and reset on refresh — this spec persists everything to Postgres.
