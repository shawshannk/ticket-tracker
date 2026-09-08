# Ticket Tracker — Progress

**Spec fingerprint**: PLAN.md derived from spec files as of 2026-07-15.
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
| M12 Create ticket view | pending | specs/06 (2026-07-15) | — |
| M13 People & users views | pending | specs/07 (2026-07-15) | — |
| M14 Testing & CI | pending | specs/09 (2026-07-15) | — |

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

## Completion (Phase 5)
<!-- Written once, when all modules are done. -->
_Pending._
