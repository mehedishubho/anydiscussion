# Walking Skeleton — Any Discussion

**Phase:** 1 (Foundation)
**Generated:** 2026-07-01

## Capability Proven End-to-End

A developer runs `pnpm setup && pnpm verify` and the entire application backbone is proven working: a Next.js 16 app boots with Cache Components (PPR) + standalone build output + an env-driven CDN image loader, the Drizzle schema applies cleanly via generated migrations to a real Postgres 16 container (8 tables, zero drift verified by the clean-room test), and a file flows through `sharp` into S3-compatible object storage as optimized WebP variants — all with the `(site)`/`(admin)` route-group boundary enforced by ESLint.

This is the thinnest possible end-to-end proof that every subsequent phase's foundation (config, DB, storage, isolation) works before a single feature is built on top of it.

## Architectural Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Framework | Next.js 16 App Router (cacheComponents:true, output:"standalone", Turbopack) | Locked stack; PPR for the public-site static+dynamic mix; standalone for Coolify Docker deploys |
| Data layer | PostgreSQL 16 + Drizzle ORM 0.45.2 (node-postgres driver) | SQL-first ORM; Better Auth peer-pins drizzle ^0.45.2 (do NOT adopt 1.0 RC); pg.Pool for connection management |
| Storage | Cloudflare R2 (S3-compatible) + MinIO for local dev | No paid API, generous egress; env-driven forcePathStyle toggle means zero code swap between local and prod |
| Image pipeline | sharp 0.35.2 resize-at-upload → WebP variants (640/1024/1920) | next/image custom loader rewrites URLs to the CDN; sharp produces optimized variants server-side at upload time (not per-request) |
| Route isolation | ESLint no-restricted-imports (flat config, literal globs) | Prevents TailAdmin/editor JS leaking into the public bundle; foundation of Phase 7 PERF-02 bundle-budget check |
| Migration hygiene | drizzle-kit generate (forward-only) + clean-room test (empty Postgres ← all migrations) | Never hand-write SQL; drizzle-kit check is snapshot-only (not a drift gate); real drift gate = generate + git diff |
| Deployment target | Coolify (self-hosted VPS, git-push deploys, managed SSL/Postgres) | Self-hosted constraint; no Vercel-specific tooling; Docker multi-stage with standalone output |
| Dev environment | Docker Compose (postgres:16-alpine + postgres-test + minio) | Single docker compose up -d spawns the entire local stack; throwaway postgres-test on port 5433 for the clean-room test |
| Directory layout | src/db (schema+migrations), src/lib/{db,r2,log}, src/app/{(site),(admin),(full-width-pages)}, src/actions (later) | (site)/(admin) physically separate; shared lib/db/actions outside app/; @/* → src/* single alias |
| Package manager | pnpm only (never npm/yarn) | Locked constraint; sharp postinstall gated by pnpm.onlyBuiltDependencies allowlist |
| Auth | Better Auth + admin/RBAC plugin (Phase 2 — not in skeleton) | Deferred; users table ships in Phase 2 via Better Auth CLI |

## Stack Touched in Phase 1

- [x] Project scaffold — TailAdmin `free-nextjs-admin-dashboard` base (Next 16.2.9, React 19.2, TS 5.9.3, ESLint 9 flat config, Tailwind 4)
- [x] Routing — three route groups: `(site)` (NEW, server-component-first), `(admin)` (existing TailAdmin), `(full-width-pages)` (auth/error — Phase 2)
- [x] Database — Drizzle 8-table schema (posts, post_seo, categories, tags, post_tags, media, settings, pages) + first migration applied to live Postgres 16
- [x] Storage — R2/sharp pipeline writing 3 WebP variants to MinIO (S3-compatible)
- [x] Config — cacheComponents (PPR), standalone output, env-driven CDN image loader, ESLint isolation gate
- [x] Verification — single-command `pnpm verify` machine-checks all 5 success criteria; `pnpm setup` is clone-to-running onboarding
- [ ] UI interaction wired to API — deferred (no business logic in Phase 1; Phase 3 adds the first real CRUD)

## Single Command That Proves the Skeleton

```
pnpm setup && pnpm verify
```

`pnpm setup` installs deps, approves the sharp build, starts Docker Compose (Postgres + MinIO), applies migrations, and confirms the MinIO bucket. `pnpm verify` then validates the next.config, runs the migration drift gate, runs the clean-room migration test (fresh Postgres ← all migrations), proves the ESLint isolation rule fires on a planted cross-group import, runs `next build`, and runs the R2 upload smoke (file → sharp → 3 WebP objects in MinIO). Exit 0 = the backbone is proven.

## Out of Scope (Deferred to Later Slices)

- **Auth + RBAC** (Better Auth, users table, proxy gate, permission helpers) → Phase 2
- **Content CRUD + Tiptap editor + presigned-URL media uploads** → Phase 3
- **TailAdmin dashboard wired to real data + forms (RHF/Zod/TanStack Query)** → Phase 4
- **SEO (generateMetadata, sitemap, JSON-LD, canonical, RSS)** → Phase 5
- **Public frontend (home, single post with Cache Components + Suspense, search, archives)** → Phase 6
- **Performance audit, rate limiting, backups, Coolify staging deploy** → Phase 7
- **Feature-specific schema columns** (Bangla slugs, view count, draft preview token, scheduled publishing) → their owning phases per D-05 hybrid depth
- **Menu builder, header/footer custom-code injection, redirects manager UI** → v2 fast-follow (SETT-01..03)
- **Configurable multi-destination backup system** → Phase 7 (pending todo)
- **Presigned-URL direct-to-storage upload flow** → Phase 3 (MEDIA-01); Phase 1 ships only the minimal server-side helper (D-14)

## Subsequent Slice Plan

Each later phase adds one vertical slice on top of this skeleton without altering its architectural decisions:

- **Phase 2 (Auth + RBAC):** A team member can sign in and be authorized by role — adds the users table (Better Auth), proxy.ts cookie gate, permission helpers, and the post status enum so the review workflow is enforced server-side from day one.
- **Phase 3 (Content Engine):** An author writes a post in Tiptap, attaches media from R2, and moves it through draft → review → publish — adds posts CRUD, the presigned-URL upload flow (building on lib/r2), double-sanitization, and revalidation.
- **Phase 4 (Dashboard Chrome):** The editorial team manages content through a polished TailAdmin dashboard wired to real data — no architectural change, just feature UI on top of the existing (admin) route group.
- **Phase 5 (SEO Basics):** Every public route emits accurate metadata — adds generateMetadata, sitemap, JSON-LD on top of the (site) route group established here.
- **Phase 6 (Public Frontend):** Readers browse the blog at maximum speed — builds the home/archive/single-post surfaces on (site), with the single-post page using Cache Components + Suspense (the highest-complexity slice).
- **Phase 7 (Performance & Deploy):** Ships on the real Coolify + Cloudflare stack meeting the perf bar, with publish→visible verified end-to-end.
