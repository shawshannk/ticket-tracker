# 11 — Production Hardening (observability, error contract, runtime safety)

Phase 3 opens here. Everything M1–M21 built works; what it lacks is the ability to be *operated*.
This spec is deliberately unglamorous: no user-visible feature ships in it. It exists because
every module after it becomes harder to debug in production if this one is skipped.

## 1. Structured logging

Replace Nest's default console logger with **pino** (`nestjs-pino`), wired as the app logger in
`main.ts` so framework logs travel the same path as ours.

- JSON in production, pretty-printed when `NODE_ENV !== 'production'`.
- Every line carries: `requestId`, `userId` (null when anonymous), `projectId` when the route is
  project-scoped, `method`, `path`, `statusCode`, `durationMs`.
- **Redaction is mandatory, not optional.** Configure pino's `redact` for `req.headers.authorization`,
  `req.headers.cookie`, `password`, `currentPassword`, `newPassword`, `token`, `tokenHash`.
  R17 (spec 10) already says credentials never reach a log; this is where that is enforced
  mechanically rather than by reviewer attention.
- Log level from `LOG_LEVEL`, defaulting to `info`.

## 2. Request correlation

A `RequestIdMiddleware` reads an inbound `x-request-id` (trusted only from the ingress; if absent,
generate a UUIDv4), puts it on the request, echoes it on the response header, and binds it into an
`AsyncLocalStorage` context so any service can log with the id without threading it through
signatures.

The id must also appear in the JSON error body (§3) — that is what turns a user's screenshot into
a log query.

## 3. The error contract

One `AllExceptionsFilter` registered globally. Every error response, without exception, has this shape:

```json
{
  "error": {
    "code": "TICKET_STATUS_INVALID",
    "message": "Status 'Planned' is not valid for a bug.",
    "requestId": "0f6b…",
    "details": [{ "path": "status", "message": "…" }]
  }
}
```

- `message` is safe to show a user. Internal detail (SQL, stack, driver text) is logged, never returned.
- A `ZodError` from `ZodValidationPipe` maps to 400 with `details` populated from the issue list.
- A Postgres unique violation maps to 409 via the existing `isUniqueViolation` helper — that helper
  stops being called ad hoc in each handler and becomes the filter's job.
- Any unrecognised throwable maps to 500 with `code: "INTERNAL"` and a generic message. The real
  error is logged at `error` level with the stack and the requestId.
- `packages/shared` gains an `ApiError` type and an `ERROR_CODES` union so the web app can branch on
  `code` instead of parsing English.

## 4. Health, readiness, shutdown

`GET /health` today returns `{status:'ok'}` unconditionally and stays green with the database down —
an orchestrator will route traffic to a broken instance. Split it:

- `GET /health/live` — process is up. No dependency checks. Never fails unless the event loop is dead.
- `GET /health/ready` — runs `select 1` against Postgres with a 2s timeout, plus any dependency a
  later module adds (Redis in M58, the job runner in M25). Returns 503 with a per-check breakdown
  when any check fails.
- Both `@Public()`. `GET /health` stays as an alias of `/health/live` for compatibility.

Use `@nestjs/terminus`. Call `app.enableShutdownHooks()`; on `SIGTERM` stop accepting connections,
let in-flight requests drain (configurable `SHUTDOWN_TIMEOUT_MS`, default 10000), then close the
Postgres pool. Without this, every deploy severs open transactions.

## 5. HTTP surface safety

In `main.ts`:

- `helmet()` — the API currently returns no security headers at all; the CSP added in M21 covers only
  the web app's nginx.
- JSON body limit of 1 MB (`express.json({ limit: '1mb' })`). Attachments (M32) will not travel
  through this path.
- A global request timeout interceptor (`REQUEST_TIMEOUT_MS`, default 30000) returning 503, so a
  pathological query cannot hold a connection open forever.
- **Swagger is gated**: mount `SwaggerModule` only when `NODE_ENV !== 'production'` or
  `ENABLE_API_DOCS=true`. Today the full API surface is published at `/api` unconditionally.
- Trust the proxy (`app.set('trust proxy', 1)`) so `req.ip` — which the login rate limiter and
  `auth_events` both record — is the client address and not the load balancer's.

## 6. Container hardening

`apps/api/Dockerfile` currently runs as root and copies the whole `node_modules`, dev dependencies
included, into the runtime stage.

- Add a non-root user (`node`) and `USER node` before `CMD`.
- Re-run `pnpm install --prod` (or `pnpm prune --prod`) in the runtime stage.
- Add `HEALTHCHECK CMD node -e "fetch('http://localhost:3000/health/live')…"`.
- Same treatment for `apps/web/Dockerfile`.

## 7. Configuration validation

A Zod schema over `process.env` validated once at boot (`apps/api/src/config/env.ts`), exported as a
typed `AppConfig`. A missing or malformed `DATABASE_URL`, a short `AUTH_JWT_SECRET`, an unparseable
`AUTH_LOGIN_RATE_LIMIT` must fail at startup with a readable message — the same discipline
`assertImpersonationIsSafe()` already applies to one variable, generalised to all of them.

## 8. Error tracking

Sentry (`@sentry/node`) behind `SENTRY_DSN`; when unset the integration is inert, so local and CI runs
need no account. Attach `requestId` and `userId` as tags. Scrub request bodies by default.

## Out of scope

Metrics/tracing (Prometheus, OpenTelemetry) — deferred to M59 with load testing, where there is
something to compare the numbers against. Log shipping is a deployment concern and no cloud target is
chosen yet.

## Acceptance criteria

- Every 4xx/5xx from any route matches the §3 envelope; an integration test asserts the shape for a
  validation failure, a 403, a 404 and a forced 500.
- No response body in any test contains the string `select` or a stack frame.
- `GET /health/ready` returns 503 when Postgres is stopped, and `GET /health/live` still returns 200.
- A `SIGTERM` during an in-flight request lets that request complete before the process exits.
- Booting without `AUTH_JWT_SECRET` fails with a message naming the variable — not a stack trace.
- `docker run` of the API image reports a non-root uid.
- Requesting `/api` with `NODE_ENV=production` returns 404.
