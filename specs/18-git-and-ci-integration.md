# 18 — Git, CI/CD & Deployment Integration

The feature that separates a tracker from a form. A ticket should know its branch, its pull request,
its pipeline and which environment its code is in, without anyone pasting a link.

## 1. Connections

```ts
export const integrations = pgTable('integrations', {
  id: uuid(…).primaryKey().defaultRandom(),
  projectId: uuid(…).notNull().references(() => projects.id),
  provider: text(…).notNull(),          // 'github' | 'gitlab' | 'azure_devops' | 'bitbucket'
  externalRepoId: text(…).notNull(),
  repoFullName: text(…).notNull(),
  // Encrypted at rest with a key from config; never returned by any endpoint, never logged.
  credentials: jsonb(…).notNull(),
  webhookSecret: text(…).notNull(),
  installedBy: uuid(…).notNull(),
  state: text(…).notNull(),             // 'active' | 'error' | 'revoked'
});
```

Provider differences live behind one `GitProvider` interface (`getPullRequest`, `createBranch`,
`listBranches`, `verifyWebhook`, `parseEvent`). GitHub first; GitLab and ADO are then adapters, not
forks of the feature.

Auth: a GitHub App (installation tokens, not a PAT) where possible; OAuth app otherwise. Tokens are
refreshed by a job before expiry; a `state: 'error'` connection surfaces in project settings with a
reconnect action rather than failing silently.

## 2. Webhook receiver

`POST /webhooks/git/:provider` — public route, but **not unauthenticated**: every request is verified
by HMAC against `webhookSecret` with a timing-safe compare before the body is parsed, and the raw body
must be preserved for that (the global JSON parser needs a raw-body branch for this path).

- Deliveries are recorded in `webhook_deliveries` (provider, event, external id, payload, status) and
  processed **idempotently by external delivery id** — providers retry, and a redelivered "PR merged"
  must not transition a ticket twice.
- Processing happens in a job. The endpoint acknowledges in under a second or the provider marks the
  hook unhealthy.

## 3. Linking

```ts
export const ticketGitLinks = pgTable('ticket_git_links', {
  ticketId: uuid(…).notNull(),
  integrationId: uuid(…).notNull(),
  kind: text(…).notNull(),        // 'branch' | 'commit' | 'pull_request'
  externalId: text(…).notNull(),
  title: text(…), state: text(…), url: text(…), authorLogin: text(…),
  updatedAt: timestamp(…),
});
```

Tickets are matched by **key** (`NIM-42`) found in a branch name, commit message or PR title/body.
The regex is built from the project's `keyPrefix`, anchored on a word boundary, and case-insensitive.
Ambiguity rules: a key for a project the repo is not connected to is ignored; a commit naming three
keys links to all three.

Author mapping: a `user_external_identities` table maps a provider login to a user, populated on
first sight by email match and correctable in the admin console. An unmapped author still links; the
event's actor is null with the login in metadata (spec 12's `actorId` is nullable for exactly this).

## 4. Smart commits & auto-transition

- Commit/PR text may carry directives: `TT-123 #done`, `#comment fixed the null check`, `#assign @sam`,
  `#time 2h`. Directives execute as the mapped user, and **subject to that user's permissions** — a
  developer cannot transition a ticket from a commit message that they could not transition in the
  UI. An unmapped author's directives are ignored and logged.
- A per-project transition map: PR opened → In Progress, review requested → In Review, merged → Done,
  closed unmerged → no change. Configurable, and off by default: a team must opt in, because a wrong
  auto-transition is far more irritating than none.
- Every automated change writes a ticket event with `actorId` = mapped user and metadata naming the
  commit/PR, so the timeline says why it moved.

## 5. Branch creation from a ticket

`POST /tickets/:id/branch` `{ baseBranch }` → creates `feature/NIM-42-short-slug` via the provider API
and returns the checkout command. Naming pattern is per-project config.

## 6. CI status

Pipeline/check-run events are stored per linked PR/commit and rendered on the ticket detail as a
compact status row. A failing required check on a PR linked to a ticket in "In Review" is shown on the
board card too — that is the state most worth surfacing without opening anything.

## 7. Deployment tracking

```ts
export const deployments = pgTable('deployments', { id, projectId, environment, version,
  commitSha, deployedAt, status, url });
```

Fed by deployment webhooks or `POST /deployments` from a pipeline using a PAT (spec 22 §2). Tickets
whose linked commits are contained in a deployment's SHA are marked as released to that environment,
which answers "is this fix in staging yet" — the question the existing `env` column only hints at.

## 8. Code review metrics

Derived from stored PR data: time-to-first-review, review latency, PR size distribution, per team and
per sprint. Surfaced in M39's dashboards.

## Out of scope

Hosting a git repo, in-app code review or diff viewing, and merge-queue behaviour.

## Acceptance criteria

- An unsigned or wrongly-signed webhook is rejected with 401 and no processing.
- The same delivery id processed twice produces one transition and one event.
- A branch named `feature/NIM-42-fix` links to NIM-42; `NIM-421` in the same repo does not.
- `#done` from a developer who lacks the transition permission is refused and logged, not applied.
- A PR merged with auto-transition disabled changes nothing.
- Revoking an integration removes no history — links persist, refresh stops.
