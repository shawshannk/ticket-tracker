# 13 — Background Jobs & Transactional Email

Two pieces of infrastructure with no UI, needed by almost everything after them. There is no job
runner in the repo at all today, and invites are delivered by an admin copying a token string out of
the API response by hand (`invite.service.ts` returns the raw token exactly once).

## 1. The job runner

**BullMQ on Redis.** Redis enters the stack here; Compose gains a `redis:7-alpine` service and
`/health/ready` (spec 11 §4) gains a Redis check.

- `apps/api/src/jobs/` — a `JobsModule` exporting a typed `enqueue(name, payload, opts)`.
- Job names and payload Zod schemas live in `packages/shared` so a producer and its consumer cannot
  disagree about the shape.
- Every job is **idempotent and retryable**: exponential backoff, 5 attempts, then a dead-letter
  queue that is visible in the admin console (M53). A job handler that cannot be safely re-run must
  guard itself with a dedupe key, not assume single delivery.
- Repeatable jobs (cron-style) are declared in one registry file so the full schedule is readable in
  one place: trash purge (M24), digest send (M28), scheduled reports (M41), staleness scan (M61).
- **Workers run in the same image as the API but a different process** — `node dist/jobs/main.js`,
  a second Compose service and a second container in any deployment. A request-serving process must
  never block on job execution.
- Jobs carry the originating `requestId` in their payload envelope so spec 11's correlation survives
  the queue boundary.

## 2. The transactional outbox

Email that must not be lost — an invite, a password reset — is not enqueued directly from a request
handler, because the enqueue can succeed while the transaction rolls back, or vice versa.

```ts
export const outbox = pgTable('outbox', {
  id: uuid('id').primaryKey().defaultRandom(),
  kind: text('kind').notNull(),
  payload: jsonb('payload').notNull(),
  createdAt: timestamp(…).notNull().defaultNow(),
  processedAt: timestamp(…),
  attempts: integer('attempts').notNull().default(0),
  lastError: text('last_error'),
});
```

Handlers insert an outbox row inside their own transaction; a repeatable job drains unprocessed rows
into the queue. This is the pattern for anything where "the change happened but the email didn't" is
unacceptable.

## 3. Email delivery

- `MailModule` with a provider interface and three implementations: **SMTP** (nodemailer, the
  default), **console** (development — renders to the log and to a `/dev/mail` page), and **noop**
  (CI). Selected by `MAIL_TRANSPORT`. No test in any suite may send real mail.
- Templates as MJML compiled to HTML at build time, each with a plain-text alternative. Templates
  live in `apps/api/src/mail/templates/` and take typed props.
- Every outbound mail has an unsubscribe/preferences link except the four transactional ones below,
  and carries `List-Unsubscribe` where applicable.
- `FROM` address, reply-to and the app's public base URL come from validated config (spec 11 §7);
  the base URL is what every link in every template is built from, and getting it wrong silently
  produces unusable emails, so it has no default.

## 4. The four transactional emails

1. **Invite** — replaces the copy-paste flow. `POST /invites` now sends; the raw token is no longer
   returned in the response body at all, which also removes it from API logs and from the admin's
   clipboard. The existing hash-only storage and single-use consumption in `invite.service.ts` are
   unchanged. Resend and revoke endpoints are added, both audited.
2. **Password reset** — genuinely absent today: a user who forgets their password needs an admin.
   `POST /auth/forgot-password` (public, rate-limited on the same ip+email basis as login, and
   **always returning 204 regardless of whether the address exists** — the response must not be an
   account-existence oracle), `POST /auth/reset-password` consuming a single-use, 1-hour,
   hash-stored token from a `password_reset_tokens` table shaped like `invites`. On success:
   revoke every refresh token for that user, and write `password_changed` to `auth_events`.
3. **Email verification** — for self-changed addresses. Changing an email does not take effect until
   the new address is confirmed; the old address is notified that a change was requested.
4. **Security notice** — sent on password change, on a new-device sign-in, and on `refresh_reuse`
   (which M20 already detects and treats as a compromise signal, but currently tells nobody).

## Out of scope

Marketing/bulk email, per-tenant SMTP configuration, and inbound email parsing (M56).

## Acceptance criteria

- `enqueue` → worker executes; a handler that throws is retried and lands in the DLQ after 5 attempts.
- A job enqueued from a request logs with the same `requestId` in the worker process.
- An outbox row written in a transaction that rolls back is never delivered.
- Invite email arrives (console transport) with a working accept link; the raw token appears in no
  response body and in no log line.
- Forgot-password returns 204 in the same time envelope for a known and an unknown address, and a
  used reset token is rejected the second time.
- A successful reset signs out all existing sessions for that user.
