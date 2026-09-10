# Build context is the REPO ROOT, not apps/api — the API depends on packages/shared through
# the pnpm workspace, so the app directory alone is not a buildable context.
# See docker-compose.yml, which sets `context: .` and points here.
FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /repo

FROM base AS deps
# Manifests first, so a dependency-free code change reuses this layer.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
RUN pnpm install --frozen-lockfile --filter @ticket-tracker/api... --filter @ticket-tracker/shared

FROM deps AS build
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN pnpm --filter @ticket-tracker/shared run build \
 && pnpm --filter @ticket-tracker/api run build

FROM base AS runtime
ENV NODE_ENV=production

# A production-only install rather than copying the build stage's node_modules: the build tree
# carries the Nest CLI, SWC, vitest and drizzle-kit, none of which belong in a running image.
# `pnpm prune --prod` was tried first and is the wrong tool here — on this workspace it left the
# dev dependencies in place *and* removed transitive runtime ones, so the image failed to boot.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY --from=build /repo/packages/shared/dist packages/shared/dist
RUN pnpm install --frozen-lockfile --prod --filter @ticket-tracker/api... --filter @ticket-tracker/shared

COPY --from=build /repo/apps/api/dist apps/api/dist
COPY apps/api/drizzle apps/api/drizzle
COPY apps/api/drizzle.config.ts apps/api/

WORKDIR /repo/apps/api

# The node image ships an unprivileged `node` user; nothing here needs root, and a container that
# runs as root turns a code-execution bug into a container-escape attempt (spec 11 §6).
USER node

EXPOSE 3000

# Liveness only — a readiness failure means "stop sending traffic", which is the orchestrator's
# call, not a reason for Docker to kill the container.
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/health/live').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/main.js"]
