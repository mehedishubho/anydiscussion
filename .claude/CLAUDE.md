<!-- GSD:project-start source:PROJECT.md -->

## Project

**Any Discussion**

A custom-built, self-hosted blog CMS for **anydiscussion.com** — not WordPress. One Next.js 16 app serves both a public-facing blog (extremely fast: ISR/PPR, minimal client JS) and an auth-gated, role-based admin dashboard (more JS-heavy, not optimizing for public Core Web Vitals), backed by one PostgreSQL database. English UI with Bangla content allowed (UTF-8, not a translated UI). Brand identity: clean, fast, professional.

**Core Value:** Editors/authors can publish well-optimized blog posts and readers can consume them at maximum speed — the public blog must be fast and SEO-sound, and the dashboard must let a small team manage the full content lifecycle (draft → review → publish) without touching code.

### Constraints

- **Tech stack (locked):** Next.js 16 App Router, Drizzle ORM + drizzle-kit, PostgreSQL, Better Auth (+admin/RBAC plugin), Tiptap, React Hook Form + Zod, TanStack Query, Cloudflare R2, dnd-kit, isomorphic-dompurify, Coolify. Do not suggest NextAuth, Prisma, or alternatives unless asked.
- **Package manager:** pnpm only — never npm or yarn, in commands/scripts/READMEs/CI.
- **Performance:** public pages ISR/static by default; PPR where pages mix static body + dynamic related content; `next/image` only (never raw `<img>`); `revalidatePath`/`revalidateTag` on publish — no polling or full rebuilds.
- **Security:** every mutating Server Action starts with a role/permission check; sanitize any raw HTML/JS field (custom code, embeds) before storage **and** before render; never rely on UI hiding alone.
- **Self-hosted / no paid APIs:** VPS via Coolify; no Vercel-specific or paid third-party APIs without explicit approval.
- **Migrations:** generate via `drizzle-kit generate` after schema changes — never hand-write SQL.
- **Timeline:** no hard deadline; sequence for correctness and the non-negotiable perf/SEO bar.

<!-- GSD:project-end -->

<!-- GSD:stack-start source:research/STACK.md -->

## Technology Stack

## TL;DR — what changed vs. training-data / CLAUDE.md assumptions

| Locked entry | Stale assumption | VERIFIED 2026 reality | Impact |
|---|---|---|---|
| Next.js 16 | "use `middleware.ts` + `experimental.ppr`" | **`proxy.ts`** (renamed), PPR via **`cacheComponents:true`**, `revalidateTag` needs 2 args, async params/searchParams | Every auth-gate & ISR file |
| Tiptap | "v2 (ProseMirror)" | **v3.27.1** is latest; v2 is maintenance-only | Use `@tiptap/*@3` |
| Zod | "v3" | **v4.4.3** | Schema API diffs; `@hookform/resolvers@5` |
| Drizzle | "latest" | **0.45.2** is `latest`; **1.0 is RC but NOT adopted** — Better Auth pins it to ^0.45.2 | Do NOT install drizzle 1.x |
| dnd-kit | "`@dnd-kit/core` + `@dnd-kit/sortable`" | Legacy pkgs frozen Dec-2024; new arch `@dnd-kit/react@0.5.0` is pre-1.0 | Use **legacy stable** |

## Recommended Stack (verified versions)

### Core framework

| Technology | Version | Purpose | Why (verified) | Conf. |
|---|---|---|---|---|
| **next** | **16.2.9** | App Router framework (public + admin) | Stable; 16.0 canaries shipped 2025-10-10, `latest` is now 16.2.9 (16.3 in preview). Node ≥20.9.0, React 19.2 peers. | HIGH |
| **react** / **react-dom** | **19.x** | UI runtime | Next 16 peers `^19.0.0` (also accepts 18.2). React 19.2 ships View Transitions, `useEffectEvent`, Activity. | HIGH |
| **typescript** | **≥5.1** (use latest 5.x) | Type safety | Next 16 minimum 5.1.0. | HIGH |
| Node.js (runtime) | **20.19+ LTS** (or 22/24) | Server runtime | Next 16 min 20.9.0; sharp requires ≥20.9.0; isomorphic-dompurify@3 requires `^20.19.0 \|\| ^22.13.0 \|\| >=24.0.0`. Use the **Node 20.19 LTS** (or 22 LTS) base image. | HIGH |

### Database & ORM

| Technology | Version | Purpose | Why | Conf. |
|---|---|---|---|---|
| **PostgreSQL** | 16 (or 17) | Primary DB | Self-hosted via Coolify managed service. PG FTS (`tsvector`/`websearch_to_tsquery`) powers `/search`. | HIGH |
| **drizzle-orm** | **0.45.2** | ORM | `latest` dist-tag. **Pinned here by Better Auth's peer (`^0.45.2`)** — Drizzle 1.0 is in RC (`1.0.0-rc.4`, 2026-06-27) but Better Auth does not yet accept it. Do **not** adopt 1.0 until Better Auth bumps its peer. | HIGH |
| **drizzle-kit** | **0.31.10** | Migrations / config | `latest` dist-tag. `defineConfig`, `generate`, `migrate`, `push`. | HIGH |
| **pg** (node-postgres) | **8.22.0** | PG driver | Drizzle's recommended driver (`drizzle-orm/node-postgres`). `postgres` (postgres.js 3.4.9) is the alternative. | HIGH |
| `@types/pg` | latest (dev) | Types | — | HIGH |

### Auth & RBAC

| Technology | Version | Purpose | Why | Conf. |
|---|---|---|---|---|
| **better-auth** | **1.6.23** | Auth + session | Published 2026-06-29. Peers explicitly support `next ^16.0.0` and `drizzle-orm ^0.45.2`. | HIGH |
| better-auth **`admin` plugin** | (built-in) | RBAC + user management | The `admin` plugin **is** the RBAC plugin — provides roles, permissions, `createAccessControl`, ban/impersonate. | HIGH |
| better-auth **`nextCookies` plugin** | (built-in) | Server-Action cookie setting | Add **last** in the plugins array so cookie-setting Server Actions work. | HIGH |

### Editor & content

| Technology | Version | Purpose | Why | Conf. |
|---|---|---|---|---|
| **@tiptap/core**, **@tiptap/react**, **@tiptap/starter-kit**, **@tiptap/html** | **3.27.1** (all aligned) | Rich text editor + server serialization | **Tiptap is v3, not v2.** v3.0.0 shipped 2024-07-14; v2 (2.27.2) is maintenance-only on a `v2-latest` dist-tag. Use `@tiptap/*@3`. `@tiptap/html` provides `generateHTML`/`generateJSON`. | HIGH |

### Forms & validation

| Technology | Version | Purpose | Why | Conf. |
|---|---|---|---|---|
| **zod** | **4.4.3** | Schema validation (shared client+server) | **Zod is v4** (4.0.0 shipped 2025-07-09). v3 is maintenance. Same schema reused for RHF client parsing and Server Action input parsing. | HIGH |
| **react-hook-form** | **7.80.0** | Dashboard forms | Peers `react ^16.8 \|\| ^17 \|\| ^18 \|\| ^19`. | HIGH |
| **@hookform/resolvers** | **5.4.0** | RHF ↔ Zod bridge | v5 supports Zod 4 (`zodResolver`). | HIGH |
| **@tanstack/react-query** | **5.101.2** | Dashboard mutations / optimistic UI | Peers `react ^18 \|\| ^19`. Use `useMutation` + `onMutate`/context for optimistic updates in client components. | HIGH |

### Media pipeline

| Technology | Version | Purpose | Why | Conf. |
|---|---|---|---|---|
| **@aws-sdk/client-s3** | **3.1076.0** | R2 (S3-compatible) uploads/gets | R2 config: `{ region: "auto", endpoint, credentials, forcePathStyle: true }`. | HIGH |
| `@aws-sdk/s3-request-presigner` | latest (3.x) | Presigned GET URLs | For any private/bypass-CDN access; public assets served via CDN domain instead. | HIGH |
| **sharp** | **0.35.2** | Server-side image resize on upload | Node ≥20.9.0. Ships prebuilt binaries (run `pnpm approve-builds` for the postinstall). Also used by Next.js's image optimizer. | HIGH |
| **Cloudflare R2** | (SaaS, no paid API) | Object storage for media | Served via custom domain `cdn.anydiscussion.com` so `next/image` can fetch via `remotePatterns`. | HIGH |

### Drag-and-drop

| Technology | Version | Purpose | Why | Conf. |
|---|---|---|---|---|
| **@dnd-kit/core** | **6.3.1** | DnD context (legacy/stable) | **Use the legacy stable packages**, not the new `@dnd-kit/react`. See "dnd-kit decision" below. | HIGH |
| **@dnd-kit/sortable** | **10.0.0** | Sortable lists (legacy/stable) | `SortableContext` + `useSortable` + `onDragEnd` reordering. | HIGH |
| ~~@dnd-kit/react~~ | (0.5.0) | New architecture | **Pre-1.0, beta as of 2026-06-27.** Skip until 1.0. Sparse docs, no migration from legacy yet. | HIGH |

### Sanitization

| Technology | Version | Purpose | Why | Conf. |
|---|---|---|---|---|
| **isomorphic-dompurify** | **3.18.0** | Isomorphic HTML/JS sanitization | Wraps `dompurify@^3.4.11` + `jsdom@^29`. Same `DOMPurify.sanitize(dirty, config)` API on server & client. | HIGH |

### Deployment

| Technology | Version | Purpose | Why | Conf. |
|---|---|---|---|---|
| **Coolify** | **v4.1.2** | Self-hosted PaaS on the VPS | Released 2026-06-04. Git-push deploys, managed SSL (Caddy/Traefik proxy), managed Postgres service, staging env. | HIGH |
| Docker (multi-stage) | — | Container build | Next.js `output: "standalone"` + node:20-alpine. See "Deployment shape" below. | HIGH |
| pnpm | latest | Package manager | **Mandatory** per project constraint. Never npm/yarn. | HIGH |

## Alternatives explicitly NOT used (locked exclusion, confirmed)

| Category | Excluded | Why not (verified) |
|---|---|---|
| Auth | NextAuth / Auth.js | Locked out. Better Auth chosen: ships RBAC (`admin` plugin), Drizzle adapter, native Next.js 16 `proxy.ts` support, 1.6.x is actively maintained. |
| ORM | Prisma | Locked out. Drizzle is SQL-first, lighter, no generated client step; Better Auth officially supports it. |
| Object storage | Vercel Blob | Locked out (Vercel-specific, paid). R2 is S3-compatible, generous egress, no paid API. |
| KV / cache | Vercel KV | Locked out. Not needed — Next 16 `cacheComponents` + Postgres + R2 cover caching. |
| Search | Algolia / paid search API | Locked out (paid). PG FTS on the `posts` table is sufficient for v1 traffic. |
| Bundler fallback | Webpack | Don't opt out of Turbopack unless a plugin truly requires it. Next 16 ships Turbopack-as-default. |
| UI kit | Anything other than TailAdmin | Locked. TailAdmin is a UI kit, not a scaffolding framework. |

## Installation

# Core

# Database

# Auth (Better Auth + admin/RBAC plugin is built-in)

# Editor (v3 — note the major)

# Forms + validation (Zod v4)

# Dashboard data layer

# Media pipeline (R2 + sharp)

# DnD (legacy stable — fast-follow menu builder)

# Sanitization

# Dev

## Current API specifics & code shapes (anti-stale-memory)

### Next.js 16 — ISR / PPR / revalidation

### Next.js 16 — auth gate is `proxy.ts`, not `middleware.ts`

### Better Auth RBAC — admin/editor/author roles

### Drizzle — config, client, migration, full-text search

# Migrations (pnpm only)

### Tiptap v3 — store JSON, render HTML server-side

### R2 upload + sharp resize + next/image CDN loader

### isomorphic-dompurify — jsdom pin (Known Issue)

## dnd-kit decision (legacy vs new architecture)

| Line | Packages | Status | API | Docs |
|---|---|---|---|---|
| **Legacy (recommended)** | `@dnd-kit/core@6.3.1`, `@dnd-kit/sortable@10.0.0` | Stable, frozen Dec-2024, ubiquitous | `DndContext` + `SortableContext` + `useSortable` + `onDragEnd` | Mature, every tutorial |
| New architecture | `@dnd-kit/react@0.5.0`, `@dnd-kit/dom@0.5.0` | **Pre-1.0, beta as of 2026-06-27** | Multi-framework, restructured | Sparse, in flux |

## Deployment shape (Coolify / self-hosted)

# Dockerfile (multi-stage) — Coolify auto-detects this

## Version-verification gotchas (flag for planners)

## Sources (all fetched 2026-07-01)

- `registry.npmjs.org`: next@16.2.9, react@19, drizzle-orm@0.45.2, drizzle-kit@0.31.10, better-auth@1.6.23, @tiptap/*@3.27.1, zod@4.4.3, react-hook-form@7.80.0, @hookform/resolvers@5.4.0, @tanstack/react-query@5.101.2, @aws-sdk/client-s3@3.1076.0, sharp@0.35.2, @dnd-kit/core@6.3.1, @dnd-kit/sortable@10.0.0, @dnd-kit/react@0.5.0, isomorphic-dompurify@3.18.0, pg@8.22.0 (dist-tags + publish timestamps + peerDependencies).
- Next.js 16 upgrade guide: `vercel/next.js@canary/docs/01-app/02-guides/upgrading/version-16.mdx` (1257 lines — Turbopack default, proxy rename, async APIs, revalidateTag 2-arg, updateTag/refresh, cacheComponents PPR, next/image changes, removals).
- Better Auth: `better-auth/better-auth@main/docs/content/docs/plugins/admin.mdx` (RBAC = admin plugin, createAccessControl, userHasPermission) + `docs/content/docs/integrations/next.mdx` (proxy.ts pattern, Next 16 compatibility).
- Drizzle: `drizzle-team/drizzle-orm-docs@main/src/content/docs/guides/postgresql-full-text-search.mdx` (tsvector/GIN/websearch_to_tsquery/ts_rank recipe) + `src/mdx/get-started/{postgresql/ConnectPostgreSQL,SetupConfig,ApplyChanges}.mdx` (config, client, generate/migrate/push).
- sharp: `lovell/sharp@main/README.md` (Node ≥20.9.0, resize/webp API).
- isomorphic-dompurify: `kkomelin/isomorphic-dompurify@master/README.md` (jsdom pin known issue, clearWindow).
- dnd-kit: `clauderic/dnd-kit@main/README.md` (new arch package list — confirms rewrite).
- @aws-sdk/client-s3: `aws/aws-sdk-js-v3@main/clients/client-s3/README.md` (S3Client + command pattern).
- Coolify: `coollabsio/coolify` latest = `v4.1.2` (2026-06-04).
- The `gsd-tools` research seam's `brave` provider was unavailable (`BRAVE_API_KEY not set`); built-in `WebSearch` was rate-limited; `context7`/`exa` MCP tools were not in the available toolset. Version verification therefore used the **npm registry directly** (`registry.npmjs.org/<pkg>/latest` and dist-tags), which is a more authoritative source than search results.

<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->

## Conventions

Conventions not yet established. Will populate as patterns emerge during development.
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->

## Architecture

Architecture not yet mapped. Follow existing patterns found in the codebase.
<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->

## Project Skills

No project skills found. Add skills to any of: `.claude/skills/`, `.agents/skills/`, `.cursor/skills/`, `.github/skills/`, or `.codex/skills/` with a `SKILL.md` index file.
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->

## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:

- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->

<!-- GSD:profile-start -->

## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
