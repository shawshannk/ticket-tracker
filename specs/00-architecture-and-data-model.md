# 00 — Architecture & Data Model

Read this before any other spec. Every feature spec references these entities and enums.

## High-level architecture

- **Monorepo** (Turborepo): `apps/api` (NestJS), `apps/web` (React), `packages/shared` (Zod schemas + enums + TS types consumed by both).
- **API style**: REST, documented via NestJS Swagger (OpenAPI). Frontend generates typed fetch clients / TanStack Query hooks from the OpenAPI spec, so the API and frontend never drift out of sync.
- **CQRS**: Use `@nestjs/cqrs` for ticket mutations (CreateTicketCommand, UpdateTicketCommand, MoveTicketCommand, AddCommentCommand, DeleteTicketCommand) and for read models (GetTicketsQuery, GetOverviewStatsQuery, etc.). This is the direct analog of your MediatR usage in .NET — same separation of concerns, different runtime.
- **Persistence**: Drizzle ORM schemas in `apps/api/src/db/schema/*.ts`, migrations via `drizzle-kit`.

## Entities

### `projects`
| Column | Type | Notes |
|---|---|---|
| id | uuid, PK | |
| name | text | e.g. "Nimbus Triage" |
| key_prefix | text, unique | e.g. "NIM" — used to build human-readable ticket keys like `NIM-124` |
| next_ticket_seq | integer, default 1 | incremented transactionally on ticket creation within this project |
| created_at | timestamptz | |

> The prototype had a project switcher that didn't filter anything. Per your confirmation, this spec makes project scoping real — see spec 02.

### `users`
| Column | Type | Notes |
|---|---|---|
| id | uuid, PK | |
| name | text | |
| email | text, unique | |
| department | text | enum-like, see `DEPARTMENTS` in shared constants |
| role | enum: `admin` \| `manager` \| `developer` | drives permissions, see spec 08 |
| created_at | timestamptz | |

Users are **global**, not scoped to a single project (matches the prototype — the same 8 people can be assignees across all three projects). Flagging this as an assumption: if you actually want per-project team membership later, that's an additive change (a `project_members` join table), not a rework.

### `sprints`
| Column | Type | Notes |
|---|---|---|
| id | uuid, PK | |
| project_id | uuid, FK → projects | sprints are per-project, not global (prototype had one flat sprint list — this is a deliberate improvement given real multi-project support) |
| name | text | e.g. "Sprint 25" |
| starts_on / ends_on | date, nullable | not in the prototype, but trivial to add now and useful for a real sprint board later |

A ticket's `sprint_id` is nullable — null means "Backlog" (matches prototype semantics).

### `tickets`
| Column | Type | Notes |
|---|---|---|
| id | uuid, PK | |
| project_id | uuid, FK → projects | required |
| key | text | generated as `{project.key_prefix}-{project.next_ticket_seq}` at creation time, e.g. `NIM-124` |
| type | enum: `epic` \| `story` \| `bug` | |
| title | text | |
| description | text | |
| status | text | **validated against a type-specific enum** — see "Status by type" below, not a single global enum |
| priority | enum: `critical` \| `high` \| `medium` \| `low` | applies to all types (prototype defaults Epics/Stories to Medium) |
| severity | enum: `1`\|`2`\|`3`\|`4`, nullable | **Bug only** — null for Epic/Story |
| assignee_id | uuid, FK → users, nullable | |
| reporter | text | **free text, not a user FK** — prototype reporters include non-people strings like "QA Automation", "Support Escalation". Keeping this as free text for v1 to preserve that; promoting to a real FK is a clean future change if you want it. |
| labels | text[] | tags, arbitrary strings |
| env | enum: `production` \| `staging` \| `development`, nullable | null for Epics |
| size | enum: `xs`\|`s`\|`m`\|`l`\|`xl`, nullable | null for Epics |
| epic_id | uuid, FK → tickets (self), nullable | set on Story and Bug tickets; null on Epics |
| story_id | uuid, FK → tickets (self), nullable | **Bug only** — a Bug may optionally link to a Story. **Constraint**: if both `epic_id` and `story_id` are set, `story_id`'s ticket must have the same `epic_id` (enforce in application logic + a check via trigger or service-layer validation) |
| sprint_id | uuid, FK → sprints, nullable | null = Backlog |
| start_date | date, nullable | |
| estimated_end_date | date, nullable | |
| created_at | timestamptz | |
| updated_at | timestamptz | update on every field change, including status moves |

### `comments`
| Column | Type | Notes |
|---|---|---|
| id | uuid, PK | |
| ticket_id | uuid, FK → tickets | |
| author_id | uuid, FK → users | **fix vs. prototype**: the prototype hardcoded every new comment's author to "Jordan Lee" regardless of which demo user was active. This spec uses whichever user is currently "acting as" (spec 08). |
| body | text | |
| created_at | timestamptz | |

## Status by type (not a single global status enum)

```
EPIC_STATUSES  = [Planned, In Progress, Done]
STORY_STATUSES = [Backlog, In Progress, In Review, Blocked, On Hold, Done]
BUG_STATUSES   = [Backlog, In Progress, In Review, Blocked, On Hold, Done]
```
The API must reject a status update that isn't valid for that ticket's `type`. This was enforced client-side only in the prototype (`STATUS_BY_TYPE` lookup) — it needs to be a real server-side validation now, since the client can no longer be trusted to be the only entry point once there's a real API.

## Computed / derived values (not stored — calculated per-request or cached)

These map directly to the Overview dashboard (spec 01):
- `openCount` = count of project's tickets where `status != 'Done'`
- `criticalOpen` = count where `status != 'Done' AND priority = 'critical'`
- `avgResolutionDays` = average of `(updated_at - created_at)` in days, over tickets where `status = 'Done'`
- `createdThisWeek` = count where `created_at >= now() - 7 days`
- `statusBreakdown` / `priorityBreakdown` = grouped counts + percentage of total
- `recentActivity` = 5 most recently `updated_at` tickets across the project

## Role permission matrix

| Action | Admin | Manager | Developer |
|---|---|---|---|
| Manage users (create/edit) | ✅ | ❌ | ❌ |
| Create Epic-type ticket | ✅ | ✅ | ❌ |
| Delete ticket | ✅ | ✅ | ❌ |
| Create Story/Bug, edit any ticket, comment | ✅ | ✅ | ✅ |

This matrix must be enforced **server-side** in NestJS guards, not just hidden in the UI — the prototype only hid buttons client-side, which is fine for a demo but not for a real app even without full auth (see spec 08 for the honest caveat about what "enforcement" means without real login).
