# 10 — Authentication & Authorization (real auth, replacing "acting as")

**Status:** specified, not yet built. Supersedes [08 — "Acting As" User & Permissions](08-current-user-and-permissions.md), which was explicit that it was role *simulation*, not access control, and sketched this replacement.

This is the **functional** spec: what the system does, who may do what, and what a person sees.
The **technical** spec — schema, tokens, guards, module plan — is [docs/auth-tech-spec.md](../docs/auth-tech-spec.md).

---

## 1. Why this exists

v1 shipped with no authentication. `X-Acting-User-Id` is a header the client sets to any user
id it likes, so:

- anyone who can reach the API can act as an admin;
- every `GET` is fully open — the whole user directory, every project, every ticket;
- any authenticated-in-name-only user can write to any project.

v2 closes all three. The permission *matrix* survives largely intact; what changes is that the
identity behind it becomes **proven** rather than **claimed**, and that authorization gains two
dimensions it never had: **which project** and **which record**.

## 2. Scope

**In scope**
- Email + password login, with signed access tokens and rotating refresh tokens.
- Admin-created accounts with an invite link the invitee uses to set their own password.
- Password change, session listing, and logout (single session and all sessions).
- Per-project membership, with a role that can differ per project.
- Record-level ownership rules for ticket deletion, assignment, and comment editing.
- Account disable, which immediately ends that person's sessions.

**Out of scope for this spec** (named so nobody assumes they're implied)
- SSO / OAuth / SAML. The design leaves room (§9) but no work is planned.
- Multi-factor authentication.
- Self-service signup. Accounts are created by a platform admin, always.
- Password reset by email — there is no mail transport in this system. Recovery is
  "a platform admin re-issues an invite", which is functionally a reset (§4.4).
- Organisation/tenant separation above the project level.

## 3. Roles and scopes

There are two independent scopes. Getting this distinction right is the whole design.

### 3.1 Global role — what you are on the platform

Every user has exactly one global role: `admin`, `manager`, or `developer` (unchanged from v1).
It governs only **platform-level** actions — those that belong to no single project.

| Platform action | admin | manager | developer |
|---|:--:|:--:|:--:|
| Create, edit, disable users; send invites | ✅ | ❌ | ❌ |
| Create a project | ✅ | ❌ | ❌ |
| See the full people directory (incl. email addresses) | ✅ | ❌ | ❌ |
| See the people directory (name, department, role) | ✅ | ✅ | ✅ |
| Manage any project's membership | ✅ | ❌ | ❌ |

**The global `admin` is a platform superuser.** They bypass project membership entirely and act
with `admin` rights inside every project, whether or not a membership row exists. This is a
deliberate, documented power: it keeps an organisation from locking itself out of its own data,
and it is the single most dangerous role in the system. §8 covers the safeguards on it.

Global `manager` and `developer` carry no special power at all outside a project. A global
manager who is a member of nothing can log in and see an empty project list.

### 3.2 Project role — what you are inside one project

Membership in a project is an explicit grant, and it carries **its own role**, which *overrides*
the global one for everything inside that project. Someone can be a `manager` on Atlas Billing
and a `developer` on Vega Mobile.

> **Effective role** for a request touching project P
> = `admin` if the user's global role is `admin`
> = else the role on their `project_members` row for P
> = else **no access** — the project and everything under it responds `404`, not `403`.

Responding 404 rather than 403 is intentional: a non-member should not be able to discover
which projects exist by watching status codes.

| Project action | admin | manager | developer |
|---|:--:|:--:|:--:|
| Read the project's tickets, board, overview, sprints | ✅ | ✅ | ✅ |
| Add/remove members, change a member's project role | ✅ | ✅ | ❌ |
| Rename the project, change its key prefix | ✅ | ✅ | ❌ |
| Create a Story or Bug | ✅ | ✅ | ✅ |
| Create an Epic | ✅ | ✅ | ❌ |
| Edit a ticket's fields | ✅ | ✅ | ✅ |
| Assign or reassign a ticket | ✅ | ✅ | owner only — §3.3 |
| Delete a ticket | ✅ | ✅ | reporter only — §3.3 |
| Comment | ✅ | ✅ | ✅ |
| Edit or delete a comment | author only — §3.3 | author only | author only |

The epic-creation and ticket-deletion rules are the same ones v1 enforced; they now read from
the **effective project role** instead of the global one.

### 3.3 Record-level rules — what you own

Two project actions additionally consider who created or holds the record. These cannot be
decided from the route alone; they need the row.

| Action | Permitted to |
|---|---|
| `ticket.update` (fields, status, labels) | any member of the project |
| `ticket.assign` (change assignee) | the reporter, the current assignee, or a project manager/admin |
| `ticket.delete` | the reporter, or a project manager/admin |
| `comment.create` | any member of the project |
| `comment.update` | **the author only** — not even a project admin |
| `comment.delete` | the author, or a project admin |

Rationale, since these will be questioned:
- **Editing tickets stays open to every member.** A tracker where a developer cannot correct a
  wrong label on someone else's bug is a tracker people route around.
- **Assignment and deletion are narrowed** because both are ways to make work disappear from
  someone's view without their knowledge.
- **Nobody may edit another person's words.** A comment is attributable speech; an admin may
  remove one (moderation) but may never alter it and leave the author's name on it.

### 3.4 Reading is no longer free

Every endpoint requires an authenticated user. There are exactly four unauthenticated routes:
`POST /auth/login`, `POST /auth/refresh`, `POST /auth/invite/accept`, and the health check.
The Swagger UI is authenticated in non-development environments.

Email addresses are visible to the user themselves and to platform admins. Every other
authenticated user sees name, department, global role, and avatar initials — enough for
assignee pickers and comment attribution, without publishing a company address book.

## 4. User journeys

### 4.1 Being invited

1. A platform admin opens **People → Add person**, fills in name, email, department, and global
   role, and submits.
2. The account is created in status **invited**. It has no password and cannot log in.
3. The system issues a single-use invite link, valid for **7 days**. There is no email
   transport, so the admin sees the link once, on screen, and passes it on themselves. It is
   not shown again — a lost link is re-issued, not recovered.
4. The invitee opens the link, sets a password meeting the policy in §5.1, and lands logged in.
   The account becomes **active**.
5. An expired, already-used, or unrecognised link shows the same neutral message: *"This invite
   link is no longer valid. Ask an administrator to send you a new one."*

### 4.2 Logging in

1. The person enters email and password on the login page.
2. On success they get an access token (short-lived, held in memory) and a refresh cookie, and
   land on the last project they used — or, if that project is no longer theirs, on the first
   project they are a member of.
3. A user who is a member of no projects sees an explicit empty state — *"You're not a member of
   any project yet. Ask an administrator to add you."* — not a broken dashboard.
4. Failures are indistinguishable: wrong password, unknown email, invited-but-not-active, and
   disabled accounts all return the same *"Email or password is incorrect."* Never reveal which
   emails have accounts.
5. After **10 failed attempts in 15 minutes** for the same email or from the same IP, further
   attempts are refused for 15 minutes with *"Too many attempts. Try again in a few minutes."*

### 4.3 Staying logged in, and stopping

- A session survives a page reload and browser restart, and lasts up to **30 days** of use.
  Being idle for 30 days ends it.
- Logging out ends the current session immediately. **Log out everywhere** ends all of them.
- Changing your password ends every *other* session, keeping the one you changed it from.
- A person can see their active sessions — device/browser, IP, last used — and revoke any one.

### 4.4 Losing and regaining access

- **Forgot password:** ask a platform admin, who re-issues an invite. Accepting it sets a new
  password and, because it is a credential change, ends every existing session on that account.
- **Leaving the team:** an admin sets the account to **disabled**. Sessions end within seconds,
  the login is refused, and the person disappears from assignee pickers — but their name stays
  on the tickets they reported and the comments they wrote. Accounts are never deleted; history
  must remain readable. (This closes the "user deletion strategy" item open since v1.)

### 4.5 Joining and leaving a project

- A project manager or admin adds a member by picking them from the directory and choosing their
  role *in that project*, defaulting to the member's global role.
- Removing a member takes effect on their next request. Their tickets and comments stay; they
  simply can no longer see the project.
- The last remaining project admin cannot be removed or demoted; the UI blocks it and the API
  refuses it with *"A project must keep at least one admin."*

## 5. Rules the server must enforce

Numbered so tests and later specs can cite them, continuing v1's R-series.

- **R11 — Proven identity.** Every request except the four public routes resolves to an
  authenticated, active user, or is rejected `401`. No header, param, or body field may name the
  acting user.
- **R12 — Project scoping.** Every project-scoped request resolves an effective role (§3.2).
  Non-members get `404` for the project and every resource beneath it, including single tickets
  addressed by their own id.
- **R13 — Effective role, not global role.** All in-project permission checks read the effective
  project role. A global manager who is a project developer may not create an epic there.
- **R14 — Ownership.** The rules in §3.3 are enforced in the command handlers that load the
  record, not only in route guards, and not only in the UI.
- **R15 — Credential invalidation.** Disabling an account, changing a password, or accepting a
  new invite invalidates that user's existing sessions. Revocation is effective on the next
  request, not merely on token expiry.
- **R16 — Refresh-token rotation with reuse detection.** Every refresh consumes its token and
  issues a new one. Presenting an already-consumed token revokes the entire session family and
  logs the event — the standard signal of a stolen token.
- **R17 — No password material leaves the server.** Password hashes are never selected into any
  DTO. Login, invite-accept, and password-change bodies are excluded from request logging.
- **R18 — Last admin standing.** The system always retains at least one active platform admin,
  and each project at least one project admin. The API refuses the operation that would break
  either.
- **R19 — Audited authority.** Login, logout, failed login, invite issued/accepted, password
  change, role change, membership change, account disable, and refresh-reuse detection are all
  recorded with actor, subject, time, and IP.

### 5.1 Password policy

Minimum 12 characters. Rejected if it matches the user's email local-part, or appears in the
bundled common-password list. No composition rules (no "must contain a symbol") and no
expiry — both are known to produce worse passwords. Hashing is argon2id; the parameters live in
the tech spec.

## 6. What a person sees

**Login page** — email, password, submit, and one error line. No "sign up" link; no password
reset link (there is nothing to link to). Reachable at `/login`; every other route redirects
here when unauthenticated, preserving the intended destination.

**Invite acceptance** — `/invite/:token`. Shows the inviting organisation's name and the target
email, a password field with a live policy checklist, and a confirm field.

**Sidebar** — the "Acting as (no real auth)" switcher is **gone**. In its place is the signed-in
person's name, avatar and global role, opening a menu with: *Your profile*, *Change password*,
*Active sessions*, *Log out*, *Log out everywhere*.

**Project switcher** — lists only projects the person is a member of (all projects, for a
platform admin, marked as such).

**Permission-aware controls** — every control the effective role cannot use is hidden, exactly as
in v1 and for the same reason: it is UX, never enforcement. New in v2 is that the frontend must
know the *project* role, so the shared permission helpers take a scope argument.

**Project settings → Members** — a table of members with their project role, an add-member
picker, and role selects. Visible to project managers and admins.

**Errors** — `401` while using the app triggers one silent token refresh; if that fails, the
person is returned to `/login` with their place remembered and a single *"Your session
expired — please sign in again."* `403` renders inline where the action was attempted, never as
a full-page error. `404` on a project renders "Project not found", identical to a genuinely
missing id.

## 7. Development and testing

Real login in every test would be slow and would make failures hard to read, so a narrow escape
hatch exists:

- When `AUTH_DEV_IMPERSONATION=true`, the API honours `X-Acting-User-Id` exactly as v1 did,
  short-circuiting authentication and granting that user's real roles and memberships.
- The flag is **refused at boot when `NODE_ENV=production`** — the process exits rather than
  starting in a state where the header works. This is a startup check, not a runtime one, so it
  cannot be missed.
- It is off by default, on in `docker-compose` for local development, and on for the integration
  and e2e suites — *except* for the auth suites themselves, which log in for real.
- Seeded users are created **active** with a known development password so anyone can log in to
  a fresh checkout. The seed refuses to run against a database whose URL is not local unless
  forced.

## 8. Threat model — what this does and does not defend against

Written in the same honest register as spec 08, because the previous document's value was that
it did not oversell itself.

**Defended**
- A curious or careless internal user escalating to admin by editing a header. Identity is now
  signed and server-verified.
- A stolen access token being useful for long — 15 minutes, and it cannot be refreshed without
  the cookie.
- A stolen refresh token going unnoticed — reuse detection kills the family (R16).
- XSS reading the long-lived credential — the refresh token is `httpOnly` and scoped to the
  refresh path, so script cannot read it.
- Enumeration of users or projects — uniform login errors, and 404 for non-members.
- An ex-employee retaining access — disable is immediate (R15), not expiry-bound.

**Not defended, and accepted**
- **A global admin doing anything they like.** There is no separation of duties above them and
  no four-eyes requirement. The mitigations are that the role is rare, its actions are audited
  (R19), and R18 stops the platform being orphaned. If that is not enough for your deployment,
  this design is not enough either.
- **XSS in general.** It cannot steal the refresh token, but it can use the access token in
  memory to act as the user for as long as the page is open. A strict CSP is required and is
  part of the tech spec; it is mitigation, not a solution.
- **A compromised database.** Password hashes are argon2id and refresh tokens are stored hashed,
  so neither is directly reusable, but ticket data is plaintext at rest.
- **Malicious project members.** Anyone you add to a project can read all of it. There is no
  field-level confidentiality and no private tickets.
- **Rate-limiting bypass by distributed sources.** The limiter is per-IP and per-email in one
  process; it is a speed bump against credential stuffing, not a defence against a botnet.

## 9. Deliberately left open

- **SSO.** The token issuance path is isolated behind one service so an OIDC provider could
  become an alternative issuer without touching guards or the permission matrix. No work planned.
- **Per-project role for the global admin.** Superuser status is currently all-or-nothing.
- **Ticket-level visibility.** Every member sees every ticket in their projects.
- **Notification of security events.** No mail transport means nobody is told their password
  changed. The audit log records it; nothing reads the log to them.

## 10. Migration from v1

1. Ship the schema, guards, and endpoints with `AUTH_DEV_IMPERSONATION` defaulting to **true**,
   so nothing breaks while the frontend is still on acting-as.
2. Backfill: every existing user becomes status **invited**; every existing user is added as a
   member of every existing project with their global role, preserving today's effective access
   exactly.
3. Ship the frontend login flow and delete the acting-as menu.
4. Flip the default of `AUTH_DEV_IMPERSONATION` to **false** and remove it from any deployed
   environment.

No data migration touches tickets or comments; authorship columns already point at real users.
