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

## Backlog
<!-- Parked ideas from mid-build. One line each, dated. Triaged at Phase 5. -->
- 2026-07-15: Full ~20-row prototype seed dataset (deferred; minimal seed chosen for v1).
- 2026-07-15: User deletion strategy (soft-delete / reassign / block) — **closed 2026-09-09**: resolved as *disable, never delete* in spec 10 §4.4; built in M17/M21.
- 2026-07-15: Per-project team membership (`project_members` join table) — **closed 2026-09-09**: specified in spec 10 §3.2, built in M18.
- 2026-07-15: Sprint CRUD UI (sprints exist in the model; no management UI spec'd yet).
- 2026-09-09: Retention/cleanup job for expired `refresh_tokens`, `invites`, `auth_events` (tech spec §10).
- 2026-09-09: JWT signing-key rotation with overlapping keys (`kid` claims) — single secret today.
- 2026-09-09: Shared-store rate limiting and session cache for multi-instance deploys.
- 2026-09-09: SSO/OIDC as an alternative token issuer (spec 10 §9) — seam left, no work planned.
