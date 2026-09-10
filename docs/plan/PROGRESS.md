# Ticket Tracker — Progress

**Spec fingerprint**: PLAN.md Phase 1 (M1–M14) derived from spec files as of 2026-07-15;
Phase 2 (M15–M21) derived from `specs/10-authentication-and-authorization.md` and
`docs/auth-tech-spec.md` as of 2026-09-09.
**Reference fingerprint**: `reference/Ticket Dashboard.dc.html` consulted as of 2026-07-15
(behavioral/visual reference only — not requirements).
<!-- Phase 3 compares current spec files against this before resuming.
     Updated whenever a spec-level change is processed. -->

## Module status
| Module | Status | Spec source (fingerprint) | Completed |
|--------|--------|---------------------------|-----------|
| M1 Scaffolding & infra | done | README.md, specs/09 (2026-07-15) | 2026-07-15 |
| M2 Shared + data model + seed | done | specs/00 (2026-07-15) | 2026-07-28 |
| M3 Users API + acting-as guard | done | specs/07, 08, 00 (2026-07-15) | 2026-09-08 |
| M4 Projects API + key sequence | done | specs/02 (2026-07-15) | 2026-09-08 |
| M5a Ticket rules + create | done | specs/06, 00 (2026-07-15) | 2026-09-08 |
| M5b Update/move/delete/comment | done | specs/05, 04, 00 (2026-07-15) | 2026-09-08 |
| M6a Read DTOs + list + detail | done | specs/03, 05 (2026-07-15) | 2026-09-08 |
| M6b Board + overview | done | specs/04, 01 (2026-07-15) | 2026-09-08 |
| M7 Frontend app shell | done | specs/02, 08 (2026-07-15) | 2026-09-08 |
| M8 Overview dashboard view | done | specs/01 (2026-07-15) | 2026-09-08 |
| M9 Tickets list view | done | specs/03 (2026-07-15) | 2026-09-08 |
| M10 Board view | done | specs/04 (2026-07-15) | 2026-09-08 |
| M11 Ticket detail view | done | specs/05 (2026-07-15) | 2026-09-08 |
| M12 Create ticket view | done | specs/06 (2026-07-15) | 2026-09-08 |
| M13 People & users views | done | specs/07 (2026-07-15) | 2026-09-08 |
| M14 Testing & CI | done | specs/09 (2026-07-15) | 2026-09-08 |
| M15 Auth schema, migration & backfill | done | specs/10, docs/auth-tech-spec §2 (2026-09-09) | 2026-09-09 |
| M16 Password, invite & token services | done | docs/auth-tech-spec §3 (2026-09-09) | 2026-09-09 |
| M17 Auth endpoints & AuthGuard | done | specs/10 §4, tech-spec §4.1 (2026-09-09) | 2026-09-09 |
| M18 Project membership & scope guard | done | specs/10 §3.2, tech-spec §5 (2026-09-09) | 2026-09-10 |
| M19 Record-level ownership | **not started** | specs/10 §3.3, tech-spec §5.2 (2026-09-09) | — |
| M20 Web auth flow | **not started** | specs/10 §6, tech-spec §7 (2026-09-09) | — |
| M21 Members UI, invites & cutover | **not started** | specs/10 §4.5, tech-spec §9 (2026-09-09) | — |

## Handoff log
<!-- One entry per module, written at completion time (Phase 4 step 4). -->

### M1 — Monorepo scaffolding & local infra (done, 2026-07-15)
- **Files created**: root `package.json` (npm workspaces), `turbo.json`, `tsconfig.base.json`;
  `packages/shared/` (`package.json`, `tsconfig.json`, `src/index.ts` placeholder export);
  `apps/api/` (`package.json`, `tsconfig.json`, `nest-cli.json`, `src/main.ts` with Swagger
  bootstrap at `/api`, `src/app.module.ts`, `src/app.controller.ts` with `GET /health`,
  `.env.example`); `apps/web/` (`package.json`, `tsconfig.json`, `vite.config.ts`,
  `tailwind.config.js`, `postcss.config.js`, `index.html`, `src/main.tsx`, `src/App.tsx`,
  `src/index.css`); root `docker-compose.yml` (postgres + api + web per spec 09's outline).
- **Key decisions / deviations from PLAN.md**:
  - **Package manager: pnpm** (matches PLAN.md's primary choice). Initially scaffolded on npm
    workspaces since pnpm wasn't installed yet, then migrated same-session: installed pnpm
    globally (`npm install -g pnpm@9.15.0` — corepack is not available on this Node version,
    so that was the install path, not `corepack prepare`), removed the npm `"workspaces"`
    field + `package-lock.json`, added `pnpm-workspace.yaml` (`apps/*`, `packages/*`), set
    root `packageManager: "pnpm@9.15.0"`, and switched the internal
    `@ticket-tracker/shared` dependency in `apps/api` and `apps/web` from `"*"` to
    `"workspace:*"` (pnpm's explicit workspace-protocol form). All commands are now
    `pnpm install` / `pnpm run ...` / `pnpm exec turbo ...`, not `npm ...`.
  - `apps/web/tsconfig.json` needed `"lib": ["ES2022", "DOM", "DOM.Iterable"]` added (the
    shared `tsconfig.base.json` only has `ES2022`) — caught by a `document is not defined`
    typecheck error in `main.tsx` during the build verification pass.
  - `apps/api` scaffolded by hand (no `@nestjs/cli` globally available) — added `@nestjs/cli`
    as a local devDependency instead so `nest build`/`nest start` work via workspace scripts.
  - AppModule/AppController kept intentionally minimal per M1 scope: one `GET /health` route
    returning `{status:"ok"}`, used only to verify the app boots. Real domain modules start in
    M3+.
- **Verification performed**:
  - `pnpm exec turbo run build` — all three workspaces (`shared`, `api`, `web`) build clean
    (re-verified after the npm→pnpm migration, since pnpm's stricter node_modules linking
    can surface hoisting issues npm's flat layout hides).
  - Built api (`node dist/main.js`) boots under pnpm's install; `GET /health` →
    `200 {"status":"ok"}`; `GET /api` (Swagger UI) → `200`.
  - `apps/web` dev server (`vite --port 5173`) serves `200` at `/`.
  - `docker compose up -d postgres` — Docker was installed (OrbStack, via
    `brew install --cask orbstack`) partway through this session. Container
    `ticket-tracker-postgres-1` starts and `pg_isready -U ticket_tracker -d ticket_tracker`
    reports "accepting connections" on `0.0.0.0:5432`. All three M1 acceptance criteria are
    now fully verified. Postgres was left running (`docker compose up -d postgres`) since M2
    needs it live for migrations/seed.
  - The `api`/`web` services in `docker-compose.yml` reference `build:` paths with no
    Dockerfile yet — not needed until containerized deploy is in scope (not yet planned);
    only `postgres` is exercised for now.
- **Open items for next session**: none. All M1 acceptance criteria verified; Postgres is up
  and ready for M2.

### M2 — Shared package + data model + migrations + seed (done, 2026-07-28)
- **Files created**:
  - `packages/shared/src/enums.ts` — `USER_ROLES`, `TICKET_TYPES`, `TICKET_PRIORITIES`,
    `TICKET_SEVERITIES`, `TICKET_ENVS`, `TICKET_SIZES`, `DEPARTMENTS` (all lowercase/canonical
    per specs/00's DB enum definitions); `EPIC_STATUSES`/`STORY_STATUSES`/`BUG_STATUSES` +
    `STATUS_BY_TYPE` (kept as the spec's exact Title Case strings, e.g. "In Progress", since
    spec 00 defines status as free text, not a DB enum); color palettes (`ROLE_COLORS`,
    `TYPE_COLORS`, `STATUS_COLORS`, `PRIORITY_COLORS`, `SEVERITY_COLORS`, `ENV_COLORS`,
    `TAG_PALETTE`, `NEUTRAL_TAG`) pulled verbatim from the prototype's `<script type="text/x-dc">`
    block in `reference/Ticket Dashboard.dc.html` (lines ~676-731).
  - `packages/shared/src/schemas.ts` — Zod schemas for user/project create+update, and ticket
    create (as a **discriminated union** on `type`, matching the exact
    `baseTicketSchema`/`storyOrBugFields`/`bugOnlyFields` shape specs/06 specifies), ticket
    update (flat partial — type can't change post-creation), move-status, add-comment.
    **`reporter` is deliberately absent from `ticketCreateSchema`** — specs/06 and specs/05
    both say it's auto-filled server-side from the acting user, not client-supplied.
  - `packages/shared/src/types.ts` — `Project`/`User`/`Sprint`/`Ticket`/`Comment` entity
    interfaces mirroring the Drizzle schema 1:1, plus DTO types inferred from the Zod schemas
    via `z.infer`.
  - `packages/shared/src/index.ts` — re-exports all three (was previously a placeholder export).
  - `apps/api/src/db/schema/{projects,users,sprints,tickets,comments}.ts` + `index.ts` barrel —
    Drizzle schema for all 5 tables. Used `pgEnum` (backed by shared's `as const` arrays) for
    `role`/`type`/`priority`/`severity`/`env`/`size`; `status` is `text` (app-validated, not a
    DB enum, per spec 00's explicit note that this must be type-dependent). Self-referencing FKs
    on `tickets.epic_id`/`tickets.story_id` use Drizzle's `AnyPgColumn` callback pattern.
  - `apps/api/src/db/index.ts` — `createDb(connectionString?)` factory using
    `drizzle-orm/postgres-js`; not yet wired into Nest DI (deferred to M3, which is where the
    first repo layer that needs it shows up).
  - `apps/api/drizzle.config.ts` — reads `DATABASE_URL` via `dotenv/config`; migrations output
    to `apps/api/drizzle/`.
  - `apps/api/src/db/seed.ts` — inserts the 8 reference users (from the prototype's
    `seedUsers()`) + "Nimbus Triage" project (`NIM`, seq 1); uses `onConflictDoNothing({ target })`
    on `email` / `key_prefix` so re-running is idempotent (verified — see below).
  - `apps/api/package.json` — added `db:generate` / `db:migrate` / `db:seed` scripts;
    `drizzle-orm`, `postgres`, `dotenv` as deps, `drizzle-kit`, `tsx` as devDeps.
  - `apps/api/.env` created from `.env.example` (gitignored, confirmed not tracked).
  - Generated migration: `apps/api/drizzle/0000_worried_doctor_strange.sql`.
- **Key decisions / deviations from PLAN.md**: none of substance. One addition beyond the
  literal file list: `projectCreateSchema.keyPrefix` got a regex constraint
  (`^[A-Z]+$`, 2-6 chars) since it's the ticket-key prefix M4 will consume — not spec-mandated
  explicitly but a direct, low-risk consequence of the schema PLAN.md already calls for.
- **Verification performed**:
  - `pnpm --filter @ticket-tracker/shared run build` and `pnpm exec turbo run build typecheck`
    (all three workspaces) — clean.
  - `pnpm run db:generate` — produced the expected 5-table migration (confirmed FK/enum shape
    matches spec 00 exactly).
  - `pnpm run db:migrate` against the Compose Postgres — applied cleanly.
  - `pnpm run db:seed` — inserted 8 users + 1 project; verified via `psql` that names/emails/
    departments/roles and the project's `key_prefix`/`next_ticket_seq` match spec exactly.
  - Re-ran `db:seed` a second time — row counts stayed at 8 users / 1 project (idempotent, no
    duplicate-key errors).
- **Open items for next session**: none blocking. Postgres is up and migrated; M3 (Users API +
  acting-as guard) can start directly against this schema. Note for M3: `createDb()` in
  `apps/api/src/db/index.ts` is a plain factory, not yet a Nest provider/module — M3 is the
  first module that actually needs the DB injected into a controller/handler, so wiring it into
  Nest's DI container (a `DbModule` or similar) is fair game as part of M3's scope, not a gap
  left over from M2.

### M3 — Users API + acting-as guard + role matrix (done, 2026-09-08)
- **Files created**:
  - `apps/api/src/db/db.module.ts` — `@Global()` `DbModule` exporting the `DB` symbol provider
    that wraps M2's `createDb()`. This closes the item M2's handoff left open (the factory was
    not yet in Nest DI).
  - `apps/api/src/auth/permissions.ts` — `PERMISSIONS` map (`manageUsers`, `createEpic`,
    `deleteTicket`), the spec 00 role matrix in one place. M5/M6 should hang their epic-create
    and ticket-delete guards off `PERMISSIONS.createEpic` / `PERMISSIONS.deleteTicket` rather
    than writing role literals.
  - `apps/api/src/auth/acting-user.guard.ts` — resolves `X-Acting-User-Id` into
    `req.actingUser`; exports `ACTING_USER_HEADER` and the `RequestWithActingUser` type.
  - `apps/api/src/auth/roles.guard.ts` — enforces `@Roles(...)` against `req.actingUser`.
  - `apps/api/src/auth/roles.decorator.ts`, `acting-user.decorator.ts` (`@ActingUser()` param
    decorator — M5 needs it for the comment `author_id` rule, R6).
  - `apps/api/src/auth/auth.module.ts` — registers both guards as `APP_GUARD`, in order.
  - `apps/api/src/common/zod-validation.pipe.ts` — generic `ZodValidationPipe` over the shared
    schemas; 400 with a `{path, message}[]` issue list. Reusable by every later module.
  - `apps/api/src/users/` — `users.module.ts`, `users.controller.ts`, `user.mapper.ts`
    (`toUser`, row → shared `User`; `createdAt` Date → ISO string), `is-unique-violation.ts`,
    `queries/get-users.query.ts`, `queries/get-user.query.ts`,
    `commands/create-user.command.ts`, `commands/update-user.command.ts`.
  - Tests: `apps/api/src/auth/roles.guard.spec.ts` (15),
    `apps/api/src/users/is-unique-violation.spec.ts` (4).
  - `apps/api/vitest.config.ts`, `apps/api/tsconfig.build.json`.
- **Files modified**: `apps/api/src/app.module.ts` (imports DbModule/AuthModule/UsersModule);
  `apps/api/src/main.ts` (added `import 'dotenv/config'` — without it `DATABASE_URL` was never
  loaded outside the seed script and `DbModule`'s factory throws at boot);
  `apps/api/nest-cli.json` (points at `tsconfig.build.json`); `apps/api/package.json`
  (added `@nestjs/cqrs@^10.2.8` — v11 requires Nest 11, we're on Nest 10 — and `zod`).
- **Key decisions / deviations from PLAN.md**:
  - **Guard split, and what returns what.** `ActingUserGuard` never rejects a *missing*
    header — it sets `actingUser = null` and lets `RolesGuard` answer 403. That keeps
    unguarded reads (`GET /users`) open per spec 07 while satisfying the acceptance criterion
    (no header on `POST`/`PATCH` → 403). A header that is *present but unresolvable* (not a
    UUID, or no such user) throws **401**, not 403 — a client bug should fail loudly rather
    than look like a permission decision. This is a deliberate refinement of the acceptance
    criterion's wording, not a miss.
  - Both guards are global (`APP_GUARD`) and **order-sensitive** — Nest runs them in
    registration order, so `ActingUserGuard` must stay listed first in `auth.module.ts`.
  - `PERMISSIONS` was added beyond PLAN.md's file list so the matrix has a single home;
    `roles.guard.spec.ts` restates the expected table independently of it, so an incorrect
    edit to `PERMISSIONS` fails a test instead of silently redefining policy.
  - No `DELETE /users` — spec 07 explicitly defers it (assignee/reporter cleanup is an
    unmade decision).
  - Empty `PATCH` body is a 200 no-op (Drizzle rejects `set({})`), not a 400.
  - Duplicate email → 409. **Gotcha for every later module**: Drizzle wraps driver errors in
    a `DrizzleQueryError` and puts the original on `.cause`, so the Postgres error code is
    *not* on the top-level error. `isUniqueViolation()` walks the cause chain; reuse it (or
    the same pattern) for M4's `key_prefix` unique constraint and M5's FK violations. This
    was caught in live verification — the first implementation checked only `err.code` and
    returned 500.
- **Verification performed**:
  - `pnpm exec turbo run build typecheck` — all three workspaces clean.
  - `pnpm --filter @ticket-tracker/api run test` — 19 tests pass. The roles-guard spec covers
    the full decision table: admin/manager/developer x {manageUsers, createEpic, deleteTicket},
    plus no-acting-user, no-`@Roles`-metadata and empty-metadata cases.
  - Live against the Compose Postgres + built API (`node dist/main.js`):
    `GET /users` → 8 seeded users; `GET /users/:id` → 200; bad uuid → 400; unknown uuid → 404.
    `POST`/`PATCH`: no header → 403, developer → 403, manager → 403, admin → 201/200.
    Garbage header → 401; well-formed but unknown user id → 401. Invalid body → 400.
    Duplicate email on both `POST` and `PATCH` → 409. Swagger `GET /api` → 200.
    The `Test Newbie` user created during this pass was deleted afterwards; the DB is back to
    the 8 seeded users + 1 project.
- **Open items for next session**: none blocking. M4 (Projects API + key sequence) can start.
  Two notes for it: (1) the `ZodValidationPipe` + `PERMISSIONS` + `@ActingUser()` plumbing is
  in place, so M4 only adds its own module; (2) Docker was not running at the start of this
  session and the Postgres container also took one spurious shutdown right after starting —
  if queries 500 with `Failed query:`, check `docker compose ps` before debugging the code.

### M4 — Projects API + multi-project scoping + ticket-key sequence (done, 2026-09-08)
- **Files created**:
  - `apps/api/src/projects/ticket-key.service.ts` — `TicketKeyService.allocate(projectId, executor?)`
    returning `{ key, seq, projectId }`. **This is the piece M5 needs.** It takes an optional
    executor so the caller can allocate inside its own transaction (`db.transaction(tx => ...)`),
    which is what spec 02 asks for: a failed ticket insert must roll the sequence back with it.
  - `apps/api/src/projects/project.mapper.ts`, `projects.controller.ts`, `projects.module.ts`
    (exports `TicketKeyService`), `queries/get-projects.query.ts`, `queries/get-project.query.ts`,
    `commands/create-project.command.ts`.
  - `apps/api/src/projects/ticket-key.service.int-spec.ts` — the race-safety integration test.
  - `apps/api/vitest.integration.config.ts`.
- **Files modified**:
  - `apps/api/src/db/index.ts` — added the `DbExecutor` type (pooled connection *or* a
    transaction handle); use it for any later helper that must join a caller's transaction.
  - `apps/api/src/auth/permissions.ts` — added `manageProjects: ['admin']`;
    `roles.guard.spec.ts` gained the matching row (19 guard tests now).
  - **`is-unique-violation.ts` moved `src/users/` → `src/common/`** (now used by both users
    and projects) — imports updated in three files. Its spec moved with it.
  - `apps/api/src/db/seed.ts` — now seeds **all three** reference projects (Nimbus Triage/NIM,
    Atlas Billing/ATL, Vega Mobile/VEG) instead of only Nimbus. Still idempotent on
    `key_prefix`. Reason: R2 (real project data isolation) can't be verified with one project,
    and M6–M10 will need a second project to prove list/board/overview scoping.
  - `apps/api/src/app.module.ts` (imports ProjectsModule); `apps/api/tsconfig.build.json`
    (excludes `*.int-spec.ts`); `apps/api/package.json` (added `test:integration`).
- **Key decisions / deviations from PLAN.md**:
  - **Key allocation is a single atomic `UPDATE ... RETURNING`**, not `SELECT ... FOR UPDATE`
    followed by an update — spec 02 allows either; one statement is simpler and takes the row
    lock for its whole duration. **Gotcha**: `RETURNING` yields *post*-update values, so the
    sequence number the caller may use is `nextTicketSeq - 1`. Do not "fix" that subtraction.
    Never split this into a read then a write.
  - **Two test suites now.** `pnpm run test` is unit-only and needs no database;
    `pnpm run test:integration` (`*.int-spec.ts`, `vitest.integration.config.ts`,
    `fileParallelism: false`) needs the Compose Postgres up. Turbo's `test` task still runs
    only the unit suite, so CI in M14 must decide explicitly whether to stand up Postgres and
    run `test:integration` too — flagging it now so it isn't missed.
  - `POST /projects` is in v1, Admin-only. Spec 02 left this as an open question; PLAN.md had
    already resolved it as in-scope, so no new decision was needed here.
  - No `PATCH`/`DELETE /projects` — neither spec 02 nor PLAN.md asks for them.
  - Duplicate `key_prefix` → 409, via the shared `isUniqueViolation` (the cause-chain gotcha
    from M3 applied exactly as predicted).
- **Verification performed**:
  - `pnpm exec turbo run build typecheck` — all three workspaces clean.
  - `pnpm --filter @ticket-tracker/api run test` — 23 unit tests pass (19 roles-guard incl. the
    new `manageProjects` row, 4 unique-violation).
  - `pnpm --filter @ticket-tracker/api run test:integration` — 3 pass, including the acceptance
    criterion: **50 concurrent `allocate()` calls on one project produced 50 distinct keys with
    no duplicates and no gaps**, and left `next_ticket_seq` advanced by exactly 50. Also covers
    first-key-is-`{PREFIX}-1` and unknown-project → NotFound.
  - `pnpm run db:seed` re-run — 8 users, 3 projects, still idempotent.
  - Live against the built API: `GET /projects` → the 3 seeded projects; `GET /projects/:id`
    → 200; bad uuid → 400; unknown uuid → 404. `POST /projects`: no header → 403,
    developer → 403, manager → 403, admin → 201; lowercase `keyPrefix` → 400 with the Zod
    issue list; duplicate prefix → 409. Swagger `GET /api` → 200. Users endpoints
    re-checked after the `is-unique-violation` move (list → 8, duplicate email → 409).
    The `TMP` project created during verification was deleted; DB is back to 8 users /
    3 projects, all with `next_ticket_seq = 1`.
- **Open items for next session**: none blocking. M5 (tickets write side) can start and should
  inject `TicketKeyService` from `ProjectsModule`, allocating the key inside the same
  transaction as the ticket insert. Reminder from M3 that still applies: `@ActingUser()` is
  ready for the reporter/comment-author rules (R6), and `PERMISSIONS.createEpic` /
  `PERMISSIONS.deleteTicket` are already defined for M5's guards.

### M5a — Ticket rules + CreateTicket (done, 2026-09-08)
> **PLAN.md changed this session**: M5 was sized L, so it was split into **M5a** (rule layer +
> create) and **M5b** (update / move-status / delete / add-comment). The original acceptance
> criteria were divided between the two, unchanged in substance. See PLAN.md's M5 section.

- **Files created**:
  - `apps/api/src/tickets/ticket-rules.ts` — **the rule layer M5b builds on.** Pure, DB-free
    functions: `defaultStatusFor`, `isValidStatusFor`, `assertValidStatus` (R1),
    `assertEpicStoryConsistency` (R5), `assertStoryLinkAllowed`. M5b's update and
    move-status commands must call these rather than re-deriving the rules.
  - `apps/api/src/tickets/ticket-links.ts` — `assertParentLinks(executor, {...})`, the
    DB-touching half: an `epic_id`/`story_id` must exist, be the right type, live in the
    **same project** (R2 — a cross-project link would breach tenancy), and satisfy R5. Takes a
    `DbExecutor` so it runs inside the caller's transaction. M5b needs this whenever an update
    changes either link.
  - `apps/api/src/tickets/ticket.mapper.ts` (`toTicket`), `commands/create-ticket.command.ts`,
    `tickets.controller.ts` (only `POST /projects/:projectId/tickets` so far — M5b adds the
    rest of the routes to this same controller), `tickets.module.ts` (imports ProjectsModule
    for `TicketKeyService`).
  - Tests: `ticket-rules.spec.ts` (16 unit), `commands/create-ticket.int-spec.ts` (12 integration).
- **Files modified**:
  - `apps/api/src/auth/permissions.ts` — added `writeTicket: ['admin','manager','developer']`
    (the matrix's "all three roles" row, used to require *a* recognized acting user on ticket
    writes) and a `can(action, role)` helper for checks a route-level `@Roles` can't express.
    `roles.guard.spec.ts` covers both (38 guard tests now).
  - `apps/api/src/app.module.ts` — imports TicketsModule.
- **Key decisions / deviations from PLAN.md**:
  - **The epic-creation gate lives in the handler, not on the route.** It depends on the
    request body's `type`, which route metadata can't see. The route carries
    `@Roles(...PERMISSIONS.writeTicket)` (any recognized user — a missing header is still 403,
    and the reporter has to come from somewhere), and the handler then calls
    `can('createEpic', role)`. **M5b's delete is different** — it is unconditionally
    Admin/Manager, so it *should* use a route-level `@Roles(...PERMISSIONS.deleteTicket)`.
  - **Status is never client-supplied on create.** It's `defaultStatusFor(type)` — Planned for
    epics, Backlog for stories/bugs. `ticketCreateSchema` has no `status` field, and Zod
    strips unknown keys, so a payload carrying `status` is silently ignored rather than 400.
    Verified: a create with `"status":"Done"` stored `Backlog`.
  - **Type-dependent fields are nulled server-side** (severity is bug-only; env/size/dates/
    sprint/epic/story are null on epics) even though the discriminated union already keeps
    them off the payload — so the stored row can't drift from the type's shape.
  - `reporter` = acting user's **name** (free text per spec 00, not an FK). This resolves the
    open question spec 06 raised, the way PLAN.md had already decided.
  - Create runs in **one transaction** wrapping link validation, key allocation and insert, so
    a rejected insert doesn't burn a sequence number. There is an integration test for exactly
    that; don't refactor the transaction away.
- **Verification performed**:
  - `pnpm exec turbo run build typecheck` — clean.
  - `pnpm run test` — **58 unit tests** (16 ticket-rules incl. every type x every status in
    both directions and the R5 table; 38 roles-guard/`can()`; 4 unique-violation).
  - `pnpm run test:integration` — **15 tests**, of which 12 are new create tests: sequential
    keys, reporter from acting user, per-type default status, epic field-nulling, severity
    kept only for bugs, valid bug→story link, R5 violation rejected, cross-project link
    rejected (R2), epic link pointing at a story rejected, unknown epic rejected, developer
    forbidden from epics but allowed stories, and **a failed create leaving the sequence
    untouched** (the next create takes the number it didn't consume).
  - Live over HTTP: no header → 403; epic as developer → 403; epic as manager → 201 `NIM-1`
    (status Planned, reporter "Aisha Patel"); story as developer → 201 `NIM-2` (Backlog);
    bug linked to that story → 201 `NIM-3`; story missing `epicId` → 400 from Zod;
    cross-project epic link → 400; R5 violation → 400; unknown project → 404.
    All test tickets were deleted and `next_ticket_seq` reset to 1 afterwards — DB is back to
    8 users / 3 projects / 0 tickets.
- **Open items for next session**: none blocking. **M5b** adds `PATCH /tickets/:id`,
  `PATCH /tickets/:id/status`, `DELETE /tickets/:id`, `POST /tickets/:id/comments` to the
  existing `tickets.controller.ts`. Notes for it: (1) status changes go through
  `assertValidStatus(storedTicket.type, newStatus)` — the type comes from the stored row, never
  the request; (2) any update touching `epicId`/`storyId` must re-run `assertParentLinks`;
  (3) `updated_at` must be set explicitly on every mutation (the column only defaults on
  insert); (4) comment `author_id` comes from `@ActingUser()`, never the body (R6).

### M5b — Update / MoveStatus / Delete / AddComment (done, 2026-09-08)
**M5 is now complete** — the whole ticket write side is in place.

- **Files created**: `apps/api/src/tickets/commands/update-ticket.command.ts`,
  `move-ticket-status.command.ts`, `delete-ticket.command.ts`, `add-comment.command.ts`,
  and `commands/write-commands.int-spec.ts` (15 integration tests).
- **Files modified**:
  - `tickets.controller.ts` — added `PATCH /tickets/:id`, `PATCH /tickets/:id/status`,
    `DELETE /tickets/:id` (204, no body), `POST /tickets/:id/comments`.
  - `tickets.module.ts` — registers the four new handlers.
  - `ticket-rules.ts` — added `assertFieldsAllowedForType` (see below). Also reworded the
    three rule error messages to avoid the "a epic" article bug now that they surface to API
    callers: they read `... for type "epic"` / `(ticket type: epic)`.
  - `ticket-rules.spec.ts` — 6 more unit tests (22 in the file, 64 unit tests overall).
- **Key decisions / deviations from PLAN.md**:
  - **`assertFieldsAllowedForType` is new and not in PLAN.md's file list.** Create is protected
    by the discriminated union, but `ticketUpdateSchema` is deliberately flat, so without this
    check `PATCH /tickets/:id` was a back door to an epic with a severity or an env. Clearing
    a field to null is always allowed; only *setting* a value is type-restricted. If M6+ ever
    adds another write path, it needs this call too.
  - **Delete semantics — decided with the user (2026-09-08), not spec'd anywhere.**
    Deleting a ticket **cascades its comments** (owned by the ticket, meaningless without it)
    but **refuses with 409 if any ticket still links to it** via `epic_id` *or* `story_id`, and
    names the blocking keys in the message. Rejected alternatives: cascading to child tickets
    (one click destroys real work) and nulling child links (silent orphans). Revisit only if
    the user asks — it is a product decision, not an implementation detail.
  - **Delete's role gate is route-level** `@Roles(...PERMISSIONS.deleteTicket)`, unlike M5a's
    epic gate, because it doesn't depend on the body. `PATCH` and `POST /comments` carry
    `writeTicket` (all three roles) per the spec 00 matrix row.
  - Every rule is checked against the **stored** ticket's `type`, never anything in the
    request — `type` is immutable after creation and `ticketUpdateSchema` has no `type` field.
  - `updated_at` is set explicitly in all four commands (the column only defaults on insert).
    **Adding a comment also bumps the ticket's `updated_at`**, so spec 01's "Recently updated"
    reflects comment activity — worth knowing when M6 builds that query and M8 renders it.
  - An empty `PATCH` body is a 200 no-op, consistent with `PATCH /users/:id` from M3.
  - Each command runs in a transaction so its read-then-write (load ticket → validate →
    update) can't interleave with a concurrent change.
- **Verification performed**:
  - `pnpm exec turbo run build typecheck` — clean.
  - `pnpm run test` — **64 unit tests**. `pnpm run test:integration` — **30 tests**, 15 new:
    update applies edits and advances `updated_at` while leaving `created_at`; status
    validated against the stored type in both directions; R5 re-checked when either link moves
    (and moving both together succeeds); type-inappropriate fields refused; empty body no-op;
    404s. Move-status: valid move advances `updated_at`, epic-only status on a bug rejected
    (the spec 04 drag case), and vice versa. Comments: `author_id` from the acting user and
    verified in the stored row, ticket `updated_at` bumped. Delete: leaf ticket deleted with
    its comments cascaded, parent with a child refused with the parent left intact then
    deletable once the child is gone, a bug's story-link counted as a child, 404s.
  - Live over HTTP: `PATCH` as developer → 200 (all roles may edit); epic → "Backlog" → 400;
    severity on an epic → 400; no header → 403; unknown ticket → 404. Status move → 200 with
    `updated_at` advanced; epic-only status → 400; empty status → 400 from Zod.
    **Comment posted by a developer with `"authorId": <admin id>` in the body stored the
    developer as author** — R6 holds against a hostile payload, not just an empty one.
    `DELETE` as developer → 403; epic with a child → 409 naming `NIM-2`; story with comments
    → 204; childless epic → 204. DB restored: 0 tickets, 0 comments, 8 users, 3 projects,
    sequences reset.
- **Open items for next session**: none blocking. **M6 (tickets read side, sized L)** is next
  and is the last backend module. Notes for it: (1) `GET /tickets/:id` must return
  `statusOptions` computed from `STATUS_BY_TYPE[ticket.type]` and `storyOptions` (stories under
  the ticket's epic) per spec 05 — `ticket-rules.ts` already has the status half;
  (2) every read must be project-scoped (R2) and paginated/filtered server-side (R8);
  (3) `toTicket` / `toUser` / `toProject` mappers exist and should be reused;
  (4) M6 is sized L — consider splitting it the way M5 was split, e.g. list+detail then
  board+overview.

### M6a — Shared read DTOs + tickets list + ticket detail (done, 2026-09-08)
> **PLAN.md changed this session**: M6 (L) was split into **M6a** (read DTOs + list + detail)
> and **M6b** (board + overview), mirroring the M5 split. The R2 acceptance test is split by
> endpoint: list is covered here; board/overview belong to M6b.

- **Files created**:
  - `apps/api/src/tickets/queries/ticket-summary.ts` — **the piece M6b reuses.** Exports the
    three join aliases (`assignee`, `epic`, `story`), `summaryColumns`, `summarySelect(executor)`
    (the joined select) and `toTicketSummary(row)`. Board and the overview's `recentActivity`
    must go through this so all "row of tickets" views agree on shape and names.
  - `queries/get-tickets.query.ts` (`GET /projects/:projectId/tickets`),
    `queries/get-ticket-detail.query.ts` (`GET /tickets/:id`),
    `queries/read-queries.int-spec.ts` (13 integration tests).
- **Files modified**:
  - `packages/shared/src/schemas.ts` — `ticketListQuerySchema` + `TICKET_SORT_FIELDS`. Lives in
    shared on purpose: the frontend's URL search-param validation (R7, M9) should parse with
    this exact schema, so the API and the address bar can't disagree. Uses `z.coerce` for
    page/pageSize because query-string values arrive as strings.
  - `packages/shared/src/types.ts` — `UserRef`, `TicketRef`, `TicketSummary`,
    `CommentWithAuthor`, `TicketDetail`, `Paged<T>`, `TicketListQuery`, `TicketListQueryInput`
    (the pre-default `z.input` form — what a URL parser starts from). These are the spec 00
    "DTO/summary shapes" SPEC.md assigns to shared; M6b adds `OverviewStats` beside them.
  - `tickets.controller.ts` / `tickets.module.ts` — two read routes and handlers; the
    controller now injects `QueryBus` alongside `CommandBus`.
- **Key decisions / deviations from PLAN.md**:
  - **Reads need no acting user.** Neither route carries `@Roles`; spec 08 only sends the
    header on mutating calls. Always project-scoped by `WHERE project_id = …` (R2), and all
    filtering/search/sort/paging is SQL (R8) — nothing is filtered in memory.
  - Search is `ILIKE %term%` over title, key and `assignee.name` — exactly spec 03's three
    fields, no more — with LIKE metacharacters escaped so a search for `%` or `_` is literal.
    **A blank/whitespace-only `search` is "no filter", not a 400** (found by the integration
    test; fixed in the shared schema with a `.transform`).
  - `total` is computed by a second `count()` query sharing the same WHERE (it needs the
    assignee join because search touches `assignee.name`). Both queries run in parallel.
  - Sort has a stable tiebreak (`created_at desc, id asc`) so paging over ties can't skip or
    duplicate rows. `sortBy=priority` relies on Postgres enum declaration order
    (critical → high → medium → low), so `asc` = most urgent first; **if the enum is ever
    reordered, this ordering silently changes.**
  - Detail's `storyOptions` is only populated for **bugs** with an epic (the dropdown exists
    only on the bug form per specs 05/06), scoped to the project *and* the epic; empty for
    epics/stories. `statusOptions` is `STATUS_BY_TYPE[type]` — the same table the write side
    validates against. Comments are oldest-first with the author's `{id, name}` joined in.
  - A list for a **nonexistent project returns `{ total: 0 }` with 200**, not 404. Defensible
    (it's a filter, and the frontend resolves the project via `GET /projects/:id` first) but a
    choice — cheap to change to a 404 if the user prefers.
- **Environment gotcha (not code)**: partway through, `apps/web` failed to build with
  `Cannot find type definition file for 'vite/client'` — the `apps/web/node_modules/vite`
  workspace link had gone missing, and earlier turbo runs had hidden it by replaying a cached
  web success. `pnpm install --frozen-lockfile` restored it (+4 links). If a workspace
  suddenly can't find a dependency it clearly has in `package.json`, check the symlinks and
  run `turbo … --force` to bypass the cache before suspecting the code.
- **Verification performed**:
  - `pnpm exec turbo run build typecheck --force` — all six tasks clean, uncached.
  - `pnpm run test` — 64 unit. `pnpm run test:integration` — **43 tests**, 13 new: project
    scoping and newest-first default; **R2: project B never sees A's rows, even for a search
    term that matches rows in A**; assignee + Epic ▸ Story breadcrumb names (null on epics);
    every filter individually and AND-combined; search over title / key / assignee name,
    case-insensitively; LIKE metacharacters literal; pagination with a stable order and the
    filter's `total` on every page; sort by createdAt/title/priority (enum order); schema
    defaults and bounds; detail's names, `statusOptions` per type, `storyOptions` limited to
    the bug's own epic, comments oldest-first with authors, 404.
  - Live over HTTP with NIM + ATL fixtures: list defaults, ATL isolation under a matching
    search, `type=bug` breadcrumb, `search=TOKEN`, assignee-name search, blank search → total
    unchanged, combined filters, `page=2&pageSize=2`, priority sort, `pageSize=500` → 400,
    `sortBy=reporter` → 400, unknown project → total 0; detail for bug/story/epic, unknown
    → 404; Swagger 200. DB restored to 8 users / 3 projects / 0 tickets / 0 comments.
- **Open items for next session**: none blocking. **M6b (board + overview)** is next and is
  the last backend module. Notes: (1) build both reads on `summarySelect`/`toTicketSummary`;
  (2) board is `GET /projects/:projectId/board?sprint=&type=` returning a flat
  `TicketSummary[]` — `sprint` takes `backlog` (sprint_id IS NULL) or a sprint id, per spec
  04; (3) overview is one aggregation query per spec 00's "computed values" with guards for
  the empty project (no divide-by-zero in percentages / `avgResolutionDays`); (4) add
  `OverviewStats` to shared; (5) the sprints table is still empty and has no API — M6b may
  need a minimal `GET /projects/:projectId/sprints` for the board's Sprint filter, which
  PLAN.md doesn't list anywhere; flag it when M6b starts.

### M6b — Board + overview stats (done, 2026-09-08)
**M6 is complete, and with it the entire backend (M1–M6).** Everything from here is frontend.

- **Files created**:
  - `apps/api/src/tickets/queries/get-board.query.ts` — `GET /projects/:projectId/board`.
  - `apps/api/src/tickets/queries/get-overview-stats.query.ts` — `GET /projects/:projectId/overview`.
  - `apps/api/src/projects/queries/get-sprints.query.ts` — `GET /projects/:id/sprints` (see
    scope addition below).
  - `apps/api/src/tickets/queries/board-overview.int-spec.ts` — 12 integration tests.
- **Files modified**:
  - `packages/shared/src/enums.ts` — added **`ALL_STATUSES`**, the union of every type's
    statuses in spec 04's Type="All" column order. It is both the board's column order (M10)
    and the overview's status-breakdown row order; use it rather than re-deriving a union.
  - `packages/shared/src/types.ts` — `OverviewStats`, `StatusBreakdownEntry`,
    `PriorityBreakdownEntry`, `BoardQuery`.
  - `packages/shared/src/schemas.ts` — `boardQuerySchema` + the `BACKLOG_SPRINT` constant
    (`'backlog'`). M10's URL search params should parse with this schema.
  - `tickets.controller.ts` / `tickets.module.ts`, `projects.controller.ts` /
    `projects.module.ts` — the three routes and handlers.
  - `apps/api/src/db/seed.ts` — seeds 3 sprints per project (9 total). Idempotent by
    `(project, name)`: re-running reports `0 new` rather than duplicating.
- **Scope addition (agreed with user, recorded in PLAN.md)**: spec 04's board has a Sprint
  filter, but **no module in the original plan ever created or listed sprints** and the table
  was empty, so the filter was unusable end to end. M6b adds a read-only
  `GET /projects/:projectId/sprints` plus seed data. Sprint *management* (create/edit) stays
  out of scope — no spec describes such a UI. If M10 needs users to create sprints, that is a
  new decision, not an oversight.
- **Key decisions / deviations from PLAN.md**:
  - **Board returns a flat `TicketSummary[]`, not grouped, and is not paginated.** Grouping is
    presentation (spec 04 says so explicitly), and which columns exist depends on the type
    filter, which the client derives from `STATUS_BY_TYPE` / `ALL_STATUSES`. A board shows
    every card in its filter by definition, so paging it would be wrong.
  - `sprint` accepts `'backlog'` (→ `sprint_id IS NULL`) or a sprint uuid; omitted = All.
    Anything else is a 400 from the shared schema.
  - **The overview is two round trips, not literally one query** — a deliberate reading of the
    acceptance criterion. One statement (CTEs + `FILTER` + `jsonb_object_agg`) produces every
    scalar and both breakdowns; a second reuses M6a's `summarySelect` for the 5
    recent-activity rows. Folding those joins into the same statement would mean
    re-implementing the summary join and mapper in raw SQL and letting recent-activity rows
    drift from list rows. **The thing the criterion actually protects against — shipping the
    ticket list to the client and totalling it up — does not happen anywhere.**
  - Breakdowns always emit **every** status (7) and **every** priority (4), zero-filled, so
    dashboard rows don't appear and vanish as a project fills up. `pct` is 0 when the project
    has no tickets — the divide-by-zero guard is in both SQL (`coalesce`) and TS.
  - `avgResolutionDays` is `avg(updated_at - created_at)` over Done tickets in **days, rounded
    to 1 decimal**. Note this uses `updated_at`, per spec 00's definition — so *any* later edit
    to a Done ticket inflates its apparent resolution time. That is what the spec asks for;
    flagging it because it is a genuine modelling weakness someone may want revisited (a real
    `resolved_at` column would be the fix).
  - `db.execute()` return shape differs by driver (postgres-js returns the array directly,
    node-postgres wraps it in `.rows`); the handler handles both, so swapping drivers later
    won't silently break the dashboard.
- **Verification performed**:
  - `pnpm exec turbo run build typecheck` — all six tasks clean.
  - `pnpm run test` — 64 unit. `pnpm run test:integration` — **55 tests**, 12 new: sprints
    listed in start-date order and project-scoped; board flat/summary-shaped, **R2 isolation**,
    filter by specific sprint, by `backlog`, by type, and sprint+type combined, plus schema
    rejection of a bad sprint value; overview KPIs against spec 00's definitions (a Done
    ticket backdated 2026-06-01 → 06-04 yields `avgResolutionDays === 3`), breakdowns with
    percentages and zero-filled rows, recent-activity ordering and shape, **the empty project
    returning zeros with no NaN**, and **R2: another project's tickets never counted**.
  - `pnpm run db:seed` run twice — `9 sprints (9 new)` then `(0 new)`, confirming idempotency.
  - Live over HTTP: sprints listed for NIM; board all/by-sprint/backlog/type+backlog, bad
    sprint → 400, ATL isolated; overview KPIs, breakdown percentages summing over 7 status
    rows, recent activity carrying epic refs; **empty project VEG → all zeros, 7 status rows,
    every pct 0**; Swagger 200. Tickets deleted and sequences reset afterwards; the 9 seeded
    sprints were intentionally left in place. DB: 0 tickets, 9 sprints, 8 users, 3 projects.
  - One live figure worth not misreading: `avgResolutionDays=0` in the HTTP pass is correct —
    that ticket was created and marked Done within the same second. The 3-day case is covered
    by the integration test.
- **Open items for next session**: none blocking. **M7 (frontend app shell)** is next and
  starts the frontend half: routing, layout, API client, acting-as switcher, project switcher.
  Notes: (1) `apps/web` is still the M1 Vite/React/Tailwind shell — no router, no TanStack
  Query, no API client yet; (2) the API client must attach `X-Acting-User-Id` on mutations in
  **one** place (spec 08) — reads need no header; (3) SPEC.md's contract says the frontend
  generates its typed client / hooks from the OpenAPI spec at `GET /api` rather than
  hand-writing types — decide in M7 whether to honour that or import the shared DTOs directly,
  and record the choice; (4) every URL-driven view should parse its search params with the
  shared schemas (`ticketListQuerySchema`, `boardQuerySchema`) so the address bar and the API
  agree (R7); (5) `pnpm run test:integration` needs Postgres up — M14's CI decision is still
  outstanding.

### M7 — Frontend app shell (done, 2026-09-08)
**First frontend module.** Everything M8–M13 renders mounts into this shell.

- **Files created** (all under `apps/web/src/`):
  - `api/client.ts` — `apiFetch`, `ApiError`, `ACTING_USER_HEADER`. **The one place the acting
    user header is attached.** Also drops empty query params (so "All" filters leave the URL),
    handles the 204 from DELETE, and surfaces the API's Zod `issues` array on a 400.
  - `api/endpoints.ts` — one function per route, typed with the shared DTOs. Views never call
    `apiFetch` directly.
  - `api/queries.ts` — `queryKeys` + TanStack Query hooks. **Mutation hooks read the acting
    user from the store themselves**, so no call site can forget to pass it.
  - `store/actingUser.ts`, `store/viewPrefs.ts` — Zustand, both `persist`ed to localStorage.
  - `layout/` — `AppShell`, `Sidebar`, `ProjectSwitcher`, `ActingUserMenu`, `useDismissable`.
  - `router.tsx`, `routes/Placeholder.tsx`, `api/client.spec.ts` (9 tests).
- **Files modified**: `main.tsx` (Query + Router providers; `App.tsx` deleted), `index.css`
  and `tailwind.config.js` (IBM Plex, prototype scrollbars), `apps/api/src/main.ts` +
  `.env`/`.env.example` (CORS — see below), `packages/shared/package.json` +
  `tsconfig.esm.json` (dual build — see below).
- **Decision recorded (asked and answered by the user, 2026-09-08): API types come from
  `@ticket-tracker/shared`, not an OpenAPI codegen step.** This is a **deliberate deviation
  from SPEC.md's cross-module contract**, which says the frontend generates a typed client from
  the OpenAPI spec. Rationale: the API builds its responses from these exact shared types, so
  the two cannot drift, and a generated client would only restate them while adding a codegen
  step that needs the API running. If drift ever appears, revisit this first.
- **Two infrastructure fixes M7 forced (neither was in PLAN.md)**:
  1. **CORS.** The API had none. The web app is a separate origin (5173 in dev, its own
     container in Compose), and `X-Acting-User-Id` is a *custom* header, so it must be named in
     `allowedHeaders` or the browser blocks every mutation at the preflight — reads would have
     kept working, which would have made this look like a mutation bug. Configurable via
     `WEB_ORIGIN`.
  2. **`packages/shared` is now dual-format.** It emitted CommonJS only; Rollup can't trace
     named re-exports through tsc's `__exportStar` barrel, so `import { ROLE_COLORS }` broke the
     production web build. It went unnoticed until now because the web app had only ever
     imported *types*, which erase at compile time. `build` is now two tsc passes (CJS →
     `dist/`, ESM → `dist/esm/`) with an `exports` map. `apps/api` keeps resolving via `main`
     (its `moduleResolution: "Node"` predates `exports`). **Any future runtime import from
     shared depends on this — don't collapse the build back to one pass.**
- **Other decisions**:
  - Routes are declared **explicitly**, not through a `view()` factory. The factory erased the
    literal path types and TanStack Router inferred only two routes; every `<Link to=…>` failed
    to typecheck. Keep adding routes one by one.
  - `/` redirects to the first project's overview, with an explicit empty state telling the
    user to run `db:seed` when there are no projects.
  - `ActingUserMenu` defaults to the first user and **self-heals if a persisted id no longer
    exists** (e.g. the DB was reseeded) — otherwise every mutation 403s with no obvious cause.
  - `apiFetch` throws rather than firing a mutation with no acting user, instead of letting it
    round-trip to a predictable 403.
  - View prefs (R10) are persisted client-side but deliberately **not** in the URL, unlike the
    spec 03/04 filters, which belong there so a filtered view stays shareable.
- **Verification performed**:
  - `pnpm exec turbo run build typecheck test --force` — all 8 tasks clean uncached; 64 api +
    9 web tests.
  - `client.spec.ts` covers the acceptance criterion at the wrapper: no header on GET, header
    present on POST/PATCH/DELETE, refusal with no acting user, empty query params dropped, 204
    handling, and error/issue surfacing.
  - **Driven in a real browser (Playwright + system Chrome)**: `/` redirected to a project
    overview; project menu listed all three with the active tick and switching changed the URL;
    Tickets/Board/People navigated with correct headings; the acting-as menu listed all 8 users
    and switching to Jordan Lee persisted across a reload (localStorage key present); a POST
    issued from the page returned **201 with `reporter=Jordan Lee`**, proving CORS + the custom
    header end to end. **Network inspection confirmed the acceptance criterion directly:** every
    `GET /projects` and `GET /users` carried no acting-user header, and the POST carried it.
  - Screenshots reviewed (`shell-overview.png`, `shell-people.png`) — sidebar, switchers, role
    badge and active nav state all render as in the prototype. The test ticket the browser
    created was deleted afterwards; Nimbus Triage is back to its 8 demo tickets.
- **Local dev**: `docker compose up -d postgres` then `pnpm run dev` (turbo runs api on :3000
  and web on :5173). Demo data from the run session is still in the database.
- **Open items for next session**: none blocking. M8 (overview dashboard, size S) is next and
  has everything it needs: `useOverview(projectId)` already exists in `api/queries.ts`, and the
  shared package exports the colour palettes (`STATUS_COLORS`, `PRIORITY_COLORS`) the prototype
  used. Replace the `Placeholder` in `overviewRoute`.

### M8 — Overview Dashboard view (done, 2026-09-08)
**First real screen.** The app now renders live project data.

- **Files created**:
  - `apps/web/src/features/overview/OverviewPage.tsx` — the whole view.
  - **Shared primitives M9-M11 should reuse rather than re-create**:
    - `components/Badge.tsx` — `StatusBadge` / `PriorityBadge` / `TypeBadge`, driven by the
      shared colour palettes. `StatusBadge` falls back to a neutral pill for an unrecognised
      status, since `status` is free text in the DB, not an enum.
    - `components/relativeTime.ts` — `relativeTime` (Intl-based, no date library) + `formatDate`.
    - `components/states.tsx` — `LoadingPanel` / `ErrorPanel` (with retry) / `EmptyState`.
  - `components/relativeTime.spec.ts` (2 tests).
- **Files modified**: `router.tsx` (overview route renders `OverviewPage` instead of the
  placeholder); `apps/web/index.html` (favicon link — the browser's automatic `/favicon.ico`
  request was the only console error on the page, and it's now clean).
- **Key decisions**:
  - **Status bars show only statuses with a count > 0**, falling back to the full zero-filled
    set when the project has no tickets at all. The API always returns all 7 (M6b), which is
    right for a stable shape but renders six empty bars on an active project. The empty-project
    case still shows every status at 0%, as spec 01 asks.
  - Recent-activity rows are `<Link>`s to the ticket detail route, so the list is navigable now
    and needs nothing from M11 to work.
  - The breadcrumb on those rows respects the R10 `showHierarchy` view pref from M7's store —
    the first consumer of that store, proving the wiring works.
  - Every figure is rendered straight from the API response; the view computes no statistic of
    its own. `avgResolutionDays` displays as-is, so a project whose Done tickets were closed
    within the same second correctly reads `0 days`.
- **Verification performed**:
  - `pnpm exec turbo run build typecheck test --force` — 8 tasks clean; 64 api + 11 web tests.
  - **Driven in a real browser (Playwright + system Chrome)**:
    - Populated project (Nimbus Triage): KPIs 7 open / 1 critical / 0 days / 8 this week;
      six status bars with counts and percentages (25%, 12.5%…); four priority tiles
      (1 critical, 2 high, 4 medium, 1 low); five recent-activity rows with keys, status
      badges, `NIM-1 ▸ NIM-3` breadcrumbs, assignee names and relative times.
    - **Empty project (Vega Mobile): all KPIs 0, every status row at 0%, and the recent-activity
      empty state** ("No activity yet — create a ticket to get started") — spec 01's edge case.
    - Clicking a recent-activity row navigates to `/projects/…/tickets/…`.
    - **Invalidation acceptance criterion**: creating a ticket from the page moved "Open
      tickets" 7 → 8. The probe ticket was deleted afterwards.
    - **Console errors: none.**
  - Screenshots reviewed (`m8-overview.png`, `m8-final.png`, `m8-empty.png`). One real bug
    caught by looking at the pixels: the KPI suffix rendered as `0days` because JSX collapsed
    a leading space — fixed with a margin. `innerText` cannot show this, so it would have
    passed a text-only check.
- **Open items for next session**: none blocking. **M9 (tickets list, size M)** is next. Notes:
  (1) `useTickets(projectId, query)` exists; (2) parse URL search params with the shared
  `ticketListQuerySchema` so the address bar and API agree (R7) — TanStack Router's
  `validateSearch` takes it directly; (3) the `density` view pref (R10) is in the store,
  unused so far — the list is where it applies; (4) reuse the badge/time/state components
  above rather than restyling; (5) spec 03 wants the search input debounced ~300ms.

### M9 — Tickets List view (done, 2026-09-08)
- **Files created** (`apps/web/src/features/tickets-list/`):
  - `searchParams.ts` — **the URL contract, and the piece M10 should copy.** `validateTicketSearch`
    (the route's `validateSearch`), `withDefaults`, `stripDefaults`, `withFilter`.
  - `useDebounced.ts` — 300ms debounce (spec 03), reusable.
  - `FilterBar.tsx` — six filter selects + the R10 density/hierarchy/tags toggles.
  - `TicketsListPage.tsx` — TanStack Table grid, pager, empty state.
  - `searchParams.spec.ts` (9 tests).
- **Files modified**: `router.tsx` (list route gains `validateSearch`), `apps/web/package.json`.
- **Key decisions**:
  - **TanStack Table pinned to v8 (`^8.21.3`), deliberately, though v9.2.4 is `latest`.** v9 is a
    ground-up rewrite (`useTable` + a `features`/`tableFeatures` model, `createCoreRowModel`,
    stricter `ColumnDef` variance) that every published example and PLAN.md predate; four
    typing probes failed to land a clean native v9 table for what is a fixed 8-column,
    entirely server-driven grid. v9 ships a `/legacy` entry, but writing new code against a
    shim is worse than pinning the stable major. **If someone upgrades, this file is the work.**
  - **`validateSearch` returns the *stripped* search, not the defaulted one.** TanStack Router
    writes whatever `validateSearch` returns back into the address bar, so returning the
    defaulted object put `?page=1&pageSize=25&sortBy=createdAt&sortDir=desc` on every pristine
    list — caught only by driving it in a browser, since the unit tests were happy either way.
    The component calls `withDefaults(search)` to get the full query for the API. **M10's board
    filters should follow this same split**, and `withDefaults` takes a loose
    `Record<string, unknown>` on purpose: its input is the address bar, not a trusted object.
  - Parsing uses the shared `ticketListQuerySchema` — the exact schema the API validates with —
    and **falls back to defaults instead of throwing** on a hand-mangled or stale URL, so a bad
    link renders a valid list rather than an error.
  - Changing any filter resets to page 1; changing the page does not. Filters set to "All"
    are removed from the URL rather than sent as a sentinel.
  - Table is `manualPagination`/`manualSorting`/`manualFiltering` — the server already scoped
    the page, and letting the table re-slice would silently paginate the page.
  - The epic filter's options come from a second `useTickets(type: 'epic', pageSize: 100)`
    call. Fine for a project's handful of epics; revisit if that stops being true.
- **Verification performed**:
  - `pnpm exec turbo run build typecheck test --force` — 8 tasks clean; 64 api + 20 web tests.
  - **Driven in a real browser (Playwright + system Chrome)**: default list 8 rows with
    "1–8 of 8 tickets"; `type=bug` → 3 rows and `?type=bug`; adding status → `?type=bug&status=Blocked`
    → 1 row; **reloading that URL restored both rows and select values** (R7); typing "refund"
    produced **one API call for six keystrokes** and 2 matching rows; a non-matching search
    showed "No tickets match your filters."; `pageSize=2` paged 1–2 → 3–4 with the URL tracking;
    the density toggle changed row height 77px → 65px and tags switched to neutral (R10);
    clicking a row navigated to the ticket detail route. **Console errors: none.**
  - Screenshots reviewed (`m9-list.png`, `m9-final.png`, `m9-compact.png`). Two things only the
    pixels showed: the filter bar wrapped and orphaned the "Tags" toggle beside the count, so
    search+count and filters+prefs are now separate rows; and the R10 prefs were confirmed to
    actually change the rendering rather than just the store.
- **Gotcha worth remembering**: after swapping react-table v9 → v8 the dev server threw
  "Invalid hook call … more than one copy of React" from a stale Vite dep bundle. Fix is
  `rm -rf apps/web/node_modules/.vite` and restart `pnpm run dev` — not a code problem. Expect
  this after any dependency swap.
- **Open items for next session**: none blocking. **M10 (board, size M)** is next. Notes:
  (1) `useBoard(projectId, query)` and `useSprints(projectId)` exist; `boardQuerySchema` +
  `BACKLOG_SPRINT` are in shared — mirror M9's `validateSearch`/`withDefaults` split;
  (2) columns come from `STATUS_BY_TYPE[type]`, or `ALL_STATUSES` when the type filter is
  "All" (spec 04); (3) `@dnd-kit/core` is not installed yet; (4) spec 04 wants a card to be
  undraggable into a column invalid for its type rather than rejected after the drop, and
  `useMoveTicketStatus` is ready for the optimistic update (R9).

### M10 — Board (Kanban) view (done, 2026-09-08)
- **Files created** (`apps/web/src/features/board/`):
  - `columns.ts` — `columnsFor(type)`, **`canDrop(ticket, status)`**, `groupByStatus`. Pure and
    unit-tested; the drop rule is the same `STATUS_BY_TYPE` table the server validates against.
  - `useOptimisticMove.ts` — the R9 mutation with cache rollback.
  - `BoardPage.tsx`, `BoardColumn.tsx` (`useDroppable`), `BoardCard.tsx` (`useDraggable`),
    `searchParams.ts`, `columns.spec.ts` (11 tests).
- **Files modified**: `router.tsx` (board route + `validateSearch`), `apps/web/package.json`
  (`@dnd-kit/core@^6.3.1`).
- **Key decisions**:
  - **Invalid drops are prevented, not rejected.** Spec 04 offers a choice; it prefers this one.
    While a card is dragged, every column its type can't take is `disabled` on the droppable and
    dimmed, so the drop can't happen. `onDragEnd` still re-checks `canDrop` — a disabled
    droppable shouldn't be the only thing standing between a user and a bad request. **The
    server validates independently (R1); none of this is the control.**
  - **The optimistic update is scoped to the exact board query key.** `useOptimisticMove` takes
    the current `BoardQuery`, so it patches the cache entry actually on screen — patching a
    generic key would leave the visible board stale under any filter. `onMutate` cancels
    in-flight refetches first, or a response landing mid-drag would overwrite the optimistic move.
  - `onSettled` invalidates the board, the overview and the tickets list, because a status move
    changes `updated_at` and therefore the dashboard's KPIs and "recently updated" too.
  - `PointerSensor` uses a 5px activation distance so the card's key can stay a real `<Link>`
    to the detail view; without it the sensor swallows the click.
  - Search params mirror M9 exactly (`validateSearch` returns the stripped form,
    `withDefaults` fills at read time) — kept identical so the two filtered views behave the same.
  - Columns are `min-w-[170px]`, matching the prototype. Seven columns overflow a typical
    window by design; the board scrolls horizontally, as the prototype does.
  - `groupByStatus` drops a ticket whose status isn't in the visible column set rather than
    inventing a column for it.
- **Verification performed**:
  - `pnpm exec turbo run build typecheck test --force` — 8 tasks clean; 64 api + 31 web tests
    (11 new: column sets per type, the spec 04 "bug into Planned" case, epic-into-story-column,
    grouping with empty columns preserved, and the URL params).
  - **Driven in a real browser with actual mouse drags (Playwright + system Chrome)**:
    - Columns for Type=All were the 7-status union; Type=epic narrowed to
      `Planned / In Progress / Done`; Type=bug gave the six story/bug statuses.
    - Sprint filter listed `All / Backlog (no sprint) / Sprint 24-26`; `?sprint=backlog`
      returned only unassigned cards.
    - **A real drag of story NIM-3 into "In Review" moved the card and the server persisted
      `In Review`.**
    - **Dragging an epic dimmed exactly 4 of 7 columns** (the story/bug-only ones) and dropping
      it on Backlog left the server status unchanged.
    - **R9 rollback, with the response delayed 1.5s to make the window observable: the card
      showed in "Done" while the request was in flight, snapped back to "In Progress" on the
      400, surfaced "Move failed — the card snapped back", and the server was untouched.**
      (A first attempt sampled at 60ms and missed the window — the mocked failure returned
      faster than the sample; the delay is what makes this test meaningful.)
    - **Console errors: none.** Test data was restored afterwards.
  - Screenshots reviewed (`m10-board.png`, `m10-dragging.png`, `m10-final.png`,
    `m10-rollback.png`). The dimming and drag overlay were confirmed visually, and the clipped
    rightmost column led to matching the prototype's 170px column width.
- **Open items for next session**: none blocking. **M11 (ticket detail, size M)** is next.
  Notes: (1) `useTicket(id)`, `useUpdateTicket`, `useDeleteTicket`, `useAddComment` all exist;
  (2) the API's `GET /tickets/:id` already returns `statusOptions` and `storyOptions`, so the
  form's dropdowns need no client-side derivation; (3) spec 05 wants the draft/dirty pattern
  preserved — edits held locally, `PATCH` only on explicit Save; (4) delete is Admin/Manager
  only and must be hidden **and** guarded (`can('deleteTicket', role)` equivalent — the web
  side has no `can()` helper yet, so add one or read `PERMISSIONS` from shared);
  (5) the detail route already exists and cards/rows link to it.

### M11 — Ticket Detail view (done, 2026-09-08)
- **Files created**:
  - `apps/web/src/features/ticket-detail/useTicketDraft.ts` — **spec 05's draft/dirty pattern.**
    `draftFrom`, `changedFields`, `useTicketDraft`. Exported pure functions so the diffing is
    unit-tested without rendering.
  - `TicketDetailPage.tsx` (two-column layout, editable side panel, role-gated delete),
    `Comments.tsx`, `useTicketDraft.spec.ts` (7 tests).
  - **`packages/shared/src/permissions.ts`** — see below.
- **Files modified**: `router.tsx`; `apps/api/src/auth/permissions.ts` (now a re-export);
  `packages/shared/src/index.ts`.
- **Key decisions**:
  - **The role matrix moved from `apps/api/src/auth/permissions.ts` into
    `packages/shared/src/permissions.ts`.** M10's handoff flagged that the web had no `can()`
    helper; duplicating the matrix would have been two sources of truth for a spec 00 contract.
    The API file is now a re-export, so every `../auth/permissions` import still works and all
    64 API tests pass unchanged. `can()` also accepts `null | undefined` for the web, where no
    acting user may be selected yet. **The frontend uses it only to hide controls — spec 08 is
    explicit that this is UX and the server guard is the actual control.**
  - **`changedFields` sends only what changed**, so a PATCH never rewrites untouched columns,
    and null/undefined are treated as the same absence (an unset date is `null` from the API
    but `''` from a cleared date input). Verified live: the PATCH body was exactly
    `{"status":"Blocked","priority":"low"}`.
  - The draft re-seeds on `ticket.id` **and `ticket.updatedAt`**, so a successful save clears
    the dirty state without a manual reset — and editing a field back to its original value by
    hand goes clean again, since dirtiness is a diff rather than a touched flag.
  - **The detail page renders its own `AppShell`**, unlike every other route, because spec 05's
    header needs the loaded ticket's key and title plus a back link — data the route wrapper
    doesn't have. Reads "Tickets / NIM-6 Token leak on retry path".
  - `statusOptions` and `storyOptions` come straight from `GET /tickets/:id` (M6a) — the client
    derives neither. Fields absent for a type simply aren't rendered: an epic's panel shows
    only Status / Priority / Assignee / dates.
  - Delete asks for confirmation, then navigates back to the list on success.
- **Verification performed**:
  - `pnpm exec turbo run build typecheck test --force` — 8 tasks clean; 64 api + 38 web tests.
  - **Driven in a real browser (Playwright + system Chrome)**:
    - **Acting as a Developer the Delete button is absent; switching to Admin reveals it.**
    - Dirty tracking: Save disabled before any edit → enabled after changing status →
      **disabled again after reverting the change by hand** → "Saved ✓" after saving, reverting
      to "Save changes" ~2s later.
    - The PATCH carried only the two changed fields and the server reflected `Blocked / low`.
    - **R6: a comment posted while acting as Diego Ramirez was stored with him as author** and
      the Activity count went 2 → 3.
    - All eight side-panel dropdowns verified by reading their rendered options:
      status (6 story/bug values), priority, assignee (Unassigned + 8), environment, epic,
      **story limited to NIM-3/NIM-4 — both under the bug's own epic NIM-1, excluding NIM-5
      which sits under a different epic**, sprint (Backlog + 3), size.
    - An **epic's** panel correctly omits environment, epic/story and sprint/size.
    - The header back link returns to the tickets list. **Console errors: none.**
  - Screenshots reviewed (`m11-detail.png`, `m11-final.png`, `m11-epic.png`); the missing
    header breadcrumb was caught this way and fixed.
- **Gotcha (dev environment, not code)**: running `turbo run build --force` while
  `pnpm run dev` is up **kills the API** — nest-cli's `deleteOutDir` wipes `dist/` under the
  running watcher, which then dies with `Cannot find module './app.module'`. Restart
  `pnpm run dev`. Don't run a forced build against a live dev server.
- **Open items for next session**: none blocking. **M12 (create ticket, size M)** is next.
  Notes: (1) `useCreateTicket(projectId)` exists and `ticketCreateSchema` is the shared
  discriminated union — validate the form with it so client and server agree;
  (2) the Epic type option must be hidden for Developers — use `can('createEpic', role)`, now
  importable from shared; (3) the bug form's Story dropdown must filter to stories under the
  selected epic, and the epic can change while the form is open, so it needs a live query
  rather than M11's server-computed `storyOptions`; (4) submit navigates to the new ticket's
  detail view (spec 06).

### M12 — Create Ticket view (done, 2026-09-08)
- **Files created** (`apps/web/src/features/create-ticket/`):
  - `buildPayload.ts` — `emptyForm`, `parseLabels`, **`buildPayload`** (flat form → the
    discriminated union) and **`validate`** (against the shared `ticketCreateSchema`). Pure, so
    the branching is unit-tested without rendering.
  - `CreateTicketPage.tsx`, `buildPayload.spec.ts` (11 tests).
- **Files modified**: `router.tsx`; **`packages/shared/src/schemas.ts`** (see below).
- **Key decisions**:
  - **The form validates with the same `ticketCreateSchema` the API enforces**, so it cannot
    offer a payload the server would reject. Zod issues are mapped to field-keyed inline errors
    and only shown after a submit attempt, not while typing.
  - **Human-readable validation messages were added to the shared schema** — it previously
    surfaced raw Zod text ("String must contain at least 1 character(s)", "Invalid uuid")
    straight into the form. They now read "Title is required" / "An epic is required for a
    story or bug". **This improves the API's 400 responses too**, since both sides share the
    schema; that was the reason to fix it in `shared` rather than paper over it in the form.
  - `buildPayload` **omits** fields that don't belong to the chosen type rather than sending
    them as null — the discriminated union rejects unknown members. `reporter` is never sent
    (spec 06: server fills it from the acting user).
  - Type pills are **filtered**, not disabled: `can('createEpic', role)` from shared hides Epic
    from Developers, as spec 06 requires. A guard also resets the form if the acting user
    switches to a Developer while Epic is selected. **The server re-checks this (M5a).**
  - The Story dropdown is a **live query** keyed on the currently selected epic, not the
    server-computed `storyOptions` M11 uses — here the epic can change while the form is open,
    and a story chosen under the previous epic is cleared when it does (R5).
  - Form defaults (`env: staging`, `size: m`, `severity: 3`, `priority: medium`) exist because
    the shared schema requires those on story/bug with no defaults of its own; a Story/Bug form
    is therefore valid as soon as a title and epic are set.
  - A project with **no epics** shows an explicit amber note ("create an epic first") rather
    than an empty dropdown and an unexplained validation failure.
  - Switching type preserves title and description but resets type-specific fields.
- **Verification performed**:
  - `pnpm exec turbo run build typecheck test --force` — 8 tasks clean; 64 api + 49 web tests.
  - **Driven in a real browser (Playwright + system Chrome)**:
    - **As a Developer the type pills are `Story / Bug`; as a Manager, `Epic / Story / Bug`.**
    - Field branching verified by reading the rendered labels: epic has no env/severity/
      epic/story/sprint/size; story adds epic/sprint/size; bug adds severity, environment and
      the story link.
    - Submitting an empty form showed the new inline messages.
    - **The story dropdown tracks the selected epic: NIM-1 → NIM-3/NIM-4, NIM-2 → NIM-5**, and
      reads "Pick an epic first" before one is chosen.
    - **A full bug submission navigated to the new ticket's detail view** (header
      "Tickets / NIM-13 Payment webhook retries stall") and the stored row was
      `type=bug, status=Backlog, severity=3, env=staging, epic=NIM-1, story=NIM-3,
      labels=[payments, urgent]` with **`reporter: Aisha Patel` — the acting user, never the
      form**. The test ticket was deleted afterwards. **Console errors: none.**
  - Screenshots reviewed (`m12-form.png`, `m12-created.png`, `m12-final.png`). This caught a
    real rendering bug: a blanket `capitalize` class title-cased the placeholder into
    "Select An Epic…", so enum labels are now capitalised in JS and sizes render "XS/S/M/L/XL".
- **Open items for next session**: none blocking. **M13 (People & users, size S)** is next —
  the last feature module. Notes: (1) `useUsers()` exists but there are **no user-mutation
  hooks yet** — `api.users.create/update` exist in `api/endpoints.ts`, so add
  `useCreateUser`/`useUpdateUser` to `api/queries.ts` alongside the ticket ones;
  (2) "Add team member" and the edit form are Admin-only — use `can('manageUsers', role)`;
  (3) spec 07 has **no delete**, deliberately; (4) `userCreateSchema`/`userUpdateSchema` are in
  shared — validate the form with them as M12 does; (5) after M13, only **M14 (testing
  hardening + Playwright e2e + GitHub Actions CI)** remains, which still owes the decision about
  running `test:integration` (and now the web suite) in CI with a live Postgres.

### M13 — People & Users views (done, 2026-09-08)
**Last feature module — every view in the plan now exists.** Only M14 (testing/CI) remains.

- **Files created** (`apps/web/src/features/people/`):
  - `PeoplePage.tsx` (list), `UserDetailPage.tsx` (Admin-editable + read-only summary),
    `CreateUserPage.tsx`, `UserFields.tsx` (the four fields, shared by create and edit),
    `userForm.ts` (`validate`, `changedFields`), `userForm.spec.ts` (7 tests).
- **Files modified**:
  - `api/queries.ts` — added `useUser`, `useCreateUser`, `useUpdateUser` (M12's handoff noted
    these were missing; the endpoint functions already existed).
  - `router.tsx` — `people/new` and `people/$userId` routes. **`people/new` is declared as a
    static path so it wins over `people/$userId`**; a `new` id would otherwise be treated as a
    user id.
  - **`packages/shared/src/schemas.ts`** — human-readable messages on `userCreateSchema`
    ("Name is required", "Enter a valid email address"). M12 did this for the ticket schemas
    but not the user one, so the People form was still showing raw Zod text
    ("String must contain at least 1 character(s)", "Invalid email"). **This improves the
    API's 400 responses too.**
- **Key decisions**:
  - Admin-only is applied in three places, all of which matter: the "Add team member" button is
    hidden, the detail's edit fields are replaced by the read-only summary, and
    `/people/new` reached by URL shows an explanation rather than a form that would fail on
    submit. **All three are UX — the server's guard is the control (R3, spec 08).**
  - The detail view has a **dirty check** (Save disabled until something differs, "Saved ✓"
    after), matching M11. Spec 07 notes the prototype always allowed Save; this is a
    deliberate improvement, and the PATCH carries only changed fields.
  - No delete anywhere — spec 07 explicitly defers it, because removing a user who is an
    assignee/reporter needs a decision nobody has made. There is no `DELETE /users` endpoint
    either (M3).
  - Both forms validate with the shared user schemas, as M12's ticket form does.
- **Verification performed**:
  - `pnpm exec turbo run build typecheck test --force` — 8 tasks clean; 64 api + 56 web tests.
  - **Driven in a real browser (Playwright + system Chrome)**:
    - **As a Developer**: 8 users listed with role badges, no "Add team member", and a user's
      detail page renders **zero edit inputs and no Save button** — just the summary.
      Navigating directly to `/people/new` shows the Admin-only explanation.
    - **As an Admin**: the button appears; editing Tom Whitfield's role sent
      **`PATCH {"role":"manager"}`** (only the changed field), the button went to "Saved ✓" and
      the role badge updated in place.
    - Creating "Nina Reyes" navigated to her new detail page showing the right email,
      department and role; a second create with the same email surfaced
      **"A user with email nina.reyes@nimbus.io already exists"** (the API's 409).
    - Validation messages re-checked after the schema fix: "Name is required" /
      "Enter a valid email address". **No page errors.**
    - Test data cleaned up: Nina Reyes deleted (via psql — there is no delete endpoint by
      design) and Tom Whitfield restored to `developer`. DB back to 8 users / 8 tickets.
  - Screenshots reviewed (`m13-people.png`, `m13-detail-dev.png`, `m13-created.png`,
    `m13-validation.png`).
- **Open items for next session**: none blocking. **M14 (testing hardening + CI) is the last
  module.** What it inherits:
  1. **The CI decision that has been outstanding since M4**: `pnpm test` (turbo) runs only the
     unit suites — 64 api + 56 web. The **30 API integration tests need a live Postgres** and
     run separately via `pnpm --filter @ticket-tracker/api run test:integration`. CI must stand
     up a Postgres service, run migrations + seed, and run that suite too, or a third of the
     backend coverage never runs.
  2. Playwright e2e: there is **no Playwright dependency in the repo** — every browser check so
     far was driven from a scratch directory against the system Chrome. M14 should add it
     properly as a dev dependency with its own config.
  3. `apps/api/Dockerfile` and `apps/web/Dockerfile` **do not exist**, though
     `docker-compose.yml` references `build:` paths for both (noted since M1). Only the
     `postgres` service is usable today.
  4. Spec 09 is the source spec and has not been re-read since M1 — start there.

### M14 — Testing hardening & CI (done, 2026-09-08)
**Final module. All 16 are complete.** This one also closed the four items carried since M1/M4.

- **Files created**:
  - `eslint.config.mjs` — flat config for the whole monorepo, plus `lint` scripts in all three
    workspaces. **Nothing linted before this**: `turbo run lint` was a no-op because no
    workspace defined the script, even though spec 09's pipeline includes a lint stage.
  - `playwright.config.ts`, `e2e/fixtures.ts`, `e2e/happy-path.spec.ts`, `e2e/rules.spec.ts`.
  - `apps/api/Dockerfile`, `apps/web/Dockerfile`, `.dockerignore`.
  - `.github/workflows/ci.yml` — four jobs: `verify`, `integration`, `e2e`, `docker`.
- **Files modified**: `docker-compose.yml` (rewritten), root/workspace `package.json` scripts,
  `.gitignore`, and three files whose dead imports lint caught.
- **Key decisions**:
  - **CI is split so slow work doesn't gate fast feedback** (spec 09). `verify` runs
    typecheck → lint → unit → build with no database. `integration` runs a Postgres **service
    container**, migrates, seeds, and runs the API's 55 integration tests — **this is the
    decision outstanding since M4**; without this job the key-sequence race and R2 isolation
    coverage would never run in CI. `e2e` is a separate job, and `docker` proves the images
    build.
  - **ESLint is deliberately type-unaware.** `turbo run typecheck` already runs the real
    compiler over every workspace; enabling typed linting would roughly double CI time to
    re-find the same errors. `react-hooks/exhaustive-deps` is a **warning**, not an error —
    five effects intentionally omit stable setters and are annotated at the call site; making
    it an error would only invite blanket disables.
  - **Compose was wrong and had never been run.** `build: ./apps/api` used the app directory as
    context, which cannot work: both apps import `packages/shared` through the pnpm workspace,
    so **the build context must be the repo root** (`context: .` + `dockerfile:`). Also added a
    Postgres healthcheck, a one-shot `migrate` service (spec 09 suggested exactly this) that
    `api` waits on via `service_completed_successfully`, and explicit env.
  - The web image builds the SPA and serves it with nginx, whose config has a
    `try_files … /index.html` fallback — without it, refreshing on `/projects/<id>/board`
    would 404. `VITE_API_URL` is a build arg because Vite inlines env at build time, and it
    points at the **host** port since the browser resolves it, not the container.
  - **E2E specs run inside the seeded projects (VEG, ATL) rather than creating their own.**
    The first version created a project per run — but there is no `DELETE /projects` endpoint,
    so they accumulated and eventually collided on `key_prefix`. **18 junk projects from that
    version were cleaned out of the dev database.** Working inside a known-empty seeded project
    is repeatable, since `db:seed` is idempotent.
  - `E2E_CHANNEL=chrome` runs the suite against an installed Google Chrome locally; CI installs
    Playwright's bundled Chromium. Workers are pinned to 1 — the specs share one database, so
    parallel workers would race and produce flaky failures.
- **Verification performed** (every CI stage was run locally, not just written):
  - `pnpm run typecheck` — 4 tasks clean. `pnpm run lint` — **0 errors**, 5 annotated warnings.
    `pnpm run test` — 64 api + 56 web. `pnpm run build` — 3 tasks clean.
  - `pnpm run test:integration` — **55 tests** against the Compose Postgres.
  - `docker build` for both images: the API image **failed first** on a multi-source `COPY`
    where only the first path was absolute — fixed, and both images now build.
  - **`docker compose up -d --build` brought the whole stack up for the first time ever**:
    postgres healthy → `migrate` applied and exited 0 → api → web. Verified against the
    *containerised* stack: `/health` 200, Swagger 200, SPA root 200, and a **deep link
    `/projects/x/board` 200, proving the nginx SPA fallback**; the API returned all 8 users
    and 3 projects. (The migrate log's Postgres lines are `NOTICE` "already exists, skipping",
    not errors — it is correctly idempotent.)
  - **`pnpm run test:e2e` — all 5 specs pass against the containerised stack**, covering spec
    09's happy path (create → list → drag on board → edit detail → comment → Developer cannot
    delete → Manager deletes) and its two priority areas: multi-project isolation and
    status-by-type validation, each checked in the UI *and* directly against the API to prove
    the server is the control.
  - **The e2e suite was checked for teeth**: deliberately breaking one assertion made it fail
    with the real page contents, confirming the fast (~2s) run time is genuine and not the
    suite silently skipping work.
  - Database restored afterwards: 3 projects, 8 users, 9 sprints, and only the 8 Nimbus demo
    tickets.
- **Known gaps, deliberately not closed**:
  - No deployment stage — spec 09 says hosting is undecided; the pipeline stops at
    "build succeeds and tests pass".
  - Frontend tests are Vitest-only; spec 09 mentions Testing Library, but the logic worth
    testing (dirty-state, URL-param sync, payload building, board rules) was extracted into
    pure functions and is covered there, with rendering covered by the e2e suite instead.
  - `db:seed` is still manual in Compose (`docker compose run --rm migrate pnpm run db:seed`),
    matching spec 09, which only asks for migrations to be automated.

## Completion (Phase 5)

**All 16 modules complete, 2026-09-08.** M5 and M6 were each split in two mid-build (M5a/M5b,
M6a/M6b), recorded in PLAN.md at the time.

### What was built
A full-stack multi-project ticket tracker, replacing a static prototype:
- **`packages/shared`** — enums, Zod schemas, DTOs and the role matrix, consumed by both sides
  so validation and permissions cannot drift. Dual CJS/ESM.
- **`apps/api`** — NestJS + CQRS + Drizzle. 15 routes across users, projects, sprints and
  tickets, with the server-side rules the prototype lacked: status validated per ticket type,
  epic/story consistency, race-safe per-project ticket keys, and the role matrix in guards.
- **`apps/web`** — React + TanStack Router/Query/Table + Zustand + dnd-kit. Overview, list,
  board, ticket detail, create, and people views, with filters in the URL.
- **Infra** — Docker Compose (postgres + migrate + api + web), and CI running typecheck, lint,
  unit, integration, build, e2e and image builds.

### Coverage at completion
| Suite | Count | Needs a database |
|---|---|---|
| API unit (`pnpm run test`) | 64 | no |
| Web unit (`pnpm run test`) | 56 | no |
| API integration (`pnpm run test:integration`) | 55 | **yes** |
| Playwright e2e (`pnpm run test:e2e`) | 5 specs | **yes**, plus running apps |

### How the requirements landed
Every R from SPEC.md is implemented and tested: R1 status-by-type and R2 project isolation are
covered in unit, integration *and* e2e (spec 09 named them the two riskiest); R3 role matrix,
R4 race-safe keys, R5 epic/story consistency, R6 comment authorship, R7 URL-driven filters,
R8 server-side pagination, R9 optimistic board moves with rollback, and R10 client view prefs.

### Deviations from SPEC.md worth knowing
1. **The frontend imports shared DTOs instead of generating a client from OpenAPI** (decided
   with the user in M7). The API builds its responses from the same types, so they cannot
   drift, and codegen would only restate them.
2. **`GET /projects/:id/sprints` and seeded sprints were added in M6b** — spec 04's board Sprint
   filter needed sprints, but no module in the original plan ever created or listed them.
3. **Ticket delete cascades comments but refuses while child tickets link to it** (409) —
   decided with the user in M5b; no spec covered it.
4. **`avgResolutionDays` uses `updated_at`** because spec 00 defines it that way, so any later
   edit to a Done ticket inflates it. A real `resolved_at` column would be the fix.

### Backlog triage
- *Full ~20-row prototype seed dataset* — **not needed.** The 8 users / 3 projects / 9 sprints
  seed plus the demo tickets created during verification proved sufficient throughout.
- *User deletion strategy* — **still open, deliberately.** Spec 07 defers it and there is no
  `DELETE /users` endpoint. Needs a product decision (soft-delete / reassign / block) before
  anyone builds it.
- *Per-project team membership (`project_members`)* — **still open**, additive whenever wanted.
- *Sprint CRUD UI* — **partially closed.** Sprints are readable and seeded (M6b); management UI
  remains unspec'd.
- *New:* no deployment target — CI stops at "build succeeds and tests pass" per spec 09.
- *New:* `docker compose` seeding is manual (`docker compose run --rm migrate pnpm run db:seed`).

### Running it
```bash
docker compose up -d --build                                   # whole stack
docker compose run --rm migrate pnpm run db:seed               # first-run demo data
# or, for development:
docker compose up -d postgres && pnpm install && pnpm run dev  # api :3000, web :5173
```

---

## Phase 2 opened — real authentication & authorization (2026-09-09)

**Trigger**: an audit of the v1 auth surface, requested by the user, followed by a decision
review. Spec 08 always described the acting-as header as role *simulation*; this phase replaces
it with real access control.

### What the audit found
The v1 mechanism works exactly as spec 08 described, and three gaps sit outside what spec 08
covered at all:
1. **Every `GET` is unauthenticated.** The full user directory (with email addresses), every
   project, and every ticket are readable by anyone who can reach the API — the acting-user
   header is only attached to mutations, and no read route carries `@Roles`.
2. **No tenancy on identity.** Projects are the boundary for *data* (R2) but not for *people*:
   any recognized user may write to any project. The `project_members` backlog item was the
   placeholder for this.
3. **Nothing prevents the platform being orphaned.** `PATCH /users/:id` lets the last admin
   demote themselves, with no audit trail of the role change.

None of these are defects against v1's specs. They are the reason v1's spec said not to deploy
it anywhere real.

### What was decided (see SPEC.md → D-auth2, D-scope, D-ownership)
JWT access + rotating refresh with reuse detection; refresh in an `HttpOnly` cookie, access
token in memory; admin-created accounts activated by single-use invite; per-project roles that
override the global role, with global `admin` as a platform superuser; record-level ownership on
assignment, deletion, and comment editing; acting-as retained only behind
`AUTH_DEV_IMPERSONATION`, refused at boot in production.

### Documents produced
- `specs/10-authentication-and-authorization.md` — functional spec, R11–R19, threat model.
- `docs/auth-tech-spec.md` — schema, token lifecycle, guard chain, config, test plan.
- `docs/plan/PLAN.md` — modules M15–M21.

### Next module
**M15 — Auth schema, migration & backfill.** No dependencies; start there. Read spec 10 §3 and
§5 before writing code — the `effectiveRole()` rule and the 404-not-403 decision drive
everything downstream.

### M15 — Auth schema, migration & backfill (done, 2026-09-09)

- **Files created**:
  - `apps/api/src/db/schema/project-members.ts` — composite PK `(project_id, user_id)`, role
    reusing `userRoleEnum`, `project_members_user_idx` for the "my projects" path.
  - `apps/api/src/db/schema/refresh-tokens.ts` — one row per issued token; `family_id` groups a
    session's rotations, `used_at` is what makes reuse detectable (R16).
  - `apps/api/src/db/schema/invites.ts`, `auth-events.ts`.
  - `apps/api/drizzle/0001_smart_wiccan.sql` + `meta/0001_snapshot.json`.
  - `apps/api/src/users/user.mapper.spec.ts` — the R17 regression test.
- **Files modified**: `apps/api/src/db/schema/users.ts` (status + credential columns),
  `tickets.ts` (`reporter_id`), `schema/index.ts`, `apps/api/src/db/seed.ts`,
  `packages/shared/src/enums.ts` (`USER_STATUSES`), `apps/api/package.json` (argon2), `README.md`.

- **Decisions and deviations**:
  1. **`tickets.reporter_id` added — a scope change, agreed with the user mid-module.** v1 stores
     the reporter as a *display name* (`reporter: text`, set from `actingUser.name`), but the tech
     spec's ownership rules authorize against `ticket.reporterId`. You cannot hang a permission on
     a display name: names are not unique and a rename would silently move delete rights. M19 was
     therefore unbuildable as written. Resolution: add a nullable FK, backfill it by exact name
     match, and keep the text column as the historical display value so no query, DTO or view
     changes. **All 9 existing tickets resolved**; the backfill deliberately skips ambiguous names
     (`count(*) = 1` guard), leaving null, which fails the ownership check safely.
  2. **The seed upserts credentials instead of skipping existing users.** `onConflictDoNothing`
     would have left the eight users on any pre-existing dev database `invited` with no password —
     i.e. unable to log in the moment M17 lands. It now re-asserts `status`/`password_hash` only,
     so a locally edited name, department or role survives a re-seed.
  3. **argon2 is a direct dependency of `apps/api` and hashing is inline in `seed.ts`**, with the
     OWASP params exported as `ARGON2_OPTIONS`. M16 must lift these into `password.service.ts` and
     re-point the seed at it. This was the agreed alternative to pulling M16's service forward.
  4. **`USER_STATUSES` went into `packages/shared`**, matching how `USER_ROLES` already drives
     `userRoleEnum`, rather than declaring the pg enum inline as the tech spec sketched.
  5. **The `User` DTO is unchanged.** `status` exists in the database but is not yet on the wire —
     M17/M21 add it when there is something that reads it. Keeping M15 schema-only meant zero
     frontend churn.
  6. **`assertLocalDatabase()` guards the seed.** It writes a known password onto every account, so
     a non-local `DATABASE_URL` is refused unless `SEED_ALLOW_REMOTE=true`.

- **Verification** (all run, all passing):
  | Check | Result |
  |---|---|
  | `drizzle-kit generate` + `migrate` against the dev DB holding v1 data (8 users, 3 projects, 9 tickets, 5 comments) | applied cleanly |
  | Backfill: `project_members` | 24 rows = 3 projects × 8 users, 0 role mismatches |
  | Backfill: `tickets.reporter_id` | 9/9 resolved, 0 null, 0 unmatched names |
  | Migrate + seed against a **fresh** database (`m15_fresh`, since dropped) | clean; 8 active users, 24 memberships |
  | Seed idempotency (run twice) | no duplicate users, memberships or sprints |
  | Password hashes | `$argon2id$v=19$m=19456,p=1,t=2$…` on all 8 |
  | `assertLocalDatabase` | refuses a remote host; `SEED_ALLOW_REMOTE=true` bypasses |
  | API unit | 67 passed (was 64; +3 mapper tests) |
  | Web unit | 56 passed, unchanged |
  | API integration | 55 passed, **unchanged** — the additions are backward compatible |
  | `pnpm run typecheck` / `lint` | clean across all workspaces |

- **Gotchas for the next session**:
  - **`argon2` is a native module.** It builds via `node-gyp-build` on install. The API Dockerfile
    likely prunes build dependencies — M16 or M17 must verify the built image still starts, and
    this has *not* been checked yet. It is the most likely surprise in this phase.
  - Integration tests currently share the dev database. Once M17 adds auth fixtures, they will
    need their own database or a truncation strategy — the seed's `active` users are now part of
    the fixture surface.
  - The dev password `DevPassw0rd!2026` is in `seed.ts` and `README.md`. M16's password policy
    (≥12 chars) must not reject it, or the seed breaks — it is 16 characters, so it passes, but
    keep it in mind when writing the common-password list.
  - `users.status` defaults to `invited`, so **any user created by the existing
    `POST /users` right now cannot ever log in.** That is correct and intentional, but it means
    M17's invite flow is not optional — without it, admins can create dead accounts.

- **Next**: M16 — password, invite & token services. No blockers.

### M16 — Password, invite & token services (done, 2026-09-09)

The credential primitives, with no HTTP surface. M17 wires them to routes.

- **Files created**:
  - `packages/shared/src/password-policy.ts` — `checkPassword()`, `COMMON_PASSWORDS`,
    `PASSWORD_MIN_LENGTH`, issue messages.
  - `apps/api/src/auth/password.service.ts` — argon2id hash/verify, `verifyDummy` for login
    timing equalisation, `assertAcceptable` throwing a Zod-shaped 400. Exports `ARGON2_OPTIONS`.
  - `apps/api/src/auth/token.service.ts` — HS256 sign/verify with pinned algorithm, issuer and
    audience; opaque refresh generation + sha256.
  - `apps/api/src/auth/session.service.ts` — issue / rotate / isFamilyActive / revokeFamily /
    revokeAllForUser / listForUser.
  - `apps/api/src/auth/invite.service.ts`, `audit.service.ts`.
  - Tests: `password.service.spec.ts` (13), `token.service.spec.ts` (15),
    `session.int-spec.ts` (10), `invite.int-spec.ts` (8).
- **Files modified**: `packages/shared/src/{index,schemas,types}.ts` (login / password-change /
  invite-accept schemas; `Membership`, `SessionSummary`, `AuthResult` DTOs),
  `apps/api/src/auth/auth.module.ts`, `apps/api/src/db/seed.ts`, `apps/api/package.json`
  (jsonwebtoken), `apps/api/.env.example`.

- **Two real bugs, both caught by tests that were written to catch exactly them**:
  1. **Reuse detection was silently a no-op.** `rotate()` threw `UnauthorizedException` from
     *inside* `db.transaction`, which rolls the transaction back — undoing the family revocation
     and the audit row it had just written. The request still failed with a 401, so from the
     outside it looked correct while a stolen session stayed alive. The transaction now returns a
     verdict and the exception is raised **after the commit**. This is the single most important
     line of this module; anything later that adds a throw inside that transaction reintroduces it.
  2. **`listForUser` reported "unknown device"** whenever the newest token in a family carried no
     user-agent (rotation need not pass request context). Now takes the most recent *non-null*
     value via `array_agg(...) FILTER (WHERE ... IS NOT NULL)`.

- **Decisions and deviations from PLAN.md**:
  1. **The policy lives in `packages/shared`, not in `password.service.ts`** as the plan listed.
     Spec 10 §6 requires the invite page to render a live policy checklist, so both sides need
     the rule — the same argument that put `PERMISSIONS` there. The service wraps it and owns
     enforcement.
  2. **`COMMON_PASSWORDS` is filtered to entries ≥ 12 characters.** Anything shorter is already
     rejected on length, so keeping it would make the check look broader than it is. Consequence
     worth knowing: `too_short` and `too_common` can never both fire, and a test asserting all
     three issues at once is unwritable.
  3. **`TokenService` is registered with `useFactory`.** Its constructor takes plain strings
     (secret, TTL) defaulted from env; Nest would try to resolve `String` as a provider and fail
     at bootstrap. The factory also keeps it `new`-able in unit tests.
  4. **Login does not apply the password policy** — only invite-accept and password-change do. An
     existing password predating a policy change must still be presentable, and rejecting
     non-policy-shaped submissions early tells an attacker something for free.
  5. **`seed.ts` now imports `ARGON2_OPTIONS` from the service**, closing M15's deviation 3.

- **Verification**:
  | Check | Result |
  |---|---|
  | API unit | 95 passed (was 67; +28) |
  | API integration | 73 passed (was 55; +18) |
  | Web unit | 56 passed, unchanged |
  | typecheck / lint | clean |
  | API boots via `nest build` + `node dist/main.js`, `GET /users` and `/projects` | 200, no errors |
  | Boot with a 8-byte `AUTH_JWT_SECRET` | exits 1: "must be at least 32 bytes (got 8)" |
  | Boot with no `AUTH_JWT_SECRET` | exits 1: "is not set" |
  | **argon2 inside `node:22-alpine`** | **hashes correctly; container boots and serves 200** |

- **M15's flagged native-module risk is CLOSED.** `docker build -f apps/api/Dockerfile` succeeds,
  argon2 loads and hashes in the image, and the container serves. No Dockerfile change was
  needed: the runtime stage copies `node_modules` from the build stage on the same base image,
  and argon2 ships a musl prebuild, so nothing is compiled.

- **Gotchas for the next session (M17)**:
  - **`tsx` cannot run the Nest app.** esbuild does not emit `design:paramtypes`, so DI fails with
    "Cannot read properties of undefined (reading 'getAllAndOverride')". Use `nest start` or
    `node dist/main.js`. The seed is fine under tsx because it uses no DI. This cost time here;
    it will look like a real bug to whoever hits it next.
  - `AUTH_JWT_SECRET` is now **required to boot**. It is set in `apps/api/.env` (gitignored) and
    documented in `.env.example`. CI and `docker-compose.yml` do **not** set it yet — M17 must add
    it to both, or the API container stops starting.
  - `SessionService.isFamilyActive()` is the per-request check AuthGuard needs for R15. It is one
    indexed query; do not cache it across requests without re-deriving R15.
  - `AuditService.record()` takes an optional executor so callers can enlist it in their own
    transaction. Reuse detection depends on that — record and revoke must commit together.
  - Integration tests create and delete their own users; they no longer rely purely on seed data.

- **Next**: M17 — auth endpoints & AuthGuard. No blockers.

### M17 — Auth endpoints & AuthGuard (done, 2026-09-09)

Real login exists. The app still runs on the legacy header because the web app has no login
screen until M20 — that is what `AUTH_DEV_IMPERSONATION` is for.

- **Files created**: `apps/api/src/auth/` — `auth.controller.ts`, `auth.service.ts`,
  `auth.guard.ts`, `auth-context.ts`, `public.decorator.ts`, `current-user.decorator.ts`,
  `cookies.ts`, `dev-impersonation.ts`, `login-throttler.guard.ts`; tests
  `auth.int-spec.ts` (27), `cookies.spec.ts` (3), `dev-impersonation.spec.ts` (3).
- **Files deleted**: `apps/api/src/auth/acting-user.guard.ts`.
- **Files modified**: `auth.module.ts`, `roles.guard.ts`, `acting-user.decorator.ts`,
  `main.ts`, `app.controller.ts`, `users.controller.ts`, `users.module.ts`,
  `commands/{create,update}-user.command.ts`, `user.mapper.ts`,
  `packages/shared/src/{types,schemas}.ts`, `apps/web/src/api/endpoints.ts`,
  `apps/web/src/features/people/CreateUserPage.tsx`, `docker-compose.yml`,
  `.github/workflows/ci.yml`, `vitest.integration.config.ts`.

- **The central design decision — what the dev flag actually means.** `AUTH_DEV_IMPERSONATION`
  does not merely accept `X-Acting-User-Id`; it restores **v1 semantics wholesale**, including
  letting an unauthenticated request through as anonymous so `RolesGuard` can answer 403 on
  guarded routes while open reads stay open. Anything narrower would have broken the current web
  app immediately, and PLAN.md's phase note commits to M15–M18 keeping the app working. With the
  flag off — the only supported production configuration — R11 applies in full: every non-public
  route needs a verified token and the legacy header is inert. Both configurations are tested.

- **Decisions and deviations**:
  1. **Rate limiting is keyed on ip + email**, via a `LoginThrottlerGuard` subclass. The default
     tracker keys on IP alone, which punishes everyone behind one NAT for one person's typo and
     lets an attacker spray a whole user list from one host without tripping. This is what the
     acceptance criterion said; the default was not it.
  2. **`POST /users` now returns `{user, inviteUrl, inviteExpiresAt}`**, not a bare `User`. The
     web app was updated in the same commit — it read `user.id` to navigate, which would have
     been `undefined`.
  3. **`CreateUserPage` no longer navigates away on success**; it shows the invite link with a
     Copy button. This is scope pulled forward from M21, and it is not optional: the link is
     stored only as a digest and returned once, so navigating away stranded an account nobody
     could ever activate.
  4. **`User` gained `status`**, and `toUser` now takes a `UserFields` projection rather than a
     whole row, so `AuthGuard` can load a user without ever selecting `password_hash` (R17).
  5. **`RolesGuard` and `@ActingUser()` survive untouched**, reading a `req.actingUser` mirror
     that `AuthGuard` sets. M18 deletes both. This kept the diff to identity, not authorization.
  6. **Login never applies the password policy** — only invite-accept and password-change do.
  7. **Integration tests now transform with SWC** (`unplugin-swc`). See gotchas.

- **Verification**:
  | Check | Result |
  |---|---|
  | API unit | 101 passed (was 95) |
  | API integration | 100 passed (was 73) |
  | Web unit | 56 passed, unchanged |
  | typecheck / lint | clean (5 pre-existing web warnings) |
  | **e2e, unchanged, against a rebuilt Compose stack** | **5/5 passed** |
  | Boot: `NODE_ENV=production` + `AUTH_DEV_IMPERSONATION=true` | exits 1, refuses to start |
  | Production config: `/health` 200, `/users` 401, legacy header 401 | as specified (R11) |
  | Dev config: anonymous reads 200, developer epic-create 403, admin-only 403 | v1 behaviour intact |
  | Login failure uniformity (unknown / wrong / invited / disabled) | one status, one message |
  | Rate limit, guard left in place | 10× 401 then 429; a different email is unaffected |
  | Disable account → live token stops working on the next request | verified (R15) |

- **Gotchas for the next session (M18)**:
  - **Vitest needed `unplugin-swc` to boot Nest.** esbuild emits no `design:paramtypes`, so every
    injected dependency was `undefined` and all 22 HTTP tests failed identically. Only
    `vitest.integration.config.ts` has the plugin; the unit config does not need it because unit
    tests construct their subjects by hand. If M18's guard tests boot the app, use the
    integration config.
  - **The throttler is real and will bite test suites.** The auth suite gives each login a
    distinct `X-Forwarded-For` and enables `trust proxy`, rather than weakening the limit. Any
    new suite that logs in repeatedly must do the same.
  - **Do not throw inside `db.transaction`** — see M16's handoff. `AuthService.acceptInvite` and
    `changePassword` deliberately do their revocation outside the invite transaction.
  - `AuthGuard` costs one user lookup + one session check per request. That is what makes R15
    true; M18's `ProjectScopeGuard` adds a third query on ticket routes. If that becomes a
    problem, batch them in one guard rather than caching across requests.
  - `req.auth.projectId` / `projectRole` are already declared on `AuthContext` and unset — M18
    fills them in.
  - `docker-compose.yml` and CI now set `AUTH_JWT_SECRET` and `AUTH_DEV_IMPERSONATION=true`.
    Turning the flag off in Compose before M20 will make the web app unusable, by design.

- **Next**: M18 — project membership & scope guard. No blockers.

### M18 — Project membership & scope guard (done, 2026-09-10)

Per-project roles are enforced, and a non-member can no longer tell a project exists. The app
still runs on `AUTH_DEV_IMPERSONATION`; the flag's anonymous branch is what keeps the pre-M20
web app working, and it is now the *only* thing that does.

- **Files created**: `apps/api/src/auth/` — `project-scope.guard.ts`, `project-scope.decorator.ts`,
  `permission.guard.ts`, `require.decorator.ts`, `auth-context.fixture.ts`, `permissions.spec.ts`
  (64), `project-scope.int-spec.ts` (26); `apps/api/src/projects/` — `members.controller.ts`,
  `queries/get-members.query.ts`, `commands/{add,update,remove}-member.command.ts`,
  `commands/project-admins.ts`.
- **Files deleted**: `apps/api/src/auth/` — `roles.guard.ts`, `roles.guard.spec.ts`,
  `roles.decorator.ts`, `acting-user.decorator.ts`, `permissions.ts` (the re-export shim).
- **Files modified**: `packages/shared/src/{permissions,schemas,types}.ts`;
  `apps/api/src/auth/{auth-context,auth.guard,auth.module}.ts`;
  `apps/api/src/{users/users.controller,projects/projects.controller,projects/projects.module,tickets/tickets.controller}.ts`;
  `apps/api/src/projects/queries/get-projects.query.ts`;
  `apps/api/src/projects/commands/create-project.command.ts`;
  `apps/api/src/tickets/commands/{create-ticket,add-comment}.command.ts`; four ticket int-specs;
  `apps/web/src/features/{ticket-detail/TicketDetailPage,create-ticket/CreateTicketPage,people/CreateUserPage,people/UserDetailPage,people/PeoplePage}.tsx`.

- **The decision that shaped the rest — two permission maps, not one.** `PERMISSIONS` became
  `PLATFORM_PERMISSIONS` + `PROJECT_PERMISSIONS`, with `PlatformAction` and `ProjectAction` as
  separate types and `@RequirePlatform` / `@RequireProject` as separate decorators. The two are
  answered from *different roles* — global vs effective — and a single map made it trivially easy
  to hand `can()` whichever role was in scope and be wrong half the time. Split, the wrong one is
  a type error. `can()` itself stays one function over the union, because the ownership helpers
  (M19) and the frontend both want a single call shape.

- **Decisions and deviations**:
  1. **Everything ProjectScopeGuard refuses is a 404, including the body text.** The suite asserts
     that a real-but-invisible project and a made-up uuid produce the same status *and* the same
     message; a differing message is an existence oracle just as much as a differing code is.
  2. **`GET /projects` filters in the query, not a guard**, and `GetProjectsHandler` carries a
     comment saying why: a list has no single project to resolve, so a guard structurally cannot
     do it. A platform admin skips the join entirely — filtering them by membership would hide
     projects they can in fact open.
  3. **`DELETE /tickets/:id` keeps a `@RequireProject('ticket.delete')` route gate**, even though
     the tech spec's end state puts that decision in the handler. Spec 10 §3.3 also allows the
     reporter, which needs the row — that is M19. Dropping the route gate first would have opened
     deletion to every project member for a whole module.
  4. **`CreateTicketCommand` and `AddCommentCommand` now take `auth: AuthContext`**, not
     `actingUser: User` — §5.3's change, pulled forward for these two because the epic gate has to
     read `auth.projectRole` to satisfy R13. The rest of §5.3 is still M19's.
  5. **Creating a project makes the creator a project admin**, in the same transaction. Otherwise
     a fresh project has zero members and violates R18 from the moment it exists.
  6. **`create-ticket` now writes `reporter_id`.** It never did — M15 added the column and
     backfilled it, but nothing populated it for new rows, so every ticket created since M15 had
     a null FK. M19's ownership rule reads *only* that column, so this would have failed open to
     "manager or admin" on every recent ticket and looked like correct behaviour.
  7. **The project last-admin refusal returns 400, not 409**, matching `UpdateUserCommand`'s
     platform half. Both refusals should read alike to a client.
  8. **Adding a non-existent `userId` is 400, not 404.** On these routes 404 already means "no
     such project, as far as you are concerned"; reusing it here would blur R12.
  9. **`auth-context.fixture.ts` is test-only**, named to say so. Handler-level int-specs call
     commands directly and never run the guards that would populate an `AuthContext`.

- **Verification**:
  | Check | Result |
  |---|---|
  | API unit | 127 passed (was 101): `permissions.spec.ts` adds 64, `roles.guard.spec.ts` removed |
  | API integration | 126 passed (was 100; +26) |
  | Web unit | 56 passed, unchanged |
  | typecheck / build | clean; 5 pre-existing web lint warnings, 0 errors |
  | **e2e, unchanged, against a rebuilt Compose stack** | **5/5 passed** |
  | Non-member on project / tickets / board / overview / sprints / members / `GET /tickets/:id` | 404 on all seven (R12) |
  | Non-member vs. non-existent project | identical status and message |
  | Non-member write | 404, not 403 |
  | Global manager + project developer creates an epic | 403 (R13) |
  | Global developer + project manager creates an epic | 201 (R13) |
  | Global admin with no membership row | 200 on project and members (superuser bypass) |
  | `GET /projects` as member / non-member / platform admin | own only / empty / all |
  | Member add → re-role → remove, effective on the next request | 204/204/204, then 404 |
  | Demote or remove the last project admin | 400 both; allowed once a second admin exists |
  | `membership_changed` audit event with actor and project | recorded (R19) |
  | Dev config: anonymous reads, anonymous epic-create, impersonated developer epic-create | 200 / 403 / 403 — v1 behaviour intact |

- **Gotchas for the next session (M19)**:
  - **Guard order is now four deep** — throttle → Auth → ProjectScope → Permission — and each
    reads what the previous wrote. Reordering the `APP_GUARD` entries in `auth.module.ts`
    unguards routes silently rather than failing.
  - **`@RequireProject` without `@ProjectScope` throws 500, deliberately.** There is no effective
    role to check, and a 403 there would look like policy while hiding an unscoped route.
  - **A route with no `@ProjectScope` is not scoped at all.** Nothing infers it from a
    `projectId` param. Any new project-scoped route M19+ adds must carry the decorator —
    `@ProjectScope('comment')` already exists for `PATCH`/`DELETE /comments/:id`.
  - **`auth.projectRole` is `undefined`, not null, for a non-member** — but a non-member never
    reaches a handler, because the guard 404s first. Inside a handler, `undefined` means the
    route carries no `@ProjectScope`, which for M19's ownership helpers is a bug, not a denial.
  - **`ProjectScopeGuard` adds one query on `param` routes and two on `ticket`/`comment` routes**,
    on top of AuthGuard's two. If that becomes a problem, merge them into one guard rather than
    caching across requests — the per-request read is what makes R15 and instant member-removal true.
  - **`GET /auth/me` still returns `{user, memberships}`**, not the `permissions` field the tech
    spec's §4.1 table lists. Nothing consumes it yet; M20's `useCan()` is the natural place to
    decide whether it wants a computed map or just the two matrices from `shared`.
  - **The web app still calls `can()` with the caller's *global* role** in TicketDetailPage and
    CreateTicketPage. That is correct only because every seeded user holds the same role in every
    project. Both sites carry a comment; M20's `useCan()` is what actually fixes it. The server
    re-checks either way, so it is a cosmetic bug, not a hole.
  - **`create-ticket.int-spec` now inserts a real user** — a synthetic actor uuid stopped being
    insertable the moment `reporter_id` was populated. Any new spec that creates tickets directly
    needs a real `users` row too.

- **Next**: M19 — record-level ownership & comment editing. No blockers.
