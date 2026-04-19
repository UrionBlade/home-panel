# syntax=docker/dockerfile:1.7
# Multi-stage build per Hono + Drizzle + better-sqlite3.
# Pensato per girare su Synology DSM (DS220+/DS920+ ecc.) — architetture x86_64 e arm64.

ARG NODE_VERSION=22-alpine

# ---------- 1. Base con pnpm ----------
FROM node:${NODE_VERSION} AS base
RUN apk add --no-cache libstdc++
ENV PNPM_HOME=/pnpm
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@10.26.2 --activate
WORKDIR /repo

# ---------- 2. Dipendenze (cache layer) ----------
FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY apps/api/package.json apps/api/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter @home-panel/api... --filter @home-panel/shared

# ---------- 3. Build ----------
FROM deps AS build
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN pnpm --filter @home-panel/api build

# ---------- 4. Runtime ----------
FROM node:${NODE_VERSION} AS runtime
RUN apk add --no-cache libstdc++ tini
ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0
ENV DATABASE_URL=/data/home-panel.sqlite
WORKDIR /app

# Ricrea solo le dipendenze di produzione
RUN corepack enable && corepack prepare pnpm@10.26.2 --activate
COPY --from=build /repo/package.json /repo/pnpm-workspace.yaml /repo/pnpm-lock.yaml* ./
COPY --from=build /repo/apps/api/package.json apps/api/package.json
COPY --from=build /repo/packages/shared apps/shared-src
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --prod --filter @home-panel/api...

# Copia gli artefatti compilati
COPY --from=build /repo/apps/api/dist apps/api/dist
COPY --from=build /repo/apps/api/drizzle apps/api/drizzle

# Volume per il file SQLite — montalo come bind su Synology, es. /volume1/docker/home-panel
VOLUME ["/data"]
EXPOSE 3000

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "apps/api/dist/index.js"]
