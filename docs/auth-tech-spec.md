# Technical spec — Authentication & Authorization

Implements [specs/10-authentication-and-authorization.md](../specs/10-authentication-and-authorization.md).
That document owns *what* and *why*; this one owns *how*. Where they disagree, spec 10 wins and
this file is wrong.

**Stack constraints this must live inside:** NestJS 10 + CQRS, Drizzle ORM on Postgres, Zod
schemas shared through `packages/shared`, React + TanStack Query/Router + Zustand on the web,
pnpm workspaces, Vitest + Playwright.

---

## 1. Architecture at a glance

```
Request
  │
  ├─ 1. AuthGuard            (global)  Bearer token → verify → load session+user → req.auth
  │                                    @Public() routes skip. Dev impersonation branch here.
  ├─ 2. ProjectScopeGuard    (global)  Resolve projectId from params → effective project role
  │                                    → req.auth.projectRole. 404 for non-members.
  ├─ 3. PermissionGuard      (global)  @Require('ticket.delete') → can(action, effectiveRole)
  │
  └─ 4. Command handler                assertOwnership(...) for the §5 record-level rules,
                                       because they need the loaded row.
```

Layers 1–3 are route-shaped and global; layer 4 is row-shaped and lives in the handler that
already loaded the row. This mirrors the precedent v1 set with the epic-creation gate in
`create-ticket.command.ts`: checks that depend on data belong where the data is.

`RolesGuard` and `ActingUserGuard` are replaced. `PERMISSIONS` / `can()` in
`packages/shared/src/permissions.ts` are extended, not rewritten — the action names grow a scope.

## 2. Database schema

New Drizzle tables in `apps/api/src/db/schema/`, one migration.

### 2.1 `users` — altered

```ts
// apps/api/src/db/schema/users.ts
export const userStatusEnum = pgEnum('user_status', ['invited', 'active', 'disabled']);

export const users = pgTable('users', {
  // ... existing columns unchanged ...
  status:            userStatusEnum('status').notNull().default('invited'),
  passwordHash:      text('password_hash'),                 // null until an invite is accepted
  passwordChangedAt: timestamp('password_changed_at', { withTimezone: true }),
  lastLoginAt:       timestamp('last_login_at', { withTimezone: true }),
});
```

`role` keeps its meaning as the **global** role (spec 10 §3.1). `passwordHash` is nullable by
design; a null hash is a hard "cannot log in", checked before any hash comparison.

> **`passwordHash` must never reach a DTO.** `toUser()` in `users/user.mapper.ts` already builds
> its output field-by-field rather than spreading the row, so it is safe as written — keep it
> that way, and add a unit test that asserts the mapper's output has no `password` key at all.
> Prefer explicit `select({...})` projections over `select()` in every users query. (R17)

### 2.2 `project_members`

```ts
export const projectMembers = pgTable('project_members', {
  projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
  userId:    uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  role:      userRoleEnum('role').notNull(),   // the per-project role — overrides users.role
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  createdBy: uuid('created_by').references(() => users.id),
}, (t) => ({
  pk:       primaryKey({ columns: [t.projectId, t.userId] }),
  byUser:   index('project_members_user_idx').on(t.userId),   // "my projects" is the hot path
}));
```

Reuses `userRoleEnum` deliberately: a project role is drawn from the same three values, so the
`can()` matrix works unchanged on either scope.

### 2.3 `refresh_tokens`

```ts
export const refreshTokens = pgTable('refresh_tokens', {
  id:         uuid('id').primaryKey().defaultRandom(),
  userId:     uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  familyId:   uuid('family_id').notNull(),        // constant across one session's rotations
  tokenHash:  text('token_hash').notNull().unique(),  // sha256 of the opaque token
  issuedAt:   timestamp('issued_at',  { withTimezone: true }).notNull().defaultNow(),
  expiresAt:  timestamp('expires_at', { withTimezone: true }).notNull(),
  usedAt:     timestamp('used_at',    { withTimezone: true }),  // set on rotation
  revokedAt:  timestamp('revoked_at', { withTimezone: true }),
  userAgent:  text('user_agent'),
  ip:         text('ip'),
}, (t) => ({
  byFamily: index('refresh_tokens_family_idx').on(t.familyId),
  byUser:   index('refresh_tokens_user_idx').on(t.userId),
}));
```

The token itself is 32 random bytes, base64url. Only its **sha256** is stored — a plain hash is
correct here, not argon2: the value is already high-entropy, and this lookup happens on every
refresh. Indexing `tokenHash` requires it be a deterministic hash, which a salted KDF is not.

### 2.4 `invites`

```ts
export const invites = pgTable('invites', {
  id:         uuid('id').primaryKey().defaultRandom(),
  userId:     uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  tokenHash:  text('token_hash').notNull().unique(),   // sha256, same reasoning as above
  expiresAt:  timestamp('expires_at', { withTimezone: true }).notNull(),
  acceptedAt: timestamp('accepted_at', { withTimezone: true }),
  createdBy:  uuid('created_by').notNull().references(() => users.id),
  createdAt:  timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
```

Issuing a new invite for a user revokes their outstanding ones (`expiresAt = now()`), so the
"lost link" recovery path cannot leave two live links.

### 2.5 `auth_events` — audit log (R19)

```ts
export const authEvents = pgTable('auth_events', {
  id:        uuid('id').primaryKey().defaultRandom(),
  type:      text('type').notNull(),   // 'login' | 'login_failed' | 'logout' | 'invite_issued' |
                                       // 'invite_accepted' | 'password_changed' | 'role_changed' |
                                       // 'membership_changed' | 'user_disabled' | 'refresh_reuse'
  actorId:   uuid('actor_id').references(() => users.id),    // who did it; null for anonymous
  subjectId: uuid('subject_id').references(() => users.id),  // who it was done to
  ip:        text('ip'),
  userAgent: text('user_agent'),
  metadata:  jsonb('metadata').$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({ bySubject: index('auth_events_subject_idx').on(t.subjectId, t.createdAt) }));
```

Append-only by convention; no update or delete path is written. `metadata` never carries
credentials — for `login_failed` it holds the *attempted email*, nothing more.

### 2.6 Backfill migration

Runs in the same migration, after the DDL (spec 10 §10 step 2):

```sql
UPDATE users SET status = 'invited';                       -- nobody has a password yet
INSERT INTO project_members (project_id, user_id, role, created_at)
SELECT p.id, u.id, u.role, now() FROM projects p CROSS JOIN users u;  -- preserve v1 access
```

The cross join is correct precisely because v1 had no membership: everyone could reach
everything, and the migration must not silently take access away.

## 3. Tokens

### 3.1 Access token

- JWT, **HS256**, secret from `AUTH_JWT_SECRET` (≥32 bytes; the app refuses to boot without it).
  HS256 over RS256 because there is one issuer and one verifier, in the same process.
- **TTL 15 minutes.** `iss: 'ticket-tracker'`, `aud: 'ticket-tracker-api'`, both verified.
- Claims are deliberately thin:

```jsonc
{ "sub": "<user id>", "sid": "<refresh family id>", "role": "admin",
  "iat": 0, "exp": 0, "iss": "ticket-tracker", "aud": "ticket-tracker-api" }
```

**Memberships are not in the token.** They change while a session is live, and a 15-minute stale
window on "can this person see this project" is unacceptable. `role` is present only for cheap
platform-level checks and is still re-read from the DB by `AuthGuard`; if the two disagree, the
database wins.

- `AuthGuard` loads the user and their session on every request. That is one indexed query, and
  it buys immediate revocation (R15) — without it, `disabled` would take up to 15 minutes to
  bite. Cache it in a request-scoped memo only; do not add a cross-request cache without
  re-deriving R15.

### 3.2 Refresh token

- 32 random bytes, base64url, **opaque** — not a JWT. Nothing reads it but the database.
- **TTL 30 days**, refreshed on each rotation (rolling window), so 30 days of *inactivity* ends
  the session while continuous use does not.
- Delivered as a cookie, and only ever to the refresh path:

```
Set-Cookie: tt_rt=<token>; HttpOnly; Secure; SameSite=Lax; Path=/auth; Max-Age=2592000
```

  `Secure` is dropped only when `NODE_ENV !== 'production'`, so local http works.
  `SameSite=Lax` suffices because refresh is a `POST` and Lax does not attach cookies to
  cross-site POSTs; the CSRF risk on the refresh route is therefore already closed. Add a
  `Origin` header check on `/auth/*` as defence in depth.

### 3.3 Rotation and reuse detection (R16)

```
POST /auth/refresh with token T (family F)
  ├─ T unknown            → 401, clear cookie
  ├─ T revoked or expired → 401, clear cookie
  ├─ T.usedAt IS NOT NULL → REUSE: revoke every row in family F,
  │                          log 'refresh_reuse', 401, clear cookie
  └─ otherwise            → in one transaction:
                              T.usedAt = now()
                              insert T' (same familyId, new hash, expiresAt = now + 30d)
                            → new access token + Set-Cookie T'
```

The whole branch runs inside a transaction with `SELECT ... FOR UPDATE` on the token row, so two
concurrent refreshes from the same tab cannot both rotate and cause a spurious reuse alarm.

## 4. API surface

### 4.1 New — `apps/api/src/auth/`

| Method | Route | Auth | Body → Response |
|---|---|---|---|
| `POST` | `/auth/login` | public | `{email, password}` → `{accessToken, user, memberships[]}` + cookie |
| `POST` | `/auth/refresh` | cookie | — → `{accessToken}` + rotated cookie |
| `POST` | `/auth/logout` | bearer | `{allSessions?: boolean}` → `204` |
| `GET`  | `/auth/me` | bearer | — → `{user, memberships[], permissions}` |
| `POST` | `/auth/password` | bearer | `{currentPassword, newPassword}` → `204`, revokes other sessions |
| `POST` | `/auth/invite/accept` | public | `{token, password}` → `{accessToken, user}` + cookie |
| `GET`  | `/auth/sessions` | bearer | — → `Session[]` (id, userAgent, ip, issuedAt, current) |
| `DELETE` | `/auth/sessions/:id` | bearer | — → `204` (own sessions only) |

`memberships[]` is `{projectId, role}[]`, the payload the frontend needs to render permission-
aware controls without a request per project.

### 4.2 New — membership management

| Method | Route | Permission |
|---|---|---|
| `GET` | `/projects/:id/members` | project member |
| `POST` | `/projects/:id/members` | `project.members.manage` |
| `PATCH` | `/projects/:id/members/:userId` | `project.members.manage` |
| `DELETE` | `/projects/:id/members/:userId` | `project.members.manage` |

### 4.3 New — comment editing (needed by the §5 ownership rules)

| Method | Route | Permission |
|---|---|---|
| `PATCH` | `/comments/:id` | author only |
| `DELETE` | `/comments/:id` | author, or project admin |

### 4.4 Changed — existing routes

- **Every** route gains `AuthGuard`. `@Public()` marks only login, refresh, invite-accept, health.
- `POST /users` also creates an invite and returns `{user, inviteUrl}`. `inviteUrl` is returned
  **once** and never stored in plaintext.
- `PATCH /users/:id` gains `status`. Setting `disabled` revokes sessions in the same transaction.
- `GET /users` returns emails only to platform admins; the mapper takes the viewer as an argument.
- Project-scoped routes gain `ProjectScopeGuard`; `GET /tickets/:id`, `PATCH /tickets/:id`, and
  `DELETE /tickets/:id` resolve their project via the ticket row (§6.2).
- Swagger's `ApiHeader('x-acting-user-id')` decorations are replaced by `@ApiBearerAuth()`, and
  `DocumentBuilder` gains `.addBearerAuth()`.

## 5. Permission model in code

`packages/shared/src/permissions.ts` grows a scope dimension. Existing `PERMISSIONS` / `can()`
signatures change, so every call site is updated in the same commit — the type error is the
checklist.

```ts
export const PLATFORM_PERMISSIONS = {
  'user.manage':      ['admin'],
  'project.create':   ['admin'],
  'directory.readEmails': ['admin'],
} as const satisfies Record<string, readonly UserRole[]>;

export const PROJECT_PERMISSIONS = {
  'project.update':          ['admin', 'manager'],
  'project.members.manage':  ['admin', 'manager'],
  'ticket.read':             ['admin', 'manager', 'developer'],
  'ticket.create':           ['admin', 'manager', 'developer'],
  'ticket.createEpic':       ['admin', 'manager'],
  'ticket.update':           ['admin', 'manager', 'developer'],
  'ticket.assign':           ['admin', 'manager'],   // developers pass via ownership — §5.2
  'ticket.delete':           ['admin', 'manager'],   // ditto
  'comment.create':          ['admin', 'manager', 'developer'],
} as const satisfies Record<string, readonly UserRole[]>;

export type PlatformAction = keyof typeof PLATFORM_PERMISSIONS;
export type ProjectAction  = keyof typeof PROJECT_PERMISSIONS;

/** The one rule that makes per-project roles work (spec 10 §3.2). */
export function effectiveRole(
  globalRole: UserRole,
  membershipRole: UserRole | null | undefined,
): UserRole | null {
  if (globalRole === 'admin') return 'admin';   // platform superuser
  return membershipRole ?? null;                // null ⇒ not a member ⇒ 404
}
```

### 5.1 Guards

```ts
// AuthGuard          → req.auth = { user, sessionId }               | 401
// ProjectScopeGuard  → req.auth.projectId, req.auth.projectRole     | 404
// PermissionGuard    → @RequirePlatform(a) | @RequireProject(a)     | 403
```

`ProjectScopeGuard` runs only on routes carrying a resolvable project, decided by a
`@ProjectScope('param' | 'ticket' | 'comment')` decorator rather than by sniffing param names —
implicit resolution is exactly how a route silently ends up unguarded.

### 5.2 Ownership, in the handlers (R14)

```ts
// apps/api/src/auth/ownership.ts
export function assertCanDeleteTicket(auth: AuthContext, ticket: { reporterId: string }): void {
  if (can('ticket.delete', auth.projectRole)) return;          // manager/admin
  if (ticket.reporterId === auth.user.id) return;              // the reporter
  throw new ForbiddenException('Only the reporter or a project manager can delete this ticket');
}

export function assertCanAssignTicket(
  auth: AuthContext, ticket: { reporterId: string; assigneeId: string | null },
): void { /* manager/admin, reporter, or current assignee */ }

export function assertCanEditComment(auth: AuthContext, comment: { authorId: string }): void {
  if (comment.authorId !== auth.user.id) {
    throw new ForbiddenException('You can only edit your own comments');   // admins included
  }
}
```

Called from `DeleteTicketHandler`, `UpdateTicketHandler` (when the body changes `assigneeId`),
and the new comment handlers — *after* the row is loaded, *before* the write. Each gets a
dedicated unit test with a hand-built `AuthContext`, following `roles.guard.spec.ts`.

### 5.3 Passing the context down

CQRS commands already take `actingUser: User` (see `AddCommentCommand`). Replace that parameter
with `auth: AuthContext` — `{ user, sessionId, projectId?, projectRole? }` — so handlers can run
ownership checks without a second lookup. Mechanical change; the compiler finds every site.

## 6. Implementation notes and traps

1. **Guard order.** `AuthModule` registers `APP_GUARD` providers in order and Nest honours it —
   the v1 comment in `auth.module.ts` documents this. The order is now Auth → ProjectScope →
   Permission, and it is load-bearing: `ProjectScopeGuard` reads `req.auth`.
2. **Ticket → project resolution costs a query.** `ProjectScopeGuard` on `@ProjectScope('ticket')`
   routes selects `tickets.projectId` by id, then stashes the row id on the request so the
   handler's own load is not duplicated work. Return `404` if the ticket does not exist *or* the
   caller is not a member — the two must be indistinguishable (spec 10 §5, R12).
3. **List endpoints must filter, not just guard.** `GET /projects` returns only the caller's
   memberships (everything, for a platform admin). A guard cannot do this; the query must join
   `project_members`. This is the most likely place for a leak to survive review.
4. **Reads are guarded now**, which changes existing tests: every integration test that calls a
   `GET` without a header will start failing. That is the point — treat each failure as
   confirmation, not noise.
5. **Timing.** Compare the password hash even when the user is unknown (verify against a fixed
   dummy hash) so login timing does not disclose which emails exist.
6. **Rate limiting** via `@nestjs/throttler` on `/auth/login` and `/auth/invite/accept`, keyed on
   `ip + email`, 10 per 15 minutes. In-process only; a multi-instance deployment needs a shared
   store, which is out of scope and should be noted at the top of the module.
7. **CORS** gains `credentials: true` and drops `x-acting-user-id` from `allowedHeaders` in
   favour of `authorization`. `WEB_ORIGIN` becomes mandatory — a wildcard origin with
   credentials is rejected by browsers anyway, so failing at boot is kinder than at runtime.
8. **Dev impersonation flag.** Checked in `main.ts` at boot:
   ```ts
   if (process.env.AUTH_DEV_IMPERSONATION === 'true' && process.env.NODE_ENV === 'production') {
     throw new Error('AUTH_DEV_IMPERSONATION must not be enabled in production');
   }
   ```
   The `AuthGuard` branch that honours the header reads a value captured at boot, not
   `process.env` per request, so nothing can flip it while running.
9. **argon2id** via the `argon2` package: memory 19 MiB, iterations 2, parallelism 1
   (the OWASP baseline). It is a native module — add it to the API Docker image's build stage
   and verify the final image still runs, since the current Dockerfile likely prunes build deps.
10. **Seed.** Seeded users become `active` with `password_hash` for a known dev password
    (`DevPassw0rd!2026`, documented in the README). Hash it once at seed time, not eight times.

## 7. Frontend

- **`apps/web/src/auth/`** — `AuthProvider` (context + `useAuth`), `tokenStore` (a module-level
  variable, **not** Zustand-persisted and never `localStorage`: memory is the point), `LoginPage`,
  `AcceptInvitePage`, `SessionsPage`.
- **`client.ts`** — attach `Authorization: Bearer`; `credentials: 'include'`; on `401`, run one
  refresh through a **single shared in-flight promise** so ten parallel queries do not fire ten
  refreshes (which reuse-detection would read as an attack and kill the session). If refresh
  fails, clear the token and redirect to `/login?next=…`. The `if (isMutation && !actingUserId)`
  precondition and the `actingUserId` parameter threaded through every function in
  `endpoints.ts` are deleted.
- **Routing** — a `beforeLoad` on the authenticated route tree redirects to `/login`; bootstrap
  calls `/auth/refresh` once before first paint so a reload does not flash the login page.
- **`store/actingUser.ts` and `layout/ActingUserMenu.tsx` are deleted.** Everything reading
  `useActingUserStore` (ticket detail, comments, board move, create-ticket, three People pages)
  switches to `useAuth().user`. Clear the persisted `ticket-tracker.acting-user` key on first
  boot of the new version.
- **Permission helpers** — `useCan()` resolves the effective role for the current project from
  `memberships`, so `can('ticket.delete', role)` call sites become
  `useCan('ticket.delete')`. Ownership-dependent controls (delete, reassign, edit comment)
  additionally compare ids client-side, and the server still re-checks (R14).
- **CSP** — add a strict `Content-Security-Policy` in the web container's nginx config: no
  `unsafe-inline` scripts, `connect-src` limited to the API origin. This is the stated mitigation
  for spec 10 §8's XSS caveat, so it is not optional.

## 8. Configuration

| Variable | Default | Notes |
|---|---|---|
| `AUTH_JWT_SECRET` | — | **Required.** ≥32 bytes. Boot fails without it. Rotating it logs everyone out. |
| `AUTH_ACCESS_TTL` | `15m` | |
| `AUTH_REFRESH_TTL` | `30d` | |
| `AUTH_INVITE_TTL` | `7d` | |
| `AUTH_DEV_IMPERSONATION` | `false` | Honours `X-Acting-User-Id`. Refused when `NODE_ENV=production`. |
| `WEB_ORIGIN` | — | **Required** now that CORS sends credentials. |
| `AUTH_COOKIE_DOMAIN` | unset | Set when API and web are on different subdomains. |

## 9. Test plan

| Level | Coverage |
|---|---|
| Unit | `effectiveRole()` truth table (global role × membership × platform-admin); the platform and project permission matrices, restated independently of the source map as `roles.guard.spec.ts` already does; every `assertCan*` ownership function; the password policy; `toUser()` never emits password material. |
| Integration | Login success/failure/lockout; refresh rotation; **reuse detection revokes the family**; logout and logout-everywhere; invite issue → accept → login; expired and reused invites; disable-revokes-sessions; password-change-revokes-others; non-member gets 404 on a project *and* on a single ticket id; per-project role beats global role in both directions; `GET /projects` lists only memberships; last-admin refusal on both scopes. |
| E2E | Log in as a seeded user for real (not impersonation); a developer cannot see the Epic option or the Delete button, and the API refuses both when driven directly; a non-member navigating to a project URL gets "not found"; session survives reload; logout returns to `/login` and the back button does not restore the app. |

Every R-number in spec 10 §5 must be citable from at least one test name. The two riskiest
areas — mirroring spec 09's judgement about R1/R2 — are **R12 project scoping** and **R16 reuse
detection**: both are invisible when broken and both are covered at all three levels.

## 10. What this spec does not answer

- **Multi-instance rate limiting and session cache.** Single-process assumptions are marked
  inline (§6.6).
- **Key rotation.** `AUTH_JWT_SECRET` is single-valued; supporting overlap needs a key list and
  `kid` claims.
- **Cleanup of expired rows.** `refresh_tokens`, `invites`, and `auth_events` grow without bound;
  a retention job is needed before this runs for a long time, and is not specified here.
- **SSO**, per spec 10 §9.
