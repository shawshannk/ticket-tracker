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
| M2 Shared + data model + seed | pending | specs/00 (2026-07-15) | — |
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

## Completion (Phase 5)
<!-- Written once, when all modules are done. -->
_Pending._
