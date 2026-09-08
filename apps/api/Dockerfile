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
COPY --from=build /repo/node_modules node_modules
COPY --from=build /repo/package.json /repo/pnpm-workspace.yaml ./
COPY --from=build /repo/packages/shared packages/shared
COPY --from=build /repo/apps/api apps/api
WORKDIR /repo/apps/api
EXPOSE 3000
CMD ["node", "dist/main.js"]
