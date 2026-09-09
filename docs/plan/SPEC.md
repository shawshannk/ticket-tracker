# Ticket Tracker — Spec (contract & index)

## Purpose
A full-stack, persisted, multi-project ticket/issue tracker with an Epic → Story → Bug
hierarchy, a Kanban board, and team management. Rebuild of a static prototype
(`Ticket Dashboard.dc.html`) into a real app for a small trusted team / portfolio use.

## Reference material (consulted 2026-07-15)
`reference/Ticket Dashboard.dc.html` — the working static prototype. Treated as
**behavioral/visual reference, not requirements**. Reconciled against the specs: the
prototype confirms the specs; every spec item marked "improvement over the prototype"
appears in the reference as the old behavior being replaced (in-memory state, faked project
scoping, hardcoded comment/reporter author = "Jordan Lee", string-based epic/story links).
Concrete values reused from it: company "Lumen Labs"; projects Nimbus Triage / Atlas Billing
/ Vega Mobile; the 8 seed users + roles/departments; the status/priority/severity/type/env
color palettes; UI copy ("Recently updated", "Critical & open", "Activity (N)", etc.).
Where reference and spec disagreed, resolved with the user (see D-key, R10 below).

## Spec sources
| Module | Spec file | Fingerprint (as of) |
|--------|-----------|---------------------|
| (cross-cutting) Data model | specs/00-architecture-and-data-model.md | 2026-07-15 |
| Overview dashboard | specs/01-overview-dashboard.md | 2026-07-15 |
| Projects & multi-project | specs/02-projects-and-multi-project.md | 2026-07-15 |
| Tickets list | specs/03-tickets-list.md | 2026-07-15 |
| Board view | specs/04-board-view.md | 2026-07-15 |
| Ticket detail | specs/05-ticket-detail.md | 2026-07-15 |
| Create ticket | specs/06-create-ticket.md | 2026-07-15 |
| People & users | specs/07-people-and-users.md | 2026-07-15 |
| Acting-as & permissions (v1, superseded) | specs/08-current-user-and-permissions.md | 2026-07-15 |
| **Authentication & authorization (v2)** | specs/10-authentication-and-authorization.md | 2026-09-09 |
| **Auth technical design (v2)** | docs/auth-tech-spec.md | 2026-09-09 |
| Testing & devops | specs/09-testing-and-devops.md | 2026-07-15 |

<!-- Fingerprint = last-modified date of the spec file at the time PLAN.md was
     (re-)derived from it. Update on every spec-level change. Phase 3 checks
     current files against these before resuming. -->

## Cross-module contracts
The things no single spec file owns. A change here affects every dependent module.

- **Shared types/models** (owner: `packages/shared`):
  - Enums: `TICKET_TYPE` (epic|story|bug), `PRIORITY` (critical|high|medium|low),
    `SEVERITY` (1|2|3|4), `ENV` (production|staging|development), `SIZE` (xs|s|m|l|xl),
    `ROLE` (admin|manager|developer), `DEPARTMENTS`.
  - `STATUS_BY_TYPE`: EPIC=[Planned, In Progress, Done]; STORY & BUG=[Backlog, In Progress,
    In Review, Blocked, On Hold, Done]. **Single source of truth**, consumed by both API
    (server-side validation) and web (UI options). Canonical in `packages/shared`.
  - DTO/summary shapes: `TicketSummary` (list/board/recent-activity row), `TicketDetail`,
    `Comment`, `User`, `Project`, `OverviewStats`. Zod schemas in `packages/shared`, reused
    as API DTOs and frontend form validation.
- **Interface boundaries**:
  - Frontend never re-implements validation rules — it imports Zod schemas + enums from
    `packages/shared`. API is the enforcement authority; frontend mirrors for UX only.
  - API is REST, documented via Swagger/OpenAPI. Frontend generates typed client / TanStack
    Query hooks from the OpenAPI spec so the two never drift.
  - Acting user is transmitted via `X-Acting-User-Id` request header on every mutating call.
    One centralized NestJS guard reads it, loads the user, and enforces the role matrix.
    One centralized frontend API-client wrapper attaches it. (See D-auth below.)
- **Module dependency order**: M1 → M2 → M3 → M4 → M5 → M6 → M7 → {M8, M9, M10, M11, M12, M13} → M14.
  M2 (shared+schema) underpins everything. Backend (M3–M6) precedes frontend views (M8–M13).

## Shared requirements
- **R1**: Status updates are validated against the ticket's **type-specific** status set,
  server-side. Invalid status → 400. (specs 00, 04, 05)
- **R2**: Multi-project data isolation is real — a ticket in project A must never appear in
  project B's list, board, or overview. (specs 00, 02)
- **R3**: Role permission matrix (Admin/Manager/Developer) enforced in NestJS guards, not just
  hidden in the UI. (specs 00, 06, 07, 08)
- **R4**: Ticket keys `{key_prefix}-{seq}` generated transactionally per project, race-safe. (spec 02)
- **R5**: The epic/story consistency constraint — if a Bug sets both `epic_id` and `story_id`,
  the linked story's `epic_id` must equal the Bug's `epic_id`. Enforced server-side. (spec 00)
- **R6**: Comment `author_id` = current acting user, taken server-side (fixes prototype's
  hardcoded "Jordan Lee" bug). (specs 00, 05, 08)
- **R7**: Filter/route state (project, list filters, board filters) lives in the URL so views
  are shareable/bookmarkable and survive refresh. (specs 02, 03, 04)
- **R8**: List and board reads are paginated/scoped server-side, not computed client-side over
  the full ticket set. (specs 01, 03)
- **R9** (nice-to-have): Optimistic updates with rollback on the board status-move. (spec 04)
- **R10** (from reference): Client-only view preferences carried over from the prototype —
  `density` (Comfortable/Compact, spec 03), `showHierarchy` (show/hide Epic▸Story breadcrumb),
  `tagStyle` (Colorful/Neutral label chips). UI-only state (not persisted server-side); lives
  in the same client store as the acting-user selection. Not in any per-module spec file —
  sourced from the reference prototype and confirmed for v1 by the user.

## Tech stack
- Language/runtime: TypeScript, Node.js
- Framework(s): NestJS + `@nestjs/cqrs` (API); React + TanStack Router/Query/Table + `@dnd-kit/core` (web)
- Database: PostgreSQL via Drizzle ORM (`drizzle-kit` migrations)
- Shared: Zod schemas/enums/types in `packages/shared`; Turborepo monorepo
- Infra/deploy: Docker Compose (Postgres + api + web) for local; cloud target deferred
- Testing: Vitest (unit/integration) + Playwright (e2e); CI via GitHub Actions

## Constraints
- No real authentication in v1 — "acting as" header only. See spec 08 for the honest security
  caveat: this is role *simulation*, not access control. Safe only for a trusted team / demo.
  **Addressed in v2**: spec 10 replaces it with real auth; the v1 constraint holds until M21
  ships and `AUTH_DEV_IMPERSONATION` is off.
- Cloud hosting target not decided; pipeline stops at "build succeeds + tests pass".
- Should stay visually close to the original prototype.

## Out of scope (v1)
- ~~Real auth (JWT)~~ — **moved into scope 2026-09-09**, see spec 10 and PLAN.md M15–M21.
- SSO/OIDC, MFA, self-signup, password reset by email, file attachments, notifications,
  real-time websocket sync. (Spec 10 §2 restates these as explicitly out of scope, with reasons.)
- User deletion (spec 07 defers the soft-delete/reassign decision).
- ~~Per-project team membership~~ — **in scope as of 2026-09-09** (spec 10 §3.2, D-scope,
  PLAN.md M18). Users remain globally unique; `project_members` adds a per-project role.

## Decisions
<!-- Promoted from module handoffs when a decision outlives its module. -->
- **D-auth** (2026-07-15, from spec 08): Acting user via `X-Acting-User-Id` header, one NestJS
  guard + `@Roles()` decorator centralizes enforcement so real auth later is a contained swap.
  **Superseded 2026-09-09 by D-auth2.** The header survives only as `AUTH_DEV_IMPERSONATION`,
  refused at boot in production.
- **D-auth2** (2026-09-09, from spec 10 — decided with the user): real authentication replaces
  role simulation. Email + password with argon2id; a 15-minute HS256 access token in memory and
  a rotating opaque refresh token in an `HttpOnly` cookie scoped to `/auth`, with reuse detection.
  Accounts are admin-created and activated through a single-use invite link; there is no
  self-signup and no email transport, so a password reset *is* a re-issued invite. Accounts are
  disabled, never deleted, so authorship history stays readable.
- **D-scope** (2026-09-09, from spec 10 §3): authorization has two scopes. The **global role**
  governs platform actions only; a **`project_members` role overrides it inside that project**.
  A global `admin` is a platform superuser who bypasses membership everywhere. A non-member sees
  `404`, never `403`, so project existence cannot be probed.
- **D-ownership** (2026-09-09, from spec 10 §3.3): editing tickets stays open to every project
  member; **assignment and deletion** additionally admit the reporter/assignee; a comment may be
  edited **only by its author**, admins included, and deleted by author or project admin.
- **D-status** (2026-07-15, from spec 00): `STATUS_BY_TYPE` canonical in `packages/shared`;
  both API validation and web UI options derive from it.
- **D-key** (2026-07-15, reference vs spec conflict resolved by user): ticket keys use a
  **single per-project sequence**, type-agnostic (`NIM-1`, `NIM-2`, `ATL-1`), per spec 00's
  `next_ticket_seq`. The prototype's per-type prefixes (`EPC-`/`STY-`/`BUG-`) are **dropped**.

## Decisions made on user's behalf
<!-- None — all open questions were confirmed with the user (see below). -->

## Confirmed open questions (2026-07-15)
- **Project CRUD**: Admin-only `POST /projects` **is** in v1 (spec 02 open question resolved).
- **Reporter on create**: auto-filled server-side from the acting user; no free-text field
  (spec 06 gap resolved).
- **Seed data**: minimal seed — the 8 users + 1 project, enough to exercise flows. Not the
  full ~20-ticket prototype dataset. Concrete values from the reference: users per
  `seedUsers()`; project "Nimbus Triage" with `key_prefix = "NIM"`.
- **Ticket key format** (D-key): per-project single sequence (`NIM-1`), not per-type prefixes.
- **View-preference toggles** (R10): `showHierarchy` + `tagStyle` included in v1 (client-only).

## Confirmed open questions (2026-09-09 — auth)
Decided with the user during the spec-10 review; each was a genuine fork, not a default.
- **Identity mechanism**: JWT access + rotating refresh, over server sessions or SSO.
- **Token transport**: refresh in an `HttpOnly` cookie, access token in memory (not
  `localStorage`, and not a cookie-only design that would need CSRF tokens everywhere).
- **Provisioning**: admin-created accounts plus a single-use invite link. No self-signup.
- **Authorization depth**: per-project membership **and** record-level ownership rules — the
  fullest of the three options offered.
- **Global vs project role**: per-project role overrides the global one; global `admin` remains
  a platform superuser that bypasses membership.
- **Acting-as**: kept behind `AUTH_DEV_IMPERSONATION`, refused at boot in production, rather
  than deleted outright (keeps e2e and local dev cheap) or kept as an admin impersonation
  feature (a privilege-escalation surface nobody asked for).
