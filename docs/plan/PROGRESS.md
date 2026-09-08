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
| M3 Users API + acting-as guard | pending | specs/07, 08, 00 (2026-07-15) | — |
| M4 Projects API + key sequence | pending | specs/02 (2026-07-15) | — |
| M5 Tickets write side | pending | specs/06, 05, 04, 00 (2026-07-15) | — |
| M6 Tickets read side | pending | specs/03, 05, 04, 01 (2026-07-15) | — |
| M7 Frontend app shell | pending | specs/02, 08 (2026-07-15) | — |
| M8 Overview dashboard view | pending | specs/01 (2026-07-15) | — |
| M9 Tickets list view | pending | specs/03 (2026-07-15) | — |
| M10 Board view | pending | specs/04 (2026-07-15) | — |
| M11 Ticket detail view | pending | specs/05 (2026-07-15) | — |
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

## Completion (Phase 5)
<!-- Written once, when all modules are done. -->
_Pending._
