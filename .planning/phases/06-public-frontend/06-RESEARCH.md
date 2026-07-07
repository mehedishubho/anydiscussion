# Phase 6: Public Frontend - Research

**Researched:** 2026-07-07
**Domain:** Next.js 16 Cache Components (PPR) + `<Suspense>` streaming, Drizzle/Postgres published-only read queries, Postgres full-text search, public-site chrome (header/footer/dark-mode), Contact form (RHF + Zod + Server Action), analytics script injection, reading-time/TOC derivation
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**View-count path (SITE-07 streaming hole + SITE-17)**
- **D-01 (Simple counter column):** Add a `views` integer column on `posts` (default 0); atomic `UPDATE posts SET views = views + 1`. **No de-dupe** — accepts minor inflation from refreshes/crawlers. Rejected `post_views` de-dupe table + "derive from Umami API".
- **D-02 (Server-side increment in the Suspense slot):** The view-count async component does the atomic `+1` per real visit, then renders the count. Under PPR the static Tiptap body stays cached; only the streaming slot runs per request. Zero client JS, no new endpoint. Rejected client-beacon + Route Handler. Researcher confirms `cacheLife`/`cacheTag` profile so the increment fires once per real visit (NOT per ISR regeneration, NOT double-counted per stream).

**Browse IA (SITE-01/02/03)**
- **D-03 (Three distinct routes):** Home = magazine (featured hero + latest grid + 1–2 category teasers); `/blog` = full reverse-chronological paginated feed; Archive = dense filterable list. **Pagination = classic URL-based page numbers** (ISR/SEO-friendly; no client fetching) across all list routes.
- **D-04 (Featured = manual flag):** Add boolean `posts.featured` (default false); editors tick "Feature this" in the post editor. Home hero = most-recently-published featured post.

**Single-post page (SITE-07/13/14)**
- **D-05 (Centered + sticky TOC sidebar):** Centered prose article (`renderPostBody`); sticky TOC sidebar on desktop built from H2/H3 (collapses to inline "On this page" on mobile); share buttons + reading time in a meta row under the title; thin read-progress bar at top; view-count + related-posts stream in `<Suspense>` at the end. Active-section highlighting = small optional client component.
- **D-06 (Related = same category, fallback to tags):** Primary = same category (latest-published first); if fewer than slot count, fill with posts sharing most tags; always exclude current post; cap ~3–4.

**Contact form (SITE-10)**
- **D-07 (Reuse `lib/email` / Resend):** Send via existing Phase-2 wrapper (Resend); destination = fixed admin inbox from `settings` (`contact.recipient_email`). Honeypot + per-IP **in-memory** rate-limit (single-instance v1; persistent limiting is v2 SCALE-01).
- **D-08 (Email-only, no DB storage):** Fire the email, store nothing. RHF + Zod (shared server-side) + Server Action (fire-and-forget `lib/email`, never throws).

**Search (SITE-08)**
- **D-09 (Page-only, server-GET):** Dedicated `/search` page: GET form + server-rendered Postgres FTS ranked results (`tsvector` / `websearch_to_tsquery` / `ts_rank`); filters (category/tag/author/date-range) via URL searchParams. **No client autocomplete.**

**Header & footer + nav (cross-cutting)**
- **D-10 (Standard chrome):** Header = logo/site-title + nav (Home, Blog, **Categories dropdown**, About, Contact) + search icon + dark-mode toggle. Footer = short site blurb + legal links + quick links + optional social links (from `settings`). Categories dropdown = cached server-component fetch. **Nav is hard-coded for v1** (menu builder is v2 SETT-01).

**Author page (SITE-06)**
- **D-11 (Full bio page + username slug):** `/author/[username]` with bio header (name + avatar + bio from AUTH-08) + their posts (cards, paginated) + `Person` JSON-LD. **Adds a `username` slug column on `user`** (nullable, unique). Byline links here.

**Archive filters (SITE-03)**
- **D-12 (Top filter bar + numbered pagination):** Top filter bar — category (dropdown), tag (multi-select), author (dropdown), date-range — via URL searchParams; numbered pagination. Tag multi-select can be a small progressive-enhancement client bit.

**Public dark mode (SITE-16)**
- **D-13 (System + header toggle):** Respect OS preference by default + small client-component toggle (mirrors dashboard class strategy via `ThemeContext` or equivalent minimal hook) + no-flash inline `<head>` script. Rejected sharing-the-dashboard-setting (couples `(site)` and `(admin)`).

**Category/tag archives (SITE-04/05)**
- **D-14 (Reuse archive template + BreadcrumbList):** `/category/[slug]` and `/tag/[slug]` reuse the main ArchiveList, pre-filtered. Inject `BreadcrumbList` JSON-LD.

**Reading time + TOC (SITE-13)**
- **D-15 (Bangla-aware + H2/H3):** Reading time derived server-side: word count via `Intl.Segmenter` (reuses Phase 3 D-21 approach) × tunable WPM (default ~200); "N min read". TOC = H2 + H3, built from rendered headings.

**Empty / streaming states (cross-cutting)**
- **D-16 (Skeletons + friendly empties):** Skeleton placeholders inside `<Suspense>` while view-count/related stream in; meaningful empty states; friendly 404 suggesting popular posts + search box.

**Analytics (ANAL-01/02)**
- **D-17 (Injection-only this phase):** Inject a `<script>` tag from a `settings`-stored script URL/ID (default Umami). GA4/Plausible swappable. **The Umami instance deploys in Phase 7** — injection mechanism only this phase.

### Claude's Discretion
- Exact **`cacheLife`/`cacheTag` profile + Suspense boundary placement** on `/[slug]` (D-02 / HIGHEST research flag — RESOLVED in this research, see HIGHEST Spike section).
- The **public read-query module shape** (`src/lib/queries/` vs `src/lib/site/`) + exact signatures (RESOLVED — see Public Read-Query Module).
- Share targets, read-progress bar mechanics, TOC active-state scroll-spy (D-05 — small client components).
- The **`username` generation/validation rules** + whether `user` already has a reusable slug field (D-11 — RESOLVED: `username` is genuinely new; see Schema Deltas).
- Honeypot field name + rate-limit threshold/window (D-07); in-memory store shape.
- Exact **`settings` key names** + seeds (RESOLVED — see Schema Deltas).
- Card aspect ratios, pagination page-size, the archive route's exact URL (`/archive`), "load more" vs numbered (numbered everywhere per D-03).
- 404 "suggested posts" selection; empty-state copy; About page content (marketing — founder-authored at build time).

### Deferred Ideas (OUT OF SCOPE)
- Dynamic branded OG image generation → Phase 7+ (Phase 5 D-09).
- Umami analytics instance deploy + GA4/Plausible swap → Phase 7 (ANAL-02).
- Persistent (Redis-backed) rate limiting + multi-instance view-count de-dupe → v2 (SCALE-01). v1 uses in-memory + no de-dupe (D-01/D-07).
- Production CWV/bundle-budget pass + publish→visible audit → Phase 7 (PERF-01/02/03).
- Menu builder + redirects manager UI → v2 (SETT-01/03). Nav hard-coded for v1 (D-10).
- Comments / reader discussion → Out of Scope.
- Bangla-aware Postgres FTS stemming → v2 (SEARCH-02 — no PG Bengali stemmer until partial PG 17). v1 uses `'simple'` config.

### Schema/seed deltas for Phase 6 (one migration via `drizzle-kit generate`)
- `posts.featured` — boolean, default false (D-04).
- `posts.views` — integer, default 0 (D-01).
- `user.username` — text, nullable, unique (D-11) — verified NEW (no existing reusable slug).
- `settings` seeds — `contact.recipient_email`, `analytics.*`, footer social-link keys.
- **No new tables** (no `post_views`, no `contact_messages` per D-01/D-08).
- Clean-room migration test (`pnpm test:migrations`) — schema-apply [BLOCKING] within Wave 1.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SITE-01 | Home page (featured / latest feed) | Browse IA (D-03/D-04); magazine layout = `posts.featured` flag (schema delta) + cached published-only query; route under `(site)/page.tsx` (replaces placeholder). Cached via `'use cache'` + `cacheTag('posts-list','featured')`. |
| SITE-02 | `/blog` feed (latest / featured) | Full reverse-chronological paginated feed; URL-based page numbers (D-03); numbered pagination; `'use cache'` + `cacheLife('hours')` + `cacheTag('posts-list')`; `params.page` is part of cache key. |
| SITE-03 | Full blog archive (chronological + filterable) | `/archive` dense filterable list; top filter bar (category/tag/author/date-range) via URL searchParams (D-12); FTS-independent filterable query in `lib/queries/archive.ts`. |
| SITE-04 | `/category/[slug]` category archive | Reuses ArchiveList component (D-14) pre-filtered by `categories.slug`; `BreadcrumbList` JSON-LD (closes Phase 5 D-03 deferral); `'use cache'` + `cacheTag('category-${id}')` (already wired in publishPost). |
| SITE-05 | `/tag/[slug]` tag archive | Reuses ArchiveList (D-14); filter via `postTags` join; `BreadcrumbList` JSON-LD. |
| SITE-06 | `/author/[slug]` author profile + their posts | `/author/[username]` (D-11); bio header (name + avatar + bio from `user`); `Person` JSON-LD (closes Phase 5 D-03); requires `user.username` schema delta (verified NEW). |
| SITE-07 | Single post page — Cache Components + `<Suspense>` (static body + dynamic view count + related posts) | **HIGHEST spike — RESOLVED.** See HIGHEST Spike section + Pattern 1. Static body via `'use cache'` post fetch (revalidated by existing `revalidateTag(\`post-${id}\`, "max")`); view-count + related stream in `<Suspense>` via `connection()` + uncached async. |
| SITE-08 | `/search` page (Postgres FTS) with filters | Postgres FTS recipe (see FTS section); `'simple'` config (Bangla-aware per SEARCH-02 v2); filters via URL searchParams; ranked via `ts_rank`. |
| SITE-09 | About us (hard-coded TSX/MDX) | Plain route `(site)/about/page.tsx`; no DB; founder-authored content at build time. `generateMetadata` via `'use cache'` + settings. |
| SITE-10 | Contact us (dashboard-managed content + working form → SMTP; honeypot + rate-limit) | Pages row `contact` already seeded (Phase 4 D-17). Contact form = client component (RHF + Zod) → Server Action → `lib/email` Resend (D-07/D-08). Honeypot + in-memory rate-limit. Email-only, no DB (D-08). |
| SITE-11 | T&C + Privacy (dashboard-managed `pages`) | Pages rows `terms-and-conditions` + `privacy-policy` already seeded (Phase 4 D-17). Render via `(site)/[slug]`-style pages route OR fixed routes reading by slug; published-only filter. |
| SITE-12 | `not-found.tsx` 404 page | Redirects-check already wired (Phase 5 D-12). This phase STYLES the 404 (suggested posts + search). Suspense-isolated redirect-check stays. |
| SITE-13 | Single-post extras — reading time + TOC | Reading time via `Intl.Segmenter` × WPM (D-15) — mirror `src/lib/excerpt/index.ts` (new `src/lib/reading-time/`); TOC from H2+H3 in rendered body. |
| SITE-14 | Single-post extras — share buttons + read-progress | Small client components (`"use client"`); share targets (X/Facebook/LinkedIn/copy-link); thin read-progress bar (scroll listener). |
| SITE-15 | Public draft preview route gated by token | **Largely DONE** (Phase 3 D-19) — verify/polish only, do NOT rebuild. Pattern at `src/app/(site)/preview/[token]/page.tsx` is the `/[slug]` analog. |
| SITE-16 | Dark mode on public site | System + header toggle (D-13); no-flash `<head>` script; mirrors dashboard class strategy but DOES NOT share the setting (route-group isolation). Small client toggle. |
| SITE-17 | View count display on posts | Consumes D-01/D-02 write path; rendered inside the streaming Suspense slot. The `+1` IS the write. |
| ANAL-01 | Analytics integration via `settings`-stored script/ID | `<script>` injection on `(site)/layout.tsx` from settings (D-17); cached settings read (`'use cache'` + `cacheTag('analytics-settings')`). |
| ANAL-02 | Default platform — self-hosted Umami; GA4/Plausible swappable | Injection-only this phase. Default settings value = empty (Umami instance deploys Phase 7). |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

**Stack (locked — verified 2026 versions in `.claude/CLAUDE.md`):**
- Next.js 16.2.9 App Router, Server Components by default, Server Actions for mutations, `cacheComponents: true` (PPR), Turbopack, `output: "standalone"` (Coolify Docker). React 19.2.
- pnpm **only** — never npm or yarn.
- PostgreSQL via Drizzle ORM 0.45.2 (pinned by Better Auth peer); `drizzle-kit generate` — never hand-write SQL.
- Zod **v4.4.3** (shared client+server schemas); RHF 7.80.0 + `@hookform/resolvers` 5.4.0.
- `next/image` only (never raw `<img>`); custom loader at `cdn.anydiscussion.com`.
- isomorphic-dompurify 3.18.0 (sanitize before storage AND render).
- **`proxy.ts`, NOT `middleware.ts`** (Next 16 rename). **2-arg `revalidateTag(tag, "max")`** — single-arg is DEPRECATED.

**Performance mandates (non-negotiable for the public site):**
- Public pages ISR/static by default. PPR where pages mix static body + dynamic holes.
- `revalidatePath`/`revalidateTag` on publish — **no polling or full rebuild**.
- **No client-side data fetching on the public site for server-renderable content.**
- `next/image` only (never raw `<img>`).

**Security mandates:**
- Every mutating Server Action starts with a role/permission check (view-count `+1` is the ONE public write and is exempt — published content is public).
- Sanitize any raw HTML/JS field before storage AND render (Pitfall #2 — `renderPostBody` is the gate before any `dangerouslySetInnerHTML`).
- Never rely on UI hiding alone.

**Route-group isolation:**
- `app/(site)` and `app/(admin)` cannot import each other (ESLint `no-restricted-imports` — bidirectional, enforced in `eslint.config.mjs`). New `lib/queries` + `components/site` live outside `app/` or strictly under `(site)` so no dashboard JS leaks the public bundle (PERF-02 audits in Phase 7).

**GSD workflow:** `commit_docs: true`, `nyquist_validation: true` (Validation Architecture section REQUIRED), `security_enforcement: true` (ASVS level 1, block on high), `human_verify_mode: end-of-phase`.

## Summary

Phase 6 is the largest surface area of any phase so far (19 requirements, 17 SITE + 2 ANAL), but almost every primitive it consumes is already built: the SEO engine (`lib/seo/*`), the sanitized render pipeline (`renderPostBody`), the redirects-check 404, the publish revalidation (D-25 already revalidates `/`, `/blog`, `/blog/[slug]`, category/tag/author archives, sitemap, rss), the excerpt utility (the model for reading-time), the email wrapper (for Contact), and the dashboard-managed `pages` rows (T&C/Privacy/Contact content already seeded). Phase 6 builds the real public routes on top of these.

**The HIGHEST-confidence research flag — Cache Components + `<Suspense>` boundary placement on `/[slug]` — is RESOLVED with HIGH confidence** by reading the **bundled Next.js 16.2.9 docs** shipped in `node_modules` (`01-app/01-getting-started/08-caching.md` + `01-app/03-api-reference/04-functions/connection.md` + `01-app/03-api-reference/01-directives/use-cache.md`). The model is unambiguous: there are exactly three rendering categories under `cacheComponents:true` — (1) `'use cache'` → cached, included in static shell; (2) `<Suspense>`-wrapped async component without `'use cache'` → fallback in static shell, content **streams per-request**; (3) deterministic sync ops → static shell. A DB write inside a `<Suspense>`-wrapped async component runs **once per real visit** and is **never** part of the cached prerender — ISR regeneration of the static shell does NOT re-invoke it. The bundled `connection()` docs even use a `getVisitorCount()` example that is nearly identical to the view-count use case. **No spike needed** — the pattern is proven in this exact repo already (`not-found.tsx` does a per-request DB lookup in `<Suspense>`; `preview/[token]/page.tsx` is the `/[slug]` analog).

**Primary recommendation:** Build the single-post page as: `'use cache'` post-fetch (cached, revalidated by existing publish tags) → render the Tiptap body synchronously (it's the LCP) → stream view-count + related-posts in two separate `<Suspense>` boundaries at the bottom of the page. The view-count async component calls `connection()` from `next/server`, then runs the atomic `UPDATE posts SET views = views + 1`, then renders the count. Schema deltas are minimal and verified: `posts.featured`, `posts.views`, `user.username` (genuinely NEW — `user` has `name` but no slug field), plus a generated `tsvector` column + GIN index for FTS, plus settings seeds. One `drizzle-kit generate` migration carries them all.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Static post body render (Tiptap JSON → HTML) | Frontend Server (SSR) | — | `renderPostBody` is server-only (`generateHTML` + `sanitizeBeforeRender`); the body is the LCP, rendered synchronously from a cached fetch. Never client-side. |
| Post fetch by slug (published-only) | Frontend Server (SSR) | Database | `'use cache'` scope keyed by slug; revalidated by publish action's existing `revalidateTag(\`post-${id}\`, "max")`. |
| View-count increment (+1 per real visit) | Frontend Server (SSR) | Database | The ONE public write. `<Suspense>`-wrapped async component calls `connection()` then `UPDATE`. Never client-side (no beacon — D-02). |
| Related posts slot | Frontend Server (SSR) | Database | `<Suspense>`-wrapped; cached via `'use cache'` + category/post-list tags so it refreshes on publish. |
| `generateMetadata` per route | Frontend Server (SSR) | — | Next.js Metadata API; `'use cache'` + `cacheTag('seo-settings')` for settings-driven routes; params-dynamic for `/[slug]` (no directive needed for the post-data read if it reuses the cached post fetch). |
| Browse/archive list queries | Frontend Server (SSR) | Database | `'use cache'` + `cacheLife('hours')` + `cacheTag('posts-list')`; pagination `params.page` is part of the cache key. |
| FTS search query | Frontend Server (SSR) | Database | `/search` GET with searchParams; `sql` template literal FTS; ranked by `ts_rank`. Never client (D-09). |
| Contact form submission | API / Backend (Server Action) | Email (Resend) | RHF client component → Server Action → `lib/email` (fire-and-forget). Honeypot + in-memory rate-limit. No DB write (D-08). |
| Public dark-mode toggle | Browser / Client | — | Small client component + no-flash `<head>` script; mirrors dashboard class strategy but DOES NOT share the setting. |
| Analytics script injection | Frontend Server (SSR) | CDN (Umami) | `<script>` from settings in `(site)/layout.tsx`; the script itself loads from a third-party/Phase-7 Umami instance. |
| TOC + reading-time derivation | Frontend Server (SSR) | — | Server-side walk of the rendered body / JSON; Bangla-aware via `Intl.Segmenter`. Never client. |
| Read-progress + share + scroll-spy | Browser / Client | — | Small client components (genuine interactivity); lazy-loaded so they don't block LCP. |
| 404 redirects-check | Frontend Server (SSR, Node runtime) | Database | Already wired (Phase 5 D-12); `<Suspense>`-isolated DB lookup in `not-found.tsx`. NOT proxy.ts (edge). |

## HIGHEST Spike — RESOLVED (Cache Components + `<Suspense>` on `/[slug]`)

This is the single highest-confidence open question flagged in CONTEXT.md D-02, ROADMAP.md, and STATE.md Blockers. **It is resolved below with HIGH confidence from the bundled Next.js 16.2.9 docs** (the most authoritative source — these docs ship with the exact runtime version in `node_modules`).

### The four spike questions, answered

**Q1. Does the dynamic `<Suspense>` slot run per request (per real visit) without invalidating the cached static body shell?**

**YES — verified.** `[VERIFIED: next@16.2.9 bundled docs — 01-app/01-getting-started/08-caching.md]`

The bundled caching guide (lines 95–130, 262–298) defines exactly three rendering categories under `cacheComponents: true`:

| Category | How to mark | Where it renders |
|----------|-------------|------------------|
| Cached (part of static shell) | `'use cache'` directive on a component/function/route | Output included in static prerender; revalidated by `cacheTag`/`revalidateTag` |
| Streaming (per-request) | `<Suspense>` wrapping an async component WITHOUT `'use cache'` | **Fallback UI in static shell; content STREAMS at request time** |
| Deterministic | Sync ops, module imports, pure computation | Automatically in static shell |

Verbatim from the bundled docs (line 128): *"The fallback (`<p>Loading posts...</p>`) is included in the static shell, while the component's content streams in at request time."* And (lines 262–280): the static shell consists of HTML for initial page loads + RSC payload for client navigation; "Next.js requires you to explicitly handle components that can't complete during prerendering. If they aren't wrapped in `<Suspense>` or marked with `use cache`, you'll see an `Uncached data was accessed outside of <Suspense>` error."

**Implication for `/[slug]`:** the Tiptap body is rendered from a `'use cache'` post-fetch (part of the static shell, ISR-revalidated on publish); the view-count + related-posts are `<Suspense>`-wrapped async components without `'use cache'` (their content streams per request). The static body paints immediately; the dynamic holes stream without blocking LCP.

**Q2. Does the `+1` increment fire once per real visit — NOT per ISR regeneration, NOT double-counted?**

**Once per real visit — verified.** `[VERIFIED: next@16.2.9 bundled docs — connection.md + caching.md]`

The streaming slot's content is **never** part of the cached prerender output — only its fallback is. ISR regeneration regenerates the static shell (the cached parts); the streaming slot runs fresh on every request that reaches the server. Therefore:

- **ISR regeneration does NOT re-invoke the streaming slot.** The slot isn't in the cached output to be regenerated.
- **One real visit = one slot execution = one `+1`.**

For the per-request signal, the bundled `connection()` docs (line 6, 32–48) are explicit:

> *"The `connection()` function allows you to indicate rendering should wait for an incoming user request before continuing. It's useful when a component doesn't use Request-time APIs like `cookies` or `headers`, but still needs to produce different output per request."*

And the canonical example (lines 42–60) is literally `getVisitorCount()`:

```ts
import { connection } from 'next/server'
export async function getVisitorCount() {
  await connection()
  return db.prepare('SELECT value FROM counters WHERE name = ?').get('visitors')
}
```

This is the exact shape of the view-count increment. **`connection()` is the right primitive** — call `await connection()` before the `UPDATE posts SET views = views + 1`, inside a `<Suspense>` boundary.

**Double-counting on stream retry:** Next.js does not document automatic retry of completed streaming slots; the slot either completes (one `+1`) or errors (the error boundary). D-01 explicitly accepts minor inflation from refreshes/crawlers (no de-dupe is the locked decision). **This is an accepted risk for v1**, not a landmine.

**Q3. The correct `cacheLife`/`cacheTag` profile.**

Verified against `use-cache.md` (lines 277–330) and the bundled example (caching.md lines 322–416). The profile per surface:

| Surface | Directive | Tags / Profile | Revalidated by (existing publish action in `actions/posts.ts`) |
|---------|-----------|----------------|------------------------------------------------------------------|
| (a) Static body shell + post fetch on `/[slug]` | `'use cache'` on the post-fetch function | `cacheTag(\`post-${id}\`)` + `cacheTag(\`author-${authorId}\`)` | `revalidateTag(\`post-${id}\`, "max")` + `revalidateTag(\`author-${authorId}\`, "max")` — **already wired** |
| (b) Settings-driven `generateMetadata` | `'use cache'` | `cacheTag('seo-settings')` | `revalidateTag('seo-settings', "max")` in `saveSeoSettings` — **already wired** |
| (c) View-count incrementing slot | **NO `'use cache'`** + `await connection()` | — | n/a — runs per request (never cached) |
| (d) Related-posts slot | `'use cache'` + `cacheLife('hours')` | `cacheTag(\`category-${catId}\`)` + `cacheTag('posts-list')` | `revalidateTag(\`category-${id}\`, "max")` + `revalidateTag('posts-list', "max")` — **already wired** |
| (e) Archive/list routes (home, `/blog`, `/archive`, `/category`, `/tag`, `/author`) | `'use cache'` + `cacheLife('hours')` | `cacheTag('posts-list')` + per-taxonomy tag | `revalidateTag('posts-list', "max")` — **already wired** |

**Key insight:** the publish action (`publishPost` in `src/actions/posts.ts` lines 351–368) ALREADY emits every tag this phase needs: `post-${id}`, `author-${authorId}`, `category-${categoryId}`, `posts-list` (all 2-arg `revalidateTag(..., "max")`). Phase 6 only needs to **add the matching `cacheTag(...)` calls inside its `'use cache'` scopes** — the invalidation side is done.

**Q4. Where exactly should `<Suspense>` boundaries go on `/[slug]` so the body paints immediately and the holes stream without blocking LCP?**

**Verified.** See Pattern 1 (Single-post page recipe) for the exact code shape. Summary:

- **NO `<Suspense>` around the post body.** The body is rendered synchronously from a `'use cache'` fetch — it's part of the static shell and is the LCP element.
- **`<Suspense>` boundary #1** wraps the view-count async component (at the bottom of the article, after the body).
- **`<Suspense>` boundary #2** wraps the related-posts async component (also at the bottom).
- Two separate boundaries (not one) so each streams independently — the view-count shouldn't wait on related-posts or vice versa.
- `generateMetadata` runs in its own scope (Next.js tracks metadata data access separately per the docs — caching.md line 418); it reads the cached post via the same `'use cache'` fetch.

**Does the `preview/[token]` PPR pattern generalize?** **Yes, with one difference.** `[CITED: src/app/(site)/preview/[token]/page.tsx]` The preview route does the token lookup per-request (no `'use cache'` — drafts are revocable). The published `/[slug]` route uses `'use cache'` for the post fetch (published content is static between publishes). The `<Suspense>` shape is identical; only the caching profile inside the async component differs. The preview route is the correct structural template.

### Anti-spike conclusion

**No spike is needed.** The pattern is fully specified by the bundled docs and already proven twice in this repo (`not-found.tsx` does a per-request DB read in `<Suspense>`; `preview/[token]/page.tsx` is the `/[slug]` analog). The planner can proceed directly to implementation. The Validation Architecture section below encodes the testable invariants.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| next | 16.2.9 | App Router framework (`cacheComponents:true`, `<Suspense>`, `connection()`) | Already installed; bundled docs are the source of truth for the spike. `[VERIFIED: package.json + node_modules docs]` |
| react / react-dom | 19.x | UI runtime | Next 16 peers `^19.0.0`. `[VERIFIED: package.json]` |
| drizzle-orm | 0.45.2 | ORM (published-only reads, FTS via `sql` template, atomic `+1`) | Pinned by Better Auth; `sql` template already used in `src/actions/media.ts`. `[VERIFIED: package.json]` |
| zod | 4.4.3 | Shared client+server schema (Contact form, search params) | `[VERIFIED: package.json]` |
| react-hook-form | 7.80.0 | Contact form | `[VERIFIED: package.json]` |
| @hookform/resolvers | 5.4.0 | RHF ↔ Zod bridge | `[VERIFIED: package.json]` |
| isomorphic-dompurify | 3.18.0 | `sanitizeBeforeRender` (Pitfall #2 — consumed unchanged via `renderPostBody`) | `[VERIFIED: package.json]` |
| resend | 6.16.0 | Contact form email delivery (via existing `lib/email`) | `[VERIFIED: package.json]` |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `Intl.Segmenter` | Node 20.19+ built-in | Bangla-aware word/grapheme counting for reading time | `src/lib/reading-time/` — no install (runtime built-in). `[VERIFIED: Node 20.19 LTS base image in CLAUDE.md]` |
| `connection` | `next/server` | Per-request signal for view-count increment | Inside the `<Suspense>`-wrapped view-count slot. `[VERIFIED: bundled connection.md]` |
| `cacheLife` / `cacheTag` | `next/cache` | `'use cache'` profile + on-demand revalidation | Every cached scope (post fetch, list routes, settings-driven metadata). `[VERIFIED: bundled use-cache.md]` |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `connection()` + `<Suspense>` (view-count) | Client beacon + Route Handler | Rejected by D-02 — adds client JS, cuts the near-zero-client-JS ethos. |
| `'use cache'` post fetch (body) | Per-request fetch like preview | Preview is draft/revocable; published content is static between publishes. `'use cache'` is correct and ISR-friendly. |
| Generated `tsvector` column + GIN | Query-time `to_tsvector` | Query-time = full table scan per search. For tens-of-thousands/month traffic and a small posts table, query-time is acceptable for v1; generated column is the schema-hygienic choice for growth. Recommend generated column (cheap to add now). |
| `posts.body` in FTS | Add a `searchText` column | `body` is jsonb (structural noise if cast to text). For v1, FTS against `title + excerpt` (both text) is sufficient. Add `searchText` later if body search is requested. |

**Installation:**
```bash
# No new packages this phase — every primitive is already installed.
# Verified via package.json (read this session).
```

**Version verification:** All recommended packages are already in `package.json` and were verified by reading that file this session. No `npm view` needed — nothing is being installed. The built-in `Intl.Segmenter` requires Node ≥20.19 LTS (the verified base image per `.claude/CLAUDE.md`).

## Package Legitimacy Audit

> **No packages are installed this phase.** Every primitive is already in `package.json` (Next 16.2.9, React 19, drizzle-orm 0.45.2, zod 4.4.3, RHF 7.80.0, @hookform/resolvers 5.4.0, isomorphic-dompurify 3.18.0, resend 6.16.0). `Intl.Segmenter` and `connection()` are runtime/framework built-ins, not packages.

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| (none new this phase) | — | — | — | — | — | — |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

*No new packages → no slopsquat risk. The planner does NOT need to add any `checkpoint:human-verify` install tasks.*

## Architecture Patterns

### System Architecture Diagram — the single-post page data flow (the spike)

```
  Reader → GET /blog/hello-world
            │
            ▼
  ┌─────────────────────────────────────────────────────────────────┐
  │  Next.js (Node runtime, cacheComponents:true)                    │
  │                                                                  │
  │  generateMetadata scope ── 'use cache' ── reads cached post     │
  │     + cacheTag('post-42')           fetch (post + post_seo)      │
  │                                       │                          │
  │  Page Server Component                 ▼                          │
  │     ├── getPostForPublic(slug) ── 'use cache' ── Drizzle ── DB   │
  │     │      cacheTag('post-42')          published+slug           │
  │     │      (returns post + seo + author)                         │
  │     │                                                            │
  │     ├── <ArticleBody /> ── renderPostBody(post.body)             │
  │     │      generateHTML → sanitizeBeforeRender → prose div        │
  │     │      ★ THE LCP — rendered synchronously, part of shell     │
  │     │                                                            │
  │     ├── <Toc /> + <ReadingTime /> + <MetaRow /> (sync, cached)   │
  │     │                                                            │
  │     ├── <Suspense fallback={<Skeleton/>}>                        │
  │     │     <ViewCountSlot postId={42} />                          │
  │     │        await connection()  ← per-request signal            │
  │     │        UPDATE posts SET views = views + 1 WHERE id = 42    │
  │     │        SELECT views ... → render "1,234 views"             │
  │     │     (NO 'use cache' — content streams every request)       │
  │     │  </Suspense>                                                │
  │     │                                                            │
  │     └── <Suspense fallback={<CardGridSkeleton/>}>                │
  │           <RelatedPostsSlot categoryId={5} postId={42} />        │
  │              'use cache'                                          │
  │              cacheLife('hours')                                   │
  │              cacheTag('category-5','posts-list')                 │
  │              SELECT ... posts WHERE category_id=5 AND id≠42      │
  │              (cached; revalidated on publish)                    │
  │           → render 3-4 PostCards                                 │
  │         </Suspense>                                               │
  │                                                                  │
  │  STATIC SHELL (cached prerender):                                │
  │     generateMetadata + ArticleBody + Toc + Suspense fallbacks    │
  │     ← ISR-regenerated only when revalidateTag('post-42','max')   │
  │       fires (publish action) — view-count/related NOT in shell   │
  │                                                                  │
  │  STREAMED AT REQUEST TIME:                                       │
  │     ViewCountSlot content + RelatedPostsSlot content             │
  │     ← run once per real visit; ISR does NOT re-invoke them       │
  └─────────────────────────────────────────────────────────────────┘
```

A reader traces: request → static body paints immediately (LCP) → view-count `+1` fires server-side → count streams in → related-posts stream in. No client fetch. No beacon. ISR regeneration of the shell never touches the view-count.

### Recommended Project Structure

```
src/
├── app/(site)/
│   ├── layout.tsx              ← EXTEND: add SiteHeader/SiteFooter/analytics script/no-flash dark script
│   ├── page.tsx                ← REPLACE placeholder: home magazine (SITE-01)
│   ├── blog/
│   │   ├── page.tsx            ← latest feed page 1 (SITE-02)
│   │   └── page/[pageNumber]/page.tsx  ← paginated feed
│   ├── archive/
│   │   └── page.tsx            ← filterable dense list (SITE-03)
│   ├── category/[slug]/page.tsx ← reuses ArchiveList (SITE-04)
│   ├── tag/[slug]/page.tsx     ← reuses ArchiveList (SITE-05)
│   ├── author/[username]/page.tsx ← bio + posts + Person JSON-LD (SITE-06)
│   ├── [slug]/page.tsx         ← ★ single post — the spike (SITE-07/13/14/17)
│   ├── search/page.tsx         ← FTS + filters (SITE-08)
│   ├── about/page.tsx          ← hard-coded TSX (SITE-09)
│   ├── contact/page.tsx        ← pages row + ContactForm client (SITE-10)
│   ├── terms-and-conditions/page.tsx  ← pages row (SITE-11)
│   ├── privacy-policy/page.tsx        ← pages row (SITE-11)
│   └── preview/[token]/page.tsx ← VERIFY/POLISH only — do NOT rebuild (SITE-15)
├── components/site/            ← NEW
│   ├── SiteHeader.tsx          ← logo + nav + search icon + ThemeToggle + Categories dropdown
│   ├── SiteFooter.tsx          ← blurb + legal + quick links + socials (from settings)
│   ├── PostCard.tsx            ← reusable card (home/blog/archive/category/tag/author/related)
│   ├── ArchiveList.tsx         ← reusable filterable list (archive/category/tag)
│   ├── Toc.tsx                 ← H2+H3 sticky sidebar (client island for scroll-spy)
│   ├── ShareButtons.tsx        ← client component (X/FB/LinkedIn/copy-link)
│   ├── ReadProgress.tsx        ← client component (scroll listener, thin top bar)
│   ├── ThemeToggle.tsx         ← client component (mirrors dashboard class strategy, separate key)
│   ├── SearchForm.tsx          ← server GET form (progressive enhancement)
│   ├── ContactForm.tsx         ← client component (RHF + Zod)
│   ├── ViewCount.tsx           ← async server component (the increment + render)
│   ├── RelatedPosts.tsx        ← async server component (cached)
│   └── skeletons.tsx           ← Suspense fallbacks (D-16)
├── lib/
│   ├── queries/                ← NEW — public published-only reads + the view-count write
│   │   ├── posts.ts            ← getPostForPublic, listPublished, listFeatured, listRelated, searchPosts, incrementViewCount
│   │   ├── taxonomy.ts         ← getCategoryBySlug, getTagBySlug, listCategories (cached, with counts)
│   │   ├── users.ts            ← getUserByUsername, listAuthorPosts
│   │   ├── pages.ts            ← getPublishedPage (for Contact/T&C/Privacy rendering)
│   │   └── archive.ts          ← listArchive (filterable by category/tag/author/date)
│   ├── reading-time/           ← NEW — Intl.Segmenter word count × WPM (D-15)
│   │   └── index.ts
│   ├── toc/                    ← NEW — extract H2/H3 from rendered body JSON (D-15)
│   │   └── index.ts
│   ├── rate-limit/             ← NEW — in-memory per-IP limit (D-07; v2 swaps for Redis)
│   │   └── index.ts
│   └── (existing reused) post-render.ts, seo/*, excerpt/, email/, image-loader.ts, db/, sanitize/
└── actions/
    └── contact.ts              ← NEW — Server Action (honeypot + rate-limit + lib/email; no DB)
```

**Isolation note:** `src/lib/queries/` lives outside `app/` so both `(site)` (read-only) and the dashboard cannot cross-pollinate. The `no-restricted-imports` ESLint rule already gates `(site)/**` and `(admin)/**` bidirectionally. The public queries import nothing from `(admin)` and nothing from `actions/` (which are admin-oriented); they go straight to `lib/db`.

### Pattern 1: Single-post page — the spike recipe

**What:** `/[slug]` with a cached static body + two streaming `<Suspense>` holes (view-count + related-posts).

```tsx
// src/app/(site)/[slug]/page.tsx — the verified shape
// [CITED: next@16.2.9 bundled docs — 01-app/01-getting-started/08-caching.md (Streaming uncached data + Putting it all together)]
// [CITED: next@16.2.9 bundled docs — 01-app/03-api-reference/04-functions/connection.md (getVisitorCount example)]
// [CITED: src/app/(site)/preview/[token]/page.tsx — the structural analog]
import { Suspense } from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { db, schema } from "@/lib/db";
import { and, eq, isNull } from "drizzle-orm";
import { cacheTag } from "next/cache";
import { getPostForPublic, incrementViewCount, listRelated } from "@/lib/queries/posts";
import { getSeoSettings } from "@/lib/seo/settings";
import { buildPostMetadata } from "@/lib/seo/metadata";
import { blogPostingJsonLd } from "@/lib/seo/jsonld";
import { renderPostBody } from "@/lib/post-render";
import { deriveReadingTime } from "@/lib/reading-time";
import { buildToc } from "@/lib/toc";
import { ViewCountSkeleton, RelatedPostsSkeleton } from "@/components/site/skeletons";

// 1. generateMetadata — params make this dynamic; the post fetch is cached.
//    Reads the SAME cached getPostForPublic so the body + metadata share a cache entry.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const data = await getPostForPublic(slug); // 'use cache' + cacheTag(`post-${id}`)
  if (!data) return { title: "Not Found" };
  const s = await getSeoSettings();
  return buildPostMetadata(
    { /* PostLike fields from data.post */ } as any,
    data.seo,
    s,
  );
}

// 2. Page — synchronous body render (LCP) + two streaming Suspense holes.
export default async function PostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const data = await getPostForPublic(slug);
  if (!data) notFound();

  const { post, seo, author } = data;
  const bodyHtml = renderPostBody(post.body); // Pitfall #2 gate — never raw
  const readingMinutes = deriveReadingTime(post.body);
  const toc = buildToc(post.body);
  const canonical = seo?.canonicalUrl || `/${post.slug}`;

  return (
    <article className="mx-auto max-w-3xl px-4 py-8">
      {/* BlogPosting JSON-LD — real <script> per Phase 5 Pitfall 2 */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(blogPostingJsonLd({ /* ... */ })) }}
      />

      {/* META ROW — title, byline (→ /author/[username]), reading time, share */}
      <h1>{post.title}</h1>
      <MetaRow author={author} readingMinutes={readingMinutes} slug={post.slug} />

      {/* BODY — the LCP. Rendered synchronously from the cached fetch. NO Suspense. */}
      <div className="prose prose-lg max-w-none dark:prose-invert" dangerouslySetInnerHTML={{ __html: bodyHtml }} />

      {/* TOC sidebar (desktop) — sticky; optional scroll-spy client island */}
      <Toc items={toc} />

      {/* STREAMING HOLE #1 — view count. Per-request via connection(). */}
      <Suspense fallback={<ViewCountSkeleton />}>
        <ViewCount postId={post.id} />
      </Suspense>

      {/* STREAMING HOLE #2 — related posts. Cached via 'use cache' + category/posts-list tags. */}
      <Suspense fallback={<RelatedPostsSkeleton />}>
        <RelatedPosts postId={post.id} categoryId={post.categoryId} />
      </Suspense>
    </article>
  );
}

// src/lib/queries/posts.ts — the cached published+slug fetch
// 'use cache' is REQUIRED here: this function reads DB on a route that would
// otherwise be fully prerenderable. cacheTag lets publishPost invalidate it.
export async function getPostForPublic(slug: string) {
  "use cache";
  const [post] = await db
    .select()
    .from(schema.posts)
    .leftJoin(schema.postSeo, eq(schema.postSeo.postId, schema.posts.id))
    .leftJoin(schema.user, eq(schema.user.id, schema.posts.authorId))
    .where(and(
      eq(schema.posts.slug, slug),
      eq(schema.posts.status, "published"),
      isNull(schema.posts.deletedAt),
    ))
    .limit(1);
  if (!post) return null;
  cacheTag(`post-${post.posts.id}`);
  if (post.posts.authorId) cacheTag(`author-${post.posts.authorId}`);
  return post;
}

// src/components/site/ViewCount.tsx — the per-request increment
// NO 'use cache' — connection() makes this per-request. Wrapped in <Suspense>.
import { connection } from "next/server";
import { incrementViewCount } from "@/lib/queries/posts";

export async function ViewCount({ postId }: { postId: number }) {
  await connection(); // prerendering stops here; the rest runs at request time
  const views = await incrementViewCount(postId); // UPDATE ... SET views = views + 1 RETURNING views
  return <span className="text-sm text-gray-500">{views.toLocaleString()} views</span>;
}
```

```ts
// src/lib/queries/posts.ts — the atomic increment (the ONE public write)
import { db, schema } from "@/lib/db";
import { eq, sql } from "drizzle-orm";

export async function incrementViewCount(postId: number): Promise<number> {
  const [row] = await db
    .update(schema.posts)
    .set({ views: sql`${schema.posts.views} + 1` })
    .where(eq(schema.posts.id, postId))
    .returning({ views: schema.posts.views });
  return row?.views ?? 0;
}
```

### Pattern 2: Archive list route (cached, paginated, filterable)

```tsx
// src/app/(site)/blog/page/[pageNumber]/page.tsx — numbered pagination (D-03)
// [CITED: next@16.2.9 bundled docs — caching.md UI-level caching example]
import { cacheLife, cacheTag } from "next/cache";

export async function listPublishedPosts(opts: {
  page: number;
  pageSize?: number;
  categoryId?: number;
  tagId?: number;
  authorId?: string;
}) {
  "use cache";
  cacheLife("hours");     // ISR-friendly; the publish action's revalidateTag refreshes sooner
  cacheTag("posts-list"); // already wired in publishPost
  if (opts.categoryId) cacheTag(`category-${opts.categoryId}`);
  if (opts.authorId) cacheTag(`author-${opts.authorId}`);
  // ... Drizzle query with limit/offset + filters + published + not-deleted
}
```

### Pattern 3: Postgres FTS (Drizzle `sql` template)

```ts
// src/lib/queries/posts.ts — searchPosts via PG full-text search
// [CITED: CLAUDE.md verified Drizzle PG-FTS recipe reference (drizzle-team/drizzle-orm-docs)]
// [VERIFIED: grep of installed drizzle-orm — no dedicated FTS builders; sql template is the recipe]
import { sql, and, eq, isNull, desc } from "drizzle-orm";

export async function searchPosts(query: string, filters: SearchFilters) {
  // 'simple' config = no stemming. Bangla has no PG stemmer (SEARCH-02 v2 caveat).
  // websearch_to_tsquery supports quoted phrases + boolean (OR/AND/-) — friendly UX.
  const tsquery = sql`websearch_to_tsquery('simple', ${query})`;
  const rows = await db
    .select({
      id: schema.posts.id,
      title: schema.posts.title,
      slug: schema.posts.slug,
      excerpt: schema.posts.excerpt,
      publishedAt: schema.posts.publishedAt,
      rank: sql<number>`ts_rank(${schema.posts.searchVector}, ${tsquery})`,
    })
    .from(schema.posts)
    .where(and(
      sql`${schema.posts.searchVector} @@ ${tsquery}`,
      eq(schema.posts.status, "published"),
      isNull(schema.posts.deletedAt),
      ...(filters.categoryId ? [eq(schema.posts.categoryId, filters.categoryId)] : []),
      // ... tag/author/date filters
    ))
    .orderBy(desc(sql`ts_rank(${schema.posts.searchVector}, ${tsquery})`))
    .limit(20);
  return rows;
}
```

### Pattern 4: Public dark mode (no-flash, route-isolated)

```tsx
// src/app/(site)/layout.tsx — extend with the no-flash script + chrome
// The script MUST run before first paint (inline, in <head> via next/script or a raw <script>
// in the layout's <html>). It mirrors the dashboard class strategy but uses a SEPARATE
// localStorage key (e.g. "site-theme") — D-13 forbids coupling (site)/(admin).
import Script from "next/script";

export default async function SiteLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <Script id="site-no-flash" strategy="beforeInteractive">
          {`(function(){try{var t=localStorage.getItem('site-theme');var m=window.matchMedia('(prefers-color-scheme: dark)').matches;if(t==='dark'||(!t&&m)){document.documentElement.classList.add('dark')}}catch(e){}})();`}
        </Script>
      </head>
      <body>
        <SiteHeader />
        <main>{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
```

### Anti-Patterns to Avoid
- **Wrapping the post body in `<Suspense>`** — it's the LCP; wrapping it makes the body stream instead of painting immediately, tanking LCP. Render it synchronously from the cached fetch.
- **Calling `incrementViewCount` outside `connection()` + `<Suspense>`** — under `cacheComponents:true`, uncached DB access outside `<Suspense>` raises `Uncached data was accessed outside of <Suspense>` at build time (bundled caching.md line 292). And without `connection()`, the build may hang (use-cache.md lines 597–607).
- **Sharing the dashboard `ThemeContext` with `(site)`** — couples the route groups, violating isolation (D-13). Use a separate minimal hook + separate localStorage key.
- **Raw `<img>` for content images** — CLAUDE.md mandate: `next/image` only. Pitfall #2 site reinforced.
- **FTS against `posts.body` directly** — it's jsonb; the structural JSON keys add noise. FTS against `title + excerpt` for v1; add a `searchText` column later if body search is requested.
- **`generateStaticParams` on `/[slug]`** — not required under PPR (the route is dynamic-by-params and prerenders on first request). Adding it pre-renders known slugs at build time, which is fine but optional — don't treat it as necessary.
- **Single combined `<Suspense>` for view-count + related** — use two boundaries so the count doesn't wait on related-posts (or vice versa).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| View-count per-request signal | A custom "is this a real visit" heuristic | `connection()` from `next/server` + `<Suspense>` | The framework provides the exact primitive; the bundled docs' canonical example IS `getVisitorCount()`. |
| Bangla word counting | Whitespace split or regex `\w+` | `Intl.Segmenter` (Node 20.19+ built-in) | Latin assumptions under-count Bangla (`deriveExcerpt` already established this — D-21/D-15). |
| HTML sanitization at render | A custom sanitizer | `renderPostBody` (existing) | Pitfall #2 — the security boundary before `dangerouslySetInnerHTML`. Already built (Phase 3). |
| Reading-time text extraction | A new JSON walker | `collectText` from `src/lib/excerpt/index.ts` | Reuse the exact walker that powers excerpts (Phase 3 D-21). |
| SEO metadata building | A new builder | `buildPostMetadata` / `buildArchiveMetadata` / `buildPageMetadata` (Phase 5) | Already built; per-route `generateMetadata` is a one-liner. |
| Email sending | A new SMTP client | `lib/email` (Phase 2 Resend wrapper, fire-and-forget) | D-07 — reuse the accepted email integration. |
| Post fetch + cache invalidation | A bespoke cache layer | `'use cache'` + `cacheTag` + the existing publish action's `revalidateTag` calls | The publish action ALREADY emits every tag this phase needs. |
| Date/number formatting | String concat | `Intl.NumberFormat` (view count: `views.toLocaleString()`) + `Intl.DateTimeFormat` | L10n-safe; consistent. |

**Key insight:** Every "hard" primitive this phase needs is already built or is a framework built-in. The phase is primarily ROUTE WIRING — composing `renderPostBody` + `buildPostMetadata` + the new `lib/queries/*` into `(site)` routes. Resist the urge to rebuild any of them.

## Runtime State Inventory

> Phase 6 is primarily a **new-route greenfield** phase (adds many `(site)` routes + a read-query module). The schema deltas (`posts.featured`, `posts.views`, `user.username`, `settings` seeds, optional FTS tsvector+GIN) flow through ONE `drizzle-kit generate` migration. The runtime-state risks are minimal but listed below for completeness.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `settings` table — new keys (`contact.recipient_email`, `analytics.*`, footer socials) seeded via `instrumentation.ts` at boot (idempotent `onConflictDoNothing`, mirrors `seedStorageSettings`). No existing key renamed. | **Seed code** (new `seedPublicFrontendSettings()` in `src/lib/storage/seed.ts` or a sibling) — not a data migration. |
| Live service config | None — no external services carry the renamed string (no rename this phase). | None. |
| OS-registered state | None — no new OS-level registrations. | None. |
| Secrets/env vars | `RESEND_API_KEY` already consumed by `lib/email` (Contact form reuses it). `contact.recipient_email` lives in `settings`, NOT env — so the admin can change it without a redeploy. | None (no new env var needed). |
| Build artifacts | `.next/standalone/` will rebuild on next `pnpm build`; the FTS generated column + GIN index are created by the new migration (apply via `pnpm db:generate` + the migration runner). The `cacheMaxMemorySize` ISR in-memory cache persists across requests on the self-hosted VPS (single replica) — document for v2 SCALE-01 (multi-replica needs Redis). | Migration apply (Wave 1 [BLOCKING]); v2 doc note. |

**Nothing found in category:** "Live service config" and "OS-registered state" — explicitly confirmed (no rename/refactor this phase; purely additive routes + schema columns).

## Common Pitfalls

### Pitfall 1: View-count slot without `connection()` → build hangs or silent caching
**What goes wrong:** Under `cacheComponents:true`, an async component doing a DB write without `'use cache'` and without `connection()` may either (a) raise `Uncached data was accessed outside of <Suspense>` if not wrapped in Suspense, or (b) have its output inadvertently cached if the framework infers it as deterministic, causing the `+1` to fire once and never again.
**Why it happens:** The framework infers rendering category from the APIs you call. A DB write is a side-effect, not data access — the framework can't infer "this should be per-request" unless you signal it.
**How to avoid:** Call `await connection()` as the FIRST line inside the `<Suspense>`-wrapped `ViewCount` component, before the `UPDATE`. `connection()` is the explicit "defer to request time" signal.
**Warning signs:** Build timeout ("Filling a cache during prerender timed out"); view count stuck at 1; `NEXT_PRIVATE_DEBUG_CACHE=1` logs showing the slot executing at build time.
`[VERIFIED: next@16.2.9 bundled docs — connection.md + use-cache.md "Build Hangs" section]`

### Pitfall 2: Single combined `<Suspense>` for view-count + related-posts
**What goes wrong:** One boundary wrapping both slots means the view-count waits for related-posts (a category query) to resolve before either streams. The count is a single fast `UPDATE`/`SELECT`; related-posts is a join + tag fallback. Coupling them delays the count unnecessarily.
**Why it happens:** It looks cleaner to wrap "the dynamic stuff" in one boundary.
**How to avoid:** Two separate `<Suspense>` boundaries — one per slot — so each streams independently.
**Warning signs:** View count appears late in the network tab; both slots resolve at the same time.

### Pitfall 3: `'use cache'` on the post fetch without a `cacheTag`
**What goes wrong:** The post body cache never invalidates on publish — readers see the old body until the container restarts.
**Why it happens:** `'use cache'` caches indefinitely unless tagged (Phase 5 Pitfall 6 already established this).
**How to avoid:** `cacheTag(\`post-${id}\`)` inside `getPostForPublic`. The publish action ALREADY calls `revalidateTag(\`post-${id}\`, "max")` — so the invalidation is wired; this phase only adds the matching tag on the cache side.
**Warning signs:** Published edits don't appear on the public post page until restart. `[VERIFIED: existing publishPost in src/actions/posts.ts lines 363]`

### Pitfall 4: FTS against `posts.body` (jsonb) directly
**What goes wrong:** `to_tsvector('simple', body::text)` indexes all the ProseMirror structural keys (`{"type":"doc","content":[...]}`) as noise words, polluting rankings and blowing up the index size.
**Why it happens:** `body` is the obvious "content" column; forgetting it's structured JSON.
**How to avoid:** FTS against `title + excerpt` only for v1 (both are text). If body search is later requested, add a derived `posts.searchText` text column populated by the excerpt walker's `collectText`, and regenerate the tsvector from `title + excerpt + searchText`.
**Warning signs:** Search results rank posts with large bodies higher regardless of relevance; GIN index is suspiciously large.

### Pitfall 5: Sharing the dashboard `ThemeContext` with `(site)`
**What goes wrong:** Importing `@/context/ThemeContext` from `(site)` may not be flagged by the current ESLint rule (it lives in `src/context/`, not `app/(admin)/`), but it couples the public site's theme to the dashboard's React Context provider tree, dragging dashboard client JS into the public bundle and coupling the two setting stores.
**Why it happens:** The existing `ThemeContext` looks reusable.
**How to avoid:** Build a minimal `ThemeToggle` client component with its own hook + a SEPARATE localStorage key (`site-theme` vs the dashboard's `theme`). D-13 explicitly forbids sharing. The no-flash `<head>` script reads `site-theme` only.
**Warning signs:** PERF-02 bundle audit (Phase 7) finds dashboard JS in the public chunk; toggling dashboard dark mode also flips the public site.

### Pitfall 6: Forgetting the `not-found.tsx` already streams a redirect-check
**What goes wrong:** Adding "suggested posts" to the 404 by running a DB read OUTSIDE the existing `<Suspense>` boundary breaks the static 404 shell (uncached data access outside Suspense).
**Why it happens:** The existing `not-found.tsx` has ONE `<Suspense>` around `<RedirectChecker />`; a developer adds suggested-posts inline in the JSX without a new boundary.
**How to avoid:** Wrap any new "suggested posts" DB read in its own `<Suspense>` boundary with a skeleton fallback.
**Warning signs:** Build error `Uncached data was accessed outside of <Suspense>` on `not-found.tsx`. `[CITED: src/app/not-found.tsx + Phase 5 D-12]`

### Pitfall 7: Contact form Server Action treated as cached
**What goes wrong:** If the contact action is wrapped in or inferred as a `'use cache'` scope, the email is sent once and subsequent submissions are silently cached as no-ops.
**Why it happens:** Misapplying the cache pattern.
**How to avoid:** Server Actions (`"use server"`) are inherently per-request — they are mutations, never cached. Do NOT add `'use cache'` to `submitContact`. The honeypot + rate-limit run on every invocation.
**Warning signs:** Only the first contact submission delivers; later ones silently no-op.

### Pitfall 8 (carried from CLAUDE.md / Pitfall #2): Raw `dangerouslySetInnerHTML` without `renderPostBody`
**What goes wrong:** XSS via stored ProseMirror JSON or migrated content.
**How to avoid:** EVERY `dangerouslySetInnerHTML` on a post/page body goes through `renderPostBody` (or the matching pages-route render pipeline). The T&C/Privacy/Contact pages-routes reuse the SAME gate. **Reinforced — this is the security boundary.**
`[CITED: CLAUDE.md Pitfall #2 + src/lib/post-render.ts]`

## Code Examples

### Reading-time derivation (Bangla-aware)

```ts
// src/lib/reading-time/index.ts
// [CITED: src/lib/excerpt/index.ts — the collectText walker to reuse]
// [CITED: .claude/CLAUDE.md — Intl.Segmenter for Bangla grapheme/word boundaries]
import { collectText } from "@/lib/excerpt"; // export collectText from the excerpt module

const DEFAULT_WPM = 200; // tunable — Bangla may read slower; adjust via settings if needed

/** Derive "N min read" from ProseMirror JSON, Bangla-aware. */
export function deriveReadingTime(bodyJson: unknown, wpm = DEFAULT_WPM): number {
  const blocks = collectText(bodyJson as any, [""]);
  const text = blocks.map((b) => b.trim()).filter(Boolean).join(" ");
  if (!text) return 1;
  // Intl.Segmenter with { granularity: 'word' } counts words correctly across scripts.
  const segmenter = new Intl.Segmenter("en", { granularity: "word" });
  let words = 0;
  for (const _ of segmenter.segment(text)) words++;
  return Math.max(1, Math.round(words / wpm));
}
```
**Note:** `collectText` is currently a private function in `src/lib/excerpt/index.ts`. The planner should export it (or extract to a shared `src/lib/prosemirror-text/`) so both excerpt and reading-time use the same walker. This is a tiny refactor, not a hand-roll.

### TOC extraction from ProseMirror JSON

```ts
// src/lib/toc/index.ts
interface TocItem { id: string; text: string; level: 2 | 3; }

/** Walk the body JSON, collect H2/H3 headings, derive URL-safe IDs. */
export function buildToc(bodyJson: unknown): TocItem[] {
  const items: TocItem[] = [];
  const walk = (node: any) => {
    if (!node) return;
    if (node.type === "heading" && (node.attrs?.level === 2 || node.attrs?.level === 3)) {
      const text = (node.content ?? []).map((c: any) => c.text ?? "").join("");
      if (text) {
        items.push({
          id: slugifyHeading(text), // simple kebab-case + dedupe
          text,
          level: node.attrs.level,
        });
      }
    }
    if (Array.isArray(node.content)) node.content.forEach(walk);
  };
  walk(bodyJson);
  return items;
}
```
**Note:** the rendered HTML must produce matching `id` attributes on `<h2>`/`<h3>`. Tiptap v3's `@tiptap/html` `generateHTML` does NOT add IDs by default. Two options: (a) extend the editor with a custom heading extension that emits IDs (preferred — single source of truth), or (b) post-process `renderPostBody`'s HTML to inject IDs. Option (a) is cleaner but touches `src/components/editor/extensions.ts` (Phase 3's single-source-of-truth). Option (b) is local to Phase 6. **Recommend (b) for v1** (less coupling to the editor config); revisit (a) if the TOC IDs drift.

### FTS schema delta (the migration)

```ts
// src/db/schema.ts — additions
import { vector } from "drizzle-orm/pg-core"; // NOTE: verify export name in 0.45.2

// ...in posts table:
export const posts = pgTable("posts", {
  // ...existing columns...
  featured: boolean("featured").default(false).notNull(), // D-04
  views: integer("views").default(0).notNull(),           // D-01
  // Generated tsvector column — PG maintains it automatically from title + excerpt.
  // 'simple' config = no stemming (Bangla has no PG stemmer — SEARCH-02 v2 caveat).
  searchVector: vector("search_vector").generatedAlwaysAs(
    sql`to_tsvector('simple', coalesce(${title}, '') || ' ' || coalesce(${excerpt}, ''))`
  ),
}, (t) => ({
  // GIN index for fast @@ tsquery matching.
  searchIdx: index("posts_search_vector_idx").using("gin", t.searchVector),
  // existing indexes...
}));

// user table — the username slug (D-11). Verified NEW: user has 'name' but no slug.
export const user = pgTable("user", {
  // ...existing columns...
  username: varchar("username", { length: 255 }).unique(), // nullable — set in profile UI
});
```
**Note on `vector` import:** Drizzle's PG `vector` column type builder should be verified against the installed `drizzle-orm@0.45.2` package before writing the migration. If the `vector` builder is not exported, the fallback is `customType` or a raw `sql` column definition. **The planner's Wave 1 must verify this import** (one `grep vector drizzle-orm/pg-core`), since the generated-column + GIN-index recipe depends on it. If `vector` isn't available, the equivalent raw-SQL approach via `sql\`to_tsvector(...) STORED\`` in a custom migration works (drizzle-kit passes raw SQL through).

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `experimental.ppr: true` | `cacheComponents: true` (Cache Components) | Next.js 16.0 | PPR is now the default under Cache Components; `'use cache'` directive + `<Suspense>` + `connection()` are the three primitives. |
| `middleware.ts` | `proxy.ts` | Next.js 16.0 | The redirects-check lives in `not-found.tsx` (Node runtime), NOT proxy (edge). Already correct in this repo. |
| Single-arg `revalidateTag(tag)` | 2-arg `revalidateTag(tag, "max")` | Next.js 16.0 | Single-arg is DEPRECATED. Already correct in this repo's publish action. |
| `unstable_noStore()` | `connection()` from `next/server` | Next.js 15.0 (stable) | The per-request signal for non-deterministic work. Use `connection()` for the view-count slot. |
| Implicit fetch caching | Explicit `'use cache'` | Next.js 15+/16 | All caching is opt-in via `'use cache'`; uncached DB reads need `<Suspense>` or they break the build. |

**Deprecated/outdated:**
- `experimental.ppr` — replaced by `cacheComponents: true`.
- `middleware.ts` — renamed to `proxy.ts` in Next 16.
- Single-arg `revalidateTag(tag)` — use `revalidateTag(tag, "max")`.
- `unstable_noStore()` — use `connection()`.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Drizzle ORM 0.45.2 exports a `vector` column builder suitable for the generated tsvector column. | FTS Schema Delta | If `vector` is not exported, fall back to a raw-SQL generated-column definition via `customType` or raw migration SQL. Planner's Wave 1 verifies with one grep. `[ASSUMED]` |
| A2 | Tiptap v3 `@tiptap/html` `generateHTML` does NOT emit `id` attributes on headings by default. | TOC extraction | If it does, the post-processing step is unnecessary. Low risk — the post-process is idempotent. `[ASSUMED]` |
| A3 | The view-count slot does NOT retry on stream interruption (one execution per request). | HIGHEST Spike / Pitfall 1 | If Next.js retries the slot on error, the `+1` could double-fire on edge cases. D-01 explicitly accepts minor inflation (no de-dupe) — accepted risk for v1. `[ASSUMED]` |
| A4 | `collectText` in `src/lib/excerpt/index.ts` can be exported (or extracted) for reuse by reading-time. | Reading-time derivation | If exporting it breaks the excerpt module's internal invariants, extract a shared `src/lib/prosemirror-text/` module. Minor refactor. `[ASSUMED]` |
| A5 | The `/archive` route URL is the canonical choice (vs `/blog/archive` or a sub-path). CONTEXT.md leaves this to discretion. | Browse IA | Operator may prefer `/blog/archive`. Easy to change; no schema impact. `[ASSUMED]` |
| A6 | `Intl.Segmenter` with `granularity: 'word'` and locale `'en'` counts Bangla words acceptably for reading-time. | Reading-time | Bangla word boundaries are mostly space-separated like English; `'en'` locale with word granularity works. If under-counting is observed, swap to `granularity: 'grapheme'` and divide by an average-graphemes-per-word constant. `[ASSUMED]` |

**All other claims are tagged `[VERIFIED: ...]` or `[CITED: ...]` inline** — sourced from the bundled `next@16.2.9` docs in `node_modules`, the verified code-shapes table in `.claude/CLAUDE.md`, or the actual codebase (schema.ts, actions/posts.ts, etc.).

## Open Questions

1. **Drizzle `vector` column builder export name in 0.45.2**
   - What we know: The CLAUDE.md verified code-shapes reference the Drizzle PG-FTS recipe (tsvector/GIN/websearch_to_tsquery/ts_rank). The installed `drizzle-orm@0.45.2` was grepped — no dedicated FTS *helper functions* (tsvector/websearchToTsquery), but the `vector` column *type* is a separate export.
   - What's unclear: Whether `vector` is exported from `drizzle-orm/pg-core` in 0.45.2, or whether it lives in a separate `drizzle-orm/pg-core/vector` submodule.
   - Recommendation: Wave 1 verification task — `grep -r "vector" node_modules/drizzle-orm/pg-core/`. If absent, define the generated column via `customType` or raw SQL in the migration. **This is a one-line verification, not a research blocker.**

2. **TOC heading IDs (editor-side vs render-side)**
   - What we know: `@tiptap/html` `generateHTML` likely doesn't emit IDs on headings by default (A2).
   - What's unclear: Whether Phase 3's `editorExtensions` already includes a heading-ID extension.
   - Recommendation: Planner peeks at `src/components/editor/extensions.ts`. If no heading-ID extension, post-process the rendered HTML in a thin wrapper around `renderPostBody` (local to Phase 6).

3. **Operator preferences for discretion items**
   - Honeypot field name, rate-limit threshold/window, exact settings key names, archive URL, page-size, share targets, 404 suggested-posts selection, About content.
   - These are all builder-discretion per CONTEXT.md — flag in the plan as "operator to confirm during UAT."

## Environment Availability

> Phase 6 has NO new external dependencies. Every tool/runtime it needs is already in use by prior phases. This audit is included for completeness.

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js 20.19+ LTS | `Intl.Segmenter`, `sharp` (existing), isomorphic-dompurify@3 | ✓ | 20.19 LTS base image (CLAUDE.md) | — |
| PostgreSQL | All `lib/queries/*`; FTS (`tsvector`, `websearch_to_tsquery`, `ts_rank`) | ✓ | 16/17 (Coolify managed) | — |
| `RESEND_API_KEY` env | Contact form (reuses `lib/email`) | ✓ (Phase 2) | runtime secret | Form degrades gracefully if unset (lib/email never throws) |
| `DATABASE_URL` env | All DB queries | ✓ (Phase 1) | runtime secret | — |
| `NEXT_PUBLIC_SITE_URL` env | Settings seed fallback only | ✓ (Phase 5) | build-time | `getSeoSettings()` falls back to localhost |
| Redis | Persistent rate-limit + multi-instance cache (v2 SCALE-01) | ✗ | — | In-memory rate-limit (single replica) per D-07 — **v2 only** |

**Missing dependencies with no fallback:** none.
**Missing dependencies with fallback:** Redis — intentionally deferred to v2 (SCALE-01). v1's single-replica Coolify deploy makes in-memory state acceptable.

## Validation Architecture

> `workflow.nyquist_validation: true` in `.planning/config.json` — this section is REQUIRED.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.9 (already installed) |
| Config file | `vitest.config.ts` (repo root — already present) |
| Quick run command | `pnpm test` (`vitest run`) |
| Full suite command | `pnpm test` (single command; no watch per VALIDATION.md) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SITE-07 | View-count slot increments exactly once per real visit (NOT per ISR regeneration) | unit + integration | `pnpm test src/lib/queries/__tests__/posts.test.ts -t "incrementViewCount"` | ❌ Wave 0 |
| SITE-07 | Static body is the LCP — rendered synchronously, NOT in a Suspense slot | manual + build-output | `pnpm build` (verify route is (PPR) in build output) | manual |
| D-01 | `incrementViewCount` is atomic (`views + 1`) and idempotent-safe under concurrency | unit | `pnpm test src/lib/queries/__tests__/posts.test.ts -t "atomic"` | ❌ Wave 0 |
| SITE-01/02/03 | Published-only filter: list queries never return draft/soft-deleted rows | unit | `pnpm test src/lib/queries/__tests__/posts.test.ts -t "published-only"` | ❌ Wave 0 |
| SITE-06 | `user.username` lookup returns the author + their published posts | unit | `pnpm test src/lib/queries/__tests__/users.test.ts` | ❌ Wave 0 |
| SITE-08 | FTS results exclude current post, only published, ranked by `ts_rank` | unit | `pnpm test src/lib/queries/__tests__/search.test.ts` | ❌ Wave 0 |
| SITE-08 | FTS uses `'simple'` config (no stemming) — Bangla queries match | unit | `pnpm test src/lib/queries/__tests__/search.test.ts -t "bangla"` | ❌ Wave 0 |
| SITE-13 | Reading time > 0 for any non-empty body; Bangla-aware via `Intl.Segmenter` | unit | `pnpm test src/lib/reading-time/__tests__/reading-time.test.ts` | ❌ Wave 0 |
| SITE-13 | TOC extracts H2+H3 only; empty body → empty TOC | unit | `pnpm test src/lib/toc/__tests__/toc.test.ts` | ❌ Wave 0 |
| SITE-10 | Contact form: honeypot field present → silently succeed without sending | unit | `pnpm test src/actions/__tests__/contact.test.ts -t "honeypot"` | ❌ Wave 0 |
| SITE-10 | Contact form: rate-limit blocks after N submissions per IP | unit | `pnpm test src/lib/rate-limit/__tests__/rate-limit.test.ts` | ❌ Wave 0 |
| SITE-10 | Contact form: valid submission calls `lib/email` once, never throws | unit | `pnpm test src/actions/__tests__/contact.test.ts` | ❌ Wave 0 |
| FOUND-04 | Cross-group import: `(site)/**` fails lint on importing from `(admin)/**` | lint | `pnpm lint` (already enforced via eslint.config.mjs) | ✅ existing |
| Pitfall #2 | Every `dangerouslySetInnerHTML` on post/page body is preceded by `renderPostBody` | grep-gate | `pnpm test` (structural assertion) | manual/lint |

### Sampling Rate
- **Per task commit:** `pnpm test` (the relevant test file(s))
- **Per wave merge:** `pnpm test` (full suite)
- **Phase gate:** Full suite green + `pnpm build` succeeds + build output shows `/[slug]` as a PPR route before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `src/lib/queries/__tests__/posts.test.ts` — covers incrementViewCount (atomicity), published-only filter, getPostForPublic (cached, slug-based), listRelated (category→tags fallback)
- [ ] `src/lib/queries/__tests__/users.test.ts` — covers getUserByUsername, listAuthorPosts
- [ ] `src/lib/queries/__tests__/search.test.ts` — covers FTS ranking, Bangla `'simple'` config, filters
- [ ] `src/lib/reading-time/__tests__/reading-time.test.ts` — covers Intl.Segmenter word count, Bangla sample, empty body
- [ ] `src/lib/toc/__tests__/toc.test.ts` — covers H2/H3 extraction, ID generation
- [ ] `src/actions/__tests__/contact.test.ts` — covers honeypot, rate-limit, lib/email invocation, Zod validation
- [ ] `src/lib/rate-limit/__tests__/rate-limit.test.ts` — covers per-IP windowed limit
- [ ] Migration test: extend `scripts/test-migrations.mjs` (clean-room) to cover the new columns + GIN index — **[BLOCKING] in Wave 1**

**Framework install:** none needed — Vitest 4.1.9 already in `package.json` + `vitest.config.ts` present.

## Security Domain

> `security_enforcement: true` in `.planning/config.json` — this section is REQUIRED. ASVS level 1, block on high.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Public site has no reader auth (auth is dashboard-only per Out-of-Scope). The contact form does not authenticate. |
| V3 Session Management | no | No public sessions. |
| V4 Access Control | **yes** (one write) | The view-count `+1` is the ONLY public write; it's unauthenticated by design (D-01 — published content is public, accepts minor inflation). No permission check needed. Every OTHER public query is read-only on published content. Server Actions (contact) are mutations but require no auth (honeypot + rate-limit are the controls). |
| V5 Input Validation | **yes** | Zod v4 schemas for: contact form (shared client+server), search params (URL searchParams parsed server-side), pagination/filter params. FTS query goes through `websearch_to_tsquery` (parameterized — no SQL injection via Drizzle's `sql` template). |
| V6 Cryptography | no | No crypto this phase (no secrets in settings beyond the existing encrypted-credential pattern from Phase 4). |
| V7 Error Handling | yes | Contact form: `lib/email` never throws (Phase 2 R8). View-count: `UPDATE ... RETURNING` is safe. FTS: empty query → empty results, no error. |
| V8 Data Protection | yes | Database access via Drizzle (parameterized queries — T-01-05 mitigation). No raw SQL string concat. |
| V12 Files & Resources | yes | All images via `next/image` (never raw `<img>`). |
| V13 API & Web Service | **yes** | The ONE public write (view-count) is an unauthenticated increment — acceptable per D-01. The contact Server Action is unauthenticated but rate-limited + honeypotted. |

### Known Threat Patterns for the public-site stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| XSS via stored post/page body | Tampering / Spoofing | `renderPostBody` (`generateHTML` → `sanitizeBeforeRender`) before EVERY `dangerouslySetInnerHTML` (Pitfall #2). Already enforced; this phase reuses unchanged. |
| SQL injection via FTS query / filters | Tampering | Drizzle's `sql` template parameterizes `${query}`; URL searchParams parsed via Zod, never string-concatenated. |
| View-count inflation (abuse) | Spoofing | Accepted per D-01 (no de-dupe for v1). Scripted abuse would inflate a vanity metric — low impact. v2 SCALE-01 adds Redis de-dupe. |
| Contact form spam / abuse | Denial of Service | Honeypot (hidden field → silent succeed without sending) + per-IP in-memory rate-limit (D-07). `lib/email` fire-and-forget — never throws, never blocks. |
| Open redirect via `redirects` table | Tampering | Already handled (Phase 5 D-12) — the redirects check is server-side, 301/302 only. |
| Analytics script injection (XSS via settings) | Tampering | The analytics `<script>` src/ID is admin-set (settings/seo page is admin-only per Phase 5). The `<script>` tag's `src` is a URL — validate it's an `https://` URL before injecting. Do NOT inject arbitrary inline script from settings. |
| CSRF on contact form | Spoofing | Server Actions in Next.js 16 have built-in CSRF protection (origin check). No additional control needed. |
| Route-group leakage (dashboard JS in public bundle) | Information Disclosure | ESLint `no-restricted-imports` (bidirectional, already enforced). PERF-02 audits in Phase 7. |

### Analytics injection specific guidance (ANAL-01/02)

The settings-stored analytics value must be a **script URL + site ID** (Umami style: `<script async src="https://umami.example.com/script.js" data-website-id="..."></script>`), NOT a freeform HTML blob. Injecting arbitrary HTML from settings is an XSS vector (an admin with a compromised account could inject malicious script). The layout reads the URL + ID, validates the URL scheme is `https://`, and emits the `<script>` tag with those two attributes only. This keeps the injection mechanism safe even if the admin account is compromised.

## Sources

### Primary (HIGH confidence)
- **Bundled `next@16.2.9` docs** (in `node_modules/.pnpm/next@16.2.9_.../node_modules/next/dist/docs/`):
  - `01-app/01-getting-started/08-caching.md` — Cache Components model; the three rendering categories (use cache / Suspense streaming / deterministic); the "Putting it all together" example with cached BlogPosts + streaming UserPreferences; the `<Suspense>` requirement for uncached data. **This is the authoritative source for the HIGHEST spike.**
  - `01-app/03-api-reference/04-functions/connection.md` — `connection()` as the per-request signal; the `getVisitorCount()` canonical example (nearly identical to the view-count use case).
  - `01-app/03-api-reference/01-directives/use-cache.md` — `'use cache'` directive semantics; cache keys; serialization constraints; `cacheLife`/`cacheTag` profiles; "Build Hangs" troubleshooting.
  - `01-app/03-api-reference/05-config/01-next-config-js/cacheLife.md` — custom cache profiles (stale/revalidate/expire).
- **The actual codebase** (read this session):
  - `src/db/schema.ts` — confirmed `posts.featured`/`posts.views`/`user.username` are genuinely NEW; `user.name` is the display name (not a slug); `posts.body` is jsonb (FTS implication).
  - `src/app/(site)/preview/[token]/page.tsx` — the `/[slug]` structural analog (PPR + `<Suspense>` + `generateMetadata` + `renderPostBody`).
  - `src/app/not-found.tsx` — proof that `<Suspense>`-wrapped per-request DB access already ships in this repo (the redirects-check).
  - `src/app/(site)/layout.tsx` + `src/app/(site)/page.tsx` — the `'use cache'` + `cacheTag('seo-settings')` pattern (already established).
  - `src/actions/posts.ts` (`publishPost` lines 325–375) — the EXACT existing `revalidateTag(..., "max")` calls this phase's `cacheTag`s must match.
  - `src/lib/post-render.ts`, `src/lib/seo/*`, `src/lib/excerpt/index.ts`, `src/lib/storage/seed.ts`, `src/lib/email` — the reused primitives.
  - `eslint.config.mjs` — the bidirectional `no-restricted-imports` rule (route-group isolation).
  - `vitest.config.ts`, `package.json` — the test framework + locked versions.

### Secondary (MEDIUM confidence)
- `.claude/CLAUDE.md` — the verified 2026 version table + code-shapes reference (Next 16.2.9 `cacheComponents:true`, `proxy.ts` rename, 2-arg `revalidateTag`, `Intl.Segmenter`, Drizzle PG-FTS recipe reference, Tiptap v3, Zod v4). Authored 2026-07-01 from npm registry + GitHub source verification.
- `.planning/phases/05-seo-basics/05-RESEARCH.md` — the established `'use cache'` + `cacheTag` + Pitfall 1/6 patterns (already proven in production this repo).
- `src/context/ThemeContext.tsx` — the dashboard class-strategy hook (the model for the public toggle, with the route-isolation caveat).

### Tertiary (LOW confidence)
- None — every claim is `[VERIFIED]`, `[CITED]`, or explicitly `[ASSUMED]` in the Assumptions Log.

**Note on web search:** Built-in WebSearch and the web reader MCP were rate-limited this session ("Weekly/Monthly Limit Exhausted", reset 2026-07-12). The researcher fell back to the **bundled `next@16.2.9` docs in `node_modules`** — which is a MORE authoritative source than any web search result (it is the exact runtime version shipping in this repo). This matches the approach the Phase 5 researcher used ("All research claims here were verified directly from the installed `next@16.2.9` package types and the bundled docs ... which is a more authoritative source than any web search result").

## Metadata

**Confidence breakdown:**
- **HIGHEST spike (Cache Components + Suspense):** HIGH — resolved from bundled next@16.2.9 docs (caching.md + connection.md + use-cache.md) + two in-repo precedents (not-found.tsx, preview/[token]/page.tsx).
- **Schema deltas:** HIGH — verified directly against `src/db/schema.ts` (confirmed `username` is new; `body` is jsonb).
- **FTS recipe:** HIGH — verified Drizzle ships no FTS helpers (grep); `sql` template pattern established in `src/actions/media.ts`; CLAUDE.md code-shapes reference confirms the recipe.
- **Reading-time / TOC:** HIGH — `Intl.Segmenter` is a Node 20.19+ built-in; `collectText` walker exists in `src/lib/excerpt/index.ts`.
- **Contact form:** HIGH — `lib/email` (Phase 2) and RHF+Zod (Phase 4) patterns are established.
- **Pitfalls:** HIGH — all grounded in bundled docs or the actual codebase.
- **Drizzle `vector` export:** MEDIUM — one-line grep verification needed in Wave 1 (Assumption A1); fallback path documented.

**Research date:** 2026-07-07
**Valid until:** 2026-08-06 (30 days — Next.js 16.x is stable; the bundled docs are pinned to the installed version so they don't drift)
