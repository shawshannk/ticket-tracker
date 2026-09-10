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
- ~~Real authentication~~ — **shipped in Phase 2** (`specs/10-authentication-and-authorization.md`). v1's "acting as" selector is gone. SSO is still out of scope (spec 10 §9)
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
cd apps/api && pnpm run db:migrate   # apply Drizzle migrations
pnpm run db:seed                     # demo data — 8 users, 3 projects, sprints, memberships
pnpm run dev                         # from repo root via Turborepo, runs api + web
```

### Seed credentials

The seed creates all eight users **active**, sharing one password:

```
DevPassw0rd!2026
```

e.g. `jordan.lee@nimbus.io` (admin), `priya.nair@nimbus.io` (manager),
`marcus.chen@nimbus.io` (developer). Sign in at `/login`; there is no other way in.

This is development-only by construction: the seed refuses to run against a non-local database
unless `SEED_ALLOW_REMOTE=true` is set explicitly, because it writes a known password onto every
account. Re-running the seed is idempotent and re-asserts those credentials without touching
names, departments or roles.

### Authentication in development

`AUTH_DEV_IMPERSONATION` is **off** in Compose and CI, which is the configuration that ships:
every route needs a bearer token and the legacy `X-Acting-User-Id` header does nothing. Turning
it on locally restores v1's behaviour — any request may claim to be any user — which is useful
for poking the API by hand and is refused outright when `NODE_ENV=production`.

`AUTH_JWT_SECRET` is required to boot; `apps/api/.env.example` documents it and the rest.
Rotating it signs everyone out. See `docs/auth-tech-spec.md` §8 for the full table.

The built web image sends a strict `Content-Security-Policy` (`apps/web/nginx.conf`) — spec 10
§8 names it as the mitigation for what XSS could otherwise do with the in-memory access token,
so it is part of the deliverable. The Vite dev server does not send it; `pnpm exec playwright
test` against the built image is what checks it.

## Known gaps carried over from the prototype (things it faked)

- The prototype's "switch user" dropdown was not authentication — it was a demo convenience, and v1 kept that *pattern* deliberately (see spec 08). **Replaced in Phase 2** (M15–M21): you sign in with a password, every route requires a verified token, and `X-Acting-User-Id` is inert. The account menu shows who you are; there is no list to pick from.
- The prototype's project switcher didn't actually filter data — this spec fixes that (see spec 02).
- Comments were hardcoded to author "Jordan Lee" regardless of which demo user was active — this spec fixes that (see spec 05).
- All prototype state lived in React memory and reset on refresh — this spec persists everything to Postgres.
