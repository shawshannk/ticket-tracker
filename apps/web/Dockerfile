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

# Non-root (spec 11 §6). nginx normally starts as root to bind a privileged port and then drops
# to `nginx` for its workers; on 5173 the root master buys nothing. The chown list is exactly the
# paths nginx writes to — miss one and the container exits on start, which is why this is
# verified by actually running the image rather than by reading the Dockerfile.
RUN touch /var/run/nginx.pid \
 && chown -R nginx:nginx /var/cache/nginx /var/log/nginx /var/run/nginx.pid /etc/nginx/conf.d
USER nginx

EXPOSE 5173

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://127.0.0.1:5173/ || exit 1
