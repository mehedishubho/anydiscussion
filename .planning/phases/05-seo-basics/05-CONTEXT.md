# Phase 5: SEO Basics - Context

**Gathered:** 2026-07-06
**Status:** Ready for planning

<domain>
## Phase Boundary

Every public-facing route emits accurate, source-of-truth metadata so posts are indexable, shareable, and canonical-correct — sourced from `post_seo` / `settings`, including Bangla-aware meta validation and an RSS feed. **Phase 5 ships the SEO *engine layer* that Phase 6 consumes**, plus the standalone root routes and the dashboard surfaces that populate the data. Concretely this phase delivers:

- **SEO engine (`src/lib/seo/`)** — metadata builders (`buildPostMetadata`, `buildPageMetadata`, `buildArchiveMetadata`, `buildSiteMetadata`), JSON-LD builders (`blogPostingJsonLd`, `websiteJsonLd`, `organizationJsonLd`), a canonical/metadataBase resolver, and Bangla-aware meta-length validators. Pure-ish helpers consumed by Phase 6's per-route `generateMetadata` + JSON-LD injection.
- **Standalone root routes** — `app/sitemap.ts` (published posts + pages, extensible for Phase 6 archives), `app/robots.ts`, and an `app/rss.xml` Route Handler (full-text, posts only).
- **Site-wide metadata** — `metadataBase`, default title template, default OG, site-wide JSON-LD on `(site)/layout.tsx`; `generateMetadata` wired into the EXISTING `(site)` routes (`page.tsx` home + `preview/[token]`).
- **Dashboard SEO surface (REQUIRED GAP CLOSURE)** — the Phase 3 post editor does NOT write `post_seo` today (only `pages` does). This phase adds the post-editor SEO panel + wires `post_seo` writes + Bangla validation (SEO-06), plus a minimal admin-only `settings/seo` page for site-wide SEO defaults.
- **Redirects check** — the empty `redirects`-table lookup wired into the request path so unmatched URLs check for a 301/302 before 404ing (CLAUDE.md mandate).

**Out of scope:** the post page itself and the archive routes (`/[slug]`, `/category/[slug]`, `/tag/[slug]`, `/author/[slug]`, `/blog`, `/search`, home) — all Phase 6 (SITE-01..08); Phase 6 wires `lib/seo/*` into those routes' `generateMetadata`. Dynamic OG image generation (fast-follow). BreadcrumbList + Person JSON-LD (Phase 6, with the routes that need them). The redirects *manager UI* (v2 — SETT-03; this phase wires the empty-table check only). Performance/CWV pass + bundle-budget audit + production revalidation audit (Phase 7). Analytics script injection (Phase 6 — ANAL-01/02). Backups (Phase 8).

**Boundary note for the planner:**
- Success criteria #1 ("each public route produces correct metadata") and #3 ("a published post page injects BlogPosting JSON-LD") are met at **HELPER LEVEL** this phase — verifiable as "given a published post, the builders return correct title/meta/canonical/OG/JSON-LD" — plus the live standalone routes (sitemap/robots/rss) and the metadata on the existing `(site)` home/preview routes. The live per-route wiring on the post/archives is Phase 6's job (the roadmap makes Phase 6 depend on Phase 5 for exactly this reason).
- **FALLBACK (researcher/planner's call):** if the phase verifier demands a *live* post URL to pass, pull a minimal read-only `/[slug]` forward (server-rendered title + sanitized body + `generateMetadata` + JSON-LD; NO Cache Components / Suspense / view-count / related). Default is NO pull-forward — Phase 6 owns SITE-07 (the highest-complexity Cache Components + Suspense spike); a thin route now would be rewritten or contend.

</domain>

<decisions>
## Implementation Decisions

### P5 ↔ P6 boundary (the scope seam)
- **D-01 (SEO layer only — Phase 6 consumes it):** Phase 5 ships the SEO ENGINE (`src/lib/seo/*` builders + standalone `sitemap.ts`/`robots.ts`/`rss.xml` + site-wide metadata on `(site)/layout.tsx` + dashboard SEO-field validation + the post-editor SEO panel) and wires `generateMetadata` into the EXISTING `(site)` routes only — `app/(site)/page.tsx` (home) + `app/(site)/preview/[token]/page.tsx`. Phase 6 consumes `lib/seo/*` (buildPostMetadata, blogPostingJsonLd, etc.) in its post/archive `generateMetadata` calls and JSON-LD injection. **No `[slug]` post-route pull-forward by default** (see fallback in `<domain>`). Chosen over "pull a thin post route forward" — Phase 6's SITE-07 is a different rendering shape (Cache Components + Suspense) and a thin route now would be rewritten or contend. *User delegated ("You decide"); Claude locked the leaner seam.*

### SEO engine layer (`src/lib/seo/`)
- **D-02 (Metadata builders):** Ship `src/lib/seo/metadata.ts` — `buildPostMetadata(post, postSeo, settings)`, `buildPageMetadata(page, settings)`, `buildArchiveMetadata(...)` (category/tag/author/search — consumed by Phase 6), `buildSiteMetadata(settings)`. Each reads the canonical base URL (D-04), the OG fallback chain (D-09), and respects `post_seo.canonicalUrl` override. These are what Phase 6's per-route `generateMetadata` calls. Site-wide metadata (`metadataBase`, title template, default OG) lives on **`(site)/layout.tsx`, NOT root `layout.tsx`** — root also wraps `(admin)` whose dashboard pages already carry their own static `metadata` titles; researcher/planner confirms placement.
- **D-03 (JSON-LD breadth = BlogPosting + site-wide WebSite/Organization):** Ship `src/lib/seo/jsonld.ts`: `blogPostingJsonLd(post, postSeo)` (per post — literal SEO-03; Article rich results) + `websiteJsonLd(settings)` (incl. `potentialAction` SearchAction for sitelinks search box) + `organizationJsonLd(settings)` (brand knowledge panel). Injected via `<script type="application/ld+json" dangerouslySetInnerHTML>`; site-wide ones on `(site)/layout.tsx`, `blogPostingJsonLd` consumed by Phase 6 on the post page (demonstrated helper-level this phase). **DEFERRED to Phase 6:** `BreadcrumbList` (needs archive-route breadcrumb concept) + `Person` author-byline (pairs with SITE-06 author pages). Chosen over "BlogPosting only" (richer eligibility, cheap once the builder exists) and "full set now" (breadcrumbs/Person need Phase 6 routes). *User delegated.*
- **D-04 (Canonical + metadataBase source):** `metadataBase` and the canonical base URL read from a `settings` key (`site.canonical_base_url` per CLAUDE.md; seeded at migration, D-11) with an env fallback (`NEXT_PUBLIC_SITE_URL` or similar) for dev. Per-post canonical: respect `post_seo.canonicalUrl` override when set, ELSE derive `{canonicalBaseUrl}/{slug}` (slugs are manual Latin per Phase 3 D-20). Pages: respect `pages.canonical` override else `{base}/{slug}`. Trailing-slash follows the Next.js 16 default — researcher/planner confirms; no custom policy unless required. Redirects table consulted before 404 (D-12).

### Standalone root SEO routes
- **D-05 (`app/sitemap.ts` — posts + pages, single, extensible):** Dynamic Next.js `sitemap()` returning `MetadataRoute.Sitemap` entries. v1 lists **published posts + published pages** (the things that exist). Category/tag/author archive entries are ADDED when Phase 6 lands those routes — the builder is structured for Phase 6 to extend, not rewrite. **Single sitemap** (not sitemap-index) — tens-of-thousands/month is fine with one file; sitemap-index is a v2 scale concern. Per-content-type `priority`/`changefreq` (SEO-08) defaults: home `1.0`/daily, posts `0.8`/weekly, pages `0.5`/monthly — builder-tunable. `lastModified` ← `posts.updatedAt` / `pages.updatedAt`. Publish action already calls `revalidatePath("/sitemap.xml")` (D-13), so it updates without a full rebuild.
- **D-06 (`app/robots.ts`):** Next.js `robots()` → `MetadataRoute.Robots`: allow all, `Sitemap: {canonicalBaseUrl}/sitemap.xml`, disallow `/preview/` (draft tokens), `/dashboard/`, and other non-public paths. Researcher/planner confirms the disallow list against the final route map.
- **D-07 (RSS — full-text, posts only, `/rss.xml`):** Route Handler at `app/rss.xml/route.ts` returning `application/rss+xml` (RSS 2.0) of the latest published posts. **Full-text** body per `<item>` (the sanitized HTML render — Phase 3 CONT-03 pipeline) per the "readers consume content / maximum reach" core value (PROJECT.md); modern blogs ship full-text feeds. **Posts only** — pages don't belong in a post feed. Latest N items (builder picks a sensible cap, e.g. 20–50). `/feed.xml` alias is builder-discretion. Publish action already calls `revalidatePath("/rss.xml")` (D-13). Rejects excerpt-only (reader-hostile for a content blog). *User delegated.*

### Dashboard SEO surface (REQUIRED GAP CLOSURE)
- **D-08 (Post-editor SEO panel + `post_seo` writes):** Phase 3's post editor does NOT persist `post_seo` today (scout-verified: only `pages` writes SEO, via `PageForm.tsx`). Phase 5 adds a dedicated **SEO panel** to the post editor (collapsible section/sidebar) — meta title, meta description, canonical URL, OG image — and wires `post_seo` insert/update into the post save Server Action (extend `src/actions/posts.ts` + `posts-schema.ts`). **Auto-derive with manual override:** meta title ← post title, meta description ← excerpt (Phase 3 D-21 `src/lib/excerpt`, Bangla-aware), OG image ← `posts.featureImage`; author can override each. Slug stays manual (Phase 3 D-20). Bangla-aware validation inline via the shared Zod schema (D-10). Mirrors the existing pages-editor SEO fields (Phase 4 D-18) for consistency. Chosen over "fields only, no derive" (more author friction). *User delegated.*
- **D-11 (Site-wide SEO settings + minimal `settings/seo` page):** Define + seed at migration: `site.title`, `site.description` (default meta description), `seo.default_og_image`, `site.canonical_base_url`, `seo.twitter_handle` (and other social handles as needed). Ship a **minimal admin-only `settings/seo` page** (`src/app/(admin)/dashboard/settings/seo/`) — sibling to Phase 4's `settings/storage` (DASH-09) — to edit them; the save action re-checks admin permission server-side (`requireRole('admin')`/`requireCan`) per the Phase 2/4 pattern. Chosen over seed-only + defer: CLAUDE.md reserves `settings/seo/`; seed-only forces DB edits for any site-title change (bad for a non-dev founder); consistent with the Storage Settings precedent. These values feed `metadataBase` (D-04), the OG fallback (D-09), and the Organization/WebSite JSON-LD (D-03).

### OG / Twitter images
- **D-09 (Static fallback chain only in v1):** Per-post OG/Twitter resolves via chain: `post_seo.ogImage` → `posts.featureImage` → site default (`settings.seo.default_og_image`, seeded D-11). Twitter card `summary_large_image` when an image is present, else `summary`. **No dynamic OG generation in v1.** Dynamic branded OG (Route Handler rendering post title + site name → PNG via `satori` + `@resvg/resvg-js`, the self-hostable core of `@vercel/og`) is a documented **FAST-FOLLOW** — added this phase ONLY if the researcher/planner confirms it clears the non-negotiable perf bar without risk; otherwise Phase 7+. `next.config.ts images.remotePatterns` already allows `cdn.anydiscussion.com` (Phase 1) so OG URLs resolve. *User delegated.*

### Bangla-aware validation
- **D-10 (SEO-06 — byte/grapheme count, not Latin):** A shared Zod schema (reused client-side in the SEO panel + server-side in the post/pages save action) validates meta title/description using a **byte / reasonable Unicode-grapheme count, NOT a Latin-character limit** (PROJECT.md; same rule Phase 3 D-21 set for excerpts). Researcher/planner sets the actual thresholds (e.g. title ~60 / description ~155 for Latin; for Bangla count bytes or graphemes via `Intl.Segmenter` or similar) — the CONSTRAINT is locked, the exact numbers are discretion. Schema lives alongside its feature per CLAUDE.md (e.g. `src/lib/seo/validation.ts` or the posts schema file).

### Redirects
- **D-12 (Redirects check wired now — mechanism TBD):** Wire the `redirects`-table lookup into the request path so unmatched URLs check for a 301/302 before 404ing (CLAUDE.md SEO mandate). Table ships EMPTY in v1 (greenfield); the redirects MANAGER UI is v2 (SETT-03) and just fills the table later — no proxy change then. **Mechanism caveat — researcher/planner MUST resolve:** Phase 2's `src/proxy.ts` is edge-runtime + cookie-only; a Drizzle/`pg` DB lookup likely CANNOT run in the edge runtime. Options: (a) `export const runtime = 'nodejs'` on `proxy.ts`; (b) move the redirect check into a server-component `not-found.tsx` / root guard. Pick the mechanism — do NOT assume edge-runtime DB access works. Forward-looking (empty table now) but closes the CLAUDE.md requirement and is ready for SETT-03.

### Revalidation (carry-forward — no new work expected)
- **D-13 (Already wired in Phase 3 D-25):** The publish/update action ALREADY calls `revalidatePath("/sitemap.xml")`, `revalidatePath("/rss.xml")`, `revalidatePath("/blog/${slug}")`, `revalidatePath("/")`, `revalidatePath("/blog")`, plus category/tag/author paths and 2-arg `revalidateTag(tag, "max")`. Phase 5 just builds the routes those paths point at; publish→sitemap/rss-visible works once the routes exist. Researcher/planner confirms whether the new `settings/seo` save needs a path revalidation (e.g. site-wide metadata) — likely `revalidatePath("/", "layout")` or similar on settings save.

### Claude's Discretion
The founder delegated every gray area ("You decide" ×5 + "Lock all 3 as recommended"). The locked defaults above ARE the recommendations; the researcher/planner has flexibility on the explicitly-open mechanics:
- Exact **metadataBase/canonical** env var name + the `(site)/layout.tsx` vs root placement (D-02/D-04).
- The **sitemap priority/changefreq** values + latest-N count for RSS (D-05/D-07); a `/feed.xml` alias (D-07).
- The **Bangla meta thresholds** + the `Intl.Segmenter` vs byte-count choice (D-10).
- The **redirects-check mechanism** — edge-runtime nodejs-flag vs `not-found.tsx` server component (D-12).
- Whether **dynamic OG** is added this phase or confirmed as a fast-follow (D-09).
- The **exact `settings` key names** + the SEO panel's component shape (collapsible sidebar vs tab) (D-08/D-11).
- Whether to pull a minimal `/[slug]` forward if the verifier demands a live post URL (D-01 fallback).

### Folded Todos
None folded this phase.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project-level (stack + scope — authoritative)
- `CLAUDE.md` (repo root) — **"SEO requirements"** (generateMetadata per route sourced from `post_seo`/`settings`; dynamic `app/sitemap.ts`; JSON-LD Article per post; respect `canonical_url` override else derive from slug; **redirects table checked in middleware before 404ing**; "Don't assume meta description length limits based on Latin character counts — Bangla reads differently; validate by byte/character count"); **"Performance requirements"** (ISR/PPR; `revalidatePath`/`revalidateTag` on publish — no polling/rebuild; `next/image` only); folder structure (the `(site)` route group; `settings/seo/` reserved); "What NOT to do".
- `.claude/CLAUDE.md` — **verified 2026 version table + code shapes**: Next.js 16.2.9 (`cacheComponents:true` PPR; **2-arg `revalidateTag(tag, "max")`**; async `params`/`searchParams`; `proxy.ts` renamed from middleware); **Zod v4.4.3** (shared client/server); **drizzle-orm 0.45.2** pinned; `metadataBase`/Metadata API patterns. Read before any dependency install or config.
- `.planning/PROJECT.md` — Core Value ("readers consume content at maximum speed — fast AND SEO-sound"); Key Decisions (pages table for legal/contact; About hard-coded); Context (greenfield DB, growing traffic tens-of-thousands/month, small team 2–5, self-hosted/no-paid-API ethos).

### Phase-5-specific (requirements + roadmap)
- `.planning/REQUIREMENTS.md` — **SEO-01..08** (the 8 requirements this phase must satisfy), plus Out-of-Scope rows (no comments, no i18n routing, no paid APIs, no Vercel tooling, freeform custom-code injection deferred).
- `.planning/ROADMAP.md` §"Phase 5: SEO Basics" — goal, **5 success criteria**, **pitfalls owned** (Bangla meta-length validation — byte/char not Latin; sitemap must update via revalidation, not a full rebuild), research flag (none — generateMetadata, sitemap.ts, JSON-LD are standard Next.js Metadata API).

### Prior-phase context (carries forward — DO NOT re-plan)
- `.planning/phases/03-content-engine/03-CONTEXT.md` — **D-21** (`src/lib/excerpt` Bangla-aware excerpt — **feeds SEO meta auto-derive in D-08 + the SEO-06 validation rule**), **D-25** (publish action already revalidates `/sitemap.xml` + `/rss.xml` + `/blog/${slug}` etc. — **D-13 carry-forward; no new revalidation work**), **D-20** (manual Latin slugs — canonical derivation is trivial), **D-24** (post editor exists at TailAdmin-quality — **D-08 ADDS the SEO panel to it**), CONT-03 (sanitized HTML render pipeline — **reused for RSS full-text body in D-07**).
- `.planning/phases/04-dashboard-chrome/04-CONTEXT.md` — **D-18** (pages editor already has SEO fields `meta_title`/`meta_description`/`canonical` — **D-08 mirrors this pattern for posts**), **D-23/D-25** (Storage Settings admin-only page pattern + encrypted `settings` storage — **D-11 `settings/seo` page follows the same shape, minus encryption since SEO defaults aren't secrets**).
- `.planning/phases/01-foundation/01-CONTEXT.md` — **D-06** (`pages` table carries its OWN SEO columns `metaTitle`/`metaDescription`/`canonical` — `buildPageMetadata` reads these), **D-12** (`NEXT_PUBLIC_CDN_URL` env-driven — pattern for `NEXT_PUBLIC_SITE_URL` in D-04), the `post_seo` table (`metaTitle`/`metaDescription`/`ogImage`/`canonicalUrl`, one-to-one with posts).
- `.planning/phases/02-auth-rbac/02-CONTEXT.md` — the `src/proxy.ts` pattern (**edge-runtime, cookie-existence gate — D-12 must reconcile DB-lookup-in-proxy with this**), `requireRole`/`requireCan` helpers (called in the new `settings/seo` save action, D-11).

### Code (current state — scout-verified)
- `src/db/schema.ts` — `postSeo` (`metaTitle`, `metaDescription`, `ogImage`, `canonicalUrl`, one-to-one with `posts`), `posts` (`excerpt`, `featureImage`, `slug`, `publishedAt`, `updatedAt`), `pages` (`metaTitle`, `metaDescription`, `canonical`), `settings` (key-value), `categories`/`tags`. **Note: `post_seo` is NOT written by any action today** — D-08 closes this gap.
- `src/app/(site)/` — current routes: `layout.tsx`, `page.tsx` (placeholder home), `preview/[token]/page.tsx`. **No `[slug]`, archives, `/blog`, `/search`, `sitemap.ts`, `robots.ts`, `rss.xml`** — all missing; the standalone routes are new this phase, the page/archive routes are Phase 6.
- `src/actions/posts.ts` — the publish action's revalidation block already calls `revalidatePath("/sitemap.xml")`, `revalidatePath("/rss.xml")`, `revalidatePath("/blog/${post.slug}")`, etc. (lines ~278-294) + 2-arg `revalidateTag(...)`. **D-13 — no change needed; Phase 5 builds the targets.** `actions/posts.ts` + `posts-schema.ts` do NOT currently touch `post_seo` — D-08 extends them.
- `src/actions/pages.ts` + `pages-schema.ts` + `src/app/(admin)/dashboard/pages/PageForm.tsx` — the existing SEO-field pattern (writes `pages.metaTitle`/`metaDescription`/`canonical`) — **D-08 mirrors this for posts**.
- `src/lib/excerpt/` — the Phase 3 D-21 Bangla-aware excerpt utility — **reused for meta-description auto-derive (D-08) and as the model for SEO-06 validation (D-10)**.
- `src/lib/image-loader.ts` + `next.config.ts` — `cdnImageLoader` + `images.remotePatterns` (cdn.anydiscussion.com + res.cloudinary.com) already configured (Phase 1/4) — **OG image URLs resolve without config change (D-09)**.
- `src/proxy.ts` — edge-runtime cookie-existence gate (Phase 2). **D-12 reconciles the redirects-table DB lookup against this.**
- `src/app/layout.tsx` — root layout (`<html lang="en">`, Outfit font, ThemeProvider/SidebarProvider); **no `metadata` export — site-wide SEO metadata goes on `(site)/layout.tsx`, not here (D-02)**.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`src/lib/excerpt/`** (Phase 3 D-21) — Bangla-aware excerpt; reused for meta-description auto-derive (D-08) + the model for SEO-06 validation (D-10).
- **`src/actions/pages.ts` + `pages-schema.ts` + `PageForm.tsx`** — the existing SEO-field CRUD pattern; **D-08 mirrors it for posts** (extend `actions/posts.ts` + `posts-schema.ts` + the post editor).
- **`src/actions/posts.ts` revalidation block** — already revalidates `/sitemap.xml` + `/rss.xml` + `/blog/${slug}` (D-13); no new revalidation work.
- **`src/lib/image-loader.ts` + `next.config.ts images.remotePatterns`** — OG image URLs resolve unchanged (D-09).
- **`src/db/schema.ts`** — `postSeo`, `posts`, `pages`, `settings`, `categories`, `tags` all exist; no schema change expected this phase (only new `settings` keys seeded — D-11).
- **Phase 4 Storage Settings pattern** (`src/app/(admin)/dashboard/settings/storage/`) — the template for the sibling `settings/seo` page (D-11): admin-only, RHF+Zod, `requireRole('admin')` save action.
- **`src/lib/permissions/`** — `requireRole`/`requireCan`; called in the `settings/seo` save action (D-11).

### Established Patterns
- **Server Actions + shared Zod schemas** (client+server) — the SEO panel validation (D-08/D-10) and the `settings/seo` save (D-11) follow this; schema lives alongside its feature per CLAUDE.md.
- **Metadata API over `next-seo`** — CLAUDE.md mandates Next.js native `generateMetadata` + `app/sitemap.ts` + `app/robots.ts`; no `next-seo` package.
- **ISR/revalidation over polling/rebuild** — `revalidatePath`/`revalidateTag` on publish (already wired, D-13); sitemap/rss update without a full rebuild.
- **`(site)` / `(admin)` isolation** — `src/lib/seo/` lives outside `app/` so both route groups can import it without ESLint `no-restricted-imports` leakage; the SEO layer adds zero client JS to the public bundle (reinforces PERF-02, audited Phase 7).
- **pnpm-only; migrations via `drizzle-kit generate`** (never hand-write SQL) — the `settings` key seeds (D-11) flow through the same migration pipeline.

### Integration Points
- **New `src/lib/seo/` modules:** `metadata.ts` (builders, D-02), `jsonld.ts` (builders, D-03), `validation.ts` (Bangla-aware Zod, D-10), + a canonical/metadataBase resolver (D-04).
- **New root routes:** `src/app/sitemap.ts` (D-05), `src/app/robots.ts` (D-06), `src/app/rss.xml/route.ts` (D-07).
- **Existing-route metadata wiring:** `generateMetadata` on `src/app/(site)/page.tsx` + `src/app/(site)/preview/[token]/page.tsx` (D-01); site-wide metadata + site-wide JSON-LD on `src/app/(site)/layout.tsx` (D-02/D-03).
- **Extended actions:** `src/actions/posts.ts` + `posts-schema.ts` gain `post_seo` insert/update (D-08); a new admin-gated `settings/seo` save action (D-11) writing the seeded `settings` keys.
- **New dashboard page:** `src/app/(admin)/dashboard/settings/seo/` (D-11); the post-editor SEO panel component (D-08) added to the existing post editor.
- **Redirects check:** `src/proxy.ts` (or a `not-found.tsx` server component) gains the empty-`redirects`-table lookup (D-12 — mechanism TBD re: edge runtime).
- **Settings seed (one migration):** new keys `site.title`, `site.description`, `seo.default_og_image`, `site.canonical_base_url`, `seo.twitter_handle` (D-11). No new tables.

</code_context>

<specifics>
## Specific Ideas

- **"Layer for Phase 6 to consume" framing** — the founder's consistent stance across phases (lean seams, do-it-properly-once) is reflected in D-01: Phase 5 builds the SEO engine + standalone routes + the data-population surfaces, and Phase 6 wires the engine into the actual post/archive routes. The helpers must be clean enough that Phase 6's per-route `generateMetadata` is a one-liner.
- **Reader-maximum-reach posture** — the full-text RSS choice (D-07) over excerpt-only reflects PROJECT.md's "readers consume content at maximum speed" core value. The founder leans toward reader-friendliness over click-extraction (consistent with no-comments, no-paid-APIs, self-hosted ethos).
- **Non-dev founder UX** — the `settings/seo` dashboard page (D-11) over seed-only reflects that the founder/operator is not always going to edit the DB for a site-title or default-OG change. Consistent with the dashboard-managed-pages and Storage Settings decisions in Phase 4.
- **No aesthetic/branding references** — branding remains deferred (PROJECT.md). OG/Twitter images use whatever the author uploads + the site default; no branded template yet (dynamic OG is the fast-follow that would introduce branding, D-09).

</specifics>

<deferred>
## Deferred Ideas

- **Dynamic branded OG image generation → fast-follow / Phase 7+.** A Route Handler rendering post title + site name → PNG via `satori` + `@resvg/resvg-js` (the self-hostable core of `@vercel/og`). Added only after the perf bar is confirmed clear (D-09).
- **`BreadcrumbList` + `Person` author JSON-LD → Phase 6**, with the archive/author routes that need them (D-03).
- **Category/tag/author archive entries in the sitemap → Phase 6**, when those routes land (D-05). The sitemap builder is structured to extend, not rewrite.
- **Sitemap-index (multi-sitemap) → v2** scale concern, if a single sitemap outgrows ~50k URLs (not near-term for this traffic profile) (D-05).
- **`/feed.xml` alias → builder-discretion / fast-follow**, if readers report needing it (D-07).
- **Redirects manager UI → v2 (SETT-03).** This phase wires the empty-table check only (D-12); the UI to populate it is v2.
- **Analytics script injection → Phase 6 (ANAL-01/02).** Umami/GA4 script via `settings`, not this phase.
- **Production revalidation audit + CWV/bundle-budget pass → Phase 7 (PERF-01/02/03).** This phase relies on the already-wired publish revalidation (D-13); Phase 7 verifies publish→visible end-to-end on the real stack.

### Reviewed Todos (not folded)
- **"Configurable multi-destination backup system"** (pending todo, area: database, matched Phase 5 with score 0.6) — **reviewed, NOT folded.** False-positive keyword overlap ("configurable, planning, requirements, phase"). Already mutated into **Phase 8 — Backup & Disaster Recovery** (BACKUP-01..05) via the 2026-07-02 roadmap update; unrelated to SEO Basics. Reviewed-and-not-folded in Phases 1, 2, 3, 4, and now 5. See `.planning/todos/pending/2026-06-30-configurable-multi-destination-backup-system.md`.

</deferred>

---

*Phase: 5-SEO Basics*
*Context gathered: 2026-07-06*
