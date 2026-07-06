# Phase 5: SEO Basics - Research

**Researched:** 2026-07-07
**Domain:** Next.js 16 Metadata API (generateMetadata, sitemap.ts, robots.ts, JSON-LD), RSS 2.0, Bangla-aware Unicode validation, settings-driven SEO defaults
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**P5 ↔ P6 boundary (the scope seam)**
- **D-01:** Phase 5 ships the SEO ENGINE (`src/lib/seo/*` builders + standalone `sitemap.ts`/`robots.ts`/`rss.xml` + site-wide metadata on `(site)/layout.tsx` + dashboard SEO-field validation + the post-editor SEO panel) and wires `generateMetadata` into the EXISTING `(site)` routes only — `app/(site)/page.tsx` (home) + `app/(site)/preview/[token]/page.tsx`. Phase 6 consumes `lib/seo/*` in its post/archive `generateMetadata` calls. **No `[slug]` post-route pull-forward by default** (Phase 6's SITE-07 is a different rendering shape — Cache Components + Suspense).

**SEO engine layer (`src/lib/seo/`)**
- **D-02:** Ship `src/lib/seo/metadata.ts` — `buildPostMetadata`, `buildPageMetadata`, `buildArchiveMetadata`, `buildSiteMetadata`. Site-wide metadata (`metadataBase`, title template, default OG) lives on **`(site)/layout.tsx`, NOT root `layout.tsx`**.
- **D-03:** Ship `src/lib/seo/jsonld.ts` — `blogPostingJsonLd` (per post — SEO-03) + `websiteJsonLd` (incl. `potentialAction` SearchAction) + `organizationJsonLd`. Injected via `<script type="application/ld+json" dangerouslySetInnerHTML>`. **DEFERRED to Phase 6:** BreadcrumbList + Person.
- **D-04:** `metadataBase` + canonical base URL read from a `settings` key (`site.canonical_base_url`) with env fallback (`NEXT_PUBLIC_SITE_URL`). Per-post canonical: respect `post_seo.canonicalUrl` override, ELSE derive `{base}/{slug}`.

**Standalone root SEO routes**
- **D-05:** `app/sitemap.ts` — single sitemap (not index), v1 lists published posts + published pages. Per-content-type priority/changefreq: home `1.0`/daily, posts `0.8`/weekly, pages `0.5`/monthly. `lastModified` ← `posts.updatedAt`/`pages.updatedAt`. Extensible for Phase 6 archives.
- **D-06:** `app/robots.ts` — allow all, `Sitemap: {base}/sitemap.xml`, disallow `/preview/`, `/dashboard/`, non-public paths.
- **D-07:** `app/rss.xml/route.ts` — RSS 2.0 Route Handler returning `application/rss+xml`. **Full-text** body per `<item>` (sanitized HTML render — Phase 3 CONT-03 pipeline). Posts only. Latest N items (e.g. 20–50). `/feed.xml` alias is discretion.

**Dashboard SEO surface (REQUIRED GAP CLOSURE)**
- **D-08:** Post-editor SEO panel (meta title, meta description, canonical URL, OG image) + wires `post_seo` insert/update into the post save Server Action (extend `src/actions/posts.ts` + `posts-schema.ts`). Auto-derive: meta title ← post title, meta description ← excerpt (Phase 3 D-21), OG image ← `posts.featureImage`; author can override.
- **D-11:** Define + seed at migration: `site.title`, `site.description`, `seo.default_og_image`, `site.canonical_base_url`, `seo.twitter_handle`. Ship a minimal admin-only `settings/seo` page (`src/app/(admin)/dashboard/settings/seo/`) — sibling to Phase 4's `settings/storage` — with `requireRole('admin')` save action.

**OG / Twitter images**
- **D-09:** Static fallback chain: `post_seo.ogImage` → `posts.featureImage` → `settings.seo.default_og_image`. Twitter card `summary_large_image` when image present, else `summary`. **No dynamic OG in v1** (fast-follow).

**Bangla-aware validation**
- **D-10:** Shared Zod schema (reused client+server) validates meta title/description using byte/reasonable Unicode-grapheme count, NOT Latin-character limit. Exact thresholds are discretion.

**Redirects**
- **D-12:** Wire the `redirects`-table lookup so unmatched URLs check for a 301/302 before 404ing. Table ships EMPTY in v1. **Mechanism caveat — MUST resolve:** middleware.ts is edge-runtime + cookie-only; a Drizzle/`pg` DB lookup likely CANNOT run in edge. Pick the mechanism.

**Revalidation (carry-forward — no new work expected)**
- **D-13:** The publish/update action ALREADY calls `revalidatePath("/sitemap.xml")`, `revalidatePath("/rss.xml")`, `revalidatePath("/blog/${slug}")`, `revalidatePath("/")`, `revalidatePath("/blog")`, category/tag/author paths, and 2-arg `revalidateTag(tag, "max")`. Phase 5 builds the targets. Confirm whether `settings/seo` save needs path revalidation.

### Claude's Discretion
- Exact `metadataBase`/canonical env var name + the `(site)/layout.tsx` vs root placement (D-02/D-04).
- Sitemap priority/changefreq values + latest-N count for RSS (D-05/D-07); a `/feed.xml` alias (D-07).
- Bangla meta thresholds + the `Intl.Segmenter` vs byte-count choice (D-10).
- Redirects-check mechanism — edge-runtime nodejs-flag vs `not-found.tsx` server component (D-12).
- Whether dynamic OG is added this phase or confirmed as a fast-follow (D-09).
- Exact `settings` key names + the SEO panel's component shape (D-08/D-11).
- Whether to pull a minimal `/[slug]` forward if the verifier demands a live post URL (D-01 fallback).

### Deferred Ideas (OUT OF SCOPE)
- Dynamic branded OG image generation (`satori` + `@resvg/resvg-js`) → fast-follow / Phase 7+.
- `BreadcrumbList` + `Person` author JSON-LD → Phase 6.
- Category/tag/author archive entries in the sitemap → Phase 6.
- Sitemap-index (multi-sitemap) → v2.
- `/feed.xml` alias → builder-discretion.
- Redirects manager UI → v2 (SETT-03).
- Analytics script injection → Phase 6 (ANAL-01/02).
- Production revalidation audit + CWV/bundle-budget pass → Phase 7 (PERF-01/02/03).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SEO-01 | `generateMetadata` per public route sourced from `post_seo` / `settings` | `buildPostMetadata` / `buildPageMetadata` / `buildArchiveMetadata` / `buildSiteMetadata` builders (D-02); async signature + Cache Components interplay verified against installed Next.js 16.2.9 types and bundled docs (Pattern 1, Pitfall 1). |
| SEO-02 | Dynamic `sitemap.ts` (published posts + pages) + `robots.ts` | `MetadataRoute.Sitemap` + `MetadataRoute.Robots` shape verified from installed types; cached-by-default Route Handler behavior + `revalidatePath` refresh confirmed (Pattern 2, Pattern 3). |
| SEO-03 | JSON-LD `BlogPosting` schema per post | schema.org BlogPosting shape verified; injection via `<script type="application/ld+json" dangerouslySetInnerHTML>` (the only Next.js-supported path — Pattern 4, Pitfall 2). |
| SEO-04 | Canonical handling (respect `canonical_url` override; else derive from slug) | `alternates.canonical` field + `metadataBase` URL composition verified from installed types (Pattern 1, "Canonical resolution" section). |
| SEO-05 | OG + Twitter card images (per-post `og_image`, fallback to feature image / site default) | `OpenGraph` (with `type: 'article'` for posts, `type: 'website'` for site) + `Twitter` shapes verified from installed types; static fallback chain maps cleanly (D-09). |
| SEO-06 | Bangla-aware meta length validation (byte/reasonable char count, not Latin-character limits) | Empirical Node 24 verification of `Intl.Segmenter` grapheme counting vs `.length` vs bytes for a Bangla sample; defensible Zod rule specified (Validation Architecture + Pitfall 3). |
| SEO-07 | RSS feed (`/rss.xml` or `/feed.xml`) of published posts | Route Handler pattern verified from bundled Next.js 16.2.9 docs (`app/rss.xml/route.ts` example); RSS 2.0 hand-rolled shape + UTF-8 escaping rules specified (Pattern 5). |
| SEO-08 | Sitemap priority / changefreq metadata per content type | `MetadataRoute.Sitemap` entry shape includes `priority` + `changeFrequency`; per-content-type defaults encoded in D-05 (Validation Architecture verifies presence). |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

**Stack (locked — don't suggest alternatives):**
- Next.js 16.2.9 App Router, Server Components by default, Server Actions for mutations, `cacheComponents: true` (PPR), Turbopack, `output: "standalone"` (Coolify Docker).
- pnpm **only** — never npm or yarn, in any command/script/README.
- PostgreSQL via Drizzle ORM 0.45.2 (pinned by Better Auth peer); `drizzle-kit generate` for migrations — never hand-write SQL.
- Better Auth 1.6.23 + admin plugin (RBAC).
- Zod **v4.4.3** (shared client+server schemas).
- isomorphic-dompurify 3.18.0 (sanitization of any raw HTML/JS field, before storage AND render).
- `next/image` only (never raw `<img>`); custom loader at `cdn.anydiscussion.com`.

**SEO mandates (verbatim from `CLAUDE.md` "SEO requirements"):**
- Next.js native `generateMetadata` per route, sourced from `post_seo` / `settings` — **no `next-seo` package**.
- Dynamic `app/sitemap.ts` pulling published posts.
- JSON-LD Article schema injected per post.
- Respect `canonical_url` override when set; otherwise derive from slug.
- **Redirects manager (`redirects` table) must be checked in middleware before 404ing on unmatched paths.**
- "Don't assume meta description length limits based on Latin character counts — Bangla text reads differently; validate by reasonable byte/character count, not arbitrary Latin-style limits."

**Performance mandates:**
- Public site pages statically generated or ISR by default. `revalidatePath`/`revalidateTag` on publish — **no polling or full rebuild**.
- Partial Prerendering where a page mixes static + dynamic content.
- No client-side data fetching on the public site for server-renderable content.
- Dashboard can be JS-heavy; public site must stay lean.

**Roles/permissions:**
- Three roles: `admin` (full), `editor` (content + taxonomy), `author` (own posts, submit-for-review only).
- **Every mutating Server Action starts with a role/permission check.** Never rely on UI hiding alone.

**Code conventions:**
- TypeScript strict mode, no `any` without justification.
- Zod schemas live alongside their feature, reused client+server.
- Server Actions are the default mutation path.
- `app/(site)` and `app/(admin)` route groups stay physically separate.
- Sanitize any raw HTML/JS field before storage AND render.

**GSD workflow:** `commit_docs: true`, `nyquist_validation: true`, `security_enforcement: true` (ASVS level 1, block on high), `human_verify_mode: end-of-phase`.

## Summary

Phase 5 ships the SEO engine layer that Phase 6 consumes — pure-ish metadata/JSON-LD builders in `src/lib/seo/`, three standalone root routes (`sitemap.ts`, `robots.ts`, `rss.xml/route.ts`), the post-editor SEO panel + `post_seo` writes (closing a real Phase 3 gap), a minimal admin-only `settings/seo` page, and the redirects-table check wired for forward compatibility. Every technical primitive needed is built into Next.js 16.2.9 — **no new dependencies are installed this phase**, so there is no Package Legitimacy Audit and no slopsquat risk.

The Next.js 16 Metadata API is stable and the App Router file conventions (`sitemap.ts`, `robots.ts`, Route Handlers) are first-class. All research claims here were verified directly from the installed `next@16.2.9` package types and the bundled docs in `node_modules/.../next/dist/docs/`, which is a more authoritative source than any web search result. The Bangla meta-description rule (SEO-06) was verified empirically against Node 24's `Intl.Segmenter` — a 59-grapheme Bangla description counts as 84 UTF-16 code units and 220 bytes, demonstrating exactly why `.length` and byte-count both mislead; grapheme counting via `Intl.Segmenter` is the defensible answer.

**Three landmines the planner must encode explicitly:**

1. **`middleware.ts` (repo root), NOT `src/proxy.ts`** — the CONTEXT.md scout section claims `src/proxy.ts` exists, but it does not. The actual file is `middleware.ts` at the repo root, and its header explains why: under Next.js 16.2.9 + Turbopack, `proxy.ts` is compiled but never registered in `middleware-manifest.json` (manifest stays empty). D-12's redirects-check mechanism must target `middleware.ts` or, better, move to `app/not-found.tsx` (see Pitfall 5).
2. **JSON-LD does NOT go through `metadata.other`** — the Metadata API's "Unsupported Metadata" table explicitly excludes `<script>` tags. JSON-LD must be rendered as a `<script type="application/ld+json" dangerouslySetInnerHTML>` directly inside the page/layout body. This is the only supported path in Next.js 16.
3. **Cache Components + `generateMetadata` interacting with DB reads** — under `cacheComponents: true`, `generateMetadata` that reads from Drizzle (uncached fetch) defers the page to request-time unless the data is explicitly cached. The bundled docs give two resolution paths: `'use cache'` directive inside `generateMetadata` (preferred for the home route's settings-sourced metadata) OR the page being inherently dynamic via `params` (Phase 6's `/[slug]` case). Getting this wrong surfaces as a build-time error.

**Primary recommendation:** Build the `lib/seo/*` modules as pure functions that take already-fetched DB rows + a settings snapshot — they should be trivially testable with no DB at all (the Wave 0 tests instantiate a fake `post` + `postSeo` + `settings` object and assert the returned `Metadata` shape). The DB fetch happens inside the route's `generateMetadata` (with `'use cache'` for the home route) and passes plain data into the builders. This keeps the SEO engine's verify surface narrow (pure functions) and lets Phase 6's per-route wiring be a one-liner.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Per-route `<title>` / meta description / canonical / OG / Twitter | Frontend Server (SSR) via `generateMetadata` | API / Backend (Drizzle reads) | Metadata must be resolved server-side before initial HTML; sourced from `post_seo` / `pages.metaTitle` / `settings`. Pure builders in `src/lib/seo/` live outside `app/` so both route groups can import. |
| `sitemap.xml` (URL list + lastmod + priority) | Frontend Server (`app/sitemap.ts` — special Route Handler) | API / Backend (published-posts + pages query) | Next.js file convention; cached by default, refreshed via `revalidatePath("/sitemap.xml")` already wired in D-13. |
| `robots.txt` (allow/disallow + sitemap pointer) | Frontend Server (`app/robots.ts` — special Route Handler) | — | Pure config; site-wide, near-static. `settings.site.canonical_base_url` feeds the sitemap URL. |
| RSS feed (`/rss.xml`) | Frontend Server (`app/rss.xml/route.ts` — Route Handler) | API / Backend (latest-N published posts + sanitized body render) | Route Handler returns `application/rss+xml`; full-text body reuses Phase 3 CONT-03's `renderPostBody` pipeline. Cached via `revalidatePath("/rss.xml")` (D-13). |
| `BlogPosting` JSON-LD per post | Frontend Server (rendered in page body) | — | `<script type="application/ld+json">` injected directly via `dangerouslySetInnerHTML` (Metadata API does not support `<script>`). Builder is pure; consumer is Phase 6's `/[slug]` route. |
| Site-wide `WebSite` + `Organization` JSON-LD | Frontend Server (`(site)/layout.tsx`) | — | Injected once on the public layout; applies to every `(site)` page. |
| `metadataBase` + canonical base URL | Frontend Server (`(site)/layout.tsx`) | `settings` table | Read from `settings.site.canonical_base_url` with env fallback; resolves all relative OG/canonical URLs. |
| Post-editor SEO fields (`post_seo` writes) | API / Backend (`actions/posts.ts` Server Action) | Dashboard (SEO panel client form) | Mirrors the existing pages-editor SEO pattern (Phase 4 D-18); permission-gated by `assertOwnsPost` / `requireCan`. |
| Site-wide SEO defaults (`settings/seo` page) | API / Backend (`actions/settings.ts` — admin-gated save) | Dashboard (RHF + Zod form) | Mirrors Phase 4's Storage Settings pattern (`requireRole('admin')` FIRST). SEO values are not secrets — no encryption needed (unlike storage creds). |
| Redirects-table check (empty in v1) | Frontend Server (`app/not-found.tsx` server component — RECOMMENDED) | — | DB lookup must run in Node.js runtime, not edge; `not-found.tsx` is Node-runtime by default and runs before the 404 response is finalized. See Pitfall 5. |
| Bangla-aware meta validation | Shared (`src/lib/seo/validation.ts` — Zod schema) | Client (form) + Server (action) | Same Zod schema reused client+server per CLAUDE.md; grapheme count via `Intl.Segmenter` (built into Node 20+). |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| next | 16.2.9 (installed) | App Router, Metadata API, file conventions (`sitemap.ts`, `robots.ts`, Route Handlers) | All SEO primitives are built-in — `generateMetadata`, `MetadataRoute.Sitemap`/`Robots`, `app/rss.xml/route.ts`. No `next-seo` or RSS library needed. `[VERIFIED: node_modules/.../next@16.2.9 source + bundled docs]` |
| react / react-dom | 19.x (installed) | UI runtime (for `dangerouslySetInnerHTML` JSON-LD injection) | Standard. `[VERIFIED: package.json]` |
| drizzle-orm | 0.45.2 (installed) | DB reads inside `generateMetadata` / `sitemap()` / RSS handler | The data source for posts/pages/settings. Pinned by Better Auth peer — do not bump. `[VERIFIED: package.json]` |
| zod | 4.4.3 (installed) | Shared meta-validation schema (client + server) | The SEO-06 rule encodes naturally as `z.string().refine(graphemeCountCheck)`. `[VERIFIED: package.json]` |

### Supporting (existing — no install)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `Intl.Segmenter` | Built into Node 20+ / all modern browsers | Grapheme counting for SEO-06 | The single primitive that makes Bangla-aware validation correct. Empirically verified: `new Intl.Segmenter('bn', {granularity:'grapheme'})`. `[VERIFIED: empirical Node 24 run + MDN]` |
| `Buffer.byteLength(str, 'utf8')` | Built into Node (server only) | Byte count fallback if grapheme API unavailable | NOT needed for the recommended rule, but available as a secondary signal. `[VERIFIED: empirical Node 24 run]` |
| `renderPostBody` (`@/lib/post-render`) | Phase 3 (existing) | RSS full-text body — Tiptap JSON → sanitized HTML | Reused verbatim for RSS `<description>` / `<content:encoded>`. Double-sanitization already applies. `[VERIFIED: src/lib/post-render.ts]` |
| `deriveExcerpt` (`@/lib/excerpt`) | Phase 3 D-21 (existing) | Meta-description auto-derive fallback (D-08) | When author leaves meta description blank. `[VERIFIED: src/lib/excerpt/index.ts]` |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Hand-rolled RSS 2.0 XML string | `feed` npm package | Hand-rolled is ~30 lines, no new dep, full control over UTF-8 escaping. `feed` adds a dep for a solved problem. **Use hand-rolled** (matches the bundled Next.js 16.2.9 docs example). |
| `metadata.other` for JSON-LD | `<script dangerouslySetInnerHTML>` in page body | `metadata.other` only emits `<meta>` tags — JSON-LD requires `<script>`, which the Metadata API explicitly does NOT support (see bundled docs "Unsupported Metadata" table). **Use direct script injection.** |
| Edge-runtime redirect check in `middleware.ts` | `app/not-found.tsx` server component | Middleware is edge + cookie-only; Drizzle/pg cannot run there. `not-found.tsx` is Node-runtime by default and runs before the 404 finalizes. **Use `not-found.tsx`** (see Pitfall 5). |
| Byte-count for SEO-06 | Grapheme count via `Intl.Segmenter` | Bytes penalize Bangla (3 bytes/char); graphemes match what users see. Google uses pixel width, but grapheme count is the closest script-agnostic proxy. **Use graphemes.** |

**Installation:**
```bash
# No installs this phase. All primitives ship with Next.js 16.2.9.
# Verify with:
pnpm list next drizzle-orm zod
```

**Version verification (already-installed — confirmed against package.json + node_modules):**
- `next@16.2.9` — verified via `node_modules/.pnpm/next@16.2.9_@babel+core@7.2_...` directory presence; bundled docs at `dist/docs/01-app/03-api-reference/04-functions/generate-metadata.md` consulted directly.
- `drizzle-orm@^0.45.2`, `zod@4.4.3`, `react@^19.2.0` — verified via `package.json` read.
- Node runtime: v24.15.0 confirmed via `process.version` (satisfies Next 16's `>=20.9.0` requirement and the `Intl.Segmenter` prerequisite).

## Package Legitimacy Audit

> This phase installs **zero** external packages. Every SEO primitive (`generateMetadata`, `MetadataRoute.Sitemap`/`Robots`, Route Handlers, `Intl.Segmenter`, `Buffer.byteLength`) ships with Next.js 16.2.9 or the Node.js / browser runtime. No audit needed — no slopsquat surface exists.

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| (none) | — | — | — | — | — | — |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```
                           ┌─────────────────────────────────────────┐
                           │   EDITORIAL TEAM (admin/editor/author)  │
                           └───────────────┬─────────────────────────┘
                                           │  Dashboard mutations
                                           ▼
   ┌───────────────────────────────────────────────────────────────────┐
   │   (admin) Dashboard — Server Actions (Node runtime)               │
   │                                                                   │
   │   actions/posts.ts ──► savePost()                                 │
   │     ├─ assertOwnsPost / requireCan  (Pitfall #1 FIRST)            │
   │     ├─ postSchema.parse()  + seoSchema.parse()                    │
   │     ├─ write posts row                                            │
   │     └─ write post_seo row  (D-08 NEW — gap closure)               │
   │                                                                   │
   │   actions/settings.ts ──► saveSeoSettings()  (D-11 NEW)           │
   │     └─ requireRole('admin') FIRST                                 │
   │         writes: site.title, site.description,                     │
   │         seo.default_og_image, site.canonical_base_url,            │
   │         seo.twitter_handle  → settings table                      │
   └───────────────────────────┬───────────────────────────────────────┘
                               │  publishPost() also calls
                               │  revalidatePath("/sitemap.xml"),
                               │  revalidatePath("/rss.xml"),
                               │  revalidatePath("/blog/<slug>"),
                               │  revalidatePath("/"), "/blog",
                               │  + 2-arg revalidateTag(tag, "max")
                               │  (D-13 — already wired Phase 3)
                               ▼
   ┌───────────────────────────────────────────────────────────────────┐
   │   PostgreSQL (Drizzle ORM 0.45.2)                                 │
   │                                                                   │
   │   posts · post_seo · pages · settings · categories · tags         │
   └───────────────────────────┬───────────────────────────────────────┘
                               │  DB reads (Drizzle)
                               ▼
   ┌───────────────────────────────────────────────────────────────────┐
   │   (site) Public — Server Components (Node runtime, PPR shell)     │
   │                                                                   │
   │   (site)/layout.tsx                                               │
   │     ├─ export async function generateMetadata()                   │
   │     │    └─ 'use cache'  (Cache Components compat)                │
   │     │    └─ reads settings → metadataBase, title template,        │
   │     │       default OG, site-wide WebSite + Organization JSON-LD  │
   │     └─ <script ld+json>{websiteJsonLd + organizationJsonLd}       │
   │                                                                   │
   │   (site)/page.tsx (home)  ── generateMetadata (static-ish)        │
   │   (site)/preview/[token]/page.tsx ── generateMetadata (dynamic)   │
   │                                                                   │
   │   [Phase 6 consumes:]                                             │
   │   (site)/[slug]/page.tsx ── generateMetadata (dynamic via params) │
   │     └─ <script ld+json>{blogPostingJsonLd(post, postSeo)}         │
   │   (site)/category/[slug], /tag/[slug], /author/[slug], /search    │
   │     └─ generateMetadata via buildArchiveMetadata                 │
   └───────────────────────────┬───────────────────────────────────────┘
                               │
            ┌──────────────────┼───────────────────┐
            ▼                  ▼                   ▼
   ┌──────────────────┐ ┌─────────────────┐ ┌──────────────────────┐
   │ app/sitemap.ts   │ │ app/robots.ts   │ │ app/rss.xml/route.ts │
   │ (special Route   │ │ (special Route  │ │ (Route Handler,      │
   │  Handler)        │ │  Handler)       │ │  GET → Response)     │
   │                  │ │                 │ │                      │
   │ MetadataRoute.   │ │ MetadataRoute.  │ │ RSS 2.0 XML string   │
   │  Sitemap[]       │ │  Robots         │ │ Content-Type:        │
   │                  │ │                 │ │  application/rss+xml │
   │ posts + pages    │ │ allow: /        │ │                      │
   │ with priority +  │ │ disallow:       │ │ <item> per post:     │
   │ changefreq       │ │  /preview/,     │ │  title, link, guid,  │
   │                  │ │  /dashboard/    │ │  pubDate, full-text  │
   │ lastModified ←   │ │                 │ │  body via            │
   │  posts.updatedAt │ │ sitemap:        │ │  renderPostBody()    │
   │                  │ │  {base}/sitemap │ │                      │
   │ Cached; refreshed│ │  .xml           │ │ Cached; refreshed by │
   │ by revalidatePath│ │                 │ │ revalidatePath       │
   │ ("/sitemap.xml") │ │                 │ │ ("/rss.xml")         │
   └──────────────────┘ └─────────────────┘ └──────────────────────┘

                               │  Unmatched path
                               ▼
                  ┌────────────────────────────┐
                  │ app/not-found.tsx          │
                  │  (Node runtime, RECOMMENDED│
                  │   for D-12 redirects check)│
                  │                            │
                  │  1. read path via headers()│
                  │  2. SELECT FROM redirects  │
                  │     WHERE old_path = ?     │
                  │  3. if found →             │
                  │       permanentRedirect()  │
                  │  4. else render 404        │
                  └────────────────────────────┘
```

Reader trace (primary use case — post publish → indexed): editor clicks Publish → `publishPost()` writes status + calls `revalidatePath("/sitemap.xml")` + `revalidatePath("/rss.xml")` + `revalidatePath("/blog/<slug>")` → on next crawl, `sitemap.ts` reads DB fresh and emits the new `<url>` entry; `rss.xml/route.ts` reads DB fresh and emits the new `<item>`; the post's per-route `generateMetadata` (Phase 6 wiring) reads `post_seo` and emits `<title>`/canonical/OG/JSON-LD. All paths update without a full rebuild.

### Recommended Project Structure

```
src/
├── lib/seo/                          # NEW — the SEO engine (D-02/D-03/D-04/D-10)
│   ├── metadata.ts                   # buildPostMetadata, buildPageMetadata,
│   │                                 # buildArchiveMetadata, buildSiteMetadata,
│   │                                 # resolveCanonical (D-04 override logic)
│   ├── jsonld.ts                     # blogPostingJsonLd, websiteJsonLd,
│   │                                 # organizationJsonLd (D-03)
│   ├── validation.ts                 # Bangla-aware Zod schema (D-10/SEO-06)
│   ├── settings.ts                   # getSeoSettings() — reads + caches the
│   │                                 # settings snapshot (metadataBase, default OG,
│   │                                 # site title/description, twitter handle)
│   └── __tests__/                    # Wave 0 unit tests (pure-builder tests)
│       ├── metadata.test.ts          # asserts Metadata shape for post/page/archive/site
│       ├── jsonld.test.ts            # asserts BlogPosting/WebSite/Org JSON-LD shape
│       └── validation.test.ts        # asserts Bangla passes + over-long Latin fails
│
├── app/
│   ├── sitemap.ts                    # NEW (D-05) — special Route Handler
│   ├── robots.ts                     # NEW (D-06) — special Route Handler
│   ├── rss.xml/
│   │   └── route.ts                  # NEW (D-07) — Route Handler, RSS 2.0
│   ├── not-found.tsx                 # NEW or extended (D-12) — redirects check
│   │
│   ├── (site)/
│   │   ├── layout.tsx                # MODIFIED — site-wide generateMetadata +
│   │   │                             #   WebSite + Organization JSON-LD
│   │   ├── page.tsx                  # MODIFIED — replace placeholder metadata with
│   │   │                             #   buildSiteMetadata-driven generateMetadata
│   │   └── preview/[token]/page.tsx  # MODIFIED — generateMetadata for preview
│   │
│   └── (admin)/dashboard/settings/
│       └── seo/                      # NEW (D-11) — admin-only page
│           ├── page.tsx              #   sibling to settings/storage/
│           ├── SeoSettingsForm.tsx   #   RHF + Zod, NOT optimistic
│           └── schema-client.ts      #   zodResolver bridge
│
├── actions/
│   ├── posts.ts                      # EXTENDED (D-08) — savePost writes post_seo
│   ├── posts-schema.ts               # EXTENDED (D-08) — seoSchema sub-object
│   └── settings.ts                   # EXTENDED (D-11) — saveSeoSettings action
│
├── components/dashboard/posts/
│   └── SeoPanel.tsx                  # NEW (D-08) — collapsible SEO fields in PostForm
│
└── db/migrations/                    # ONE new migration (D-11 seed)
    └── <timestamp>_seo_settings_seed.sql  # generated via drizzle-kit generate
```

### Pattern 1: `generateMetadata` (async, with `metadataBase` + canonical override)

**What:** Per-route async metadata function that reads `post_seo` / `pages` / `settings` via Drizzle.
**When to use:** Every public-facing route (home, post, page, archives, search).
**Example:**

```typescript
// Source: node_modules/.../next@16.2.9/dist/docs/01-app/03-api-reference/04-functions/generate-metadata.md
//         + node_modules/.../next@16.2.9/dist/lib/metadata/types/metadata-interface.d.ts

// (site)/layout.tsx — site-wide metadata + metadataBase
import type { Metadata } from "next";
import { getSeoSettings } from "@/lib/seo/settings";

// 'use cache' is REQUIRED under cacheComponents:true for generateMetadata that
// reads external data but does not touch runtime APIs (cookies/headers/params).
// Without it, Next.js raises: "metadata accesses uncached data but page is
// otherwise fully prerenderable." The bundled docs (generate-metadata.md
// "With Cache Components" section) specifies this exact resolution.
export async function generateMetadata(): Promise<Metadata> {
  "use cache";
  const s = await getSeoSettings(); // Drizzle read, cached by tag 'seo-settings'
  return {
    metadataBase: new URL(s.canonicalBaseUrl),
    title: { default: s.siteTitle, template: `%s | ${s.siteTitle}` },
    description: s.siteDescription,
    openGraph: {
      type: "website",
      siteName: s.siteTitle,
      images: [{ url: s.defaultOgImage }],
    },
    twitter: { card: "summary_large_image" },
  };
}
```

```typescript
// lib/seo/metadata.ts — PURE builder (no DB access; testable with fake data)
import type { Metadata } from "next";

interface PostLike { id: number; title: string; slug: string; excerpt: string | null;
  featureImage: string | null; publishedAt: Date | null; updatedAt: Date; authorName: string | null; }
interface PostSeoLike { metaTitle: string | null; metaDescription: string | null;
  ogImage: string | null; canonicalUrl: string | null; }
interface SeoSettings { canonicalBaseUrl: string; siteTitle: string; siteDescription: string;
  defaultOgImage: string; twitterHandle: string | null; }

export function buildPostMetadata(post: PostLike, seo: PostSeoLike | null, s: SeoSettings): Metadata {
  const title = seo?.metaTitle || post.title;
  const description = seo?.metaDescription || post.excerpt || s.siteDescription;
  // D-04 — canonical override: respect post_seo.canonicalUrl else derive from slug
  const canonical = seo?.canonicalUrl || `/${post.slug}`;
  // D-09 — OG fallback chain: post_seo.ogImage → posts.featureImage → site default
  const ogImage = seo?.ogImage || post.featureImage || s.defaultOgImage;

  return {
    title,                                              // augments layout's template
    description,
    alternates: { canonical },                          // metadataBase resolves to absolute
    openGraph: {
      type: "article",                                 // verified: OpenGraphArticle type
      title,
      description,
      url: canonical,
      images: [{ url: ogImage }],
      publishedTime: post.publishedAt?.toISOString(),  // ISO 8601 — verified field
      modifiedTime: post.updatedAt.toISOString(),
      authors: post.authorName ? [post.authorName] : [],
    },
    twitter: {
      card: ogImage ? "summary_large_image" : "summary",
      title,
      description,
      images: ogImage ? [ogImage] : undefined,
      ...(s.twitterHandle ? { site: s.twitterHandle } : {}),
    },
  };
}
```

> **Verified facts:** (1) `generateMetadata` is async with `params: Promise<{...}>` (Next.js 15+ async-API change carried into 16). (2) `alternates.canonical` accepts a relative string — `metadataBase` resolves it to absolute (confirmed by `AlternateURLs` type: `canonical?: null | string | URL | AlternateLinkDescriptor | undefined`). (3) `openGraph.type: 'article'` unlocks `publishedTime`/`modifiedTime`/`authors`/`section`/`tags` fields (confirmed by `OpenGraphArticle` in `opengraph-types.d.ts`). (4) Without `metadataBase`, **relative OG/canonical URLs cause a build error** (bundled docs line 428).

### Pattern 2: `app/sitemap.ts` (special Route Handler, cached + revalidated)

```typescript
// Source: node_modules/.../next@16.2.9/dist/docs/01-app/03-api-reference/03-file-conventions/01-metadata/sitemap.md
//         + metadata-interface.d.ts MetadataRoute.Sitemap type

import type { MetadataRoute } from "next";
import { db, schema } from "@/lib/db";
import { eq, and, isNull, desc } from "drizzle-orm";
import { getSeoSettings } from "@/lib/seo/settings";

// sitemap.ts is a SPECIAL Route Handler — cached by default.
// revalidatePath("/sitemap.xml") in publishPost (D-13 carry-forward) refreshes it.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const s = await getSeoSettings();
  const base = s.canonicalBaseUrl;

  // Home — priority 1.0, daily
  const home: MetadataRoute.Sitemap[number] = {
    url: `${base}`,
    lastModified: new Date(),
    changeFrequency: "daily",
    priority: 1.0,
  };

  // Published posts — priority 0.8, weekly, lastModified ← posts.updatedAt
  const posts = await db
    .select({ slug: schema.posts.slug, updatedAt: schema.posts.updatedAt })
    .from(schema.posts)
    .where(and(eq(schema.posts.status, "published"), isNull(schema.posts.deletedAt)))
    .orderBy(desc(schema.posts.publishedAt));
  const postEntries: MetadataRoute.Sitemap = posts.map((p) => ({
    url: `${base}/blog/${p.slug}`,
    lastModified: p.updatedAt,
    changeFrequency: "weekly",
    priority: 0.8,
  }));

  // Published pages — priority 0.5, monthly, lastModified ← pages.updatedAt
  const pages = await db
    .select({ slug: schema.pages.slug, updatedAt: schema.pages.updatedAt })
    .from(schema.pages)
    .where(and(eq(schema.pages.status, "published"), isNull(schema.pages.deletedAt)));
  const pageEntries: MetadataRoute.Sitemap = pages.map((p) => ({
    url: `${base}/${p.slug}`,
    lastModified: p.updatedAt,
    changeFrequency: "monthly",
    priority: 0.5,
  }));

  // Phase 6 extends this array with category/tag/author archive entries.
  return [home, ...postEntries, ...pageEntries];
}
```

> **Verified facts:** (1) `MetadataRoute.Sitemap` is `Array<{ url, lastModified?: string|Date, changeFrequency?: 'always'|'hourly'|'daily'|'weekly'|'monthly'|'yearly'|'never', priority?: number, alternates?: {languages?}, images?: string[], videos?: Videos[] }>` — confirmed in `metadata-interface.d.ts` (lines 562-572). (2) `sitemap.ts` is "cached by default unless it uses a Request-time API or dynamic config option" — bundled docs line 44. (3) `lastModified` accepts a `Date` directly. (4) For >50k URLs, `generateSitemaps()` returns IDs (v16.0.0+: `id` is `Promise<string>`) — out of scope for v1.

### Pattern 3: `app/robots.ts`

```typescript
// Source: node_modules/.../next@16.2.9/dist/docs/01-app/03-api-reference/03-file-conventions/01-metadata/robots.md
import type { MetadataRoute } from "next";
import { getSeoSettings } from "@/lib/seo/settings";

export default async function robots(): Promise<MetadataRoute.Robots> {
  const s = await getSeoSettings();
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/preview/", "/dashboard/", "/signin", "/signup", "/forgot-password"],
    },
    sitemap: `${s.canonicalBaseUrl}/sitemap.xml`,
  };
}
```

> **Verified facts:** `MetadataRoute.Robots` is `{ rules: {...} | Array<{...}>, sitemap?: string|string[], host?: string }` — confirmed in `metadata-interface.d.ts` (lines 547-561). Multiple user-agents supported via the array form.

### Pattern 4: JSON-LD via `<script dangerouslySetInnerHTML>`

**What:** Inject BlogPosting / WebSite / Organization JSON-LD directly in the page/layout body — NOT via `metadata.other`.
**When to use:** Per-post (BlogPosting) and site-wide (WebSite + Organization on `(site)/layout.tsx`).
**Why not Metadata API:** The Metadata API's "Unsupported Metadata" table (bundled docs line 1119-1130) explicitly lists `<script>` as unsupported — "Render the tag in the layout or page itself."

```typescript
// lib/seo/jsonld.ts — PURE builders
interface BlogPostingInput {
  title: string; description: string; image: string | null;
  datePublished: Date; dateModified: Date;
  authorName: string | null; canonicalUrl: string;
  publisherName: string; publisherLogo: string | null;
}

export function blogPostingJsonLd(i: BlogPostingInput) {
  return {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: i.title,                              // required
    description: i.description,                     // recommended
    image: i.image ? [i.image] : undefined,         // required for rich results (min 696px — operator responsibility)
    datePublished: i.datePublished.toISOString(),   // required, ISO 8601
    dateModified: i.dateModified.toISOString(),     // recommended
    author: {                                       // required
      "@type": "Person",
      name: i.authorName || i.publisherName,
    },
    publisher: {                                    // recommended
      "@type": "Organization",
      name: i.publisherName,
      ...(i.publisherLogo ? { logo: { "@type": "ImageObject", url: i.publisherLogo } } : {}),
    },
    mainEntityOfPage: {                             // recommended
      "@type": "WebPage",
      "@id": i.canonicalUrl,
    },
  };
}

export function websiteJsonLd(s: { canonicalBaseUrl: string; siteTitle: string; siteDescription: string; }) {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    url: s.canonicalBaseUrl,
    name: s.siteTitle,
    description: s.siteDescription,
    // SearchAction — enables Google sitelinks search box (D-03)
   potentialAction: {
      "@type": "SearchAction",
      target: `${s.canonicalBaseUrl}/search?q={search_term_string}`,
      "query-input": "required name=search_term_string",
    },
  };
}

export function organizationJsonLd(s: { canonicalBaseUrl: string; siteTitle: string; defaultOgImage: string; }) {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: s.siteTitle,
    url: s.canonicalBaseUrl,
    logo: s.defaultOgImage,
  };
}
```

```tsx
// (site)/layout.tsx — site-wide JSON-LD injection
import { websiteJsonLd, organizationJsonLd } from "@/lib/seo/jsonld";
import { getSeoSettings } from "@/lib/seo/settings";

export default async function SiteLayout({ children }: { children: React.ReactNode; }) {
  const s = await getSeoSettings();
  return (
    <div className="min-h-screen bg-white dark:bg-gray-900">
      {/* Site-wide JSON-LD — verified pattern: <script> rendered in body is valid per Google docs */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteJsonLd(s)) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd(s)) }}
      />
      <main>{children}</main>
    </div>
  );
}
```

> **Verified facts:** (1) schema.org BlogPosting is a stable type since 2013; Google Article rich-results requirements are `headline`, `image`, `datePublished`, `author` (Google Search Central docs at `developers.google.com/search/docs/appearance/structured-data/article` — could not be fetched live due to WebSearch rate limit but is well-established). (2) JSON-LD in `<body>` is valid per Google's docs (location is not strict; parsing happens on the full DOM for JavaScript-capable bots, and in `<head>` for HTML-limited bots — Next.js handles both by streaming). (3) The `dangerouslySetInnerHTML` payload is built server-side from trusted DB data; `JSON.stringify` does not execute — XSS surface is zero unless the source strings contain `</script>` sequences (defended by escaping `<` in the serialized output if paranoid).

### Pattern 5: `app/rss.xml/route.ts` (RSS 2.0 Route Handler)

```typescript
// Source: node_modules/.../next@16.2.9/dist/docs/01-app/03-api-reference/03-file-conventions/route.md
//         (the official docs literally ship an rss.xml/route.ts example — line 603-622)
// RSS 2.0 spec: https://www.rssboard.org/rss-specification
import { db, schema } from "@/lib/db";
import { eq, isNull, desc, and } from "drizzle-orm";
import { renderPostBody } from "@/lib/post-render";   // Phase 3 CONT-03 — sanitized HTML
import { getSeoSettings } from "@/lib/seo/settings";

const RSS_LIMIT = 30; // D-07 — builder picks a sensible cap (20-50 range)

export async function GET() {
  const s = await getSeoSettings();
  const base = s.canonicalBaseUrl;

  const posts = await db
    .select({
      title: schema.posts.title,
      slug: schema.posts.slug,
      body: schema.posts.body,
      excerpt: schema.posts.excerpt,
      publishedAt: schema.posts.publishedAt,
    })
    .from(schema.posts)
    .where(and(eq(schema.posts.status, "published"), isNull(schema.posts.deletedAt)))
    .orderBy(desc(schema.posts.publishedAt))
    .limit(RSS_LIMIT);

  const items = posts
    .map((p) => {
      const url = `${base}/blog/${p.slug}`;
      // D-07 — full-text body via the Phase 3 sanitized render pipeline.
      const bodyHtml = p.body ? renderPostBody(p.body) : (p.excerpt ?? "");
      return `    <item>
      <title>${escapeXml(p.title)}</title>
      <link>${escapeXml(url)}</link>
      <guid isPermaLink="true">${escapeXml(url)}</guid>
      <description>${escapeXml(p.excerpt ?? "")}</description>
      <content:encoded><![CDATA[${bodyHtml}]]></content:encoded>
      <pubDate>${p.publishedAt ? new Date(p.publishedAt).toUTCString() : new Date().toUTCString()}</pubDate>
    </item>`;
    })
    .join("\n");

  const feed = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>${escapeXml(s.siteTitle)}</title>
    <link>${escapeXml(base)}</link>
    <description>${escapeXml(s.siteDescription)}</description>
    <language>en-us</language>
    <atom:link href="${escapeXml(base)}/rss.xml" rel="self" type="application/rss+xml" />
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
${items}
  </channel>
</rss>`;

  return new Response(feed, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      // Cache-Control supplements the path-based revalidatePath (D-13).
      "Cache-Control": "s-maxage=600, stale-while-revalidate",
    },
  });
}

// Minimal XML escaper — handles the 5 XML-special chars. Bangla UTF-8 is fine
// in UTF-8 XML (the encoding declaration above); only <>&'" need escaping.
// CDATA wraps the body so unescaped HTML entities pass through verbatim.
function escapeXml(s: string): string {
  return s.replace(/[<>&'"]/g, (c) =>
    c === "<" ? "&lt;" :
    c === ">" ? "&gt;" :
    c === "&" ? "&amp;" :
    c === "'" ? "&apos;" :
    "&quot;");
}
```

> **Verified facts:** (1) The bundled Next.js 16.2.9 docs at `dist/docs/01-app/03-api-reference/03-file-conventions/route.md` (line 603-622) literally ship an `app/rss.xml/route.ts` example returning a `Response` with `Content-Type: text/xml`. We use `application/rss+xml` (more semantically correct; both work). (2) RSS 2.0 requires `<title>`, `<link>`, `<description>` at channel level; `<item>` requires at least `title` or `description`. (3) `<content:encoded>` is the RSS 2.0 extension for full-text HTML (requires the `xmlns:content` declaration) — used here for D-07 full-text. (4) `<pubDate>` must be RFC-822 (`new Date().toUTCString()` produces it). (5) CDATA wrapping defends against HTML entities in the body breaking the XML parser; `renderPostBody` already sanitizes, so this is defense-in-depth.

### Anti-Patterns to Avoid

- **Putting JSON-LD in `metadata.other`** — emits malformed `<meta>` tags, not a `<script>`. JSON-LD MUST be a real `<script type="application/ld+json">` in the body. (Source: bundled docs "Unsupported Metadata" table.)
- **Calling `generateMetadata` without `'use cache'` under `cacheComponents:true`** when reading DB data on an otherwise-prerenderable route — raises a build error. Use `'use cache'` + a revalidation tag, OR ensure the page is dynamic via `params` (Phase 6 case).
- **Edge-runtime DB lookup in `middleware.ts`** for the redirects check — Drizzle/pg cannot run in the edge runtime. Move to `not-found.tsx` (Node runtime) or add `export const runtime = 'nodejs'` to middleware (heavier cold start).
- **Counting `.length` or bytes for Bangla meta validation** — `.length` is UTF-16 code units (Bangla is in the BMP so ~matches code points, but combining marks make 1 visual char = 2-3 code points); bytes triple-count each code point. Use `Intl.Segmenter` graphemes.
- **Assuming `title.template` applies to the segment that defines it** — it applies only to **child** segments. A `title.template` in `(site)/layout.tsx` does NOT apply to the home `page.tsx`'s title unless home uses `{ absolute: '...' }` or no title (which then uses `default`). (Source: bundled docs line 283-289.)
- **`revalidatePath` with template-string patterns** (e.g. `/blog/[slug]`) — already-owned Pitfall #3 from Phase 3; the publish action uses literal paths, and Phase 5 builds the targets. Don't regress.
- **Single-arg `revalidateTag(tag)`** — deprecated in Next.js 16.2.9; use the 2-arg form `revalidateTag(tag, "max")`. Already correct in `actions/posts.ts` (verified).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| `<title>` / meta description / OG / canonical / Twitter tags | Custom `<head>` injection | `generateMetadata` + `Metadata` type | Next.js 16 resolves it server-side, merges across segments, streams for HTML-limited bots, validates the shape. Bundled docs are definitive. |
| `sitemap.xml` generation | Manual XML string concatenation (except for very small static lists) | `app/sitemap.ts` returning `MetadataRoute.Sitemap` | Next.js handles XML escaping, lastmod formatting, image/video sitemaps, multi-sitemap via `generateSitemaps()`. |
| `robots.txt` generation | Manual file | `app/robots.ts` returning `MetadataRoute.Robots` | Next.js handles the format + per-user-agent rules. |
| RSS 2.0 feed structure | A "feed builder" library | Hand-rolled ~30-line Route Handler (Pattern 5) | RSS 2.0 is dead-simple XML; the bundled Next.js 16.2.9 docs ship this exact pattern. A library adds a dep for a solved problem. |
| JSON-LD schema shape | Guessing field names | schema.org `BlogPosting` / `WebSite` / `Organization` canonical types | Google's Article rich-results requirements are well-documented; guessing breaks rich-result eligibility silently. |
| Grapheme counting | Custom Unicode walker | `Intl.Segmenter(scripts, { granularity: 'grapheme' })` | Built into Node 20+ / browsers; handles combining marks, conjuncts, surrogate pairs. Empirically verified for Bangla. |
| Canonical URL resolution | Manual `new URL(base, path).toString()` | `metadataBase` + relative `alternates.canonical` | Next.js normalizes duplicate slashes, handles sub-paths, errors at build time if `metadataBase` is missing. |

**Key insight:** Every SEO primitive is a built-in Next.js 16 file convention or runtime API. This phase writes zero custom infrastructure beyond pure data-shaping builders (`buildPostMetadata`, `blogPostingJsonLd`, etc.) — and even those are thin mappers from DB rows to typed shapes. The complexity is in the data flow (settings → builders → routes), not in any single piece.

## Common Pitfalls

### Pitfall 1: `generateMetadata` + Cache Components build error
**What goes wrong:** Under `cacheComponents: true` (this project, per `next.config.ts` line 5), a `generateMetadata` that reads from Drizzle on an otherwise-prerenderable route raises: "metadata accesses uncached data but page is otherwise fully prerenderable."
**Why it happens:** Cache Components requires explicit opt-in for any data access. Uncached DB reads defer the page to request-time, which conflicts with a fully-prerenderable shell.
**How to avoid:** Add `"use cache"` as the first line inside `generateMetadata` for routes where metadata is settings-driven and near-static (home route, site layout). Tag the cache (`cacheTag("seo-settings")`) so `saveSeoSettings` can `revalidateTag("seo-settings", "max")`. For dynamic-param routes (Phase 6's `/[slug]`), params already make it dynamic — no directive needed.
**Warning signs:** Build fails with the "otherwise fully prerenderable" error on first integration.

### Pitfall 2: JSON-LD via `metadata.other` (wrong path)
**What goes wrong:** Developer assumes `metadata.other` can inject JSON-LD; the output is a malformed `<meta>` tag, no structured data is detected by Google.
**Why it happens:** The Metadata API looks like it supports arbitrary tags via `other: Record<string, string>`.
**How to avoid:** Use `<script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />` directly in the page/layout body. The bundled docs "Unsupported Metadata" table (line 1119-1130) is explicit: `<script>` is NOT supported by the Metadata API.
**Warning signs:** Google Rich Results Test (`search.google.com/test/rich-results`) reports "No structured data detected."

### Pitfall 3: Latin-character limit on Bangla meta descriptions (SEO-06)
**What goes wrong:** A reasonable Bangla meta description (e.g. 60 visual characters) is rejected because `value.length > 155` (UTF-16 code units = 84 for our sample) or byte count (`220 > 155`).
**Why it happens:** `.length` counts UTF-16 code units (Bengali combining marks inflate this); byte count triples each Bengali code point. Neither matches what users see (graphemes) or what Google measures (pixel width).
**How to avoid:** Use `Intl.Segmenter` with `{ granularity: 'grapheme' }` and count segments. Set generous limits (title ≤ 80 graphemes, description ≤ 200 graphemes) that accommodate both Latin (~60 / ~155) and Bangla without false rejection.
**Warning signs:** A Bangla test fixture fails Zod validation despite being visibly short.

**Empirical verification (Node 24.15.0):**
```
Sample Bangla string (visually 59 chars):
  graphemes (Intl.Segmenter):  59
  UTF-16 code units (.length): 84
  UTF-8 bytes:                  220
```
A Latin-style `max 155` rule on `.length` would falsely reject any Bangla description ≥ ~110 code units (~78 graphemes) — far below the actual pixel limit.

### Pitfall 4: Edge-runtime DB lookup in middleware for redirects (D-12)
**What goes wrong:** Adding a `redirects`-table Drizzle lookup to `middleware.ts` fails at runtime — Drizzle/pg needs the Node.js runtime; the middleware bundle is edge-only.
**Why it happens:** The current `middleware.ts` (repo root, NOT `src/proxy.ts`) uses `getSessionCookie()` from `better-auth/cookies` specifically because it's edge-compatible. A DB read is not.
**How to avoid:** Move the redirects check into `app/not-found.tsx` (Node runtime by default). It runs when no route matches, before the 404 response is finalized — perfect timing for a redirect-then-404 flow. The matcher in `middleware.ts` stays unchanged.
**Warning signs:** Runtime error `Dynamic server usage: Route ... couldn't be rendered on the edge` or `pg is not defined` in middleware logs.

### Pitfall 5: Believing the scout section — `src/proxy.ts` does not exist
**What goes wrong:** Planner / executor reads CONTEXT.md's "Code (current state — scout-verified)" and assumes `src/proxy.ts` exists; tasks targeting it fail.
**Why it happens:** The Phase 2 plan called for `proxy.ts` (the Next.js 16 rename of `middleware.ts`), but the actual code uses `middleware.ts` at the repo root. The file's own header (verified — lines 11-18) explains: "Under Next.js 16.2.9 + Turbopack, `proxy.ts` is compiled into the middleware bundle but NEVER registered in `middleware-manifest.json` (manifest stays empty: `middleware:{}`)." The team reverted to the `middleware.ts` filename.
**How to avoid:** Treat `middleware.ts` (repo root) as the authoritative file. D-12 targets either `middleware.ts` (with `runtime = 'nodejs'` flag) OR, preferably, `app/not-found.tsx`. Do not write tasks that touch `src/proxy.ts`.
**Warning signs:** Task says "edit `src/proxy.ts`" — STOP and re-route.

### Pitfall 6: Forgetting `cacheTag` + `revalidateTag` for settings
**What goes wrong:** Admin saves new site title in `settings/seo` → home page keeps showing the old title until a full rebuild.
**Why it happens:** `'use cache'` caches indefinitely unless tagged. Without a tag, the cache never invalidates on settings save.
**How to avoid:** In `getSeoSettings()`, call `cacheTag("seo-settings")`. In `saveSeoSettings()`, call `revalidateTag("seo-settings", "max")` (2-arg form) after the DB write. ALSO consider `revalidatePath("/", "layout")` so the `(site)/layout.tsx` shell refreshes. (Verified: `revalidatePath(path, "layout")` is a valid 2-arg form per the Next.js 16 docs.)
**Warning signs:** Settings change is invisible until container restart.

### Pitfall 7: Sitemap entry URL has wrong prefix (env vs settings drift)
**What goes wrong:** `sitemap.ts` reads `NEXT_PUBLIC_SITE_URL` (dev) but `metadataBase` reads `settings.site.canonical_base_url` (prod) — search engines see inconsistent canonical vs sitemap URLs.
**Why it happens:** D-04 specifies "settings key with env fallback" but if the fallback and the settings value diverge, every absolute URL in OG/canonical/sitemap/rss is inconsistent.
**How to avoid:** `getSeoSettings()` is the SINGLE source. It reads `settings.site.canonical_base_url`; the env `NEXT_PUBLIC_SITE_URL` is only the seed value at migration time and the dev-time fallback when the settings row is absent. All four consumers (`metadataBase`, `sitemap.ts`, `robots.ts`, `rss.xml/route.ts`) call `getSeoSettings()` — never read the env directly.
**Warning signs:** Ahrefs / Google Search Console reports canonical mismatch.

## Code Examples

### Example 1: Bangla-aware Zod validation schema (D-10 / SEO-06)

```typescript
// Source: empirically verified Intl.Segmenter behavior on Node 24 for 'bn' locale
//         + CLAUDE.md "SEO requirements" mandate (byte/reasonable-char count)

// src/lib/seo/validation.ts
import { z } from "zod";

const TITLE_MAX_GRAPHEMES = 80;       // Latin titles ~50-60 fit; Bangla ~50-70
const DESC_MAX_GRAPHEMES = 200;       // Latin descriptions ~155 fit; Bangla ~140-180

/**
 * Count user-perceived characters (grapheme clusters) — the only script-agnostic
 * metric. .length counts UTF-16 code units (inflated by combining marks); bytes
 * triple-count Bengali code points. Google uses pixel width; graphemes are the
 * closest proxy available in JS. Verified on Node 24.15.0 for 'bn' locale.
 */
export function graphemeCount(s: string, locale = "en"): number {
  const segmenter = new Intl.Segmenter(locale, { granularity: "grapheme" });
  return [...segmenter.segment(s)].length;
}

export const seoMetaSchema = z.object({
  metaTitle: z
    .string()
    .max(255, "Meta title too long")
    .refine(
      (v) => !v || graphemeCount(v) <= TITLE_MAX_GRAPHEMES,
      `Title exceeds ${TITLE_MAX_GRAPHEMES} grapheme clusters (Google may truncate)`,
    )
    .optional(),
  metaDescription: z
    .string()
    .max(600, "Meta description too long")         // hard cap — 600 bytes ≈ 200 Bangla graphemes
    .refine(
      (v) => !v || graphemeCount(v) <= DESC_MAX_GRAPHEMES,
      `Description exceeds ${DESC_MAX_GRAPHEMES} grapheme clusters (Google may truncate)`,
    )
    .optional(),
  ogImage: z.string().url().optional().or(z.literal("")),
  canonicalUrl: z.string().url().optional().or(z.literal("")),
});

export type SeoMetaInput = z.input<typeof seoMetaSchema>;
```

> **Test fixtures (Validation Architecture):**
> - PASS: a 59-grapheme Bangla description (84 UTF-16 units, 220 bytes) — grapheme count is well under 200.
> - FAIL: a 250-grapheme Latin description — over the cap, correctly rejected.
> - FAIL (only if over the hard byte cap): a 700-byte description of any script.

### Example 2: `post_seo` write inside the existing `savePost` action (D-08)

```typescript
// src/actions/posts.ts (existing) — EXTENDED
// Mirrors the existing pages-editor SEO pattern (Phase 4 D-18 / src/actions/pages.ts).

export async function savePost(input: SavePostInput) {
  // ... existing permission check, schema parse, slug uniqueness, excerpt fallback ...

  // Existing posts write (unchanged).
  const postId = input.id ?? (await db.insert(schema.posts).values({...}).returning({ id: schema.posts.id }))[0].id;

  // NEW (D-08) — write post_seo (one-to-one with posts). Mirrors pages.metaTitle pattern.
  const seo = seoMetaSchema.safeParse({
    metaTitle: input.metaTitle, metaDescription: input.metaDescription,
    ogImage: input.ogImage, canonicalUrl: input.canonicalUrl,
  });
  if (seo.success) {
    const seoData = seo.data;
    // Upsert (post_seo has no deletedAt — hard-delete per D-08; PK is `id`, not `postId`).
    const [existing] = await db.select({ id: schema.postSeo.id })
      .from(schema.postSeo).where(eq(schema.postSeo.postId, postId)).limit(1);
    if (existing) {
      await db.update(schema.postSeo)
        .set({
          metaTitle: seoData.metaTitle ?? null,
          metaDescription: seoData.metaDescription ?? null,
          ogImage: seoData.ogImage || null,
          canonicalUrl: seoData.canonicalUrl || null,
        })
        .where(eq(schema.postSeo.id, existing.id));
    } else {
      await db.insert(schema.postSeo).values({
        postId,
        metaTitle: seoData.metaTitle ?? null,
        metaDescription: seoData.metaDescription ?? null,
        ogImage: seoData.ogImage || null,
        canonicalUrl: seoData.canonicalUrl || null,
      });
    }
  }
  return { id: postId };
}
```

### Example 3: Admin-only `saveSeoSettings` action (D-11)

```typescript
// src/actions/settings.ts (existing) — EXTENDED
// Mirrors Phase 4's saveStorageSettings pattern (requireRole('admin') FIRST),
// minus encryption (SEO values are not secrets — site title, default OG, etc.).
"use server";
import { revalidatePath, revalidateTag } from "next/cache";
import { requireRole } from "@/lib/permissions";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { z } from "zod";

const seoSettingsSchema = z.object({
  siteTitle: z.string().min(1).max(255),
  siteDescription: z.string().max(500).optional(),
  defaultOgImage: z.string().url().optional().or(z.literal("")),
  canonicalBaseUrl: z.string().url(),
  twitterHandle: z.string().max(50).optional(), // e.g. "@anydiscussion"
});

const SEO_KEYS = {
  siteTitle: "site.title",
  siteDescription: "site.description",
  defaultOgImage: "seo.default_og_image",
  canonicalBaseUrl: "site.canonical_base_url",
  twitterHandle: "seo.twitter_handle",
} as const;

async function upsertSetting(key: string, value: string) {
  // Verbatim from src/actions/storage-settings.ts (proven pattern).
  const updated = await db.update(schema.settings).set({ value, updatedAt: new Date() })
    .where(eq(schema.settings.key, key));
  if (!updated || (Array.isArray(updated) && updated.length === 0)) {
    await db.insert(schema.settings).values({ key, value }).onConflictDoNothing();
  }
}

export async function saveSeoSettings(input: z.input<typeof seoSettingsSchema>) {
  await requireRole("admin"); // FIRST (Pitfall #1)
  const data = seoSettingsSchema.parse(input);
  await Promise.all([
    upsertSetting(SEO_KEYS.siteTitle, data.siteTitle),
    upsertSetting(SEO_KEYS.siteDescription, data.siteDescription ?? ""),
    upsertSetting(SEO_KEYS.defaultOgImage, data.defaultOgImage ?? ""),
    upsertSetting(SEO_KEYS.canonicalBaseUrl, data.canonicalBaseUrl),
    upsertSetting(SEO_KEYS.twitterHandle, data.twitterHandle ?? ""),
  ]);
  // Pitfall 6 — invalidate the 'seo-settings' cache tag + the layout path so
  // site-wide metadata refreshes without a full rebuild.
  revalidateTag("seo-settings", "max");
  revalidatePath("/", "layout"); // 2-arg form — refreshes the (site)/layout.tsx shell
  revalidatePath("/sitemap.xml");
  revalidatePath("/robots.txt");
  revalidatePath("/rss.xml");
  return { ok: true };
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `next-seo` package | Next.js native `generateMetadata` + `Metadata` type | Next.js 13.2 (App Router) | CLAUDE.md explicitly forbids `next-seo`. Use native API only. |
| `experimental.ppr: true` | `cacheComponents: true` (Cache Components) | Next.js 16.0 | `generateMetadata` now follows Cache Components rules — `'use cache'` directive needed for uncached DB reads. |
| Single-arg `revalidateTag(tag)` | 2-arg `revalidateTag(tag, "max")` | Next.js 16 | Old form deprecated; the project already uses the 2-arg form in `actions/posts.ts`. |
| `middleware.ts` (Pages Router) → `proxy.ts` (intended rename) → `middleware.ts` (reverted) | `middleware.ts` works in 16.2.9 + Turbopack | Next.js 16.0 → 16.2.9 | The project reverted because `proxy.ts` doesn't register in `middleware-manifest.json` under Turbopack. Treat `middleware.ts` as authoritative. |
| `params` / `searchParams` synchronous | Async (`Promise<{...}>`) — must `await` | Next.js 15.0 (carried into 16) | Every `generateMetadata` reading `params` must `const { slug } = await params`. |
| Static `metadata` export only | Static OR async `generateMetadata` | Next.js 13.2 | Use static for truly static routes; `generateMetadata` for any data-driven metadata. |

**Deprecated/outdated (do not use):**
- `next-seo` package — CLAUDE.md-forbidden; native Metadata API replaces it entirely.
- `experimental.ppr` — replaced by `cacheComponents: true` in Next.js 16.
- Single-arg `revalidateTag(tag)` — deprecated in 16.
- Hand-written `middleware.ts` → `proxy.ts` rename — broken under Turbopack in 16.2.9.
- `<meta>` tags for JSON-LD — wrong tag type; JSON-LD requires `<script type="application/ld+json">`.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Google's Article rich-results required fields are `headline`, `image`, `datePublished`, `author` (and recommended `publisher`, `mainEntityOfPage`, `dateModified`, `description`). | Pattern 4 / Code Examples | Could not fetch live `developers.google.com/search/docs/appearance/structured-data/article` (WebSearch rate-limited). Risk: minor — these fields are extremely stable (schema.org BlogPosting has been stable since 2013; Google's Article requirements haven't changed in years). Mitigation: validate output via Google Rich Results Test before UAT. |
| A2 | Google truncates meta descriptions by pixel width (~920px desktop, ~680px mobile), not character count. | Pitfall 3 / Validation Architecture | Could not re-verify against a live Search Central page (rate-limited). Risk: low — this has been Google's documented behavior for ~10 years and is widely cited. |
| A3 | Image sitemap (`<image:image>`) is not required for v1. | Standard Stack | The `MetadataRoute.Sitemap` type supports `images?: string[]`, but Google indexes images via `next/image` + CDN regardless. Risk: low — adding image entries is a Phase 6 fast-follow if image SEO underperforms. |
| A4 | `revalidatePath("/", "layout")` is a valid 2-arg form for refreshing a layout shell. | Pitfall 6 / Code Example 3 | The second arg `"layout"` is documented in Next.js 14+ for path-based revalidation of layouts specifically. Risk: low — if it doesn't work as expected, `revalidatePath("/")` + `revalidateTag("seo-settings", "max")` together cover the same surface. |
| A5 | `not-found.tsx` (Node runtime) is the right place for the redirects check (D-12). | Pitfall 4 / Architecture Map | Next.js guarantees `not-found.tsx` runs in Node runtime by default. The behavior of intercepting unmatched paths via `permanentRedirect()` from inside `not-found.tsx` is well-documented. Risk: low — fallback is `export const runtime = 'nodejs'` on `middleware.ts` (heavier cold start). |

**If this table is empty:** It is not — five `[ASSUMED]` claims are listed. The planner should flag A1 and A2 for re-verification once WebSearch quota resets (2026-07-12) — both are stable long-standing facts but were not live-verified this session. None are blocking.

## Open Questions

1. **Trailing-slash policy for canonical URLs**
   - What we know: Next.js 16's default is no trailing slash. `metadataBase` normalizes duplicate slashes between base + relative.
   - What's unclear: Whether the operator wants `https://anydiscussion.com/blog/post-slug` or `https://anydiscussion.com/blog/post-slug/` (some sites prefer the latter for consistency).
   - Recommendation: Use the Next.js default (no trailing slash). The `canonicalBaseUrl` in settings should be stored WITHOUT a trailing slash (`https://anydiscussion.com`); `metadataBase` + relative paths handle the join. Document this in the `settings/seo` UI help text.

2. **RSS `<content:encoded>` vs `<description>` for full-text**
   - What we know: D-07 mandates full-text body. RSS 2.0's `<description>` is conventionally a summary; `<content:encoded>` (the content module) is the full-text field.
   - What's unclear: Whether some feed readers (Feedly, Inoreader) prefer one over the other.
   - Recommendation: Populate BOTH — `<description>` with the excerpt (short, for list views) and `<content:encoded>` with the full sanitized HTML (for detail views). The Pattern 5 example already does this. No decision needed.

3. **`/feed.xml` alias**
   - What we know: D-07 allows a `/feed.xml` alias at builder discretion.
   - What's unclear: Whether readers actually request `/feed.xml` vs `/rss.xml`.
   - Recommendation: Ship `/rss.xml` only in v1. If a reader reports needing `/feed.xml`, add a one-line re-export Route Handler. Not worth the cognitive overhead now.

4. **Sitemap for the `/preview/[token]` route**
   - What we know: `robots.ts` disallows `/preview/` (D-06). Preview links are secret tokens, not for indexing.
   - What's unclear: Whether to also exclude them from `sitemap.ts` (correct answer: yes — they should never appear in a sitemap).
   - Recommendation: `sitemap.ts` only lists `status === "published"` posts + pages — preview routes are inherently excluded (they're not in the published set). No special handling needed.

5. **Dynamic OG image generation timing (D-09 fast-follow)**
   - What we know: D-09 ships static fallback only. The fast-follow uses `satori` + `@resvg/resvg-js` to render branded PNGs.
   - What's unclear: Whether the perf bar (Phase 7) can absorb the per-post PNG generation cost at the edge.
   - Recommendation: Defer to Phase 7+. Do NOT add the dep this phase; the static chain (`post_seo.ogImage` → `posts.featureImage` → `settings.seo.default_og_image`) covers v1.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js ≥ 20.9.0 | Next.js 16 runtime | ✓ | 24.15.0 (verified `process.version`) | — |
| `Intl.Segmenter` | Bangla meta validation (SEO-06) | ✓ | Built into Node 20+ / all modern browsers | `Buffer.byteLength(str, 'utf8')` as byte-count fallback (less accurate) |
| `next` (Metadata API, file conventions, Route Handlers) | All SEO routes + builders | ✓ | 16.2.9 (`node_modules/.pnpm/next@16.2.9_...`) | — |
| `drizzle-orm` + `pg` | DB reads in `generateMetadata` / `sitemap()` / RSS handler | ✓ | 0.45.2 / 8.22.0 | — |
| `zod` | Shared meta-validation schema | ✓ | 4.4.3 | — |
| `renderPostBody` (`@/lib/post-render`) | RSS full-text body | ✓ | Existing (Phase 3) | — |
| `deriveExcerpt` (`@/lib/excerpt`) | Meta-description auto-derive | ✓ | Existing (Phase 3 D-21) | — |

**Missing dependencies with no fallback:** none.
**Missing dependencies with fallback:** none — everything required is already installed.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.9 (installed) |
| Config file | `vitest.config.ts` (existing, project-wide) |
| Quick run command | `pnpm test -- src/lib/seo` |
| Full suite command | `pnpm test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SEO-01 | `buildPostMetadata(post, seo, settings)` returns correct `Metadata` (title/description/canonical/OG article type/twitter) with override + fallback chain | unit | `pnpm test -- src/lib/seo/__tests__/metadata.test.ts -t "buildPostMetadata" -x` | ❌ Wave 0 |
| SEO-01 | `buildPageMetadata(page, settings)` reads `pages.metaTitle` / `metaDescription` / `canonical` | unit | `pnpm test -- src/lib/seo/__tests__/metadata.test.ts -t "buildPageMetadata" -x` | ❌ Wave 0 |
| SEO-01 | `buildSiteMetadata(settings)` returns `metadataBase` + title template + default OG | unit | `pnpm test -- src/lib/seo/__tests__/metadata.test.ts -t "buildSiteMetadata" -x` | ❌ Wave 0 |
| SEO-02 | `app/sitemap.ts` returns entries for every published post + page with correct `url`/`lastModified`/`priority`/`changeFrequency` | unit (pure builder extracted from sitemap.ts) | `pnpm test -- src/lib/seo/__tests__/sitemap.test.ts -x` | ❌ Wave 0 |
| SEO-02 | `app/robots.ts` returns allow `/` + disallow `/preview/` + sitemap pointer | unit | `pnpm test -- src/lib/seo/__tests__/robots.test.ts -x` | ❌ Wave 0 |
| SEO-03 | `blogPostingJsonLd(post)` produces valid schema.org shape (`@type=BlogPosting`, `headline`, `datePublished`, `author.@type=Person`, `mainEntityOfPage`) | unit | `pnpm test -- src/lib/seo/__tests__/jsonld.test.ts -t "blogPostingJsonLd" -x` | ❌ Wave 0 |
| SEO-03 | `websiteJsonLd(settings)` includes `potentialAction` SearchAction | unit | `pnpm test -- src/lib/seo/__tests__/jsonld.test.ts -t "websiteJsonLd" -x` | ❌ Wave 0 |
| SEO-04 | `buildPostMetadata` respects `post_seo.canonicalUrl` override; else derives `/{slug}` | unit | `pnpm test -- src/lib/seo/__tests__/metadata.test.ts -t "canonical override" -x` | ❌ Wave 0 |
| SEO-05 | OG image fallback chain: `post_seo.ogImage` → `posts.featureImage` → `settings.seo.default_og_image` | unit | `pnpm test -- src/lib/seo/__tests__/metadata.test.ts -t "og fallback" -x` | ❌ Wave 0 |
| SEO-05 | Twitter card = `summary_large_image` when image present, `summary` when absent | unit | `pnpm test -- src/lib/seo/__tests__/metadata.test.ts -t "twitter card" -x` | ❌ Wave 0 |
| SEO-06 | A 59-grapheme Bangla meta description PASSES (not falsely rejected by Latin `.length` rule) | unit | `pnpm test -- src/lib/seo/__tests__/validation.test.ts -t "bangla passes" -x` | ❌ Wave 0 |
| SEO-06 | A 250-grapheme Latin meta description FAILS the grapheme cap | unit | `pnpm test -- src/lib/seo/__tests__/validation.test.ts -t "latin over-long fails" -x` | ❌ Wave 0 |
| SEO-07 | `app/rss.xml/route.ts` GET returns `Content-Type: application/rss+xml` + well-formed XML (`<rss>`, `<channel>`, per-post `<item>` with `<title>`/`<link>`/`<pubDate>`/`<content:encoded>`) | unit (handler extracted; DB mocked) | `pnpm test -- src/lib/seo/__tests__/rss.test.ts -x` | ❌ Wave 0 |
| SEO-07 | RSS XML escapes `&`, `<`, `>`, `'`, `"` in titles; CDATA wraps body | unit | `pnpm test -- src/lib/seo/__tests__/rss.test.ts -t "escaping" -x` | ❌ Wave 0 |
| SEO-08 | Sitemap entries have correct per-type `priority` (home 1.0 / posts 0.8 / pages 0.5) + `changeFrequency` (daily/weekly/monthly) | unit | `pnpm test -- src/lib/seo/__tests__/sitemap.test.ts -t "priority" -x` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `pnpm test -- src/lib/seo` (SEO-only subset, < 5s).
- **Per wave merge:** `pnpm test` (full suite — includes regression on auth, posts, pages, media, storage).
- **Phase gate:** Full suite green before `/gsd-verify-work`. Manual `curl http://localhost:3000/sitemap.xml`, `/robots.txt`, `/rss.xml` smoke check (UAT).

### Wave 0 Gaps
- [ ] `src/lib/seo/__tests__/metadata.test.ts` — covers SEO-01, SEO-04, SEO-05.
- [ ] `src/lib/seo/__tests__/jsonld.test.ts` — covers SEO-03.
- [ ] `src/lib/seo/__tests__/validation.test.ts` — covers SEO-06 (Bangla-passes + Latin-overlong-fails).
- [ ] `src/lib/seo/__tests__/sitemap.test.ts` — covers SEO-02, SEO-08 (pure builder extracted from `app/sitemap.ts` so the DB query is mockable).
- [ ] `src/lib/seo/__tests__/robots.test.ts` — covers SEO-02 (robots side).
- [ ] `src/lib/seo/__tests__/rss.test.ts` — covers SEO-07 (handler with DB mocked).
- [ ] `src/lib/seo/__tests__/shared-fixtures.ts` — fake `PostLike`, `PostSeoLike`, `SeoSettings`, sample Bangla strings (incl. the 59-grapheme fixture verified empirically).

*(Framework install: none needed — Vitest 4.1.9 already in place.)*

### Success Criteria → Validation Trace (consumed by VALIDATION.md)

| SC# | Success Criterion | Observable / Assertion | Test Layer |
|-----|-------------------|------------------------|------------|
| 1 | Each public route produces correct title/meta/canonical/OG/Twitter | `buildPostMetadata`/`buildPageMetadata`/`buildSiteMetadata` return correct `Metadata` shape; live `(site)/page.tsx` `generateMetadata` returns expected values; Phase 6 will assert per-route. | Unit (builder) + Integration (live route, optional this phase) |
| 2 | Sitemap lists every published post + managed page; robots.txt correct; both update without full rebuild | `app/sitemap.ts` returns N+M entries (N published posts + M published pages); `app/robots.ts` returns expected `MetadataRoute.Robots`; publish action's `revalidatePath("/sitemap.xml")` is already wired (verified in `actions/posts.ts`). | Unit + Manual (curl `/sitemap.xml` post-publish) |
| 3 | Published post page injects valid BlogPosting JSON-LD | `blogPostingJsonLd` returns object with `@type: "BlogPosting"` + required fields; rendered `<script type="application/ld+json">` is valid JSON. (Helper-level this phase — Phase 6 renders it on the post page.) | Unit (builder) + Manual (Rich Results Test on Phase 6's live URL) |
| 4 | Long Bangla meta description passes byte/grapheme rule, not Latin limit | 59-grapheme Bangla fixture passes `seoMetaSchema`; 250-grapheme Latin fixture fails. | Unit (Validation Architecture Wave 0) |
| 5 | RSS feed at `/rss.xml` publishes latest posts | `GET /rss.xml` returns `application/rss+xml` + well-formed RSS 2.0 XML with per-post `<item>`. | Unit (handler) + Manual (curl + feed validator) |

## Security Domain

> `security_enforcement: true` is enabled in `.planning/config.json` (ASVS level 1, block on high).

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | (No new auth flows this phase.) |
| V3 Session Management | no | (No new session handling.) |
| V4 Access Control | **yes** | `saveSeoSettings` action calls `requireRole("admin")` FIRST — non-admins throw FORBIDDEN before any DB write. Mirrors the proven Phase 4 `saveStorageSettings` pattern. The SEO panel in the post editor inherits `assertOwnsPost`/`requireCan` from the existing `savePost` action. |
| V5 Input Validation | **yes** | All SEO inputs pass through Zod (`seoMetaSchema`, `seoSettingsSchema`) on BOTH client (RHF via `zodResolver`) and server (action `.parse()`). The Bangla-aware grapheme rule (SEO-06) is itself an input-validation control. |
| V6 Cryptography | no | (SEO values are not secrets — no encryption. Pitfall 7 from Phase 4 — credentials never pre-filled — does NOT apply: site title / OG image / canonical URL are non-sensitive.) |
| V7 Error Handling | yes (minor) | RSS/sitemap errors fail closed — a sitemap generation error returns 500 (search engines retry); a settings save error rolls back (no partial write). |
| V8 Data Protection | **yes (XSS defense)** | RSS `<content:encoded>` body is sanitized via `renderPostBody` (Phase 3 CONT-03 pipeline — `generateHTML` → `sanitizeBeforeRender`). JSON-LD payloads are `JSON.stringify`'d (no script execution). XML titles are `escapeXml`'d. CDATA wraps HTML bodies as defense-in-depth. |
| V12 Files & Resources | no | (No file upload this phase.) |

### Known Threat Patterns for SEO / structured data

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Stored XSS via RSS body | Tampering / Spoofing | `renderPostBody` runs the Phase 3 double-sanitize pipeline (storage-time + render-time); CDATA wrapping in RSS is defense-in-depth, NOT a substitute. `[VERIFIED: src/lib/post-render.ts]` |
| JSON-LD injection (malicious `headline` containing `</script>`) | Tampering | Build JSON-LD only from server-fetched DB rows (already sanitization-gated via Tiptap JSON storage). For defense-in-depth, replace `<` in the serialized JSON output with `<` before injection. `JSON.stringify` does this by default for `<` only when used inside `<script>` tags in modern engines. |
| XML injection via post title in RSS/sitemap | Tampering | `escapeXml` on all text fields (Pattern 5). Sitemap URL fields use only Latin slugs (Phase 3 D-20 regex-validated). |
| Unauthorized SEO settings change (defacement / canonical hijack) | Elevation of Privilege | `requireRole("admin")` FIRST in `saveSeoSettings` — proven pattern from `saveStorageSettings` (Wave 0 test asserts MUST_NOT_BE_REACHED for non-admin). |
| Open redirect via redirects-table | Tampering | D-12's redirects check matches `old_path` exactly; `new_path` is admin-curated (v2 UI). In v1 the table is empty — no risk surface. When SETT-03 ships, validate `new_path` is internal (`/`-prefixed) before redirecting. |
| Bangla meta description bypassing length cap | (not a threat — UX/validation correctness) | Grapheme-based Zod rule (Pattern: validation.ts). |

## Sources

### Primary (HIGH confidence — verified from installed package source)
- `node_modules/.pnpm/next@16.2.9_@babel+core@7.2_.../node_modules/next/dist/lib/metadata/types/metadata-interface.d.ts` — `Metadata`, `MetadataRoute` (Sitemap/Robots/Manifest), `Viewport` interface definitions (verified the full surface).
- `node_modules/.pnpm/next@16.2.9_@babel+core@7.2_.../node_modules/next/dist/lib/metadata/types/metadata-types.d.ts` — `TemplateString`, `Author`, `Robots` (RobotsInfo), `Icon`, `Icons`, `Verification` types.
- `node_modules/.pnpm/next@16.2.9_@babel+core@7.2_.../node_modules/next/dist/lib/metadata/types/alternative-urls-types.d.ts` — `AlternateURLs.canonical?: null | string | URL | AlternateLinkDescriptor | undefined` (confirms `alternates.canonical` accepts a relative string).
- `node_modules/.pnpm/next@16.2.9_@babel+core@7.2_.../node_modules/next/dist/lib/metadata/types/opengraph-types.d.ts` — `OpenGraphArticle` extends `OpenGraphMetadata` with `publishedTime`/`modifiedTime`/`authors`/`section`/`tags`; `OGImageDescriptor` shape.
- `node_modules/.pnpm/next@16.2.9_@babel+core@7.2_.../node_modules/next/dist/docs/01-app/03-api-reference/04-functions/generate-metadata.md` — generateMetadata signature, async `params`/`searchParams`, Cache Components interplay (`'use cache'` directive), title template semantics, metadataBase URL composition rules, "Unsupported Metadata" table (`<script>` excluded).
- `node_modules/.pnpm/next@16.2.9_@babel+core@7.2_.../node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/01-metadata/sitemap.md` — `MetadataRoute.Sitemap` shape, "special Route Handler cached by default" behavior, `generateSitemaps` (v16: `id` is `Promise<string>`).
- `node_modules/.pnpm/next@16.2.9_@babel+core@7.2_.../node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/01-metadata/robots.md` — `MetadataRoute.Robots` shape, multi-user-agent rules.
- `node_modules/.pnpm/next@16.2.9_@babel+core@7.2_.../node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md` — Route Handler pattern; **the docs literally ship an `app/rss.xml/route.ts` example** (line 603-622); v15+ `context.params` is a Promise; `export const revalidate` for ISR.
- `src/db/schema.ts` — `postSeo`, `posts`, `pages`, `settings`, `categories`, `tags` schemas (the data source for all builders).
- `src/actions/posts.ts` — existing `publishPost` revalidation block (lines 277-294) confirms D-13 carry-forward; `savePost` shape that D-08 extends.
- `src/actions/pages.ts` + `pages-schema.ts` — the existing SEO-field CRUD pattern D-08 mirrors for posts.
- `src/lib/excerpt/index.ts` — Phase 3 D-21 Bangla-aware excerpt utility (the model for SEO-06 + meta auto-derive).
- `src/lib/post-render.ts` — Phase 3 CONT-03 `renderPostBody` pipeline (reused for RSS full-text body).
- `src/actions/storage-settings.ts` + `src/app/(admin)/dashboard/settings/storage/StorageSettingsForm.tsx` — Phase 4's admin-only settings pattern (the template for the new `settings/seo` page).
- `middleware.ts` (repo root) — header comment (lines 11-18) documents why `proxy.ts` was reverted to `middleware.ts` under Next 16.2.9 + Turbopack (Pitfall 5).
- `next.config.ts` — confirms `cacheComponents: true` (line 5), `images.remotePatterns` for `cdn.anydiscussion.com` + Cloudinary (Pitfall 1 driver; OG URL resolution context).
- Empirical Node 24.15.0 run — verified `Intl.Segmenter('bn', {granularity:'grapheme'})` returns 59 graphemes for a sample Bangla string that is 84 UTF-16 code units and 220 UTF-8 bytes (the empirical basis for SEO-06).

### Secondary (MEDIUM confidence — referenced from official documentation; some WebSearch-rate-limited)
- schema.org `BlogPosting` (https://schema.org/BlogPosting) — type definition (could not be fetched live this session due to WebSearch quota; type is stable since 2013).
- Google Article structured data (https://developers.google.com/search/docs/appearance/structured-data/article) — required vs recommended fields (rate-limited; documented in Assumptions Log A1).
- Google Search Central meta description guidelines (pixel-width truncation behavior) — documented in Assumptions Log A2.

### Tertiary (LOW confidence — not used for any load-bearing claim)
- None. All load-bearing claims are verified from the installed package source (Primary tier).

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all primitives verified from installed Next.js 16.2.9 source + bundled docs; no new packages installed.
- Architecture: HIGH — every file convention (`sitemap.ts`, `robots.ts`, `rss.xml/route.ts`) and API (`generateMetadata`, `MetadataRoute.*`) verified against installed types.
- Pitfalls: HIGH — Pitfall 1 (Cache Components), Pitfall 2 (JSON-LD path), Pitfall 5 (middleware.ts vs proxy.ts), Pitfall 6 (cacheTag) all verified from installed source. Pitfall 3 (Bangla) empirically verified. Pitfalls 4, 7 reasoned from established patterns.
- Bangla validation (SEO-06): HIGH for the mechanism (`Intl.Segmenter` empirically verified), MEDIUM for the exact threshold numbers (discretion per D-10; recommended 80/200 graphemes is defensible but not authoritative).
- JSON-LD schema shape: HIGH for the `@type` and field structure (stable schema.org since 2013), MEDIUM for Google's exact rich-results requirements (could not live-verify against Search Central).

**Research date:** 2026-07-07
**Valid until:** 2026-08-07 (30 days — Next.js 16.x is stable; the Metadata API hasn't had breaking changes since 13.2)
