# Phase 1: Foundation - Context

**Gathered:** 2026-06-30
**Status:** Ready for planning

<domain>
## Phase Boundary

Establish the locked Next.js 16 + Drizzle + Postgres + R2 backbone and conventions **on top of the existing TailAdmin `free-nextjs-admin-dashboard` scaffold**, so Content (Phase 3) and Auth (Phase 2) work begin on a stable, drift-free base. Concretely this phase delivers:

- **Framework config** — Next.js 16 with `cacheComponents:true` (PPR), Turbopack, `output:"standalone"`, and a custom `next/image` loader pointed at the CDN URL (env-driven).
- **DB layer** — Drizzle ORM + `node-postgres` client (`db/`, `drizzle.config.ts`), the base schema, and the first `drizzle-kit generate` migration.
- **R2/sharp pipeline** — a minimal server-side `lib/r2` upload helper that runs `sharp` to produce optimized variants and writes to S3-compatible storage.
- **Route-group isolation** — `app/(site)` created and physically isolated from `app/(admin)` via an ESLint `no-restricted-imports` rule that fails the build on any cross-group import.
- **Dev/onboarding infra + migration hygiene tooling** — Docker Compose stack, env convention, `pnpm setup`, and a clean-room migration test.

**Out of scope:** auth/RBAC (Phase 2), posts/content CRUD + Tiptap + presigned media uploads (Phase 3), TailAdmin wiring to real data (Phase 4), SEO (Phase 5), public frontend (Phase 6), the production backup *system* + deploy (Phase 7). The `users` table is deferred to Phase 2 (Better Auth generates it).

</domain>

<decisions>
## Implementation Decisions

### Dev environment
- **D-01 (Postgres):** Run Postgres 16 locally via a committed **Docker Compose** service (`docker-compose.yml` at repo root). The same compose file spawns a throwaway DB for the FOUND-06 clean-room migration test. No native installs, no shared cloud dev DB.
- **D-02 (S3-compatible storage):** Run **MinIO via the same Compose** file for local dev — credential-free, zero egress. R2-specific parity (CDN, real R2 quirks) is verified later in staging (Phase 7), not locally.
- **D-03 (Env files):** Layered — commit `.env.example` (documented, shipped with **working MinIO defaults** so local dev is zero-config) alongside a gitignored `.env.local` for real secrets. No per-env files; Coolify injects staging/prod.
- **D-04 (Onboarding):** A **`pnpm setup` script** (Node, cross-platform/Windows-aware — the primary dev OS is Windows) that installs deps, runs `pnpm approve-builds` for `sharp`, starts Compose, applies migrations, and confirms the MinIO bucket exists. Clone → running in one command.

### Schema strategy
- **D-05 (Completion depth):** **Hybrid** — create all v1 tables now with core identity columns + everything already fully specified in CLAUDE.md/REQUIREMENTS. Defer only genuinely-uncertain feature columns (view-count, `published_at` scheduling, etc.) to their owning phase's migration. Not full-v1-up-front, not skeleton-only.
- **D-06 (`pages` table):** **Post-like with its own SEO columns** — `{ id, slug, title, body(jsonb), status(draft/published), published_at, created_at, updated_at, meta_title, meta_description, canonical }`. Edited via the same Tiptap editor (DASH-05). Do NOT generalize `post_seo` into a polymorphic/shared SEO table in this phase.
- **D-07 (`users` table):** **Defer to Phase 2.** Phase 1 ships **8 tables** (posts, post_seo, categories, tags, post_tags, media, settings, pages). Better Auth's CLI generates `users` + auth tables in Phase 2, then the `role` field is added. `posts.author_id` exists as a **plain column now**; its FK constraint is added in a Phase 2 migration.
- **D-08 (Deletion):** **Soft-delete content, hard-delete the rest.** `deleted_at` timestamp on posts, pages, media, categories, tags (queries filter `WHERE deleted_at IS NULL`). Hard-delete on settings, `post_tags`, `post_seo`.

### Migration hygiene
- **D-09 (Clean-room test):** `pnpm test:migrations` **local script + CI gate**. Spins up a throwaway Postgres (via the Compose service), applies every committed migration, and fails on drift. Runs locally for fast feedback AND in CI on every PR — drift cannot merge.
- **D-10 (Generate-then-commit rule):** CI runs **`drizzle-kit check`** — Drizzle's built-in sync validator that fails if `schema.ts` has ungenerated changes. Paired with the clean-room test, drift is caught two ways with no new tooling.
- **D-11 (Rollback stance):** **Forward-only + backup restore.** Migrations are additive; no hand-written down-scripts (honors the "never hand-write SQL" constraint). Recovery from a bad migration = Postgres backup restore (Phase 7) + a new forward fix migration.

### CDN/R2 readiness
- **D-12 (Image loader):** **Env-driven `NEXT_PUBLIC_CDN_URL`.** `.env.example` ships a MinIO default for local dev; Coolify injects `cdn.anydiscussion.com` in staging/prod once provisioned. The FOUND-05 upload test runs against MinIO; real R2 is verified in Phase 7. No code swap later — just an env change.

### Isolation enforcement
- **D-13 (Cross-group ban):** **ESLint `no-restricted-imports`** in the flat config (`eslint.config.mjs`). Errors on any import crossing the `(site)`/`(admin)` boundary while still allowing both to import from shared `actions/lib/db`. Delete the legacy **`.eslintrc.json`** (ESLint 9 = flat config only). Phase 7's bundle-budget check (PERF-02) adds a second layer catching actual bundle leakage.

### R2 upload scope
- **D-14 (Phase 1 = minimal helper):** Ship **only a minimal server-side `lib/r2` function** (file/buffer → `sharp` variants → write object). Enough for FOUND-05 and to prove the pipeline end-to-end. The **presigned-URL direct-to-storage flow + media-library UI are Phase 3** (MEDIA-01). Keep the phase boundary clean.

### Verification shape
- **D-15 (`pnpm verify`):** A **`pnpm verify` script** that machine-checks each Phase 1 success criterion 1:1: validates `next.config` (cacheComponents/standalone/image-loader env URL), runs the drift gate (`drizzle-kit generate` + `git diff --exit-code src/db/migrations/` — NOT `drizzle-kit check` alone, which only validates snapshot/journal consistency per RESEARCH.md Pitfall 1) + the clean-room migration test, runs the ESLint isolation rule against a **planted cross-group import that must fail**, runs `next build` (succeeds), and runs the `lib/r2` upload smoke against MinIO. Repeatable, CI-able.

### Foundation conventions (smaller locks)
- **D-16 (Path aliases):** **`@/*` → `src/*` only.** No extra specific aliases — everything (db, lib, actions) lives under `src/`, so the single default alias covers it.
- **D-17 (Error/log foundation):** **Lay it down now.** Add `app/error.tsx` (global error boundary — Next best-practice) + a **dependency-free `lib/log` wrapper** (structured console for v1; swappable to pino later). Easier day one than retrofitting across many Server Actions.
- **D-18 (Demo cleanup):** Phase 1 removes `package-lock.json`, `.eslintrc.json`, **and the `ecommerce/` demo folder** (CLAUDE.md marks it out-of-scope). **Keep** chart/table/form demo components as wiring reference until Phase 4 (DASH-07) removes them once real pages exist.
- **D-19 (Compose location):** `docker-compose.yml` at **repo root** (Docker auto-discovers; `docker compose up` works from root).

### Claude's Discretion
The following are intentionally left open for the researcher/planner (founder-level decisions are exhausted):
- Exact `drizzle.config.ts` fields, dialect config, and migration folder path (`src/db/migrations`).
- The precise ESLint `no-restricted-imports` rule body (regex/glob patterns for the two route groups + the shared-dirs allowlist).
- CI service-container setup for Postgres (GitHub Actions service container vs docker-in-CI).
- Which `sharp` output variants/formats to produce, and exact MinIO bucket/credential defaults in `.env.example`.
- Internal structure of the `pnpm setup` / `pnpm verify` / `pnpm test:migrations` scripts.
- `next/image` `remotePatterns` whitelisting (MinIO localhost + the CDN domain) — driven by D-12.

### Folded Todos
None folded into Phase 1 scope. (A backup-system todo was captured during this session but belongs to Phase 7 — see Deferred Ideas.)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project-level (stack + scope — authoritative)
- `CLAUDE.md` (repo root) — authoritative source for the locked stack, conventions, folder structure, schema reference, and "what NOT to do." Where it overlaps with other docs, it wins on mechanics.
- `.claude/CLAUDE.md` — **verified 2026 version table + code shapes** (Next 16.2.9, Drizzle 0.45.2 — do NOT adopt 1.0, Better Auth 1.6.23, Tiptap v3 not v2, Zod 4, sharp postinstall `pnpm approve-builds`, 2-arg `revalidateTag`). Read before any dependency install or config.
- `.planning/PROJECT.md` — v1 scope, Key Decisions table, Context (existing TailAdmin scaffold, the `package-lock.json` landmine, greenfield DB, team size 2–5).

### Phase-1-specific (requirements + roadmap)
- `.planning/REQUIREMENTS.md` — FOUND-01..06 (the 6 requirements this phase must satisfy).
- `.planning/ROADMAP.md` §"Phase 1: Foundation" — goal, 5 success criteria, Pitfall #5 (Drizzle migration drift), research flag (LOW: re-verify `getTableColumns`, sharp `pnpm approve-builds`, 2-arg `images.qualities`).

</canonical_refs>

<code_context>
## Existing Code Insights

The repo is the **stock TailAdmin `free-nextjs-admin-dashboard` scaffold** — nothing project-specific exists yet. Scout findings:

### Reusable Assets
- **TailAdmin `(admin)` shell** — `src/app/(admin)` layout, `AppSidebar`, `AppHeader`, `Backdrop`, `SidebarWidget` (`src/layout/`), context providers (`SidebarContext`, `ThemeContext`). Keep; Phase 4 wires real data.
- **`(full-width-pages)` route group** — already exists; auth + error pages land here (Phase 2).
- **Root `layout.tsx`, `globals.css`, `not-found.tsx`, `favicon.ico`** — exist; extend, don't recreate.
- **Demo components** — `src/components/{calendar,charts,common,form,header,tables,ui,user-profile}` — keep as reference (D-18); `src/components/ecommerce` — delete (D-18).

### Established Patterns
- **TypeScript strict** (`tsconfig.json`), **Tailwind v4** (`@tailwindcss/postcss` — CSS-based config, no `tailwind.config.js` expected), **ESLint 9 flat config**.
- **App Router with route groups** — `(admin)` + `(full-width-pages)` present; Phase 1 adds `(site)` as a sibling.
- Installed already: `next@^16.1.6`, `react@^19.2.0`, `typescript@^5.9.3`, `eslint-config-next@16.0.7`. **Not installed:** drizzle-orm, drizzle-kit, pg, @aws-sdk/client-s3, sharp, better-auth, tiptap, zod — Phase 1+ adds them.

### Integration Points
- **New route group:** create `src/app/(site)` — sibling to `(admin)` + `(full-width-pages)`.
- **New shared dirs (outside `app/`, per CLAUDE.md):** `src/db/` (schema.ts, migrations/, index.ts), `src/lib/db/` (Drizzle client), `src/lib/r2/`, `src/lib/log/` (D-17), `src/actions/` (later phases).
- **Config files to modify:** `next.config.ts` (cacheComponents/standalone/image-loader), `eslint.config.mjs` (+ isolation rule), `tsconfig.json` (alias already `@/*`→src), `package.json` (add pnpm scripts: setup/verify/test:migrations; remove `package-lock.json`).
- **`pnpm` migration:** the scaffold shipped a `package-lock.json` (npm artifact) — must be removed and replaced with `pnpm-lock.yaml` (D-18 + the locked pnpm-only constraint).

</code_context>

<specifics>
## Specific Ideas

No specific aesthetic/reference requests (branding is deferred to the UI phase per PROJECT.md). The founder's preferences expressed here are workflow/strategy choices (D-01..D-19), not look-and-feel.

</specifics>

<deferred>
## Deferred Ideas

- **Configurable multi-destination backup system → Phase 7.** Surfaced during this session. The founder chose **option B (expand v1)**: PERF-05 + Phase 7 scope must grow from "Postgres backups scheduled" to a configurable, settings-driven backup system (destinations: R2 · Google Drive · local as multi-select; configurable frequency/retention/off-site; configurable restore-drill cadence with alerting; tooling + R2-object-backup left to Phase 7 research; Google Drive OAuth caveat flagged). **Captured as a pending todo** at `.planning/todos/pending/2026-06-30-configurable-multi-destination-backup-system.md` — Phase 7's `/gsd-discuss-phase` auto-surfaces it. **Requires a roadmap/requirements update via GSD handlers before Phase 7 planning.**
- **Presigned-URL direct-to-storage upload flow → Phase 3 (MEDIA-01).** Phase 1 ships only the minimal server-side helper (D-14).
- **Feature-specific schema columns** (Bangla-slug helpers → CONT-07, `published_at` scheduling → CONT-09, view-count → SITE-17, draft preview token → CONT-10) → their owning phases (3/5/6), per the hybrid-depth decision (D-05).
- **`users` + auth tables → Phase 2** (Better Auth generates; D-07).
- **Chart/table/form demo removal + lean-dashboard lazy-loading → Phase 4 (DASH-07).**

</deferred>

---

*Phase: 1-Foundation*
*Context gathered: 2026-06-30*
