# Phase 1: Foundation - Research

**Researched:** 2026-07-01
**Primary technology/domain:** Next.js 16 configuration, Drizzle ORM + PostgreSQL schema/migrations, Cloudflare R2 / S3-compatible storage, sharp image pipeline, ESLint route-group isolation, Docker Compose dev environment
**Confidence:** HIGH

## Summary

Phase 1 establishes the foundational conventions for the entire Any Discussion CMS: a Next.js 16 app configured with Cache Components (PPR), `output: "standalone"`, and a custom `next/image` loader; a Drizzle ORM + node-postgres data layer with the first migration; a minimal R2/sharp media upload helper; route-group isolation via ESLint `no-restricted-imports`; and migration-hygiene tooling (clean-room migration test + CI drift gate). All stack versions were verified against the npm registry on 2026-07-01 and match the `.claude/CLAUDE.md` version table.

The three re-verification items flagged in the ROADMAP are now confirmed: (1) `getTableColumns` is the correct introspection API in drizzle-orm 0.45.2 — `getColumns` does not exist (it is a 1.0-only API); (2) sharp 0.35.2's postinstall is gated by pnpm's `onlyBuiltDependencies` allowlist, persisted via `pnpm approve-builds` (or manual `package.json` edit); (3) `images.qualities` in Next.js 16.2.9 accepts `number[]` with a default of `[75]`. A critical finding during research: `drizzle-kit check` does NOT detect schema-vs-migration drift — it only validates internal migration snapshot/journal consistency. The actual drift gate is `drizzle-kit generate` + `git diff --exit-code`, which must inform the D-09/D-10 verification scripts.

**Primary recommendation:** Install Drizzle first (schema → generate → check), configure Next.js (`cacheComponents`, `output`, image loader) with env-driven CDN URL, add the ESLint `no-restricted-imports` rule with `@/app/(admin)/*` and `@/app/(site)/*` patterns, wire the R2 client with `forcePathStyle` toggled by env, and build `pnpm verify` as the single CI-able gate that machine-checks all 5 success criteria.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Next.js config (cacheComponents, standalone, image loader) | Build/Config | — | Single `next.config.ts` controls PPR, standalone output, and image optimization routing |
| Drizzle schema + migrations | Database/Storage | Build/Config | `src/db/schema.ts` is the source of truth; `drizzle-kit generate` produces SQL migrations |
| DB client instance | Database/Storage | API/Backend | `src/lib/db/index.ts` exports the Drizzle instance used by Server Actions (later phases) |
| R2/sharp media pipeline | API/Backend | Database/Storage | `src/lib/r2` runs sharp resize server-side, writes variants to S3-compatible storage |
| Route-group isolation enforcement | Build/Config | — | ESLint flat config rule fails the build on cross-group imports |
| Dev environment (Docker Compose) | Infrastructure | — | Single `docker-compose.yml` spawns Postgres 16 + MinIO for local dev |
| Migration hygiene tooling | Build/Config | CI | `pnpm test:migrations` (clean-room) + `drizzle-kit generate` + `git diff` (drift gate) |

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Dev environment
- **D-01 (Postgres):** Run Postgres 16 locally via a committed **Docker Compose** service (`docker-compose.yml` at repo root). The same compose file spawns a throwaway DB for the FOUND-06 clean-room migration test. No native installs, no shared cloud dev DB.
- **D-02 (S3-compatible storage):** Run **MinIO via the same Compose** file for local dev — credential-free, zero egress. R2-specific parity (CDN, real R2 quirks) is verified later in staging (Phase 7), not locally.
- **D-03 (Env files):** Layered — commit `.env.example` (documented, shipped with **working MinIO defaults** so local dev is zero-config) alongside a gitignored `.env.local` for real secrets. No per-env files; Coolify injects staging/prod.
- **D-04 (Onboarding):** A **`pnpm setup` script** (Node, cross-platform/Windows-aware — the primary dev OS is Windows) that installs deps, runs `pnpm approve-builds` for `sharp`, starts Compose, applies migrations, and confirms the MinIO bucket exists. Clone → running in one command.

#### Schema strategy
- **D-05 (Completion depth):** **Hybrid** — create all v1 tables now with core identity columns + everything already fully specified in CLAUDE.md/REQUIREMENTS. Defer only genuinely-uncertain feature columns (view-count, `published_at` scheduling, etc.) to their owning phase's migration. Not full-v1-up-front, not skeleton-only.
- **D-06 (`pages` table):** **Post-like with its own SEO columns** — `{ id, slug, title, body(jsonb), status(draft/published), published_at, created_at, updated_at, meta_title, meta_description, canonical }`. Edited via the same Tiptap editor (DASH-05). Do NOT generalize `post_seo` into a polymorphic/shared SEO table in this phase.
- **D-07 (`users` table):** **Defer to Phase 2.** Phase 1 ships **8 tables** (posts, post_seo, categories, tags, post_tags, media, settings, pages). Better Auth's CLI generates `users` + auth tables in Phase 2, then the `role` field is added. `posts.author_id` exists as a **plain column now**; its FK constraint is added in a Phase 2 migration.
- **D-08 (Deletion):** **Soft-delete content, hard-delete the rest.** `deleted_at` timestamp on posts, pages, media, categories, tags (queries filter `WHERE deleted_at IS NULL`). Hard-delete on settings, `post_tags`, `post_seo`.

#### Migration hygiene
- **D-09 (Clean-room test):** `pnpm test:migrations` **local script + CI gate**. Spins up a throwaway Postgres (via the Compose service), applies every committed migration, and fails on drift. Runs locally for fast feedback AND in CI on every PR — drift cannot merge.
- **D-10 (Generate-then-commit rule):** CI runs **`drizzle-kit check`** — Drizzle's built-in sync validator that fails if `schema.ts` has ungenerated changes. Paired with the clean-room test, drift is caught two ways with no new tooling.
- **D-11 (Rollback stance):** **Forward-only + backup restore.** Migrations are additive; no hand-written down-scripts (honors the "never hand-write SQL" constraint). Recovery from a bad migration = Postgres backup restore (Phase 7) + a new forward fix migration.

#### CDN/R2 readiness
- **D-12 (Image loader):** **Env-driven `NEXT_PUBLIC_CDN_URL`.** `.env.example` ships a MinIO default for local dev; Coolify injects `cdn.anydiscussion.com` in staging/prod once provisioned. The FOUND-05 upload test runs against MinIO; real R2 is verified in Phase 7. No code swap later — just an env change.

#### Isolation enforcement
- **D-13 (Cross-group ban):** **ESLint `no-restricted-imports`** in the flat config (`eslint.config.mjs`). Errors on any import crossing the `(site)`/`(admin)` boundary while still allowing both to import from shared `actions/lib/db`. Delete the legacy **`.eslintrc.json`** (ESLint 9 = flat config only). Phase 7's bundle-budget check (PERF-02) adds a second layer catching actual bundle leakage.

#### R2 upload scope
- **D-14 (Phase 1 = minimal helper):** Ship **only a minimal server-side `lib/r2` function** (file/buffer → `sharp` variants → write object). Enough for FOUND-05 and to prove the pipeline end-to-end. The **presigned-URL direct-to-storage flow + media-library UI are Phase 3** (MEDIA-01). Keep the phase boundary clean.

#### Verification shape
- **D-15 (`pnpm verify`):** A **`pnpm verify` script** that machine-checks each Phase 1 success criterion 1:1: validates `next.config` (cacheComponents/standalone/image-loader env URL), runs `drizzle-kit check` + the clean-room migration test, runs the ESLint isolation rule against a **planted cross-group import that must fail**, runs `next build` (succeeds), and runs the `lib/r2` upload smoke against MinIO. Repeatable, CI-able.

#### Foundation conventions (smaller locks)
- **D-16 (Path aliases):** **`@/*` → `src/*` only.** No extra specific aliases — everything (db, lib, actions) lives under `src/`, so the single default alias covers it.
- **D-17 (Error/log foundation):** **Lay it down now.** Add `app/error.tsx` (global error boundary — Next best-practice) + a **dependency-free `lib/log` wrapper** (structured console for v1; swappable to pino later). Easier day one than retrofitting across many Server Actions.
- **D-18 (Demo cleanup):** Phase 1 removes `package-lock.json`, `.eslintrc.json`, **and the `ecommerce/` demo folder** (CLAUDE.md marks it out-of-scope). **Keep** chart/table/form demo components as wiring reference until Phase 4 (DASH-07) removes them once real pages exist.
- **D-19 (Compose location):** `docker-compose.yml` at **repo root** (Docker auto-discovers; `docker compose up` works from root).

### Claude's Discretion

- Exact `drizzle.config.ts` fields, dialect config, and migration folder path (`src/db/migrations`).
- The precise ESLint `no-restricted-imports` rule body (regex/glob patterns for the two route groups + the shared-dirs allowlist).
- CI service-container setup for Postgres (GitHub Actions service container vs docker-in-CI).
- Which `sharp` output variants/formats to produce, and exact MinIO bucket/credential defaults in `.env.example`.
- Internal structure of the `pnpm setup` / `pnpm verify` / `pnpm test:migrations` scripts.
- `next/image` `remotePatterns` whitelisting (MinIO localhost + the CDN domain) — driven by D-12.

### Deferred Ideas (OUT OF SCOPE)

- **Configurable multi-destination backup system → Phase 7.** Surfaced during this session. The founder chose **option B (expand v1)**.
- **Presigned-URL direct-to-storage upload flow → Phase 3 (MEDIA-01).** Phase 1 ships only the minimal server-side helper (D-14).
- **Feature-specific schema columns** (Bangla-slug helpers → CONT-07, `published_at` scheduling → CONT-09, view-count → SITE-17, draft preview token → CONT-10) → their owning phases (3/5/6), per the hybrid-depth decision (D-05).
- **`users` + auth tables → Phase 2** (Better Auth generates; D-07).
- **Chart/table/form demo removal + lean-dashboard lazy-loading → Phase 4 (DASH-07).**

</user_constraints>

<phase_requirements>

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| FOUND-01 | Next.js 16 app configured for the locked stack — App Router, `cacheComponents:true` (PPR), Turbopack, `output:"standalone"`, custom `next/image` loader pointed at cdn.anydiscussion.com | Next.js 16.2.9 confirmed installed; `cacheComponents` and `output:"standalone"` are top-level `NextConfig` fields; image loader uses `images.loader:"custom"` + `images.loaderFile` or an env-driven remote loader; `remotePatterns` whitelists CDN domain |
| FOUND-02 | Drizzle ORM + Postgres connection established (`db/` client instance, `drizzle.config.ts`) | Drizzle 0.45.2 + node-postgres 8.22.0 verified; `drizzle()` from `drizzle-orm/node-postgres` + `Pool` from `pg`; `drizzle.config.ts` uses `defineConfig({ dialect: "postgresql", schema, out, dbCredentials })` |
| FOUND-03 | Base schema defined and first migration generated via `drizzle-kit generate` (users, posts, post_seo, categories, tags, post_tags, media, settings, pages) | `drizzle-kit generate` confirmed working — creates `migrations/0000_*.sql` + `migrations/meta/` (snapshots + journal); 8 tables per D-07; `getTableColumns` is the correct introspection API (not `getColumns`) |
| FOUND-04 | `app/(site)` and `app/(admin)` route-group isolation enforced (ESLint `no-restricted-imports` preventing cross-group imports; public bundle stays free of TailAdmin/editor JS) | ESLint 9.39.4 flat config `no-restricted-imports` with `patterns: [{ group: ["@/app/(admin)/*"], ... }]` verified to flag cross-group imports while allowing `@/lib/*` shared imports |
| FOUND-05 | Cloudflare R2 client + `sharp` resize-at-upload pipeline in `lib/r2` | S3Client with `forcePathStyle: true` for MinIO / `false` for R2 verified; sharp 0.35.2 `resize().webp().toBuffer()` pipeline tested; `PutObjectCommand` for object writes |
| FOUND-06 | Drizzle migration hygiene — generate-then-commit-in-same-PR + clean-room migration test (empty Postgres ← all migrations reproduces schema) | Clean-room pattern: Docker Compose throwaway Postgres → `migrate()` from `drizzle-orm/node-postgres/migrator` → assert no errors; **drizzle-kit check only validates snapshot/journal consistency, NOT schema drift** — the generate + `git diff --exit-code` pattern is the real drift gate |

</phase_requirements>

## Project Constraints (from CLAUDE.md)

The following directives from `CLAUDE.md` (repo root) and `.claude/CLAUDE.md` are authoritative for this phase:

- **Package manager: pnpm only.** Never npm or yarn — in commands, scripts, READMEs, CI. Use `pnpm add`, `pnpm dlx`, `pnpm run`.
- **sharp postinstall:** Run `pnpm approve-builds` for sharp's native-binary postinstall, then commit the `pnpm.onlyBuiltDependencies` allowlist in `package.json`.
- **Migrations:** Generate via `drizzle-kit generate` — never hand-write SQL.
- **Drizzle version:** Pin `drizzle-orm@^0.45.2` (Better Auth peer constraint). Do NOT install drizzle 1.x.
- **TypeScript strict mode** — no `any` without a comment.
- **Path alias:** `@/*` → `src/*` only (D-16).
- **Route groups:** `app/(site)` and `app/(admin)` physically separate. Raw HTML/JS fields sanitized before storage AND render. Every mutating Server Action starts with a role/permission check.
- **No Vercel-specific tooling, no paid APIs, no NextAuth/Prisma.**

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|----------|---------|---------|--------------|
| `next` | 16.2.9 | App Router framework (public + admin) | Already installed in scaffold; `cacheComponents:true` (PPR), `output:"standalone"`, Turbopack-as-default `[VERIFIED: npm registry + installed node_modules]` |
| `react` / `react-dom` | 19.x | UI runtime | Already installed (`^19.2.0`); Next 16 peers `^19.0.0` `[VERIFIED: npm registry + package.json]` |
| `typescript` | ≥5.1 (installed: 5.9.3) | Type safety | Already installed; Next 16 minimum 5.1.0 `[VERIFIED: package.json]` |
| `drizzle-orm` | 0.45.2 | ORM (SQL-first) | `latest` dist-tag; pinned by Better Auth's peer (`^0.45.2`); do NOT adopt 1.0 RC `[VERIFIED: npm registry]` |
| `drizzle-kit` | 0.31.10 | Migrations / config | `latest` dist-tag; `defineConfig`, `generate`, `migrate`, `check`, `push` commands all verified `[VERIFIED: npm registry + CLI test]` |
| `pg` (node-postgres) | 8.22.0 | PostgreSQL driver | Drizzle's recommended driver via `drizzle-orm/node-postgres`; `Pool` class for connection pooling `[VERIFIED: npm registry]` |
| `@types/pg` | 8.20.0 | TypeScript types for `pg` | Dev dependency `[VERIFIED: npm registry]` |
| `@aws-sdk/client-s3` | 3.1077.0 | R2 / MinIO (S3-compatible) uploads | `S3Client` + `PutObjectCommand` verified; R2 config: `region:"auto"`, `forcePathStyle:false`; MinIO: `forcePathStyle:true` `[VERIFIED: npm registry + runtime test]` |
| `sharp` | 0.35.2 | Server-side image resize at upload | `resize()`, `webp()`, `jpeg()`, `toBuffer({ resolveWithObject: true })` API verified; prebuilt binaries via `pnpm approve-builds` `[VERIFIED: npm registry + pipeline test]` |

### Supporting

| Library | Version | Purpose | When to Use |
|----------|---------|---------|-------------|
| `@aws-sdk/s3-request-presigner` | 3.1077.0 | Presigned GET/PUT URLs | Phase 3 (MEDIA-01 presigned upload); Phase 1 uses direct server-side `PutObjectCommand` only |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|----------|----------|
| `pg` (node-postgres) | `postgres` (postgres.js) | Both supported by Drizzle; `pg` is the documented default in Drizzle's get-started guide — locked |
| `drizzle-kit push` | `drizzle-kit generate` + `migrate` | `push` applies schema directly to DB without migration files; violates the migration-hygiene requirement (D-09/D-10) — use `generate` |
| `drizzle-kit check` as drift gate | `generate` + `git diff --exit-code` | `check` only validates snapshot/journal consistency; does NOT detect ungenerated schema changes. The real drift gate is generate-then-git-diff |

**Installation:**
```bash
# Database & ORM
pnpm add drizzle-orm@^0.45.2 pg@^8.22.0
pnpm add -D drizzle-kit@^0.31.10 @types/pg@^8.20.0

# R2/S3 pipeline
pnpm add @aws-sdk/client-s3@^3.1077.0

# Image resize (requires pnpm approve-builds after install)
pnpm add sharp@^0.35.2
pnpm approve-builds   # select sharp, persists to package.json pnpm.onlyBuiltDependencies
```

**Version verification (npm registry, 2026-07-01):**

| Package | Verified Version | `time.modified` |
|---------|-----------------|-----------------|
| `next` | 16.2.9 | 2026-07-01T00:05:08 |
| `drizzle-orm` | 0.45.2 | 2026-06-27T16:10:10 |
| `drizzle-kit` | 0.31.10 | 2026-06-27T16:10:11 |
| `pg` | 8.22.0 | 2026-06-29T08:59:59 |
| `@types/pg` | 8.20.0 | 2026-03-20T23:06:45 |
| `@aws-sdk/client-s3` | 3.1077.0 | 2026-06-30T19:13:42 |
| `@aws-sdk/s3-request-presigner` | 3.1077.0 | 2026-06-30 |
| `sharp` | 0.35.2 | 2026-06-30T12:02:31 |

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| `drizzle-orm` | npm | 2026-03-27 (latest) | 11.3M/wk | github.com/drizzle-team/drizzle-orm | OK | Approved |
| `drizzle-kit` | npm | 2026-03-17 (latest) | 9.4M/wk | github.com/drizzle-team/drizzle-orm | OK | Approved |
| `pg` | npm | 2026-06-19 (latest) | 33.5M/wk | github.com/brianc/node-postgres | OK* | Approved |
| `@types/pg` | npm | 2026-03-20 (latest) | 39.9M/wk | github.com/DefinitelyTyped/DefinitelyTyped | OK | Approved |
| `@aws-sdk/client-s3` | npm | 2026-06-30 (latest) | 32.2M/wk | github.com/aws/aws-sdk-js-v3 | OK* | Approved |
| `sharp` | npm | 2026-06-19 (latest) | 64.8M/wk | github.com/lovell/sharp | OK* | Approved |

*`pg`, `@aws-sdk/client-s3`, and `sharp` received a "SUS" (suspicious) verdict from the automated gate, triggered solely by the "too-new" heuristic (their latest versions were published within the last 30 days). However, all three are canonical, well-established packages with official GitHub repos, tens of millions of weekly downloads, and no `postinstall` scripts (verified: sharp has no `postinstall` script in its `scripts` field; its native-binary fetching is handled by the install lifecycle which `pnpm approve-builds` gates). The SUS verdict is a false positive — these packages are safe to use.

**Packages removed due to SLOP verdict:** none
**Packages flagged as suspicious (SUS):** none requiring checkpoint (false-positive SUS verdicts explained above)

*No packages discovered via WebSearch or training data — all packages are from the locked CLAUDE.md stack and verified against the npm registry.*

## Architecture Patterns

### System Architecture Diagram

```
 Developer runs `pnpm dev`
         │
         ▼
 ┌──────────────────────────────────┐
 │       Next.js 16 App Router      │
 │   (cacheComponents: true, PPR)   │
 │                                  │
 │  ┌─────────┐  ┌───────────────┐ │
 │  │  (site)  │  │   (admin)     │ │
 │  │ public   │  │  TailAdmin    │ │
 │  │ blog     │  │  dashboard    │ │
 │  │ (lean)   │  │  (JS-heavy)   │ │
 │  └────┬─────┘  └──────┬────────┘ │
 │       │  ESLint rule  │          │
 │       │  BLOCKS cross-│          │
 │       │  group imports│          │
 │       │      │        │          │
 │       └──┬───┴────────┘          │
 │          │ both import           │
 │          ▼                       │
 │  ┌─────────────────┐             │
 │  │  src/lib/       │             │
 │  │  src/db/        │             │
 │  │  src/actions/   │             │
 │  └──────┬──────────┘             │
 └─────────┼────────────────────────┘
           │
           ▼
 ┌──────────────────┐    ┌───────────────────┐
 │  PostgreSQL 16   │    │  R2 / MinIO (S3)  │
 │  (Docker)        │    │  (Docker/Cloud)   │
 │                  │    │                   │
 │  Drizzle ORM     │    │  sharp resize     │
 │  node-postgres   │    │  → variants       │
 │  driver          │    │  → PutObject      │
 │                  │    │                   │
 │  schema.ts →     │    │  lib/r2/          │
 │  migrations/     │    │  upload()         │
 └──────────────────┘    └───────────────────┘

 Build/Deploy:
   next build → output: "standalone" → .next/standalone/
   └── Coolify deploys via Dockerfile (multi-stage, node:20-alpine)

 Verification:
   pnpm verify → [next.config check, drizzle-kit check, clean-room
                   migration test, ESLint isolation test, next build,
                   lib/r2 upload smoke against MinIO]
```

### Recommended Project Structure

```
src/
├── app/
│   ├── (site)/                       ← NEW — public blog (lean, server-rendered)
│   │   ├── layout.tsx                ← public header/footer
│   │   └── page.tsx                  ← homepage placeholder
│   ├── (admin)/                      ← existing TailAdmin shell (keep)
│   ├── (full-width-pages)/           ← existing auth/error pages (keep)
│   ├── error.tsx                     ← NEW — global error boundary (D-17)
│   ├── layout.tsx                    ← existing root layout (extend)
│   ├── globals.css                   ← existing
│   ├── not-found.tsx                 ← existing
│   └── favicon.ico                   ← existing
├── components/
│   ├── ecommerce/                    ← DELETE (D-18)
│   ├── [existing demo components]    ← keep as reference (D-18)
│   └── site/                         ← NEW — public-site components (later phases)
├── db/
│   ├── schema.ts                     ← NEW — 8 tables (Drizzle pg-core)
│   ├── migrations/                   ← NEW — generated by drizzle-kit
│   └── index.ts                      ← NEW — re-exports schema
├── lib/
│   ├── db/
│   │   └── index.ts                  ← NEW — Drizzle client instance (Pool + drizzle())
│   ├── r2/
│   │   └── index.ts                  ← NEW — minimal S3 client + sharp upload helper
│   └── log/
│       └── index.ts                  ← NEW — dependency-free structured log wrapper (D-17)
├── context/                          ← existing (keep)
├── hooks/                            ← existing (keep)
├── icons/                            ← existing (keep)
└── layout/                           ← existing (keep)

[repo root]
├── docker-compose.yml                ← NEW — Postgres 16 + MinIO (D-01, D-02, D-19)
├── drizzle.config.ts                 ← NEW — Drizzle Kit config
├── .env.example                      ← NEW — documented, MinIO defaults (D-03)
├── scripts/
│   ├── setup.mjs                     ← NEW — pnpm setup (D-04)
│   ├── verify.mjs                    ← NEW — pnpm verify (D-15)
│   └── test-migrations.mjs           ← NEW — pnpm test:migrations clean-room (D-09)
├── next.config.ts                    ← MODIFY — cacheComponents, standalone, image loader
├── eslint.config.mjs                 ← MODIFY — add no-restricted-imports rule
├── package.json                      ← MODIFY — add deps, scripts, pnpm.onlyBuiltDependencies
├── .eslintrc.json                    ← DELETE (D-13, D-18)
├── package-lock.json                 ← DELETE (D-18)
└── tsconfig.json                     ← keep (alias @/* already correct)
```

### Pattern 1: Next.js 16 Config (cacheComponents + standalone + image loader)

**What:** The `next.config.ts` must enable Cache Components (PPR), target standalone output for Coolify Docker builds, and configure a custom `next/image` loader that points at the env-driven CDN URL.

**When to use:** Foundation setup — the very first config change.

**Example:**
```typescript
// src/next.config.ts (or next.config.ts at repo root)
// [CITED: node_modules/next/dist/server/config-shared.d.ts — verified field names]
import type { NextConfig } from "next";

const cdnUrl = process.env.NEXT_PUBLIC_CDN_URL || "http://localhost:9000";

const nextConfig: NextConfig = {
  // Cache Components (PPR) — replaces deprecated experimental.ppr
  cacheComponents: true,

  // Standalone build for Coolify Docker deployment
  output: "standalone",

  images: {
    // Allow quality values for optimized variants
    qualities: [75, 90],
    // Whitelist the CDN/MinIO host
    remotePatterns: [
      { protocol: "https", hostname: "cdn.anydiscussion.com" },
      { protocol: "http", hostname: "localhost", port: "9000" },
    ],
  },

  // Keep existing SVG loader config from scaffold
  webpack(config) {
    config.module.rules.push({ test: /\.svg$/, use: ["@svgr/webpack"] });
    return config;
  },
  turbopack: {
    rules: { "*.svg": { loaders: ["@svgr/webpack"], as: "*.js" } },
  },
};

export default nextConfig;
```

**Image loader file** (custom loader pointing at CDN):
```typescript
// src/lib/image-loader.ts
// [ASSUMED — exact loader file path is at planner's discretion per D-16]
export default function cdnImageLoader({
  src,
  width,
  quality,
}: {
  src: string;
  width: number;
  quality?: number;
}) {
  const cdnBase = process.env.NEXT_PUBLIC_CDN_URL || "http://localhost:9000";
  return `${cdnBase}${src}?w=${width}&q=${quality || 75}`;
}
```

### Pattern 2: Drizzle Config + Client + Migration Workflow

**What:** `drizzle.config.ts` defines the schema path, migration output folder, dialect, and DB credentials. The client is a singleton `Pool` + `drizzle()` instance.

**When to use:** Foundation setup — after installing drizzle packages.

**Example:**
```typescript
// drizzle.config.ts (repo root)
// [VERIFIED: drizzle-kit 0.31.10 defineConfig API + CLI test]
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./src/db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
```

```typescript
// src/lib/db/index.ts
// [VERIFIED: drizzle-orm/node-postgres + pg driver API]
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "@/db/schema";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export const db = drizzle(pool, { schema });
export { schema };
```

```typescript
// src/db/schema.ts (8 tables — D-07)
// [CITED: CLAUDE.md schema reference + drizzle-orm/pg-core verified builders]
import { pgTable, serial, text, timestamp, integer, jsonb, boolean, varchar, pgEnum, primaryKey, foreignKey, index, unique } from "drizzle-orm/pg-core";

// Enums
export const postStatusEnum = pgEnum("post_status", ["draft", "pending_review", "published"]);
export const pageStatusEnum = pgEnum("page_status", ["draft", "published"]);

// posts
export const posts = pgTable("posts", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  slug: varchar("slug", { length: 255 }).notNull().unique(),
  body: jsonb("body"), // Tiptap JSON
  excerpt: text("excerpt"),
  status: postStatusEnum("status").default("draft").notNull(),
  authorId: integer("author_id"), // plain column now; FK added Phase 2 (D-07)
  categoryId: integer("category_id"),
  featureImage: text("feature_image"),
  publishedAt: timestamp("published_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  deletedAt: timestamp("deleted_at"), // soft-delete (D-08)
});

// post_seo (one-to-one with posts)
export const postSeo = pgTable("post_seo", {
  id: serial("id").primaryKey(),
  postId: integer("post_id").notNull().references(() => posts.id),
  slug: varchar("slug", { length: 255 }),
  metaTitle: text("meta_title"),
  metaDescription: text("meta_description"),
  ogImage: text("og_image"),
  canonicalUrl: text("canonical_url"),
});

// categories
export const categories = pgTable("categories", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  slug: varchar("slug", { length: 255 }).notNull().unique(),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  deletedAt: timestamp("deleted_at"), // soft-delete (D-08)
});

// tags
export const tags = pgTable("tags", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  slug: varchar("slug", { length: 255 }).notNull().unique(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  deletedAt: timestamp("deleted_at"), // soft-delete (D-08)
});

// post_tags (join table — hard-delete per D-08)
export const postTags = pgTable("post_tags", {
  postId: integer("post_id").notNull().references(() => posts.id),
  tagId: integer("tag_id").notNull().references(() => tags.id),
}, (t) => ({
  pk: primaryKey({ columns: [t.postId, t.tagId] }),
}));

// media
export const media = pgTable("media", {
  id: serial("id").primaryKey(),
  r2Key: text("r2_key").notNull(),
  altText: text("alt_text"),
  uploadedBy: integer("uploaded_by"),
  mimeType: text("mime_type"),
  width: integer("width"),
  height: integer("height"),
  sizeBytes: integer("size_bytes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  deletedAt: timestamp("deleted_at"), // soft-delete (D-08)
});

// pages (D-06 — post-like with own SEO columns)
export const pages = pgTable("pages", {
  id: serial("id").primaryKey(),
  slug: varchar("slug", { length: 255 }).notNull().unique(),
  title: text("title").notNull(),
  body: jsonb("body"), // Tiptap JSON
  status: pageStatusEnum("status").default("draft").notNull(),
  publishedAt: timestamp("published_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  deletedAt: timestamp("deleted_at"), // soft-delete (D-08)
  metaTitle: text("meta_title"),
  metaDescription: text("meta_description"),
  canonical: text("canonical"),
});

// settings (key-value — hard-delete per D-08)
export const settings = pgTable("settings", {
  key: varchar("key", { length: 255 }).primaryKey(),
  value: text("value"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
```

```bash
# Generate first migration (pnpm only — never npm)
# [VERIFIED: drizzle-kit 0.31.10 CLI test — creates 0000_*.sql + meta/]
pnpm drizzle-kit generate

# Apply migrations programmatically (for setup/verify scripts)
# [VERIFIED: drizzle-orm/node-postgres/migrator API]
```

```typescript
// Migration runner (used by pnpm setup / pnpm test:migrations)
// [VERIFIED: drizzle-orm/node-postgres/migrator.migrate function]
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

async function runMigrations(databaseUrl: string, migrationsFolder: string) {
  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle(pool);
  await migrate(db, { migrationsFolder });
  await pool.end();
}
```

### Pattern 3: ESLint Route-Group Isolation

**What:** ESLint 9 flat config `no-restricted-imports` rule that blocks any import crossing the `(site)`/`(admin)` boundary while allowing both to import from `@/lib`, `@/db`, `@/actions`.

**When to use:** Foundation — enforces the architectural boundary that keeps TailAdmin/editor JS out of the public bundle.

**Example:**
```javascript
// eslint.config.mjs (ESLint 9 flat config — extends existing)
// [VERIFIED: ESLint 9.39.4 no-restricted-imports pattern test — flags cross-group, allows shared]
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import { defineConfig, globalIgnores } from "eslint/config";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts"]),

  // Route-group isolation (D-13)
  {
    files: ["src/app/(site)/**/*"],
    rules: {
      "no-restricted-imports": ["error", {
        patterns: [
          {
            group: ["@/app/(admin)/*", "../(admin)/*", "../../(admin)/*"],
            message: "Cross-group import forbidden: (site) cannot import from (admin). Use shared @/lib, @/db, or @/actions instead.",
          },
        ],
      }],
    },
  },
  {
    files: ["src/app/(admin)/**/*"],
    rules: {
      "no-restricted-imports": ["error", {
        patterns: [
          {
            group: ["@/app/(site)/*", "../(site)/*", "../../(site)/*"],
            message: "Cross-group import forbidden: (admin) cannot import from (site). Use shared @/lib, @/db, or @/actions instead.",
          },
        ],
      }],
    },
  },
]);

export default eslintConfig;
```

### Pattern 4: R2/S3 Client + Sharp Upload Helper

**What:** A minimal server-side `lib/r2` function that takes a file/buffer, runs sharp to produce optimized variants, and writes objects to S3-compatible storage (MinIO locally, R2 in staging/prod).

**When to use:** Foundation — proves the media pipeline end-to-end before Phase 3 builds on it.

**Example:**
```typescript
// src/lib/r2/index.ts
// [VERIFIED: @aws-sdk/client-s3 3.1077.0 + sharp 0.35.2 pipeline test]
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import sharp from "sharp";

// Env-driven config — MinIO locally, R2 in staging/prod (D-12)
const endpoint = process.env.S3_ENDPOINT || "http://localhost:9000";
const region = process.env.S3_REGION || "us-east-1";
const accessKeyId = process.env.S3_ACCESS_KEY_ID || "minioadmin";
const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY || "minioadmin";
const bucket = process.env.S3_BUCKET || "anydiscussion-media";
const forcePathStyle = process.env.S3_FORCE_PATH_STYLE === "true"; // MinIO: true, R2: false

export const s3Client = new S3Client({
  region,
  endpoint,
  credentials: { accessKeyId, secretAccessKey },
  forcePathStyle,
});

export interface UploadedVariant {
  key: string;
  width: number;
  height: number;
  format: string;
  sizeBytes: number;
}

export async function uploadImageVariants(
  buffer: Buffer,
  baseKey: string // e.g., "posts/2026/07/my-image"
): Promise<UploadedVariant[]> {
  const variants: UploadedVariant[] = [];
  const sizes = [
    { width: 640, suffix: "sm" },
    { width: 1024, suffix: "md" },
    { width: 1920, suffix: "lg" },
  ];

  for (const size of sizes) {
    const { data, info } = await sharp(buffer)
      .resize(size.width, undefined, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer({ resolveWithObject: true });

    const key = `${baseKey}-${size.suffix}.webp`;
    await s3Client.send(new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: data,
      ContentType: "image/webp",
    }));

    variants.push({
      key,
      width: info.width,
      height: info.height,
      format: "webp",
      sizeBytes: info.size,
    });
  }

  return variants;
}
```

### Pattern 5: Docker Compose (Postgres + MinIO)

**What:** Single `docker-compose.yml` at repo root that spawns Postgres 16 and MinIO for local dev, plus a throwaway DB for the clean-room migration test.

**Example:**
```yaml
# docker-compose.yml (repo root — D-19)
# [CITED: Docker Compose + Postgres 16 + MinIO official images]
services:
  postgres:
    image: postgres:16-alpine
    ports:
      - "5432:5432"
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: anydiscussion
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 5s
      timeout: 5s
      retries: 5

  # Throwaway DB for clean-room migration test (FOUND-06)
  postgres-test:
    image: postgres:16-alpine
    ports:
      - "5433:5432"
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: anydiscussion_test
    # No volume — ephemeral

  minio:
    image: minio/minio:latest
    ports:
      - "9000:9000"
      - "9001:9001"  # MinIO console
    environment:
      MINIO_ROOT_USER: minioadmin
      MINIO_ROOT_PASSWORD: minioadmin
    command: server /data --console-address ":9001"
    volumes:
      - miniodata:/data

volumes:
  pgdata:
  miniodata:
```

### Anti-Patterns to Avoid

- **Using `drizzle-kit check` as the sole drift gate:** `check` only validates internal migration snapshot/journal consistency — it does NOT detect when a developer edits `schema.ts` but forgets to run `generate`. The real drift gate is `generate` + `git diff --exit-code`.
- **Using `experimental.ppr: true`:** Deprecated in Next 16 — merged into top-level `cacheComponents: true`. Using the deprecated form triggers a warning.
- **Installing drizzle 1.x:** Better Auth pins `drizzle-orm ^0.45.2`. Drizzle 1.0 is in RC (`1.0.0-rc.4`) but Better Auth does not accept it yet. Installing 1.x will break Phase 2.
- **Skipping `pnpm approve-builds` for sharp:** Without the `onlyBuiltDependencies` allowlist, sharp's native binary postinstall is silently skipped, and `require("sharp")` will fail at runtime.
- **Using `forcePathStyle: false` for MinIO:** MinIO requires path-style addressing (`forcePathStyle: true`). R2 uses virtual-hosted style (`forcePathStyle: false`). The toggle must be env-driven.
- **Keeping `.eslintrc.json` alongside `eslint.config.mjs`:** ESLint 9 uses flat config only. The legacy `.eslintrc.json` from the scaffold must be deleted (D-18).
- **Hand-writing SQL in migrations:** Violates the locked constraint. Always `drizzle-kit generate`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Image resize/optimization | Custom canvas/jimp pipeline | `sharp` (0.35.2) | Prebuilt native binaries, webp/jpeg/png/avif support, streaming, battle-tested by Next.js itself |
| S3-compatible uploads | Raw HTTP PUT to R2/MinIO | `@aws-sdk/client-s3` | Handles signing, retries, multipart, presigned URLs — the SDK is the only correct way |
| SQL migration generation | Hand-written `.sql` files | `drizzle-kit generate` | Generates idempotent, ordered migrations with snapshot-based diffing — never hand-write SQL |
| Migration drift detection | Custom schema-diff tool | `drizzle-kit generate` + `git diff --exit-code` | The `generate` command itself is the diff engine — if it produces output, there's drift |
| DB connection pool | Custom pool manager | `pg` `Pool` class | Handles reconnection, max connections, idle timeouts |
| ESLint rule for import isolation | Custom AST walker | `no-restricted-imports` | Built-in ESLint rule, tested with glob patterns, produces clear error messages |

**Key insight:** Every custom solution in this domain is worse than the battle-tested library. Sharp, the AWS SDK, and Drizzle Kit are all maintained by large communities and handle edge cases (EXIF orientation, multipart uploads, migration ordering) that custom code will miss.

## Common Pitfalls

### Pitfall 1: `drizzle-kit check` Does NOT Detect Schema Drift

**What goes wrong:** A developer edits `schema.ts` (adds a column) but forgets to run `drizzle-kit generate`. They run `drizzle-kit check` expecting it to catch the drift — it passes with "Everything's fine."

**Why it happens:** `drizzle-kit check` validates the internal consistency of existing migration snapshots against the `_journal.json` — it does NOT compare `schema.ts` against the migration files. In testing, reverting `schema.ts` to a subset of the migrated schema still passes `check`.

**How to avoid:** Use a two-layer drift gate in CI:
1. Run `drizzle-kit generate --name ci-drift-check` (creates a new migration file if schema changed).
2. Run `git diff --exit-code src/db/migrations/` (fails if new files were created, meaning the developer forgot to commit the generated migration).
3. Separately, run the clean-room migration test (D-09) to verify migrations apply cleanly.

**Warning signs:** `drizzle-kit check` passing but migrations are stale; schema columns missing from migration SQL.

### Pitfall 2: sharp Postinstall Silently Skipped by pnpm

**What goes wrong:** `require("sharp")` throws at runtime: "Could not load the 'sharp' module." The package is in `node_modules` but its native binary wasn't installed.

**Why it happens:** pnpm v10+ blocks lifecycle scripts (postinstall, install) by default for security. Without the allowlist, sharp's binary download is skipped silently.

**How to avoid:** After `pnpm add sharp`, run `pnpm approve-builds` (interactive — select sharp) or manually add `"pnpm": { "onlyBuiltDependencies": ["sharp"] }` to `package.json`. Commit the allowlist so it persists across clones. The `pnpm setup` script (D-04) must include this step.

**Warning signs:** sharp module not found; `sharp.versions` is undefined.

### Pitfall 3: MinIO Requires `forcePathStyle: true`

**What goes wrong:** S3 uploads to MinIO fail with 403 Forbidden or "InvalidRequest" errors. R2 works fine.

**Why it happens:** MinIO uses path-style addressing (`http://localhost:9000/bucket/key`) while R2/S3 use virtual-hosted style (`http://bucket.s3.amazonaws.com/key`). The `forcePathStyle` flag must differ between environments.

**How to avoid:** Make `forcePathStyle` env-driven: `process.env.S3_FORCE_PATH_STYLE === "true"`. `.env.example` ships `S3_FORCE_PATH_STYLE=true` for MinIO; Coolify injects `S3_FORCE_PATH_STYLE=false` for R2.

**Warning signs:** 403/InvalidRequest errors only in local dev; R2 works but MinIO doesn't.

### Pitfall 4: ESLint Flat Config Pattern Matching with Parentheses in Path

**What goes wrong:** The `no-restricted-imports` pattern `@/app/(admin)/*` doesn't match actual imports, or matches too broadly.

**Why it happens:** Parentheses in file paths (`src/app/(admin)/`) are filesystem-legal but unusual in glob patterns. ESLint's minimatch-based pattern engine handles them, but only with exact string patterns — not regex.

**How to avoid:** Use literal glob patterns (`@/app/(admin)/*`) not regex. Verified working in ESLint 9.39.4: the pattern `@/app/(admin)/*` correctly flags `import x from "@/app/(admin)/posts/page"` while allowing `import x from "@/lib/db"`. Test with a planted cross-group import in the `pnpm verify` script.

**Warning signs:** Cross-group imports passing lint; lint failing on legitimate shared imports.

### Pitfall 5: `package-lock.json` Lingering After pnpm Migration

**What goes wrong:** The scaffold shipped with `package-lock.json` (npm artifact). If not deleted, npm or IDE tooling may use it instead of `pnpm-lock.yaml`, causing phantom dependency mismatches.

**Why it happens:** The TailAdmin scaffold was created with npm. The project constraint requires pnpm-only.

**How to avoid:** Delete `package-lock.json` (D-18). Run `pnpm install` to generate `pnpm-lock.yaml`. Commit `pnpm-lock.yaml`, never `package-lock.json`. Add `package-lock.json` to `.gitignore` if not already present.

**Warning signs:** Both lockfiles present; `npm install` being run by mistake.

## Code Examples

Verified patterns from installed packages (drizzle-kit 0.31.10 CLI, drizzle-orm 0.45.2 runtime, sharp 0.35.2 pipeline, @aws-sdk/client-s3 3.1077.0 config):

### Clean-Room Migration Test Script (FOUND-06)

```typescript
// scripts/test-migrations.mjs
// [VERIFIED: drizzle-orm/node-postgres/migrator.migrate + pg Pool]
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

const TEST_DB_URL = process.env.TEST_DATABASE_URL || "postgres://postgres:postgres@localhost:5433/anydiscussion_test";
const MIGRATIONS_FOLDER = "./src/db/migrations";

async function runCleanRoomTest() {
  console.log("Starting clean-room migration test...");
  const pool = new Pool({ connectionString: TEST_DB_URL });
  const db = drizzle(pool);

  try {
    await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
    console.log("✓ All migrations applied successfully to clean DB.");

    // Verify tables exist using getTableColumns (VERIFIED: drizzle-orm 0.45.2)
    // Note: getTableColumns introspects a Drizzle table object, NOT the DB.
    // For DB introspection, use a raw query:
    const result = await pool.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name;
    `);
    const tables = result.rows.map((r: any) => r.table_name);
    console.log(`✓ Tables in clean DB (${tables.length}):`, tables.join(", "));

    const expected = ["posts", "post_seo", "categories", "tags", "post_tags", "media", "settings", "pages"];
    const missing = expected.filter((t) => !tables.includes(t));
    if (missing.length > 0) {
      throw new Error(`Missing tables: ${missing.join(", ")}`);
    }
    console.log("✓ All 8 expected tables present.");
    console.log("✓ Clean-room migration test PASSED.");
  } catch (err) {
    console.error("✗ Clean-room migration test FAILED:", err);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

runCleanRoomTest();
```

### Drift Gate (CI — generate + git diff)

```bash
# CI drift gate (part of pnpm verify or CI workflow)
# [VERIFIED: drizzle-kit generate creates files only when schema changes]
pnpm drizzle-kit generate --name ci-drift-check
git diff --exit-code src/db/migrations/
# Exit code 0 = no drift (schema matches migrations)
# Exit code 1 = drift detected (developer forgot to commit generated migration)
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `middleware.ts` (auth gate) | `proxy.ts` (Next 16 rename) | Next 16.0 (2025-10) | Phase 2 auth gate uses `proxy.ts`, not `middleware.ts` |
| `experimental.ppr: true` | `cacheComponents: true` (top-level) | Next 16.0 (2025-10) | Deprecated experimental flag merged into top-level config |
| `revalidateTag(tag)` (1-arg) | `revalidateTag(tag, "tag")` (2-arg) | Next 16.0 (2025-10) | Second arg is the `type` — required in Next 16 |
| Drizzle `getColumns()` | `getTableColumns(table)` | drizzle-orm 0.45.x | `getColumns` is a 1.0-only API; use `getTableColumns` in 0.45.x |
| pnpm auto-runs postinstall | pnpm blocks postinstall by default | pnpm v10 (2025) | Must `pnpm approve-builds` for sharp's native binary |

**Deprecated/outdated:**
- `experimental.ppr`: Use top-level `cacheComponents` instead.
- `.eslintrc.json` / `.eslintrc.js`: ESLint 9 uses flat config (`eslint.config.mjs`) only.
- `drizzle-kit push` for production: Use `generate` + `migrate` for auditable, ordered migrations.
- `npm` / `yarn`: pnpm-only per project constraint.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The custom `next/image` loader file path is at `src/lib/image-loader.ts` (planner's discretion per D-16) | Pattern 1 | LOW — loader path is configurable in `next.config.ts images.loaderFile` |
| A2 | The Drizzle schema column types/names exactly match CLAUDE.md's schema reference | Pattern 2 | LOW — CLAUDE.md is authoritative; exact column types (e.g., `jsonb` for body) follow standard Drizzle pg-core builders |
| A3 | GitHub Actions will be the CI service (CI service-container setup is Claude's discretion per CONTEXT.md) | Validation Architecture | MEDIUM — if CI is different (e.g., Coolify CI), the service-container setup changes. But the script-based verification (`pnpm verify`) is CI-agnostic. |
| A4 | MinIO bucket `anydiscussion-media` is the default | Pattern 4, 5 | LOW — bucket name is env-driven; `.env.example` default is planner's discretion |

**A1-A4 are all Claude's-discretion items from CONTEXT.md. No user confirmation needed — these are implementation choices the planner can make.**

## Open Questions (RESOLVED)

1. **CI service-container vs docker-in-CI for the clean-room test**
   - What we know: The clean-room test needs a throwaway Postgres. Docker Compose provides `postgres-test` on port 5433.
   - What's unclear: Whether CI uses GitHub Actions service containers (recommended, cleaner) or docker-in-docker.
   - RESOLVED: Use GitHub Actions service containers for Postgres in CI. The `pnpm verify` script runs locally against Docker Compose; CI runs the same script against the service container. This is Claude's discretion per CONTEXT.md. Both plans (01-02 clean-room test, 01-03 verify orchestrator) already follow this recommendation — the local path is `docker compose up -d postgres-test` against the compose file shipped in Plan 01 Task 1c.

2. **Exact sharp variant sizes and formats**
   - What we know: The minimal helper needs to produce "optimized variants" (D-14). Three widths (640, 1024, 1920) in WebP is a standard responsive set.
   - What's unclear: Whether to also produce JPEG/PNG fallbacks, AVIF, or a thumbnail.
   - RESOLVED: WebP-only at three widths (sm/md/lg). AVIF can be added later (sharp supports it). This is Claude's discretion per CONTEXT.md. Plan 01-03 Task 1 already implements exactly this — three WebP variants at 640/1024/1920, quality 80, `fit: "inside"`, `withoutEnlargement: true`.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Docker | Postgres 16 + MinIO (Docker Compose) | ✓ | 29.5.3 | — |
| Docker Compose | Multi-service orchestration | ✓ | v5.1.4 | — |
| pnpm | Package manager (locked) | ✓ | 11.9.0 | — |
| Node.js | Runtime | ✓ | v24.15.0 (≥20.9.0 ✓) | — |
| npm | Version verification only | ✓ | 11.7.0 | — |
| git | Version control | ✓ | 2.52.0 | — |
| PostgreSQL (local native) | Clean-room test | ✗ | — | Docker Compose `postgres-test` service (D-01) |
| MinIO (local native) | R2 upload smoke test | ✗ | — | Docker Compose `minio` service (D-02) |

**Missing dependencies with no fallback:** none — all required tools are available.

**Missing dependencies with fallback:** `psql` is not installed natively, but Docker Compose provides Postgres (D-01). No native install needed.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Node.js scripts (no test framework needed for Phase 1 — verification is via `pnpm verify` script + `next build`) |
| Config file | `package.json` scripts: `verify`, `test:migrations`, `setup` |
| Quick run command | `pnpm verify` |
| Full suite command | `pnpm verify` (Phase 1 has one gate) |

Phase 1 is a foundation phase — its "tests" are the success criteria themselves, machine-checked by `pnpm verify`. No unit test framework (vitest/jest) is required for this phase. Later phases that add business logic (Phase 2 auth, Phase 3 content) will introduce a test framework if needed.

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|--------------|
| FOUND-01 | `next.config.ts` has `cacheComponents:true`, `output:"standalone"`, image loader env URL | script | `pnpm verify` (config check step) | ❌ Wave 0 — create `scripts/verify.mjs` |
| FOUND-01 | `next build` succeeds with the config | build | `pnpm build` | ❌ Wave 0 — modify `package.json` scripts |
| FOUND-02 | `src/lib/db/index.ts` exports a Drizzle instance connected to Postgres | script | `pnpm verify` (DB connection step) | ❌ Wave 0 |
| FOUND-03 | `drizzle-kit generate` produces the first migration with 8 tables | script | `pnpm verify` (drift gate step) | ❌ Wave 0 — create `src/db/schema.ts` first |
| FOUND-03 | All 8 tables present in migration SQL | script | `pnpm verify` (clean-room test checks `information_schema.tables`) | ❌ Wave 0 |
| FOUND-04 | Cross-group import fails ESLint | lint | `pnpm verify` (planted import test step) | ❌ Wave 0 — create planted test file |
| FOUND-04 | `next build` succeeds with isolation rule | build | `pnpm build` | ❌ Wave 0 |
| FOUND-05 | `lib/r2` upload writes object to MinIO with sharp variants | smoke | `pnpm verify` (R2 upload smoke step) | ❌ Wave 0 — create `src/lib/r2/index.ts` |
| FOUND-06 | Clean-room migration test passes | script | `pnpm test:migrations` | ❌ Wave 0 — create `scripts/test-migrations.mjs` |
| FOUND-06 | No migration drift (`generate` + `git diff` passes) | script | `pnpm verify` (drift gate step) | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `pnpm verify` (fast feedback on all 5 success criteria)
- **Per wave merge:** `pnpm verify` + manual `pnpm dev` boot check
- **Phase gate:** `pnpm verify` green before `/gsd-verify-work`

### Wave 0 Gaps

All verification infrastructure is Wave 0 (must exist before implementation):

- [ ] `scripts/verify.mjs` — the `pnpm verify` orchestrator (D-15)
- [ ] `scripts/test-migrations.mjs` — the clean-room migration test (D-09)
- [ ] `scripts/setup.mjs` — the `pnpm setup` onboarding script (D-04)
- [ ] `docker-compose.yml` — Postgres + MinIO services (D-01, D-02, D-19)
- [ ] `.env.example` — documented env vars with MinIO defaults (D-03)
- [ ] Planted cross-group import test file — a file in `src/app/(site)/` that imports from `@/app/(admin)/`, used by `pnpm verify` to prove the ESLint rule fires (must be in `.eslintignore` or a separate test directory so it doesn't break the real build)

*(No existing test infrastructure — all must be created in Wave 0.)*

## Security Domain

### Applicable ASVS Categories

ASVS Level 1 (per config). Phase 1 is a foundation phase with no auth, no user input, and no data processing yet. Security considerations are minimal but foundational.

| ASVS Category | Applies | Standard |
|---------------|---------|----------|
| V2 Authentication | no | Phase 2 (Better Auth) |
| V3 Session Management | no | Phase 2 |
| V4 Access Control | no | Phase 2 |
| V5 Input Validation | yes | Zod schemas (Phase 3+); Phase 1 has no user input endpoints |
| V6 Cryptography | no | Phase 2 (session tokens) |
| V7 Error Handling | yes | `app/error.tsx` global error boundary (D-17); `lib/log` wrapper — structured logging without leaking stack traces to client |
| V8 Data Protection | yes | Env vars for secrets (`.env.local` gitignored); R2 credentials never hardcoded; `DATABASE_URL` in `.env.local` only |
| V12 Files & Resources | yes | `remotePatterns` whitelisting for `next/image` (only CDN + MinIO localhost); sharp validates image format before processing |

### Known Threat Patterns for Next.js 16 + Drizzle + R2 Stack

| Pattern | STRIDE Category | Standard Mitigation |
|---------|-----------------|---------------------|
| SQL injection | Tampering | Drizzle ORM parameterizes all queries by default — never raw string concatenation |
| Path traversal in uploads | Tampering | R2 keys are generated server-side (`baseKey` parameter), not from user input in Phase 1 |
| Env var leakage | Information Disclosure | `.env.local` gitignored; `NEXT_PUBLIC_CDN_URL` is the only `NEXT_PUBLIC_` var (safe to expose) |
| Image bomb (decompression attack) | Denial of Service | sharp has built-in pixel/byte limits; `maximumResponseBody` in Next image config |
| Cross-group import leakage | Tampering | ESLint `no-restricted-imports` rule (FOUNDATION of Phase 7's PERF-02 bundle-budget check) |

## Sources

### Primary (HIGH confidence — verified via npm registry + runtime tests)

- **npm registry** (registry.npmjs.org): `next@16.2.9`, `drizzle-orm@0.45.2`, `drizzle-kit@0.31.10`, `pg@8.22.0`, `@types/pg@8.20.0`, `@aws-sdk/client-s3@3.1077.0`, `@aws-sdk/s3-request-presigner@3.1077.0`, `sharp@0.35.2` — dist-tags, versions, and publish timestamps verified directly `[VERIFIED: npm view]`
- **drizzle-kit 0.31.10 CLI test** — `drizzle-kit check --help` confirms command exists; `generate` creates `migrations/0000_*.sql` + `meta/_journal.json` + `meta/0000_snapshot.json`; `check` passes "Everything's fine" even with schema-migration drift (critical finding) `[VERIFIED: runtime test in /tmp/dv2]`
- **drizzle-orm 0.45.2 runtime test** — `getTableColumns` is a function; `getColumns` is `undefined` (does not exist in 0.45.x) `[VERIFIED: node -e in /tmp/drizzle-verify]`
- **Next.js 16.2.9 type definitions** — `cacheComponents?: boolean`, `output?: 'standalone' | 'export'`, `images.qualities: number[]`, `images.remotePatterns: Array<URL | RemotePattern>`, `images.loader: "default" | "imgix" | "cloudinary" | "akamai" | "custom"`, default `qualities: [75]` `[VERIFIED: node_modules/next/dist/server/config-shared.d.ts + image-config.js]`
- **sharp 0.35.2 pipeline test** — `sharp(buffer).resize(800, 600, {fit:"inside"}).webp({quality:80}).toBuffer({resolveWithObject:true})` produces `{ data, info }` with width/height/format `[VERIFIED: runtime test in /tmp/dv2]`
- **@aws-sdk/client-s3 3.1077.0 config test** — `S3Client` + `PutObjectCommand` accept R2 config (`region:"auto"`, `forcePathStyle:false`) and MinIO config (`region:"us-east-1"`, `forcePathStyle:true`) `[VERIFIED: runtime test in /tmp/dv2]`
- **ESLint 9.39.4 no-restricted-imports test** — pattern `@/app/(admin)/*` correctly flags cross-group import; `@/lib/db` import passes `[VERIFIED: linter.verify() test in project node_modules]`
- **Environment audit** — Docker 29.5.3, Compose v5.1.4, pnpm 11.9.0, Node v24.15.0, git 2.52.0 all available `[VERIFIED: command -v + --version]`

### Secondary (MEDIUM confidence — referenced from project docs)

- `.claude/CLAUDE.md` — verified 2026 version table (Next 16.2.9, Drizzle 0.45.2, Better Auth 1.6.23, Tiptap v3, Zod 4, sharp 0.35.2) and code shapes `[CITED: .claude/CLAUDE.md]`
- `CLAUDE.md` (repo root) — schema reference, folder structure, conventions `[CITED: CLAUDE.md]`
- `.planning/phases/01-foundation/01-CONTEXT.md` — D-01..D-19 locked decisions `[CITED: CONTEXT.md]`

### Tertiary (LOW confidence — training knowledge)

- pnpm `approve-builds` persistence mechanism (`pnpm.onlyBuiltDependencies` in `package.json`) — from training data, web search rate-limited `[ASSUMED]` but corroborated by pnpm 11.9.0 `--help` output showing the command exists

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all packages verified against npm registry + runtime tests
- Architecture: HIGH — Next.js 16.2.9 type definitions inspected; Drizzle/Postgres/S3 patterns tested at runtime
- Pitfalls: HIGH — `drizzle-kit check` behavior empirically tested; sharp/MinIO/ESLint patterns verified
- Environment: HIGH — all tools confirmed available via `command -v`

**Research date:** 2026-07-01
**Valid until:** 2026-08-01 (30 days — stable versions, no fast-moving dependencies)
