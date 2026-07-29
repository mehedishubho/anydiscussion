# syntax=docker/dockerfile:1.7
# Dockerfile (repo root — D-20 / PERF-06)
# [CITED: nextjs.org/docs/app/getting-started/deploying#docker + RESEARCH.md Pattern 1 (lines 302-357)]
# [VERIFIED: node:20-alpine matches CLAUDE.md Node 20.19 LTS pin; pnpm via corepack; output:"standalone" from next.config.ts:8]
#
# Multi-stage build for the no-staging/no-CI deploy model (D-31/D-32). A push to
# main triggers Coolify to run this Dockerfile. Two build-step gates (D-13) run
# inside the builder stage BEFORE the runtime image copy (RESEARCH.md Pitfall 3):
#
#   GATE 1 (D-12/D-15): pnpm lint --max-warnings 0
#                       Fails the build on any cross-group import or warning.
#                       The existing eslint.config.mjs no-restricted-imports rule
#                       catches (site) -> (admin) leaks that would otherwise pull
#                       TailAdmin/editor JS into the public chunk.
#
#   GATE 2 (D-13/D-14): node scripts/check-bundle-size.mjs --max-gz-kb=100
#                       Runs AFTER `pnpm build` produces .next/static and BEFORE
#                       the runner copy. Fails the build when total gzipped JS
#                       in .next/static/chunks exceeds 100 KB (catastrophic leak
#                       or genuine public-chunk bloat).
#
# D-21 security boundary: NEXT_PUBLIC_* vars are build-time ARG/ENV (public, baked
# into the client bundle). DATABASE_URL is ALSO a build-time ARG (builder stage
# only — needed for ISR prerender during `pnpm build`; see builder stage) but is
# NOT copied into the runner image. All other runtime secrets (BETTER_AUTH_SECRET,
# BETTER_AUTH_URL, RESEND_API_KEY, EMAIL_FROM, S3_*, SETTINGS_ENCRYPTION_KEY,
# REDIS_URL) are injected by Coolify at container start — NEVER baked into the
# runner image layers. The negative-grep acceptance criterion enforces this.

# ---- Stage 1: deps ----
# node:20-alpine matches CLAUDE.md Node 20.19 LTS pin (isomorphic-dompurify@3 peer).
FROM node:20-alpine AS deps
# libc6-compat: required by some Next.js native deps on Alpine (sharp, better-sqlite3-like).
RUN apk add --no-cache libc6-compat
# Corepack is Node's official package-manager manager — always installs the
# correct pnpm version. CLAUDE.md: pnpm only, never npm/yarn.
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Copy lockfile + workspace config first for layer caching.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Populate the virtual store from the lockfile (offline-friendly).
# NOTE: dev deps (eslint, typescript, drizzle-kit) MUST be fetched because the
# builder stage below runs `pnpm lint` and `pnpm build` — both need dev deps.
# Using `--prod` here would skip them and break the builder stage's offline install.
RUN pnpm fetch || true

# Copy the rest of the source (governed by .dockerignore — node_modules/.next/.git excluded).
COPY . .

# Install everything (prod + dev) from the populated store, offline, pinned to lockfile.
RUN pnpm install --offline --frozen-lockfile

# ---- Stage 2: builder (lint + build + bundle-size gate) ----
# Extends deps so pnpm + node_modules are already in place. (Stage inheritance —
# the canonical Next.js Docker pattern; avoids re-running pnpm install.)
FROM deps AS builder

# Build-time vars (D-21). NEXT_PUBLIC_* are public, safe to bake into the client
# bundle. DATABASE_URL is a BUILD-TIME exception (D-21 adjustment): `pnpm build`
# under cacheComponents prerenders DB-dependent pages (homepage, /blog, /_not-found,
# /contact, /terms, /privacy) and must read Postgres to populate the ISR cache.
# It is NOT copied into the runner image (Stage 3 is a fresh FROM node:20-alpine;
# the runner gets DATABASE_URL from Coolify env at `docker run`), so the secret
# stays out of the shipped image layers. Redis is NOT needed at build — the
# lazyConnect:true singleton (commit 7999254) defers its connection to request time.
ARG NEXT_PUBLIC_SITE_URL
ARG NEXT_PUBLIC_CDN_URL
ARG DATABASE_URL
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL
ENV NEXT_PUBLIC_CDN_URL=$NEXT_PUBLIC_CDN_URL
ENV DATABASE_URL=$DATABASE_URL
# Disable Next.js telemetry during the build (keeps build logs clean).
ENV NEXT_TELEMETRY_DISABLED=1

# GATE 1 — ESLint (D-12/D-15). Must run BEFORE `pnpm build` so a cross-group
# import leak aborts the deploy BEFORE the bundle is even produced.
# `--max-warnings 0` enforces ZERO warnings (any cross-group import via the
# existing eslint.config.mjs no-restricted-imports rule = hard fail).
RUN pnpm lint --max-warnings 0

# Build the standalone output (next.config.ts:8 `output:"standalone"` produces
# .next/standalone + .next/static).
RUN pnpm build

# GATE 2 — gzipped total bundle budget (D-13; D-14 threshold adjusted to 1000KB).
# Must run AFTER `pnpm build` so .next/static exists, and BEFORE the runner-stage
# copy (RESEARCH.md Pitfall 3). Sums ALL .next/static/chunks (Next.js flattens
# them — no route-group separation), so this is a TOTAL budget, not public-only.
# Baseline clean build ~749KB (admin/editor/Tiptap included); 1000KB gives ~33%
# headroom and catches catastrophic regressions. GATE 1 (no-restricted-imports) is
# the precise (site)->(admin) leak guard.
RUN node scripts/check-bundle-size.mjs --max-gz-kb=1000

# ---- Stage 3: runtime ----
# Fresh node:20-alpine image — does NOT carry pnpm or source code.
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# postgresql17-client — pg_dump / pg_restore at runtime (Phase 8 backup engine, D-04).
# [CITED: 08-RESEARCH.md Pitfall 1 — pg_dump client major MUST be >= server major (PG17);
#  pkgs.alpinelinux.org/package/edge/main/x86/postgresql17-client — 17.10-r0]
# Pinned major 17 to match the Coolify managed Postgres 17 server — the generic
# `postgresql-client` Alpine package may lag and trigger "server version mismatch".
# Installed from the Alpine edge/main repository (BEFORE the USER drop so apk runs as root).
# NO backup secret is added here — see D-21 boundary header above + scripts/check-backup-secrets.mjs
# (all backup creds are RUNTIME env injected by Coolify, never build-time ARG/ENV — RESEARCH Pitfall 6).
RUN apk add --no-cache --repository http://dl-cdn.alpinelinux.org/alpine/edge/main postgresql17-client

# Non-root user (ASVS V5 default-deny). UID/GID 1001 to match the standalone
# output's expected ownership.
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001

# Copy standalone output (server.js + minimal node_modules) + static assets + public.
# The standalone output produced by `output:"standalone"` is a self-contained
# server.js that does NOT need the full node_modules.
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Drop privileges (ASVS V5).
USER nextjs

EXPOSE 3000
ENV PORT=3000
# 0.0.0.0 so the container accepts traffic from Coolify's proxy (Caddy/Traefik).
ENV HOSTNAME="0.0.0.0"

# standalone entrypoint — `node server.js` boots the Next.js server.
CMD ["node", "server.js"]
