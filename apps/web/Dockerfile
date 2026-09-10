# Build context is the REPO ROOT (see apps/api/Dockerfile for why).
FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /repo

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile --filter @ticket-tracker/web... --filter @ticket-tracker/shared

FROM deps AS build
COPY packages/shared packages/shared
COPY apps/web apps/web
# Vite inlines env at build time, so the API URL is baked into the bundle here. It points at
# the host, not the `api` service, because the browser resolves it — not the container.
ARG VITE_API_URL=http://localhost:3000
ENV VITE_API_URL=$VITE_API_URL
RUN pnpm --filter @ticket-tracker/shared run build \
 && pnpm --filter @ticket-tracker/web run build

FROM nginx:1.27-alpine AS runtime
ARG VITE_API_URL=http://localhost:3000
COPY --from=build /repo/apps/web/dist /usr/share/nginx/html
# The config moved out of a `printf` here and into apps/web/nginx.conf once it grew a CSP —
# a security header is not something to maintain inside an escaped shell string.
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
# The CSP's connect-src is pinned to the same origin the bundle was built to call, so the two
# cannot drift. Done with sed at build time, not nginx's envsubst templates: envsubst would also
# expand `$uri` in try_files and break SPA routing.
RUN sed -i "s|__API_ORIGIN__|${VITE_API_URL}|g" /etc/nginx/conf.d/default.conf \
 && nginx -t
EXPOSE 5173
