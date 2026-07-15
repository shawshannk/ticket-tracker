# Ticket Tracker — Plan

Derived from spec as of: 2026-07-15  <!-- must match PROGRESS.md fingerprint -->

Dependency order (from SPEC.md cross-module contracts, not spec-file numbering):
M1 → M2 → M3 → M4 → M5 → M6 → M7 → {M8..M13} → M14.
Backend (M3–M6) precedes frontend views (M8–M13) because the web app generates its typed
client from the API's OpenAPI spec.

Reference: `reference/Ticket Dashboard.dc.html` consulted for visual/behavioral fidelity
(per-module "Reference consulted" notes below). It is reference, not requirements — the
specs win on conflict. Resolved conflicts: D-key (per-project keys) and R10 (view toggles).

## Modules

### M1: Monorepo scaffolding & local infra (M)
- **Goal**: Turborepo skeleton with three workspaces, NestJS + React app shells that boot, and a Docker Compose Postgres that comes up.
- **Source spec**: README.md, specs/09-testing-and-devops.md
- **Files**: `package.json`, `turbo.json`, `pnpm-workspace.yaml` (or npm workspaces), `apps/api/` (NestJS `main.ts`, empty AppModule, Swagger bootstrap), `apps/web/` (Vite + React + Tailwind shell), `packages/shared/` (empty index + build config), `docker-compose.yml`, `apps/api/.env.example`, root `tsconfig.base.json`.
- **Acceptance criteria**:
  - `turbo run build` completes across all three workspaces.
  - `docker compose up -d postgres` starts Postgres and it accepts connections on 5432.
  - `apps/api` boots and serves Swagger UI at `/api`; `apps/web` serves the Vite dev page.
- **Depends on**: —

### M2: Shared package + data model + migrations + seed (L→ core of the app, keep tight)
- **Goal**: All enums/Zod schemas/types in `packages/shared`; Drizzle schema for all 5 tables; first migration; minimal seed (8 users + 1 project).
- **Source spec**: specs/00-architecture-and-data-model.md
- **Reference consulted**: prototype `seedUsers()`, `DEPARTMENTS`, color palettes, and `STATUS_BY_TYPE` for concrete enum/seed values. Seed project = "Nimbus Triage" / `key_prefix "NIM"` / `next_ticket_seq 1`.
- **Files**: `packages/shared/src/enums.ts` (incl. `STATUS_BY_TYPE`, `DEPARTMENTS`, color palettes), `packages/shared/src/schemas.ts` (Zod: ticket create/update, comment, user, project, DTO shapes), `packages/shared/src/types.ts`, `apps/api/src/db/schema/*.ts` (projects, users, sprints, tickets, comments), `apps/api/src/db/index.ts` (Drizzle client), `drizzle.config.ts`, generated migration under `apps/api/drizzle/`, `apps/api/src/db/seed.ts`.
- **Acceptance criteria**:
  - `drizzle-kit generate` produces a migration; `drizzle-kit migrate` applies it cleanly to the Compose Postgres.
  - Seed script runs and inserts the 8 reference users + 1 project ("Nimbus Triage", `key_prefix "NIM"`, `next_ticket_seq=1`).
  - `packages/shared` builds and exports enums/schemas importable by both apps.
- **Depends on**: M1

### M3: Users API + acting-as guard + role matrix (M)
- **Goal**: Server-side identity/permission foundation everything else depends on.
- **Source spec**: specs/07-people-and-users.md, specs/08-current-user-and-permissions.md, specs/00 (role matrix)
- **Files**: `apps/api/src/auth/acting-user.guard.ts`, `apps/api/src/auth/roles.decorator.ts` + `roles.guard.ts`, `apps/api/src/users/*` (module, controller, CQRS query/command handlers for GET list/detail, POST, PATCH), DTOs from shared.
- **Acceptance criteria**:
  - `GET /users`, `GET /users/:id` return seeded users.
  - `POST /users` and `PATCH /users/:id` return 403 unless `X-Acting-User-Id` resolves to an Admin.
  - Vitest unit tests cover the roles-guard decision table (admin/manager/developer × guarded actions).
- **Depends on**: M2

### M4: Projects API + multi-project scoping + ticket-key sequence (M)
- **Goal**: Project list/detail/create; the transactional per-project key generator used by ticket creation.
- **Source spec**: specs/02-projects-and-multi-project.md
- **Key format** (D-key): single per-project sequence, type-agnostic — `{key_prefix}-{seq}` e.g. `NIM-1`. No per-type prefixes.
- **Files**: `apps/api/src/projects/*` (module, controller, `GetProjectsQuery`, `GetProjectQuery`, `CreateProjectCommand` — Admin-gated), a `TicketKeyService`/command helper using `UPDATE ... RETURNING` for `next_ticket_seq`.
- **Acceptance criteria**:
  - `GET /projects` lists projects; `GET /projects/:id` returns one; `POST /projects` is Admin-only (403 otherwise).
  - Integration test: two concurrent key allocations for one project yield distinct sequential keys (race-safe).
- **Depends on**: M3

### M5: Tickets write side — commands + validation (L)
- **Goal**: Create / Update / Delete / MoveStatus / AddComment as CQRS commands with all server-side rules.
- **Source spec**: specs/06-create-ticket.md, specs/05-ticket-detail.md, specs/04-board-view.md (status move), specs/00 (constraints)
- **Files**: `apps/api/src/tickets/commands/*` (CreateTicket, UpdateTicket, DeleteTicket, MoveTicketStatus, AddComment), controller routes `POST /projects/:projectId/tickets`, `PATCH /tickets/:id`, `PATCH /tickets/:id/status`, `DELETE /tickets/:id`, `POST /tickets/:id/comments`. Reporter auto-filled from acting user; comment author from acting user.
- **Acceptance criteria**:
  - Status-by-type validation rejects invalid status with 400 (unit tested per type).
  - Epic/story consistency constraint (R5) enforced and unit tested.
  - Epic creation and delete are Admin/Manager-only (403 for Developer), tested.
  - Comment `author_id` = acting user; create sets `reporter` = acting user's name.
- **Depends on**: M4

### M6: Tickets read side — list / detail / board / overview (L)
- **Goal**: All read queries with scoping, filtering, pagination, and computed overview stats.
- **Source spec**: specs/03-tickets-list.md, specs/05-ticket-detail.md, specs/04-board-view.md, specs/01-overview-dashboard.md
- **Files**: `apps/api/src/tickets/queries/*` (GetTickets w/ filters+pagination+sort, GetTicketDetail incl. comments+statusOptions+storyOptions, GetBoard flat filtered list, GetOverviewStats single-query aggregation). Routes `GET /projects/:projectId/tickets`, `GET /tickets/:id`, `GET /projects/:projectId/board`, `GET /projects/:projectId/overview`.
- **Acceptance criteria**:
  - List returns `{ items, total }`, honors status/priority/assignee/env/epic/type/search + page/pageSize + sort.
  - Integration test for R2: a ticket created in project A never appears in project B's list/board/overview.
  - Overview computed in one query; empty-project edge cases return 0 / 0.0 without divide-by-zero.
- **Depends on**: M5

### M7: Frontend app shell — routing, layout, API client, acting-as & project switcher (M)
- **Goal**: The web skeleton every view mounts into: typed API client from OpenAPI, TanStack Router tree nested under `/projects/$projectId`, sidebar with project switcher (route change) + acting-as selector (Zustand), API wrapper attaching `X-Acting-User-Id`.
- **Source spec**: specs/02 (routing/switcher), specs/08 (acting-as), README (stack)
- **Reference consulted**: prototype sidebar layout, project/user dropdowns, nav icons, color palettes, and the `density`/`showHierarchy`/`tagStyle` view-preference toggles (R10) — store these UI-only prefs in the same client store (`store/viewPrefs.ts`) as acting-user.
- **Files**: `apps/web/src/api/*` (generated/typed client + wrapper), `apps/web/src/router.tsx`, `apps/web/src/store/actingUser.ts` + `store/viewPrefs.ts` (Zustand), `apps/web/src/layout/*` (sidebar, project switcher, acting-as dropdown), TanStack Query provider setup.
- **Acceptance criteria**:
  - App boots, sidebar lists projects (from `GET /projects`) and users (acting-as); switching project changes the URL and refetches scoped data.
  - Every mutation sends the `X-Acting-User-Id` header (verified via network inspection or a wrapper unit test).
  - `density`/`showHierarchy`/`tagStyle` toggles exist in the client store and are readable by feature views (R10).
- **Depends on**: M6

### M8: Overview Dashboard view (S)
- **Goal**: Read-only KPI cards + status/priority breakdowns + recent activity.
- **Source spec**: specs/01-overview-dashboard.md
- **Reference consulted**: prototype Overview markup — KPI cards, status bars, priority tiles, "Recently updated" list; color palettes.
- **Files**: `apps/web/src/features/overview/*`.
- **Acceptance criteria**: KPIs, breakdowns, and recent activity render from `GET .../overview`; empty project shows empty states; query key `['overview', projectId]` invalidated by ticket mutations.
- **Depends on**: M7

### M9: Tickets List view (M)
- **Goal**: Filter bar + search + density toggle + paginated table, filters bound to URL.
- **Source spec**: specs/03-tickets-list.md
- **Reference consulted**: prototype List markup — filter bar, column grid, row layout, breadcrumb; honors R10 `density`/`showHierarchy`/`tagStyle`.
- **Files**: `apps/web/src/features/tickets-list/*` (TanStack Table).
- **Acceptance criteria**: Filters/search sync to URL params; debounced search (300ms); server-side pagination; row click navigates to detail; "X of Y" count and empty state.
- **Depends on**: M7

### M10: Board (Kanban) view (M)
- **Goal**: `@dnd-kit` board with type-dependent columns, sprint/type filters, optimistic status move.
- **Source spec**: specs/04-board-view.md
- **Reference consulted**: prototype Board markup — column layout, card design, count badges; honors R10 `density`/`tagStyle`. (Prototype used raw HTML5 DnD; this module replaces it with `@dnd-kit`.)
- **Files**: `apps/web/src/features/board/*`.
- **Acceptance criteria**: Columns match the type filter; cards not draggable into invalid columns; drop calls `PATCH /tickets/:id/status` with optimistic update + rollback on failure; filters bound to URL.
- **Depends on**: M7

### M11: Ticket Detail view (M)
- **Goal**: Inline editable fields with draft/dirty-state pattern, comments, role-gated delete.
- **Source spec**: specs/05-ticket-detail.md
- **Reference consulted**: prototype Detail markup — two-column layout, editable side panel, activity/comments, save/delete buttons; honors R10 `showHierarchy`/`tagStyle`.
- **Files**: `apps/web/src/features/ticket-detail/*`.
- **Acceptance criteria**: Draft/dirty tracking (Save disabled until change, "Saved ✓" after); status options + story options driven by type/epic; comments list + add; delete visible only to Admin/Manager; mutation invalidates detail/list/board/overview queries.
- **Depends on**: M7

### M12: Create Ticket view (M)
- **Goal**: Type-aware form (Epic/Story/Bug), Epic option hidden for Developer, submit → detail.
- **Source spec**: specs/06-create-ticket.md
- **Reference consulted**: prototype Create markup — type pills, type-branched field grid, tags input, submit/cancel. (No reporter field — auto-filled server-side per your decision.)
- **Files**: `apps/web/src/features/create-ticket/*`.
- **Acceptance criteria**: Fields branch by type using shared Zod schema; Bug story-dropdown filtered to selected epic; Epic tab hidden for Developer; reporter not shown (auto-filled server-side); submit navigates to new ticket's detail.
- **Depends on**: M7

### M13: People & Users views (S)
- **Goal**: People list + user detail edit + create-user form (Admin-only entry points).
- **Source spec**: specs/07-people-and-users.md
- **Reference consulted**: prototype People list, User Detail (Admin-only editable fields + read-only summary), Create User form.
- **Files**: `apps/web/src/features/people/*`.
- **Acceptance criteria**: List renders users; "Add team member" + edit save visible/functional only for Admin; create navigates to new user's detail.
- **Depends on**: M7

### M14: Testing hardening & CI (M)
- **Goal**: Integration-test infra + Playwright happy-path e2e + GitHub Actions pipeline.
- **Source spec**: specs/09-testing-and-devops.md
- **Files**: `apps/api` integration tests (testcontainers or Compose PG), `e2e/` Playwright suite, `.github/workflows/ci.yml`.
- **Acceptance criteria**: E2E covers create → list → drag on board → edit detail → comment → delete as Manager → confirm Developer cannot delete; CI runs typecheck → lint → unit → integration → build (e2e as a separate job).
- **Depends on**: M8–M13

## Backlog
<!-- Parked ideas from mid-build. One line each, dated. Triaged at Phase 5. -->
- 2026-07-15: Full ~20-row prototype seed dataset (deferred; minimal seed chosen for v1).
- 2026-07-15: User deletion strategy (soft-delete / reassign / block) — spec 07 defers.
- 2026-07-15: Per-project team membership (`project_members` join table) — additive, future.
- 2026-07-15: Sprint CRUD UI (sprints exist in the model; no management UI spec'd yet).
