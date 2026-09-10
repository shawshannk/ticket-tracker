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
> **Split into M5a / M5b on 2026-09-08** (was one L module; the skill calls for splitting L).
> The acceptance criteria below are divided between the two halves, unchanged in substance.

#### M5a: Ticket rules + CreateTicket (M)
- **Goal**: The shared server-side rule layer, plus ticket creation end to end.
- **Source spec**: specs/06-create-ticket.md, specs/00 (constraints, status by type)
- **Files**: `apps/api/src/tickets/ticket-rules.ts` (status-by-type validation, default status,
  epic/story consistency R5, type-dependent field nulling), `ticket.mapper.ts`,
  `commands/create-ticket.command.ts`, `tickets.controller.ts` (route
  `POST /projects/:projectId/tickets` only), `tickets.module.ts`.
- **Acceptance criteria**:
  - Status-by-type validation rejects invalid status with 400 (unit tested per type).
  - Epic/story consistency constraint (R5) enforced and unit tested.
  - Epic creation is Admin/Manager-only (403 for Developer), tested.
  - Create sets `reporter` = acting user's name and allocates the key via M4's
    `TicketKeyService` inside the insert's transaction.
- **Depends on**: M4

#### M5b: Update / MoveStatus / Delete / AddComment (M)
- **Goal**: The remaining four write commands, on top of M5a's rule layer.
- **Source spec**: specs/05-ticket-detail.md, specs/04-board-view.md (status move), specs/00
- **Files**: `apps/api/src/tickets/commands/*` (UpdateTicket, MoveTicketStatus, DeleteTicket,
  AddComment), controller routes `PATCH /tickets/:id`, `PATCH /tickets/:id/status`,
  `DELETE /tickets/:id`, `POST /tickets/:id/comments`.
- **Acceptance criteria**:
  - Status-by-type validation applies to both `PATCH /tickets/:id` and `PATCH /tickets/:id/status`.
  - R5 re-checked on update when `epic_id` / `story_id` change.
  - Delete is Admin/Manager-only (403 for Developer), tested.
  - Comment `author_id` = acting user, taken server-side, never from the body.
  - `updated_at` advances on every mutation, including status moves.
- **Depends on**: M5a

### M6: Tickets read side — list / detail / board / overview (L)
> **Split into M6a / M6b on 2026-09-08**, as M5 was. Acceptance criteria divided, unchanged
> in substance; the R2 isolation test is split by endpoint.

#### M6a: Shared read DTOs + tickets list + ticket detail (M)
- **Goal**: The two ticket-shaped reads, with the summary select/mapper every later read reuses.
- **Source spec**: specs/03-tickets-list.md, specs/05-ticket-detail.md
- **Files**: `packages/shared` additions (`TicketSummary`, `TicketDetail`, `Paged<T>`,
  `ticketListQuerySchema`); `apps/api/src/tickets/queries/ticket-summary.ts` (joined select +
  mapper shared by list / board / overview), `queries/get-tickets.query.ts`,
  `queries/get-ticket-detail.query.ts`; routes `GET /projects/:projectId/tickets`,
  `GET /tickets/:id`.
- **Acceptance criteria**:
  - List returns `{ items, total }`, honors status/priority/assignee/env/epic/type/search +
    page/pageSize + sortBy/sortDir; search is case-insensitive substring over title/key/assignee name.
  - Detail includes `comments[]` (with author), `statusOptions` from the ticket's type, and
    `storyOptions` (stories under its epic).
  - Integration test for R2: a ticket created in project A never appears in project B's list.
- **Depends on**: M5

#### M6b: Board + overview stats (M)
- **Goal**: The board's flat filtered list and the overview's single-query aggregation.
- **Source spec**: specs/04-board-view.md, specs/01-overview-dashboard.md
- **Files**: `packages/shared` `OverviewStats`; `queries/get-board.query.ts`,
  `queries/get-overview-stats.query.ts`; routes `GET /projects/:projectId/board`,
  `GET /projects/:projectId/overview`.
- **Scope addition (agreed with user 2026-09-08)**: spec 04's board Sprint filter needs sprints
  to exist, but no module in this plan ever created or listed them and the table is empty.
  M6b therefore also adds `GET /projects/:projectId/sprints` (read-only) and seeds 2-3 sprints
  per project. Sprint *management* (create/edit) stays out of scope — no spec describes it.
- **Acceptance criteria**:
  - Board honors sprint/type filters and returns `TicketSummary[]` flat (grouping is client-side).
  - Overview computed in one query; empty-project edge cases return 0 / 0.0 without divide-by-zero.
  - Integration test for R2: project A's tickets never appear in project B's board/overview.
- **Depends on**: M6a

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

## Phase 2 — Real authentication & authorization

Derived from `specs/10-authentication-and-authorization.md` (2026-09-09) and
`docs/auth-tech-spec.md`. Supersedes spec 08's acting-as mechanism.

Dependency order: M15 → M16 → M17 → M18 → M19 → M20 → M21.
Backend first, and in this order for a reason: the schema must exist before tokens can be
issued, tokens before scoping can be enforced, and the whole API must be enforcing before the
web app stops sending `X-Acting-User-Id`. `AUTH_DEV_IMPERSONATION=true` holds the app working
end-to-end through M15–M18; M19 is the first module that breaks the old client, and M21 is the
first that may ship with the flag off.

### M15: Auth schema, migration & backfill (M)
- **Goal**: Every table and column real auth needs, plus a backfill that preserves today's access exactly.
- **Source spec**: docs/auth-tech-spec.md §2
- **Files**: `apps/api/src/db/schema/users.ts` (add `status`, `password_hash`, `password_changed_at`, `last_login_at`), new `project-members.ts`, `refresh-tokens.ts`, `invites.ts`, `auth-events.ts`, `apps/api/src/db/schema/index.ts`, generated migration under `apps/api/drizzle/`, `apps/api/src/db/seed.ts`.
- **Scope added 2026-09-09 during implementation**: `tickets.reporter_id` (nullable FK to users) plus a name-matching backfill, and `USER_STATUSES` in `packages/shared/src/enums.ts`. The tech spec's ownership rules assume `ticket.reporterId`, but v1 stored the reporter as a denormalized display name — M19 was unbuildable as written without this. Decided with the user: add the FK, keep the text column for display.
- **Acceptance criteria**:
  - `drizzle-kit generate` + `migrate` apply cleanly to a database holding v1 data.
  - Backfill inserts one `project_members` row per (project × user) with the user's global role, so no existing access is removed.
  - Seed creates the 8 users as `active` with an argon2id hash of a documented dev password, and every user as a member of every seeded project.
  - `toUser()` has a unit test asserting no password material appears in its output (R17).
- **Depends on**: —

### M16: Password, invite & token services (M)
- **Goal**: The credential primitives, with no HTTP surface yet — pure units, exhaustively tested.
- **Source spec**: docs/auth-tech-spec.md §3, §5.1; spec 10 §5.1
- **Files**: `apps/api/src/auth/password.service.ts` (argon2id hash/verify, policy check), `apps/api/src/auth/token.service.ts` (JWT sign/verify, opaque refresh generation + sha256), `apps/api/src/auth/session.service.ts` (issue / rotate / revoke / revoke-family / revoke-all-for-user), `apps/api/src/auth/invite.service.ts`, `apps/api/src/auth/audit.service.ts`, `packages/shared/src/schemas.ts` (login, password-change, invite-accept schemas).
- **Built 2026-09-09 with one deviation**: the policy itself went to `packages/shared/src/password-policy.ts`, not into `password.service.ts` — spec 10 §6's live checklist on the invite page needs it client-side too.
- **Acceptance criteria**:
  - Password policy: ≥12 chars, rejects email local-part and the bundled common list.
  - Rotation marks the old token used and issues a new one in the same family, inside one transaction with `FOR UPDATE`.
  - Presenting a used token revokes the whole family and writes a `refresh_reuse` audit event (R16) — an integration test proves it.
  - `AUTH_JWT_SECRET` shorter than 32 bytes, or absent, fails at construction.
- **Depends on**: M15

### M17: Auth endpoints & AuthGuard (L)
- **Goal**: Real login. Every route authenticated, with the dev-impersonation escape hatch.
- **Source spec**: docs/auth-tech-spec.md §4.1, §5.1, §6.8; spec 10 §4.2–4.4
- **Files**: `apps/api/src/auth/auth.controller.ts`, `auth.guard.ts` (replaces `acting-user.guard.ts`), `public.decorator.ts`, `auth-context.ts`, `auth.module.ts`, `apps/api/src/main.ts` (CORS credentials, bearer in Swagger, boot-time impersonation check), `apps/api/src/app.controller.ts` (`@Public()` health), **and `docker-compose.yml` + `.github/workflows/ci.yml`** — `AUTH_JWT_SECRET` became required to boot in M16 and is set in neither.
- **Acceptance criteria**:
  - `POST /auth/login|refresh|logout|password`, `GET /auth/me|sessions`, `DELETE /auth/sessions/:id`, `POST /auth/invite/accept` behave per the tech spec's table.
  - Refresh cookie is `HttpOnly; SameSite=Lax; Path=/auth`, and `Secure` outside development.
  - Login failures are uniform across unknown email / wrong password / invited / disabled, and a dummy hash is verified for unknown emails so timing does not disclose existence.
  - Disabling an account or changing a password revokes sessions and takes effect on the very next request (R15).
  - Throttling: 10 login attempts per 15 minutes per ip+email.
  - The process **exits at boot** if `AUTH_DEV_IMPERSONATION=true` with `NODE_ENV=production`.
  - With the flag on, every existing integration test still passes unchanged.
- **Depends on**: M16

### M18: Project membership & scope guard (L)
- **Goal**: Per-project roles enforced, and non-members unable to detect a project exists.
- **Source spec**: docs/auth-tech-spec.md §5, §6.1–6.3; spec 10 §3.2, R12/R13
- **Files**: `packages/shared/src/permissions.ts` (`PLATFORM_PERMISSIONS`, `PROJECT_PERMISSIONS`, `effectiveRole`), `apps/api/src/auth/project-scope.guard.ts`, `permission.guard.ts` (replaces `roles.guard.ts`), `project-scope.decorator.ts`, `require.decorator.ts`, `apps/api/src/projects/members.controller.ts` + CQRS handlers, and every existing controller (decorator swap).
- **Acceptance criteria**:
  - `effectiveRole()` truth table covered exhaustively in unit tests, including the global-admin bypass.
  - A non-member gets `404` for `GET /projects/:id`, its tickets, board, overview, sprints, **and** for `GET /tickets/:id` addressed directly (R12).
  - A global manager who is a project developer cannot create an epic there; a global developer who is a project manager can (R13). Both directions tested.
  - `GET /projects` returns only the caller's memberships — a query-level filter, not a guard (tech spec §6.3).
  - Member add/update/remove works; removing or demoting the last project admin is refused (R18).
  - `PERMISSIONS`/`can()` call sites in `apps/web` compile against the new signatures.
- **Scope adjusted 2026-09-10 during implementation**:
  - `PERMISSIONS` split into `PLATFORM_PERMISSIONS` / `PROJECT_PERMISSIONS` with separate action
    types and separate decorators (`@RequirePlatform` / `@RequireProject`), because the two are
    answered from different roles and one map made the wrong role easy to pass.
  - Tech spec §5.3 (`actingUser: User` → `auth: AuthContext`) pulled forward for
    `CreateTicketCommand` and `AddCommentCommand` only — the epic gate must read the *effective*
    project role for R13. The remaining command signatures stay with M19.
  - `create-ticket` now writes `tickets.reporter_id`, which nothing had populated since M15 added
    it. M19's ownership rule reads only that column and would have failed open without this.
  - `CreateProjectCommand` makes its creator a project admin in the same transaction, so R18's
    project half holds from the moment a project exists.
  - `DELETE /tickets/:id` keeps its manager/admin route gate for one more module; M19 replaces it
    with the ownership check that also admits the reporter.
- **Depends on**: M17

### M19: Record-level ownership & comment editing (M)
- **Goal**: The rules that need the row, enforced where the row is loaded.
- **Source spec**: docs/auth-tech-spec.md §5.2–5.3; spec 10 §3.3, R14
- **Files**: `apps/api/src/auth/ownership.ts`, `apps/api/src/tickets/commands/delete-ticket.command.ts`, `update-ticket.command.ts`, new `update-comment.command.ts` + `delete-comment.command.ts`, `apps/api/src/tickets/comments.controller.ts`, all remaining command constructors (`actingUser: User` → `auth: AuthContext`; create-ticket and add-comment already converted in M18), and `tickets.controller.ts` — the `@RequireProject('ticket.delete')` route gate comes off as `assertCanDeleteTicket` goes in. New comment routes use `@ProjectScope('comment')`, which M18 built.
- **Acceptance criteria**:
  - A project developer may delete a ticket they reported, and may not delete one they did not.
  - Authorization reads `tickets.reporter_id` (added in M15), **never** the `reporter` display-name text. A null `reporter_id` fails the ownership check and falls back to manager/admin.
  - A developer may reassign a ticket where they are reporter or assignee, and not otherwise.
  - `PATCH /comments/:id` succeeds only for the author — **including** a refusal for a project admin — and `DELETE /comments/:id` succeeds for author or project admin.
  - Every `assertCan*` has a unit test with a hand-built `AuthContext`, in the style of `roles.guard.spec.ts`.
- **Scope adjusted 2026-09-10 during implementation**:
  - A route that hands its decision to `ownership.ts` still keeps `@RequireProject('ticket.read')`
    — "you must be a member of this project". Without it, an identity-less request under
    `AUTH_DEV_IMPERSONATION` reaches the handler with a null `auth` and 500s where v1 gave 403.
    Found by probing the running container; applies to `DELETE /tickets/:id` and both comment routes.
  - `MoveTicketStatusCommand` keeps its old signature: a status move has no ownership dimension,
    and an unused `auth` parameter would imply a check that isn't there.
  - No `edited_at` on comments — deferred, and noted for M20/M21 to decide alongside the UI.
- **Depends on**: M18

### M20: Web auth flow (L)
- **Goal**: A real login screen; acting-as deleted from the frontend.
- **Source spec**: docs/auth-tech-spec.md §7; spec 10 §6
- **Files**: new `apps/web/src/auth/*` (`AuthProvider`, `tokenStore`, `LoginPage`, `AcceptInvitePage`, `SessionsPage`, `useCan`), `apps/web/src/api/client.ts` + `endpoints.ts` (bearer, credentials, single-flight refresh, drop every `actingUserId` param), `router.tsx`, `layout/AppShell.tsx`, `Sidebar.tsx`, `ProjectSwitcher.tsx`; **deleted**: `store/actingUser.ts`, `layout/ActingUserMenu.tsx`; updated consumers in `features/ticket-detail/*`, `features/board/useOptimisticMove.ts`, `features/create-ticket/*`, `features/people/*`.
- **Acceptance criteria**:
  - Unauthenticated access to any route redirects to `/login` and returns to the intended page after signing in.
  - A reload does not flash the login page: bootstrap refreshes once before first paint.
  - Ten simultaneous 401s trigger exactly **one** refresh request (a single shared in-flight promise) — unit-tested, because getting this wrong looks like token theft to M16's reuse detection.
  - The project switcher lists only the user's memberships; a user with none sees the explicit empty state.
  - Account menu offers change password, sessions, log out, log out everywhere.
  - No reference to `X-Acting-User-Id` or `ticket-tracker.acting-user` remains in `apps/web`.
- **Scope adjusted 2026-09-10 during implementation**:
  - `GET /auth/invite/:token` added to the API (public, throttled): spec 10 §6 wants the
    acceptance page to name the invitee and nothing could tell it.
  - The login rate limit became env-configurable, defaulting to the spec's 10 per 15 minutes;
    Compose raises it because the e2e suite now signs in for real many times per run.
  - **R16 narrowed**: a refresh replay inside `AUTH_REFRESH_GRACE_MS` on a family that still has
    a live token is forgiven and audited, instead of revoking the family. Every full page load
    rotates the cookie, so a navigation that discards the response otherwise ended every session.
    Agreed with the user; recorded under R16 in specs/10.
  - E2E ported to real login **here** rather than in M21 (agreed with the user), so the suite
    stays green; `e2e/auth.spec.ts` covers M20's own criteria and M21 adds the rest.
- **Depends on**: M19

### M21: Members UI, invites, hardening & cutover (M)
- **Goal**: Admin-facing management, the security headers spec 10 §8 promises, and the flag off.
- **Source spec**: spec 10 §4.1, §4.5, §6; docs/auth-tech-spec.md §7, §9
- **Files**: `apps/web/src/features/people/*` (invite link display, disable/enable, email visibility by viewer), new `apps/web/src/features/project-settings/Members*.tsx`, `apps/web/nginx.conf` (CSP — note the Dockerfile currently writes its nginx config inline), `docker-compose.yml` + `.github/workflows/ci.yml` (auth env), `e2e/auth.spec.ts` (extend — M20 created it), `README.md`. The real-login helper in `e2e/fixtures.ts` landed in M20.
- **Acceptance criteria**:
  - An admin creates a user, sees the invite link once, and a second browser accepts it and lands logged in — covered end-to-end.
  - Members table adds/removes/re-roles; refuses removing the last project admin.
  - E2E logs in for real (no impersonation) and covers: developer sees no Epic option and no Delete on someone else's ticket; a non-member navigating to a project URL sees "not found"; logout returns to `/login` and the back button does not restore the app.
  - CSP is served and the app runs with no inline-script violations.
  - CI passes with `AUTH_DEV_IMPERSONATION` unset for the auth e2e job.
- **Scope adjusted 2026-09-10 during implementation**:
  - `User.email` became nullable, the consequence of §4.4's viewer-dependent visibility; redaction
    lives in `toUserFor` so every DTO path shares one rule.
  - The nginx config moved into `apps/web/nginx.conf` and the CSP's `connect-src` is substituted
    at build time with `sed` — nginx's envsubst templates would also expand `$uri` and break SPA
    routing. `style-src` allows inline (role colours, Google Fonts); `script-src` does not.
  - `WEB_ORIGIN` names both `localhost` and `127.0.0.1`; `playwright.config.ts` gained
    `E2E_FORCE_IPV4` so the built image can be tested while a dev server holds `[::1]:5173`.
  - `useProject()` now repairs project membership to the seeded state, so a crashed run cannot
    poison the next one.
- **Depends on**: M20

## Phase 3 modules (M22–M70)

Derived from specs 11–28 as of 2026-09-10. Phase 3 turns a working app into an operable product
and then a competitive one. Three rules govern the ordering below:

1. **M22–M26 are foundations, not features.** Observability, the event stream, the job runner and
   email are each depended on by a dozen later modules. Building any headline feature before them
   means building it twice.
2. **Two modules unlock disproportionately**: M23 (the ticket event stream) is the source for
   notifications, charts, automation, webhooks, real-time and every insight; M40 (TQL) is the one
   query implementation behind saved filters, dashboards, board configs, reports and automation
   conditions. Neither is a user-visible feature on its own. Both come early anyway.
3. **Anything that changes an existing rule keeps its old tests.** M44a (workflows) and M55 (custom
   roles) both replace a compiled-in constant with data; in each case the existing spec files
   (`ticket-rules.spec.ts`, `permissions.spec.ts`) must pass unchanged against the seeded defaults.
   That is the acceptance criterion that proves the migration was behaviour-preserving.

Sizes: S ≈ half a session, M ≈ one session, L must be split before starting (M44 and M45 already are).

### M22: Production hardening (M)
- **Goal**: The app becomes operable — structured logs, correlated requests, one error contract, real health, safe shutdown, hardened container.
- **Source spec**: specs/11-production-hardening.md
- **Files**: `apps/api/src/config/env.ts` (Zod env schema), `src/common/logging/*` (pino setup, `RequestIdMiddleware`, AsyncLocalStorage context), `src/common/filters/all-exceptions.filter.ts`, `src/common/interceptors/timeout.interceptor.ts`, `src/health/*` (terminus module, `/health/live`, `/health/ready`), `src/main.ts` (helmet, body limit, trust proxy, gated Swagger, shutdown hooks), `packages/shared/src/errors.ts` (`ApiError`, `ERROR_CODES`), `apps/api/Dockerfile`, `apps/web/Dockerfile`, `docker-compose.yml`, `.env.example`.
- **Acceptance criteria**: per spec 11 "Acceptance criteria" — error-envelope shape asserted for 400/403/404/500; no stack or SQL in any body; `/health/ready` 503 with Postgres down while `/health/live` stays 200; SIGTERM drains in-flight requests; boot fails readably on a missing env var; image runs non-root; `/api` is 404 under `NODE_ENV=production`.
- **Scope adjusted 2026-09-10 during implementation**:
  - Pinned `nestjs-pino@4` / `@nestjs/terminus@10`: the current majors need Nest 11 and this
    module does not upgrade the framework. **Nest 10 → 11 is now a backlog item.**
  - `apps/web/src/api/client.ts` + its spec joined the file list: the error envelope is a
    breaking change for the client, which read `payload.message` / `payload.issues`.
  - `drizzle-kit`, `tsx` and `express` moved from devDependencies to dependencies — the first two
    because `docker compose run migrate` runs from the production image, the third because
    `main.ts` imports express directly.
  - Terminus health reports bypass the error envelope (documented exception); the request timeout
    returns 503 rather than 408.
- **Depends on**: M21

### M23: Ticket event stream (M)
- **Goal**: Every change to a ticket leaves an immutable, queryable trace — the substrate for notifications, charts, automation, webhooks, real-time and insights.
- **Source spec**: specs/12-activity-history-and-trash.md §1–3
- **Files**: `apps/api/src/db/schema/ticket-events.ts` + migration, `src/tickets/events/ticket-event.service.ts`, wiring into all seven existing command handlers, `src/tickets/queries/get-ticket-events.query.ts`, `get-project-activity.query.ts`, changes to `get-overview-stats.query.ts`, `packages/shared/src/events.ts` (`TICKET_EVENT_TYPES` + the shared event formatter), `apps/web/src/features/ticket-detail/ActivityTab.tsx`.
- **Acceptance criteria**: per spec 12 — every command writes the expected rows; a rolled-back transaction writes none; the Overview feed is one row per change, not per ticket; the formatter is used by both API and web.
- **Depends on**: M22

### M24: Soft delete & trash (S)
- **Goal**: Deletion stops being unrecoverable.
- **Source spec**: specs/12-activity-history-and-trash.md §4–5
- **Files**: migration adding `deletedAt`/`deletedBy` to `tickets`, `src/tickets/not-deleted.ts` (the one shared predicate), edits to every read query, `commands/restore-ticket.command.ts`, `queries/get-trash.query.ts`, `apps/web/src/features/project-settings/Trash.tsx`, purge job registration (lands with M25).
- **Acceptance criteria**: per spec 12 — one test per read endpoint asserting a deleted ticket is absent; restore returns the ticket and its comments; purge removes a 31-day-old row and spares a 1-day-old one.
- **Depends on**: M23

### M25: Job runner & transactional outbox (M)
- **Goal**: A place for work that must not happen inside a request, and a way to make a side effect atomic with the transaction that caused it.
- **Source spec**: specs/13-jobs-and-email.md §1–2
- **Files**: `apps/api/src/jobs/*` (module, typed `enqueue`, worker entrypoint `jobs/main.ts`, repeatable-job registry, DLQ), `src/db/schema/outbox.ts` + migration, `packages/shared/src/jobs.ts` (names + payload schemas), `docker-compose.yml` (redis + worker services), `/health/ready` Redis check, `.github/workflows/ci.yml` (redis service).
- **Acceptance criteria**: per spec 13 — enqueue→execute; failing handler retried 5× then DLQ; `requestId` survives the queue boundary; an outbox row in a rolled-back transaction is never delivered.
- **Depends on**: M22

### M26: Transactional email (M)
- **Goal**: Invites stop being copy-paste, and a user who forgets their password stops needing an admin.
- **Source spec**: specs/13-jobs-and-email.md §3–4
- **Files**: `apps/api/src/mail/*` (module, SMTP/console/noop transports, MJML templates + text alternatives), `src/auth/password-reset.service.ts`, `db/schema/password-reset-tokens.ts` + migration, changes to `invite.service.ts` and the invites controller (send, resend, revoke; token no longer returned), `auth.controller.ts` (`forgot-password`, `reset-password`), `apps/web/src/features/auth/ForgotPassword.tsx` + `ResetPassword.tsx`, `apps/web/src/features/people/*` (invite UI now says "sent").
- **Acceptance criteria**: per spec 13 — invite mail with a working link; raw token in no body and no log; forgot-password is not an account-existence oracle (same status and timing envelope either way); a used reset token fails; a successful reset revokes every session.
- **Depends on**: M25

### M27: Notification core & watchers (M)
- **Goal**: Changes reach the people they concern, in-app and by email.
- **Source spec**: specs/14-notifications-and-subscriptions.md §1–3, §5
- **Files**: `db/schema/ticket-watchers.ts`, `notifications.ts`, `notification-preferences.ts` + migration, `src/notifications/*` (fan-out job subscribing to M23's events, recipient resolution with re-checked permissions, channel dispatch), controller (`GET /notifications`, read, read-all, watch/unwatch), mail templates, `apps/web/src/layout/NotificationBell.tsx`, `features/notifications/*`, watcher UI on ticket detail.
- **Acceptance criteria**: per spec 14 — the actor is never notified of their own action; a revoked member's pending notifications are dropped; preference `off` produces in-app only; muting survives re-assignment.
- **Depends on**: M23, M25

### M28: Mentions & digests (M)
- **Goal**: `@someone` works, and email volume stays survivable.
- **Source spec**: specs/14-notifications-and-subscriptions.md §4, §3 (digest), §6
- **Files**: `packages/shared/src/mentions.ts` (the `@[Name](id)` parse/serialise pair), API-side mention extraction + non-member rejection, digest job + template, `apps/web/src/components/MentionInput.tsx` (typeahead over project members), preferences settings page.
- **Acceptance criteria**: per spec 14 — mentioning a non-member is a 400 and creates nothing; a rename does not orphan a mention; the digest batches two tickets into one mail and sends nothing when empty.
- **Depends on**: M27

### M29: Sprint lifecycle (M)
- **Goal**: Sprints stop being read-only seed data.
- **Source spec**: specs/15-agile-planning.md §1
- **Files**: migration (`state`, `goal`, `completedAt`, `createdBy`, partial unique index on the active sprint), `src/projects/commands/{create,update,delete,start,complete}-sprint.command.ts`, sprint routes, `packages/shared` sprint schemas, `apps/web/src/features/sprints/*` (management + completion dialog).
- **Acceptance criteria**: per spec 15 — a second active sprint fails at the database level under concurrency; completing with 3 incomplete tickets moves all 3 and writes 3 events in one transaction.
- **Depends on**: M23

### M30: Backlog ranking & backlog view (M)
- **Goal**: The product gains a user-defined order, and a fifth view to groom in.
- **Source spec**: specs/15-agile-planning.md §2–3
- **Files**: `packages/shared/src/rank.ts` (LexoRank), migration adding `tickets.rank` + backfill, `PATCH /tickets/:id/rank` (server computes from neighbour ids), rebalance job, `apps/web/src/features/backlog/*`, board column ordering switched to rank.
- **Acceptance criteria**: per spec 15 — 1000 drags between the same neighbours never produce a duplicate or invalid rank; a client-supplied rank string is ignored; board and backlog agree on order.
- **Depends on**: M29

### M31: Estimation & agile charts (M)
- **Goal**: Points, velocity, burndown, CFD and cycle time — all reconstructed from events, not from `updatedAt`.
- **Source spec**: specs/15-agile-planning.md §4–5
- **Files**: migration (`tickets.storyPoints`, `sprints.capacityPoints`, `sprint_capacity`), `src/analytics/*` (four chart queries over `ticket_events`), chart routes, `apps/web/src/features/charts/*` (Recharts), sprint header committed-vs-completed.
- **Acceptance criteria**: per spec 15 — burndown matches a hand-computed series for known completion dates; velocity ignores an in-flight sprint; charts are pure functions of events over a range.
- **Depends on**: M29, M23

### M32: Board configuration (M)
- **Goal**: Multiple boards per project, swimlanes and WIP limits.
- **Source spec**: specs/15-agile-planning.md §6
- **Files**: `db/schema/boards.ts` + migration, board CRUD, `get-board.query.ts` reading a board config, `apps/web/src/features/board/*` (board switcher, swimlane grouping, WIP breach state, settings).
- **Acceptance criteria**: per spec 15 — a WIP limit of 3 renders a breach at 4 and still permits the drop; swimlanes group by epic/assignee/priority; a project with no board rows behaves exactly as today.
- **Depends on**: M30

### M33: Attachments (M)
- **Goal**: Files on tickets and comments, without file bytes ever passing through the API.
- **Source spec**: specs/16-attachments-and-rich-content.md §1–2, §4
- **Files**: `db/schema/attachments.ts` + migration, `src/storage/*` (S3 client, presign, HEAD verification, magic-byte sniff), attachment routes (presign, complete, download redirect, delete), sweep + thumbnail + scan jobs, `docker-compose.yml` (MinIO), `apps/web/src/features/ticket-detail/Attachments.tsx`.
- **Acceptance criteria**: per spec 16 — oversize/disallowed/non-member presign refused; declared-vs-real content type resolved to the sniffed value; download 403 for a non-member; never-completed uploads and orphan objects swept; SVG/HTML never rendered inline.
- **Depends on**: M25

### M34: Rich text & markdown migration (M)
- **Goal**: Descriptions and comments become markdown, safely.
- **Source spec**: specs/16-attachments-and-rich-content.md §3–4
- **Files**: migration (escape existing text, add `descriptionFormat`), `src/common/sanitize.ts` (server-side, shared with mail templates), `apps/web/src/components/RichTextEditor.tsx` (TipTap + mention plugin + image paste), renderer with strict allowlist, dirty-state adjustments in ticket detail.
- **Acceptance criteria**: per spec 16 — every existing seeded description renders byte-identically after migration; `<script>` and `<img onerror>` are inert in web and in email; opening a pristine ticket does not mark it dirty.
- **Depends on**: M33

### M35: Ticket links & sub-tasks (M)
- **Goal**: A fourth hierarchy level and a real dependency graph.
- **Source spec**: specs/20-ticket-model-extensions.md §1–2
- **Files**: migration (`subtask` type, `parentId`, `ticket_links`), `ticket-rules.ts` extension of R5, cycle check on `blocks`, link routes, `packages/shared` link-type pairs, `apps/web` sub-task list with progress and a links panel.
- **Acceptance criteria**: per spec 20 — an A→B→C→A `blocks` cycle is rejected at write time; the inverse renders on the other ticket and disappears with the link; R5's existing tests extend to the new level and pass.
- **Depends on**: M23

### M36: Label registry & ticket templates (M)
- **Goal**: Labels stop drifting; new tickets start from a useful shape.
- **Source spec**: specs/20-ticket-model-extensions.md §3–4
- **Files**: `db/schema/labels.ts`, `ticket-labels.ts`, `ticket-templates.ts` + migration with the case-folding merge and a printed merge report, label CRUD/merge/rename, template CRUD, `apps/web/src/features/project-settings/{Labels,Templates}.tsx`, template picker on the create form.
- **Acceptance criteria**: per spec 20 — `Bug`/`bug`/`BUG` fold into one row and the merge is reported, not silent; rename propagates; delete requires zero usages or an explicit force.
- **Depends on**: M23

### M37: Custom fields (M)
- **Goal**: Teams can add the one field the fixed schema does not have.
- **Source spec**: specs/20-ticket-model-extensions.md §5
- **Files**: `db/schema/custom-field-defs.ts`, `custom-field-values.ts` + migration, `src/custom-fields/*` (definition cache, per-type Zod validation built from the definition, required-field enforcement), mapper changes so every ticket read resolves values, `apps/web/src/features/project-settings/CustomFields.tsx` + dynamic field renderer on create/detail.
- **Acceptance criteria**: per spec 20 — a required field blocks create with a 400 naming it; archiving hides the field everywhere while the value row count is unchanged; the definition cache invalidates on change.
- **Depends on**: M36

### M38: Bulk operations, clone, convert & move (M)
- **Goal**: Grooming at scale, and the three ticket-level operations users assume exist.
- **Source spec**: specs/20-ticket-model-extensions.md §6–7
- **Files**: `commands/bulk-operation.command.ts` (per-ticket permission and validity checks, partial-success body, shared `bulkOperationId`), job path above `BULK_MAX`, `clone-ticket`, `convert-ticket-type`, `move-ticket-project` commands, `tickets.previousKeys` migration, `apps/web` multi-select + bulk action bar.
- **Acceptance criteria**: per spec 20 — 3 tickets, one invalid transition → 2 successes, 1 reasoned failure, exactly 2 events; a moved ticket is still reachable by its previous key; convert warns which type-specific fields will be cleared.
- **Depends on**: M35, M37

### M39: Full-text & cross-project search (M)
- **Goal**: Search that reads descriptions and comments, and the product's first cross-project query.
- **Source spec**: specs/17-search-and-query-language.md §1–2
- **Files**: migration (`searchVector` generated columns + GIN, `pg_trgm`), `src/search/search.service.ts` (the interface an external engine would later implement), `GET /search`, scope resolution from `project_members` applied inside the query, `apps/web/src/components/SearchPalette.tsx` (Cmd-K).
- **Acceptance criteria**: per spec 17 — a description-only term matches; an exact key sorts first; a non-member's results are identical to a run where that project does not exist (no post-filtering); soft-deleted tickets excluded.
- **Depends on**: M24

### M40: TQL — the ticket query language (M)
- **Goal**: One query implementation for filters, boards, dashboards, reports and automation.
- **Source spec**: specs/17-search-and-query-language.md §3–4
- **Files**: `packages/shared/src/tql/*` (grammar, parser, AST, typed field registry incl. custom fields), `apps/api/src/search/tql-compiler.ts` (AST → parameterised Drizzle `SQL`, clause/depth limits), `POST /search/tql`, `?tql=` on the list route, `apps/web/src/components/TqlEditor.tsx` with autocomplete, simple filters compiling to TQL.
- **Acceptance criteria**: per spec 17 — every operator has a compiled-predicate unit test; a fuzz run produces no SQL error and no over-limit query; user text never reaches SQL text; a parse error returns the character offset.
- **Depends on**: M39, M37

### M41: Saved filters & dashboards (M)
- **Goal**: A query written once, reused everywhere; the Overview generalised.
- **Source spec**: specs/21-filters-reports-and-dashboards.md §1–2
- **Files**: `db/schema/saved-filters.ts`, `dashboards.ts` + migration, filter/dashboard CRUD, per-widget data routes with caller-scoped execution, `apps/web/src/features/dashboards/*` (grid, widget types), Overview re-implemented as a seeded system dashboard.
- **Acceptance criteria**: per spec 21 — a shared filter returns different counts for an admin and a single-project developer (a filter is a query, never a grant); a failing widget does not break the page; the re-implemented Overview matches `get-overview-stats.query.ts` numbers exactly on the seed.
- **Depends on**: M40

### M42: Scheduled reports & export (M)
- **Goal**: Data leaves the app safely and on a schedule.
- **Source spec**: specs/21-filters-reports-and-dashboards.md §3–4
- **Files**: `db/schema/scheduled-reports.ts` + migration, report job (rendered per recipient with that recipient's permissions), `src/export/*` (CSV/JSON/XLSX writers, formula-injection escaping, project bundle with a versioned schema in `packages/shared`), export job + signed download, `data_exported` audit event, `apps/web/src/features/reports/*`.
- **Acceptance criteria**: per spec 21 — two recipients with different memberships receive different CSVs; an empty report sends nothing; `=cmd` in a title exports inert; every export is audited.
- **Depends on**: M41, M25

### M43: Import pipeline (M)
- **Goal**: The feature that decides whether anyone can migrate onto this.
- **Source spec**: specs/21-filters-reports-and-dashboards.md §5
- **Files**: `src/import/*` (source adapters for the §4 bundle, generic CSV, Jira, GitHub, GitLab, Trello; upload → map → dry-run → commit pipeline; `externalId`/`externalSource` idempotency; per-row error report; batch rollback), import jobs with progress, `apps/web/src/features/import/*` (mapping UI, dry-run report).
- **Acceptance criteria**: per spec 21 — a dry-run writes nothing and explains every skip; importing the same CSV twice creates N tickets, not 2N; rollback restores the project exactly, verified by row counts and checksums.
- **Depends on**: M42

### M44a: Workflow model & enforcement (M)
- **Goal**: `STATUS_BY_TYPE` becomes per-project data, with behaviour preserved exactly.
- **Source spec**: specs/19-configurable-workflows.md §1–3
- **Files**: `db/schema/workflows.ts`, `workflow-statuses.ts`, `workflow-transitions.ts` + migration seeding defaults that reproduce the constant, `ticket-rules.ts` taking a workflow argument, `MoveTicketStatusHandler` validating against transitions, condition evaluators, `GET /tickets/:id/transitions`.
- **Acceptance criteria**: per spec 19 — `ticket-rules.spec.ts` passes **unmodified** against seeded defaults; an absent transition is a 400 even when called directly against the API; a project with no workflow rows behaves exactly as before; `/transitions` omits what the caller may not do and says why.
- **Depends on**: M23

### M44b: Workflow editor & downstream consequences (M)
- **Goal**: Teams edit their own workflow; charts and boards stop keying off the string "Done".
- **Source spec**: specs/19-configurable-workflows.md §4–5
- **Files**: `apps/web/src/features/project-settings/WorkflowEditor.tsx` (graph + list mode, save validation), the status-remap transaction for removed statuses, DoR/DoD checklists, board columns and charts switched to `statusCategory`, `statusCategory` added to TQL, status colours moved to `workflow_statuses.color`.
- **Acceptance criteria**: per spec 19 — removing a status holding 5 tickets forces a mapping and moves all 5 atomically; a workflow with no `done`-category status fails validation; renaming "Done" breaks no chart.
- **Depends on**: M44a, M32, M40

### M45a: Git connections & webhook receiver (M)
- **Goal**: A verified, idempotent pipe from the git provider, and ticket↔code links.
- **Source spec**: specs/18-git-and-ci-integration.md §1–3
- **Files**: `db/schema/integrations.ts`, `ticket-git-links.ts`, `webhook-deliveries.ts`, `user-external-identities.ts` + migration, `src/integrations/git/*` (the `GitProvider` interface + GitHub adapter, OAuth/App install flow, encrypted credentials, token refresh job), `POST /webhooks/git/:provider` with raw-body HMAC verification, key-matching and author-mapping, `apps/web/src/features/project-settings/Integrations.tsx`.
- **Acceptance criteria**: per spec 18 — an unsigned or tampered delivery is 401 with no processing; the same delivery id twice produces one link and one event; `NIM-42` in a branch links, `NIM-421` does not.
- **Depends on**: M25

### M45b: Smart commits, auto-transition & branch creation (M)
- **Goal**: Code events move tickets — under the acting user's permissions, never above them.
- **Source spec**: specs/18-git-and-ci-integration.md §4–6
- **Files**: `src/integrations/git/directives.ts` (`#done`, `#comment`, `#assign`, `#time`), per-project transition map (off by default), `POST /tickets/:id/branch`, PR/commit panel and CI status row on ticket detail, board card status badge.
- **Acceptance criteria**: per spec 18 — `#done` from a user lacking the transition is refused and logged, not applied; an unmapped author's directives are ignored; a merge with auto-transition disabled changes nothing; every automated change writes an event naming the commit or PR.
- **Depends on**: M45a, M44a

### M46: CI status & deployment tracking (M)
- **Goal**: "Is this fix in staging yet" becomes answerable.
- **Source spec**: specs/18-git-and-ci-integration.md §6–8
- **Files**: `db/schema/deployments.ts` + migration, check-run/pipeline event handling, `POST /deployments` (PAT-authenticated once M51 lands), commit-containment resolution marking tickets released per environment, code-review metrics queries feeding M41's widgets, ticket detail + version page UI.
- **Acceptance criteria**: per spec 18 — a deployment marks exactly the tickets whose linked commits it contains; a failing required check surfaces on the board card; revoking an integration preserves all history.
- **Depends on**: M45a

### M47: Versions & release notes (M)
- **Goal**: Releases become a first-class object, and notes generate themselves.
- **Source spec**: specs/24-releases-roadmap-and-capacity.md §1–2
- **Files**: `db/schema/versions.ts` + migration adding `fixVersionId`/`affectsVersionId`, version CRUD + release command (with `moveUnresolvedTo`), `GET /versions/:id/release-notes`, release burndown, `apps/web/src/features/versions/*`.
- **Acceptance criteria**: per spec 24 — releasing with unresolved tickets requires an explicit destination and moves them all; notes list exactly the version's Done tickets, grouped, excluding internal-labelled ones; the deterministic output needs no model call.
- **Depends on**: M23

### M48: Roadmap & capacity planning (M)
- **Goal**: The date fields that already exist start earning their place.
- **Source spec**: specs/24-releases-roadmap-and-capacity.md §3–4
- **Files**: `db/schema/absences.ts` + migration, roadmap query (epic bars, derived dates from children, dependency edges from `blocks`), forecast query returning a range, `apps/web/src/features/roadmap/*` (timeline, drag-reschedule, zoom, markers), over-allocation warnings on sprint planning.
- **Acceptance criteria**: per spec 24 — an epic with no dates renders a bar derived from its children; dragging writes both dates and one event; a dependency arrow appears for every visible `blocks` link; the forecast is presented as a range, never a date.
- **Depends on**: M47, M31, M35

### M49: Time tracking (S)
- **Goal**: Optional worklogs, off by default.
- **Source spec**: specs/24-releases-roadmap-and-capacity.md §5
- **Files**: `db/schema/worklogs.ts` + migration (`originalEstimate`, `remainingEstimate`), worklog CRUD, `#time` directive wiring, per-user/sprint/epic reports, project setting + conditional UI.
- **Acceptance criteria**: per spec 24 — with tracking off, no worklog field appears in any API response for that project; logging decrements remaining and is correctable.
- **Depends on**: M47, M45b

### M50: Outbound webhooks (M)
- **Goal**: This app can tell other systems what happened.
- **Source spec**: specs/22-api-platform-and-automation.md §1
- **Files**: `db/schema/webhook-subscriptions.ts` (+ reuse of `webhook_deliveries`) + migration, `src/webhooks/*` (TQL-filtered event subscription, HMAC signing, backoff retries, auto-disable, SSRF checks at save **and** at delivery), delivery log + replay endpoints, `apps/web/src/features/project-settings/Webhooks.tsx`.
- **Acceptance criteria**: per spec 22 — a link-local target is rejected at save and at delivery (DNS rebinding); a tampered body fails signature verification; continuous failure auto-disables and notifies; every delivery is inspectable and replayable.
- **Depends on**: M23, M25, M40

### M51: API tokens & service accounts (M)
- **Goal**: Scripts, pipelines and integrations get a first-class way in.
- **Source spec**: specs/22-api-platform-and-automation.md §2
- **Files**: `db/schema/api-tokens.ts` + migration, `src/auth/api-token.service.ts` (hashing reused from `TokenService`), an `AuthGuard` token branch populating the same `AuthContext`, scope enforcement intersected with the owner's live permissions, `type: 'service'` users, expiry-warning job, bucketed `lastUsedAt` writes, `auth_events` additions, `apps/web/src/features/account/Tokens.tsx`.
- **Acceptance criteria**: per spec 22 — `tickets:read` gets 403 on a write; revoking the owner's membership makes their token 403 immediately (permission is an intersection, re-evaluated per request); the secret is shown once and stored only as a hash; every downstream guard is unchanged.
- **Depends on**: M22

### M52: Automation rules (M)
- **Goal**: If-this-then-that over everything the earlier modules built.
- **Source spec**: specs/22-api-platform-and-automation.md §3
- **Files**: `db/schema/automation-rules.ts`, `automation-runs.ts` + migration, `src/automation/*` (trigger subscription, TQL conditions, action executors, `runAs` permission enforcement, loop protection: no self-retrigger, depth 5, per-project hourly budget), dry-run endpoint, `apps/web/src/features/project-settings/Automation.tsx` with a run log.
- **Acceptance criteria**: per spec 22 — a rule whose action satisfies its own trigger halts and logs the halt; a rule running as a developer cannot perform a manager-only transition; the run log names trigger, conditions matched, actions taken and errors; dry-run writes nothing.
- **Depends on**: M40, M50, M44a

### M53: API versioning, rate limits & contract checks (S)
- **Goal**: The API becomes something a third party can depend on.
- **Source spec**: specs/22-api-platform-and-automation.md §4
- **Files**: `/v1` route prefix with unversioned aliases, per-token/per-user throttling with `X-RateLimit-*` and `Retry-After`, uniform list envelope applied across controllers, OpenAPI snapshot + breaking-change CI check, `Deprecation`/`Sunset` header support, `docs/api-changelog.md`.
- **Acceptance criteria**: per spec 22 — the OpenAPI diff check fails a PR that removes a `/v1` field; a token over its limit gets a 429 carrying `Retry-After`; every list endpoint matches the envelope contract test.
- **Depends on**: M51, M59

### M54: Organisations & project visibility (M)
- **Goal**: The tenant boundary, added while it is still cheap, plus visibility and archival.
- **Source spec**: specs/23-identity-and-governance.md §5–6
- **Files**: `db/schema/organizations.ts` + migration backfilling one default org across every table, `ProjectScopeGuard` org check, `projects.visibility` and `archivedAt`, one central archived-write check, two-step project delete + purge job, org settings UI.
- **Acceptance criteria**: per spec 23 — every existing row lands in the default org and no existing test changes behaviour; an archived project rejects every write with one consistent error and still returns search results; visibility defaults to `private`.
- **Depends on**: M22

### M55: Custom roles (M)
- **Goal**: The permission matrix moves from compiled constant to data, without weakening.
- **Source spec**: specs/23-identity-and-governance.md §4
- **Files**: `db/schema/roles.ts`, `role-permissions.ts` + migration seeding immutable system roles that reproduce today's matrix, a database-backed resolver behind the existing `can()` signature, cache + explicit invalidation, role editor UI, reassignment-before-delete.
- **Acceptance criteria**: per spec 23 — `permissions.spec.ts` passes **unchanged** against the database-backed resolver; guards remain the sole enforcement point; a role in use cannot be deleted without reassignment.
- **Depends on**: M54

### M56: SSO (OIDC & SAML) (M)
- **Goal**: The deferral in spec 10 §9 closes.
- **Source spec**: specs/23-identity-and-governance.md §1
- **Files**: `db/schema/identity-providers.ts` + migration, `src/auth/sso/*` (OIDC code+PKCE, SAML, attribute mapping, JIT provisioning, domain allowlist, verified-email-only linking, break-glass admin list, IdP-initiated logout into the existing revocation path), `auth_events` additions, login page provider buttons, org SSO settings.
- **Acceptance criteria**: per spec 23 — an unverified email never links an existing account; `enforced` blocks password login for org users while break-glass admins still sign in, and cannot be saved with an empty break-glass list; sessions remain this app's own tokens with rotation and replay detection unchanged.
- **Depends on**: M54

### M57: SCIM provisioning & teams (M)
- **Goal**: Directory-driven lifecycle, and group-based membership.
- **Source spec**: specs/23-identity-and-governance.md §2–3
- **Files**: `/scim/v2/Users` and `/scim/v2/Groups` (service-token authenticated), `db/schema/teams.ts`, `team-members.ts` + migration, `project_members` accepting a team subject, effective-role resolution taking the strongest of direct and team-derived, `@team` mentions and team assignment, teams UI.
- **Acceptance criteria**: per spec 23 — SCIM deactivation revokes every refresh token and API token within one request cycle; a team-derived role grants exactly what a direct one would; removing someone from a team removes their derived access.
- **Depends on**: M56, M55

### M58: Admin console, sessions & data governance (M)
- **Goal**: An operator surface over what already exists, and the compliance obligations.
- **Source spec**: specs/23-identity-and-governance.md §7–9
- **Files**: `apps/web/src/features/admin/*` (users, active sessions, audit browser + CSV export, job queue and DLQ health, webhook health, feature flags, instance settings), user-facing session management in account settings, retention config + purge jobs for `auth_events`/`ticket_events`, signed audit export, GDPR export-my-data and redact-in-place erasure, `docs/runbooks/backup-restore.md` with a rehearsed restore.
- **Acceptance criteria**: per spec 23 — erasure anonymises the user while every ticket, comment and audit row stays resolvable (redaction, never cascade); "sign out everywhere" invalidates every refresh token; every admin action is audited; the restore rehearsal is documented with measured RPO/RTO.
- **Depends on**: M54, M25

### M59: Caching & query performance (M)
- **Goal**: The known-slow shapes stop being slow, provably.
- **Source spec**: specs/25-scale-and-performance.md §1–4
- **Files**: `src/cache/*` (Redis, version-keyed on the project's latest event id, `CACHE_ENABLED` kill switch), per-request memoisation in the mappers, index migration + `EXPLAIN` evidence doc, slow-query logging, cursor pagination across every list endpoint with the uniform envelope, pool/timeout config, `@ReadOnly()` replica routing marker, `db:seed:large`.
- **Acceptance criteria**: per spec 25 — Overview p95 improves by an order of magnitude with cache on and returns identical numbers with it off; a write followed immediately by a read never sees stale data; cursor pagination holds constant latency through 100k tickets where offset degrades.
- **Depends on**: M23

### M60: Frontend performance, load testing, metrics & SLOs (M)
- **Goal**: Numbers, thresholds and alerts — the half of observability spec 11 deliberately deferred.
- **Source spec**: specs/25-scale-and-performance.md §5–6
- **Files**: route-level code splitting, TanStack Virtual on list/backlog/board, CI bundle budget, shared optimistic-update rollback, `k6/*` scenarios run nightly against the large seed with a committed baseline, `prom-client` `/metrics` (protected), OpenTelemetry tracing correlated on `requestId`, `docs/slos.md` + alert rules + capacity model.
- **Acceptance criteria**: per spec 25 — the nightly job fails when a deliberately introduced N+1 is committed; no query in the k6 mix exceeds the slow threshold on the large seed; every metric has a documented threshold.
- **Depends on**: M59

### M61: Real-time sync & presence (M)
- **Goal**: Two open tabs stop disagreeing.
- **Source spec**: specs/26-realtime-and-integrations.md §1–3
- **Files**: `src/realtime/*` (SSE endpoint, Redis pub/sub fan-out, membership filtering at connect and on change, `Last-Event-ID` replay from `ticket_events`, slow-consumer drop), thin payloads only, `apps/web/src/realtime/*` (EventSource → TanStack Query invalidation), presence + advisory editing indicators, optimistic-concurrency `updatedAt` on PATCH with a 409 diff.
- **Acceptance criteria**: per spec 26 — a drag in one session appears in another within a second; frames carry no ticket content (permission checks stay on the read path); a revoked member stops receiving events mid-stream; a field being edited is never overwritten and the conflicting PATCH is a 409.
- **Depends on**: M23, M25

### M62: Chat integrations & inbound email (M)
- **Goal**: The tracker reaches the places people actually talk, in both directions.
- **Source spec**: specs/26-realtime-and-integrations.md §4–5
- **Files**: `src/integrations/chat/*` (Slack + Teams apps, channel subscriptions with TQL filters, per-viewer unfurls, slash command, message action, interactive buttons executing as the linked user, email-verified identity linking), `src/integrations/inbound-mail/*` (provider webhook/IMAP, header-based threading with subject fallback, external-reporter handling, attachment ingestion, quote stripping with raw retention, SPF/DKIM, per-sender limits, auto-reply loop guard).
- **Acceptance criteria**: per spec 26 — an unfurl shows nothing to a viewer who cannot read the project; a reply threads correctly with an edited subject; an unknown sender is never auto-provisioned as a user; an auto-responder exchange terminates after one message.
- **Depends on**: M26, M61

### M63: Reactions & comment threading (S)
- **Goal**: Comment ergonomics.
- **Source spec**: specs/26-realtime-and-integrations.md §6
- **Files**: `db/schema/comment-reactions.ts`, `comments.parentCommentId` + migration, routes, realtime wiring, UI.
- **Acceptance criteria**: per spec 26 — one level of nesting only; reactions and replies arrive live and notify per spec 14's rules.
- **Depends on**: M61

### M64: AI plumbing, triage & duplicate detection (M)
- **Goal**: The model layer, with a deterministic fallback that ships first and stays.
- **Source spec**: specs/27-intelligence-and-insights.md §1–2, §9
- **Files**: `src/ai/*` (the `AiProvider` interface targeting the Claude API, versioned prompt files, budgets, per-org caps, call logging, short timeouts, `AI_ENABLED` kill switch), pgvector migration + embedding refresh job behind `SearchService`, triage suggestion endpoint with the nearest-neighbour fallback, duplicate panel on create and detail, `metadata.source = 'ai'` on applied suggestions, CI eval set.
- **Acceptance criteria**: per spec 27 — with `AI_ENABLED=false` every view renders and every fallback works; context is never assembled from data the caller cannot read; an accepted suggestion writes an `ai`-tagged event; a provider timeout leaves ticket creation within its normal latency budget.
- **Depends on**: M39

### M65: Summarisation & standup digest (M)
- **Goal**: The daily-use feature — a readable account of what actually moved.
- **Source spec**: specs/27-intelligence-and-insights.md §3
- **Files**: `src/ai/summaries/*` (thread summary cached and invalidated by comment count, standup digest from events, retro input, release-notes prose over M47's deterministic output), digest job + delivery through spec 14 and spec 26 §4 channels, UI entry points.
- **Acceptance criteria**: per spec 27 — the digest is generated from events, not from `updatedAt`; a summary is not recomputed on every open; release notes still produce without a model call.
- **Depends on**: M64, M28, M47

### M66: Rot detection & estimate calibration (M)
- **Goal**: The report nobody else does well — no model required.
- **Source spec**: specs/27-intelligence-and-insights.md §4–6
- **Files**: `src/analytics/rot/*` (the six rules), project health panel with one-click bulk fixes, calibration query (actual cycle time by size and assignee) surfaced at estimation time as a range, blocked-chain/critical-path analysis over the `blocks` graph, weekly report registration.
- **Acceptance criteria**: per spec 27 — each of the six rules has a unit test over a hand-built fixture; calibration is shown as a range, never a point prediction; top blockers rank by blocked work, not blocker count.
- **Depends on**: M31, M35, M42

### M67: Personal work queue & meeting mode (M)
- **Goal**: The view most people would open first, which no cross-project query exists for today.
- **Source spec**: specs/27-intelligence-and-insights.md §7–8
- **Files**: cross-project "my work" query (assigned + watched, ranked by blocker, commitment, due date, staleness), `apps/web/src/features/my-work/*` with focus mode, `features/meeting-mode/*` (keyboard-driven, inline commit, covered/remaining, optional shared cursor over M61).
- **Acceptance criteria**: per spec 27 — the queue spans every project the caller can read and nothing else; meeting mode is fully keyboard-operable and commits edits inline.
- **Depends on**: M39, M61

### M68: Accessibility & keyboard completeness (M)
- **Goal**: WCAG 2.2 AA, and every action reachable without a mouse.
- **Source spec**: specs/28-ux-accessibility-and-mobile.md §1–2
- **Files**: `@dnd-kit` keyboard sensor wiring with announcements, focus management across every modal/drawer/menu, semantic landmarks and labelled controls, `aria-describedby` on errors keyed to spec 11's error ids, live regions, non-colour status signals across the inherited palettes, `prefers-reduced-motion`, shortcut registry + `?` overlay, `axe-core` in Playwright.
- **Acceptance criteria**: per spec 28 — every e2e flow passes keyboard-only; `axe-core` reports zero violations on all views in both themes; a board card can be picked up, moved and dropped by keyboard with each step announced.
- **Depends on**: M22

### M69: Theming & internationalisation (M)
- **Goal**: A real dark theme, and time that is correct for everyone.
- **Source spec**: specs/28-ux-accessibility-and-mobile.md §3–4
- **Files**: palette tokens replacing hardcoded Tailwind classes, dark theme + per-user override, org branding from M54, `react-i18next` with an extracted English catalogue and a CI hardcoded-literal check, per-user timezone preference, calendar-date vs instant handling (`sprints.startsOn`/`endsOn` and ticket dates never timezone-shifted), `Intl` number/list/plural formatting, RTL via logical properties.
- **Acceptance criteria**: per spec 28 — switching a user's timezone changes every timestamp and **no** sprint or due date; every string resolves through the catalogue; contrast passes in both themes.
- **Depends on**: M68, M54

### M70: Mobile, PWA & state polish (M)
- **Goal**: The phase closes on the states every earlier module left as a placeholder.
- **Source spec**: specs/28-ux-accessibility-and-mobile.md §5–7
- **Files**: responsive list/detail/notifications/my-work, single-column board mode, 44px touch targets, swipe actions, bottom nav, PWA manifest + offline shell + read-only recent tickets, designed empty states for every list/column/widget/search, layout-matching skeletons, error states keyed on `ERROR_CODES` with a copyable `requestId`, first-run guided setup, coach marks, what's-new panel, and the cross-view consistency audit (one button hierarchy, one form layout, one confirmation pattern).
- **Acceptance criteria**: per spec 28 — the board is usable at 375px, verified by a mobile-viewport e2e run; every list and board column renders a designed empty state, enumerated by a test; skeletons do not reflow on arrival.
- **Depends on**: M69

## Backlog
<!-- Parked ideas from mid-build. One line each, dated. Triaged at Phase 5. -->
- 2026-07-15: Full ~20-row prototype seed dataset (deferred; minimal seed chosen for v1).
- 2026-07-15: User deletion strategy (soft-delete / reassign / block) — **closed 2026-09-09**: resolved as *disable, never delete* in spec 10 §4.4; built in M17/M21.
- 2026-07-15: Per-project team membership (`project_members` join table) — **closed 2026-09-09**: specified in spec 10 §3.2, built in M18.
- 2026-07-15: Sprint CRUD UI — **closed 2026-09-10**: specified in specs/15 §1, planned as M29.
- 2026-09-09: Retention/cleanup job for expired `refresh_tokens`, `invites`, `auth_events` — **closed 2026-09-10**: the job runner is M25, the retention policy specs/23 §9 (M58).
- 2026-09-09: JWT signing-key rotation with overlapping keys (`kid` claims) — single secret today. Still open at Phase 3 planning; a natural companion to M56, not specified.
- 2026-09-09: Shared-store rate limiting and session cache for multi-instance deploys — **closed 2026-09-10**: Redis arrives in M25; per-token limits specs/22 §4 (M53), caching specs/25 §1 (M59).
- 2026-09-09: SSO/OIDC as an alternative token issuer (spec 10 §9) — **closed 2026-09-10**: specified in specs/23 §1, planned as M56.
- 2026-09-10: Upgrade Nest 10 → 11 (unblocks current `nestjs-pino` / `@nestjs/terminus` majors).
- 2026-09-10: Enforce `SHUTDOWN_TIMEOUT_MS` as a hard deadline — `enableShutdownHooks()` currently drains unbounded.
