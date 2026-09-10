# 23 — Identity, Org Structure & Governance

Spec 10 shipped a complete first-party auth system and explicitly deferred SSO (§9). The permission
matrix in `packages/shared/src/permissions.ts` is three fixed roles compiled into the app. There is no
tier above "project", no group membership, and no operator-facing console.

Everything here extends spec 10 rather than replacing it. Its invariants (R11–R19) continue to hold.

## 1. SSO — OIDC and SAML

- `identity_providers`: per-org config (issuer, client id/secret, JWKS URL, attribute mapping,
  `enforced` flag, allowed email domains).
- OIDC authorization-code flow with PKCE; SAML 2.0 via `@node-saml/passport-saml` for the enterprise
  cases that still require it.
- **Just-in-time provisioning**: a first successful assertion creates the user, disabled-by-default or
  auto-activated per config, with role from an attribute mapping. Domain allowlist enforced.
- Account linking by verified email. An unverified email must never link — that is account takeover.
- `enforced` disables password login for that org's users, except a break-glass local admin list that
  cannot be empty (locking every administrator out of an SSO-enforced instance whose IdP is down is a
  real and unrecoverable failure).
- Sessions still issue this app's own tokens; the existing `SessionService`, refresh rotation and
  replay detection are unchanged. IdP-initiated logout hits the same revocation path.
- `auth_events` gains `sso_login`, `sso_provisioned`, `sso_link_failed`.

## 2. SCIM 2.0

`/scim/v2/Users` and `/scim/v2/Groups`, authenticated by a dedicated service token (spec 22 §2).
Create, update, deactivate and group membership sync. Deactivation via SCIM revokes every refresh
token and API token immediately — an offboarded employee losing access everywhere except here is the
scenario this exists to prevent.

## 3. Teams

`teams` and `team_members`, plus `project_members` accepting a team as its subject. Assigning a team
to a project with a role grants that role to its members; an effective-role resolution takes the
strongest of the user's direct and team-derived roles. `@team-name` becomes mentionable (spec 14) and
assignable as a ticket's "assigned team" for triage queues.

## 4. Custom roles

Today's matrix is compiled in. Moving it to data must not weaken it.

- `roles` (per org: name, description, `isSystem`) and `role_permissions` (the action list).
- The action vocabulary stays exactly `PLATFORM_PERMISSIONS` / `PROJECT_PERMISSIONS` as declared in
  `packages/shared` — code continues to ask `can(role, 'ticket.delete')`; only the answer's source
  moves. **The guards remain the sole enforcement point**, as spec 08 insists.
- `admin`, `manager` and `developer` are seeded as immutable system roles reproducing today's matrix
  exactly, so an instance that never touches the editor behaves identically.
- Permissions are cached per role with an explicit invalidation on change, because they are read on
  every request.
- A role in use cannot be deleted without reassignment.

## 5. Organisations / workspaces

The tier above project. Decided now because retrofitting a tenant boundary later is the single most
expensive migration this codebase could face.

- `organizations`; every project, user, team, role and workflow belongs to exactly one.
- Migration creates a single default org and backfills every existing row into it, leaving current
  single-tenant behaviour unchanged.
- `ProjectScopeGuard` gains an org check above its project check.
- Org-level settings: identity providers, default notification policy, retention policy, branding.

## 6. Project visibility & archival

- `visibility`: `private` (membership only — today's behaviour), `internal` (any org member reads),
  `public` (anonymous read, if the instance enables it). The default stays `private`; an existing
  project's behaviour must not change.
- **Archive**: read-only project, hidden from the switcher, still searchable and exportable. Every
  write path checks the archived flag centrally, not per handler.
- Delete is a two-step with a typed confirmation, a 30-day soft window, then a purge job.

## 7. Admin console

An operator UI over what already exists: instance users with disable/reset/force-logout, active
sessions (from `refresh_tokens`), the `auth_events` audit browser with filtering and CSV export, job
queue health and the dead-letter queue (spec 13), webhook delivery health (spec 22), feature flags,
and instance settings. Gated on the platform `admin` role and every action audited.

## 8. Session & device management

For end users, in account settings: active sessions with device, IP, last-used and current-session
marker; revoke one; "sign out everywhere". The `refresh_tokens` table already carries what this needs.

## 9. Data governance

- **Audit retention & export**: configurable retention for `auth_events` and `ticket_events`, a purge
  job, and a signed export for SIEM ingestion.
- **GDPR**: export-my-data (everything about one subject) and right-to-erasure. Erasure **redacts,
  never cascades** — a user row is anonymised in place (`Deleted user #1234`, email nulled, hashes
  cleared) so that `reporterId`, `actorId`, comment authorship and audit trails keep referential
  integrity. Deleting the row would take the project's history with it, which is both wrong and, for
  audit records, usually unlawful.
- A documented, tested backup and restore runbook: PITR, an RPO/RTO statement, and a scheduled
  restore rehearsal — a backup nobody has restored is a hypothesis, not a backup.

## Out of scope

Per-field permissions, customer-facing portals, multi-region data residency, and hardware-key MFA
(TOTP MFA is a natural follow-on to §1 but is not specified here).

## Acceptance criteria

- OIDC login provisions a user, links only on a verified email, and issues this app's own session.
- With `enforced`, password login is refused for org users and still works for a break-glass admin;
  the config cannot be saved with an empty break-glass list.
- SCIM deactivation kills every refresh token and API token within one request cycle.
- Seeded system roles produce decisions byte-identical to the current matrix — `permissions.spec.ts`
  passes unchanged against the database-backed resolver.
- Every existing row lands in the default org and no existing test changes behaviour.
- An archived project rejects every write with one consistent error and still returns search results.
- Erasure anonymises the user while every ticket, comment and audit row remains resolvable.
