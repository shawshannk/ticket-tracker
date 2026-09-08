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
COPY --from=build /repo/apps/web/dist /usr/share/nginx/html
# The app is a SPA on TanStack Router: any deep link must serve index.html, or a refresh on
# /projects/<id>/board would 404.
RUN printf 'server {\n  listen 5173;\n  root /usr/share/nginx/html;\n  location / {\n    try_files $uri $uri/ /index.html;\n  }\n}\n' > /etc/nginx/conf.d/default.conf \
 && rm -f /etc/nginx/conf.d/default.conf.default
EXPOSE 5173
