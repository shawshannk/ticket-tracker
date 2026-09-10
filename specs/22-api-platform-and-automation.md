# 22 — API Platform, Webhooks, Tokens & Automation

Today the only way to authenticate is an interactive login producing a session cookie and a JWT.
There is no way for a script, a pipeline or another system to call this API, and no way for this API
to tell anyone else that something happened.

## 1. Outbound webhooks

```ts
export const webhookSubscriptions = pgTable('webhook_subscriptions', {
  id, projectId, url, secret, events: text[], tqlFilter, active, createdBy, createdAt,
});
export const webhookDeliveries = pgTable('webhook_deliveries', {
  id, subscriptionId, eventId, requestBody, responseStatus, responseBody,
  attempt, deliveredAt, nextRetryAt, status,
});
```

- Events come from spec 12's stream, optionally narrowed by a TQL filter, so a subscription can be
  "only critical bugs in this project".
- Payloads are signed: `X-Signature: sha256=…` HMAC over the raw body with a per-subscription secret,
  plus `X-Timestamp` and a delivery id for replay protection on the receiver's side.
- Retries with exponential backoff (5 attempts). A subscription failing continuously for 24 hours is
  auto-disabled and its owner notified — a dead endpoint must not consume the queue forever.
- Every delivery is inspectable and replayable from project settings. Debugging a webhook without a
  delivery log is guesswork, and that log is most of the feature's value.
- **SSRF protection is mandatory**: the target URL is resolved and checked against private/link-local/
  loopback ranges at save time *and* at delivery time (DNS can be re-pointed between the two), scheme
  restricted to https outside development, redirects not followed.

## 2. Personal access tokens & service accounts

```ts
export const apiTokens = pgTable('api_tokens', {
  id, userId, name, tokenHash, prefix, scopes: text[], projectIds: uuid[],
  lastUsedAt, expiresAt, revokedAt, createdAt,
});
```

- Format `tt_<prefix>_<secret>`; only the hash is stored, reusing `TokenService`'s hashing. Shown once
  at creation, exactly like an invite.
- **Scoped down, never up**: a token's effective permission is the intersection of its scopes and its
  owner's current permissions, re-evaluated per request. A developer's token cannot delete a ticket,
  and revoking the user's access instantly neuters every token they hold.
- Scopes are coarse and readable: `tickets:read`, `tickets:write`, `projects:read`, `admin:read`, …
  Optionally restricted to named projects.
- Presented as `Authorization: Bearer tt_…`; `AuthGuard` gains a token branch beside the JWT branch,
  populating the same `AuthContext` so every downstream guard is unchanged.
- `lastUsedAt` updated asynchronously (a per-minute bucket, not a write per request).
- Expiry required, max 1 year. A job warns 7 days before and audits creation, use-after-revoke and
  revocation into `auth_events`.
- **Service accounts**: users with `type: 'service'` that cannot log in interactively, for CI and
  integrations, so a pipeline is not tied to an employee who may leave.

## 3. Automation rules

The if-this-then-that layer. Everything below already exists in pieces — this composes them.

```ts
export const automationRules = pgTable('automation_rules', {
  id, projectId, name, enabled, trigger: jsonb, conditions: jsonb, actions: jsonb,
  runAsUserId, createdBy, lastRunAt, runCount,
});
```

- **Triggers**: ticket created, field changed, status changed, comment added, link added, scheduled
  (cron), webhook received, git event (spec 18), sprint started/completed.
- **Conditions**: a TQL expression, plus field comparisons on the old and new values.
- **Actions**: transition, assign, set field, add/remove label, add comment, create sub-task, link
  tickets, send notification, call a webhook, run another rule.
- Runs as `runAsUserId` (default the rule's creator) and is **subject to that user's permissions** —
  automation is never a privilege escalation path.
- **Loop protection**: a rule's own actions do not re-trigger it; a chain depth limit of 5; a
  per-project execution budget per hour. Without these the first rule anyone writes takes the queue
  down.
- Every run is logged with trigger, matched conditions, actions taken and errors, viewable per rule.
  Rules that cannot be debugged get disabled and distrusted.
- A dry-run mode evaluates against recent events and reports what *would* have happened.

## 4. Public API surface

- Version the API at `/v1`, with the current unversioned paths kept as aliases for the web app.
- Rate limits per token and per user, tighter than the global 300/min in `auth.module.ts`, returned as
  `X-RateLimit-*` headers with a `Retry-After` on 429.
- Cursor pagination and a consistent envelope on every list endpoint (spec 25 §3).
- The OpenAPI document (already generated) becomes the published contract: a CI check fails the build
  on a breaking change to a `/v1` path that is not accompanied by a version note.
- A deprecation policy: `Deprecation` and `Sunset` headers, and a changelog page.

## Out of scope

GraphQL, a plugin/app framework with third-party UI extensions, and OAuth for third-party apps acting
on a user's behalf (tokens cover first-party automation).

## Acceptance criteria

- A webhook to `http://169.254.169.254/…` is rejected at save and, if smuggled in via DNS, at delivery.
- A signed delivery verifies against the documented recipe; a tampered body does not.
- A failing endpoint is retried 5 times with growing delays and auto-disabled after the window.
- A token with `tickets:read` gets 403 on a write; revoking the owner's membership makes it 403 on
  reads for that project immediately.
- A rule whose action satisfies its own trigger halts instead of looping, and the halt is logged.
- A rule running as a developer cannot perform a manager-only transition.
- The OpenAPI diff check fails a PR that removes a `/v1` field.
