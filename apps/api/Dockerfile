# syntax=docker/dockerfile:1.7
# Multi-stage image for the Hono + Drizzle API.
# Build stage produces a single bundled dist/index.js via tsup.
# Runtime stage only needs better-sqlite3 (native bindings) installed at runtime.

ARG NODE_VERSION=22-alpine

# ---------- 1. Build: pnpm install + tsup bundle ----------
FROM node:${NODE_VERSION} AS build
RUN apk add --no-cache libstdc++ python3 make g++
ENV PNPM_HOME=/pnpm
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@10.26.2 --activate
WORKDIR /repo

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY tsconfig.base.json ./
COPY apps/api/package.json apps/api/
COPY packages/shared/package.json packages/shared/

RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter @home-panel/api...

COPY packages/shared packages/shared
COPY apps/api apps/api

RUN pnpm --filter @home-panel/api build

# ---------- 2. Runtime: minimal image with only better-sqlite3 ----------
FROM node:${NODE_VERSION} AS runtime
RUN apk add --no-cache libstdc++ tini
ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0
ENV DATABASE_URL=/data/home-panel.sqlite
WORKDIR /app

COPY apps/api/package.runtime.json package.json
RUN npm install --omit=dev --no-package-lock --no-audit --no-fund \
    && npm cache clean --force

COPY --from=build /repo/apps/api/dist dist
COPY --from=build /repo/apps/api/drizzle drizzle

VOLUME ["/data"]
EXPOSE 3000

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/index.js"]
