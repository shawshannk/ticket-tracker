# 09 — Testing, Docker Compose & CI

## Local development — Docker Compose

```yaml
# docker-compose.yml (outline)
services:
  postgres:
    image: postgres:16
    environment:
      POSTGRES_DB: ticket_tracker
      POSTGRES_USER: ticket_tracker
      POSTGRES_PASSWORD: dev_only_password
    ports: ["5432:5432"]
    volumes: ["pgdata:/var/lib/postgresql/data"]

  api:
    build: ./apps/api
    env_file: ./apps/api/.env
    depends_on: [postgres]
    ports: ["3000:3000"]

  web:
    build: ./apps/web
    depends_on: [api]
    ports: ["5173:5173"]

volumes:
  pgdata:
```

- `apps/api/.env` holds `DATABASE_URL=postgres://ticket_tracker:dev_only_password@postgres:5432/ticket_tracker`
- Run migrations against the compose Postgres instance with `drizzle-kit migrate` before first boot, or add a one-shot `migrate` service that runs and exits.
- No cloud target is specified yet, per your call — this Compose setup is the full local dev/test environment for now.

## Testing strategy

| Layer | Tool | What to cover |
|---|---|---|
| Backend unit tests | Vitest | CQRS command/query handlers in isolation (mock the Drizzle repo layer) — especially the status-by-type validation, the epic/story consistency constraint, and the permission-matrix guard logic, since those are the rules most likely to regress silently |
| Backend integration tests | Vitest + a real Postgres (via `testcontainers` or the Compose instance) | Full request → DB → response round trip for the ticket-key-sequence generation (race condition safety), and the multi-project scoping (a ticket in Project A must never appear in Project B's list) |
| Frontend unit tests | Vitest + Testing Library | Dirty-state logic on Ticket Detail, filter-to-URL-param sync on List/Board |
| E2E | Playwright | The core happy paths: create a ticket → see it in the list → drag it across the board → edit it in detail → add a comment → delete it (as Manager) → confirm Developer role can't delete |

Prioritize the integration and E2E tests around **multi-project data isolation** and **status-by-type validation** — those are the two areas where a subtle bug would be easy to miss visually but would corrupt real data.

## CI (GitHub Actions)

Suggested pipeline stages, matching your existing CodePipeline/GitHub Actions habits:
1. Install + typecheck (Turborepo's `turbo run typecheck`)
2. Lint
3. Unit tests (`turbo run test`)
4. Integration tests (spin up Postgres service container in the Actions job)
5. Build both apps
6. (E2E via Playwright can run as a separate, slower job — don't block fast feedback on it)

No deployment step yet, since hosting isn't decided — this pipeline stops at "build succeeds and tests pass."
