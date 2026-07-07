# Phase 6: Public Frontend - Context

**Gathered:** 2026-07-07
**Status:** Ready for planning

<domain>
## Phase Boundary

Readers can browse and consume the blog at maximum speed — home, feeds, archives, single posts, search, and marketing/legal pages — with the public site staying ISR/Cache Components-first and near-zero client JS, including the highest-complexity surface: the single-post page with a static Tiptap body streaming dynamic holes (view count + related posts). Phase 6 **consumes** the SEO engine (Phase 5 `lib/seo/*`), the render pipeline (`renderPostBody`), the redirects-check 404, and the already-wired publish revalidation — building the real public routes on top of them.

Concretely this phase delivers:

- **Browse routes (SITE-01/02/03)** — Home (magazine: featured hero + latest grid + 1–2 category teasers); `/blog` (full reverse-chronological paginated feed); a full filterable archive (dense list: category/tag/author/date-range filters via URL params + numbered pagination). Three distinct jobs: discover → read-latest → find.
- **Taxonomy + author archives (SITE-04/05/06)** — `/category/[slug]` + `/tag/[slug]` reuse the archive template pre-filtered by taxon (+ `BreadcrumbList` JSON-LD); `/author/[username]` full bio page (name + avatar + bio from AUTH-08) + their posts + `Person` JSON-LD; the single-post byline links to the author page.
- **Single-post page (SITE-07/13/14/17)** — centered prose body via `renderPostBody`; sticky TOC sidebar (H2+H3) on desktop / inline "On this page" on mobile; meta-row (reading time, date, author byline, share buttons); thin read-progress bar; **view count + related posts stream in `<Suspense>`** at the end — the view-count async component does the atomic `+1` server-side then renders the count. This is the HIGHEST-complexity research spike target.
- **Search (SITE-08)** — dedicated `/search` page: GET form + Postgres FTS ranked results, filters (category/tag/author/date-range) via URL searchParams; header search icon links to it.
- **Marketing/legal pages** — About (hard-coded TSX/MDX, SITE-09); Contact (dashboard-managed `pages` content + working form → `lib/email` (Resend), honeypot + in-memory rate-limit, email-only no DB, SITE-10); T&C + Privacy (dashboard-managed `pages`, SITE-11).
- **404 (SITE-12)** — redirects-check already wired (Phase 5 D-12); this phase styles a friendly 404 (suggested posts + search).
- **Preview (SITE-15)** — `/preview/[token]` already exists (Phase 3 D-19); verify/polish only — do NOT rebuild.
- **Public dark mode (SITE-16)** — system preference + header toggle (small client component + no-flash `<head>` script); mirrors the dashboard class strategy.
- **Analytics injection (ANAL-01/02)** — inject a `<script>` from `settings` (default Umami); the Umami instance itself deploys in Phase 7 (injection-only this phase).

**Out of scope:** performance/CWV pass + bundle-budget audit + production revalidation audit (Phase 7 — PERF-01/02/03); the Umami analytics instance deploy (Phase 7); backups (Phase 8); the redirects manager UI + menu builder (v2 — SETT-01/03; nav is hard-coded for v1); dynamic OG image generation (Phase 7+ fast-follow); comments / reader discussion (OOS); i18n routing (OOS).

**Boundary notes for the planner:**

- The **HIGHEST-confidence research flag** (Cache Components + `<Suspense>` boundary placement on `/[slug]`, `cacheLife`/`cacheTag` profiling) is the single most likely spike candidate — confirm before building all archive routes. **D-02** (server-side increment in the Suspense slot) shapes but does NOT resolve this; the researcher must verify the dynamic hole runs per-request under PPR without invalidating the static body cache, and that the increment fires once per real visit (not per ISR regeneration).
- A **new first-party read-query layer** is needed: existing actions (`listPosts`, `getPost`, `listCategories`, `listTags`, `listPages`) are admin-oriented; Phase 6 needs published-only, slug-based public fetches (single post + SEO, related-posts, author + their posts, archive + filters, FTS search). Likely a new `src/lib/queries/` (or `src/lib/site/`) module — all READ-ONLY for published content; the view-count `+1` is the only public write.
- SITE-15 (preview route) is **largely DONE** from Phase 3 — verify/polish, do not rebuild.

</domain>

<decisions>
## Implementation Decisions

### View-count path (SITE-07 streaming hole + SITE-17)
- **D-01 (Simple counter column):** Add a `views` integer column on `posts` (default 0); atomic `UPDATE posts SET views = views + 1`. **No de-dupe** — accepts minor inflation from refreshes/crawlers (acceptable for the tens-of-thousands/month traffic profile). Rejected the `post_views` de-dupe table (more write rows + aggregation overhead for a vanity metric) and the "derive from Umami API" option (couples display to analytics uptime; the Umami instance deploys in Phase 7 so display would slip).
- **D-02 (Server-side increment in the Suspense slot):** The view-count async component (the same dynamic hole that streams related-posts) does the atomic `+1` per real visit, then renders the count. Under PPR the static Tiptap body stays cached; only the streaming slot runs per request. **Zero client JS, no new endpoint.** Rejected the client-beacon + Route Handler alternative (adds a client fetch — a cut against the near-zero-client-JS ethos). Researcher must confirm `cacheLife`/`cacheTag` profile so the increment fires once per real visit (not per ISR regeneration, not double-counted per stream).

### Browse IA (SITE-01/02/03)
- **D-03 (Three distinct routes):** Home = magazine (featured hero + latest grid + 1–2 category teasers); `/blog` = full reverse-chronological paginated feed; Archive = dense filterable list. Three distinct jobs: discover → read-latest → find. Matches PROJECT.md's explicit "/blog feed vs full archive split". Rejected collapsing home+/blog (blurs the three-route intent) and folding /blog+archive (under-delivers SITE-03's "complete filterable archive"). **Pagination = classic URL-based page numbers** (ISR/SEO-friendly; no client fetching) across all list routes.
- **D-04 (Featured = manual flag):** Add a boolean `posts.featured` (default false); editors tick "Feature this" in the post editor. Home hero = most-recently-published featured post; grid mixes featured + latest. Gives editorial control so home's hero ≠ `/blog`'s first item. Rejected "latest N = featured" (home hero identical to /blog first item) and "flag + manual order" (more complexity than needed).

### Single-post page (SITE-07/13/14)
- **D-05 (Centered + sticky TOC sidebar):** Centered prose article (`renderPostBody`); sticky TOC sidebar on desktop built from H2/H3 headings (collapses to an inline "On this page" on mobile); share buttons + reading time in a meta row under the title; thin read-progress bar at top; view-count + related-posts stream in `<Suspense>` at the end. Active-section highlighting = a small optional client component (CSS-sticky otherwise). Rejected the inline-top TOC (no sidebar) and the rich-magazine + dual sticky rail (more client JS / scroll-spy).
- **D-06 (Related = same category, fallback to tags):** Primary = posts in the same category (latest-published first); if fewer than the slot count, fill with posts sharing the most tags; always exclude the current post; cap ~3–4. Rejected shared-tags-only (ignores the strong category signal) and combined-score (more query complexity for marginal gain).

### Contact form (SITE-10)
- **D-07 (Reuse `lib/email` / Resend):** Send via the existing Phase-2 `lib/email` wrapper (Resend) — one email integration, consistent with auth emails; destination = a fixed admin inbox from `settings` (key e.g. `contact.recipient_email`). The Phase-2 adoption is the precedent that resolves PROJECT.md's "no paid API" tension for email specifically. Rejected raw SMTP via `nodemailer` (deliverability burden for a small team; decouples from the proven path). Honeypot (hidden field) + per-IP **in-memory** rate-limit (single-instance v1; persistent limiting is a v2 scale concern consistent with the documented ISR cliff).
- **D-08 (Email-only, no DB storage):** Fire the email and store nothing — matches PROJECT.md's explicit "no DB storage" decision. Rejected the `contact_messages` dashboard-inbox table (resilience/archive convenience) as a deliberate scope-lean call. RHF + Zod (shared server-side) + a Server Action (fire-and-forget `lib/email`, which never throws).

### Search (SITE-08)
- **D-09 (Page-only, server-GET):** Dedicated `/search` page: GET form + server-rendered Postgres full-text ranked results (`tsvector` / `websearch_to_tsquery` / `ts_rank`); filters (category / tag / author / date-range) applied via URL searchParams. A header search icon links to `/search`. **No client autocomplete** — zero client JS, fully ISR/cacheable. Rejected the header autocomplete box (client component + API Route — cuts the perf ethos).

### Header & footer + nav (cross-cutting)
- **D-10 (Standard chrome):** Header = logo/site-title + nav (Home, Blog, **Categories dropdown** listing categories from the DB, About, Contact) + search icon + dark-mode toggle. Footer = short site blurb + legal links (T&C, Privacy) + quick links + optional social links (from `settings`). The Categories dropdown is a cached server-component fetch. **Nav is hard-coded for v1** (menu builder is v2 — SETT-01). Rejected the minimal/flat nav (no category discovery) — the dropdown is cheap and aids browse/SEO.

### Author page (SITE-06)
- **D-11 (Full bio page + username slug):** `/author/[username]` with a bio header (name + avatar + bio from AUTH-08) + their posts (cards, paginated) + `Person` JSON-LD (closes Phase 5 D-03 deferral); the single-post byline links here. **Adds a `username` slug column on `user`** (nullable, unique) + a dashboard profile field — Better Auth's `user.id` is a UUID (bad for a public URL). Researcher/planner verifies against `schema.ts` whether a reusable name/username field already exists before adding a new column.

### Archive filters (SITE-03)
- **D-12 (Top filter bar + numbered pagination):** A top filter bar — category (dropdown), tag (multi-select), author (dropdown), date-range — all applied via URL searchParams; classic numbered pagination (SEO-crawlable, ISR-friendly). Server-rendered; the tag multi-select can be a small progressive-enhancement client bit. Rejected the sidebar-facet layout (competes for horizontal space with the dense list).

### Public dark mode (SITE-16)
- **D-13 (System + header toggle):** Respect the OS preference by default + a small client-component toggle in the header (mirrors the dashboard's class strategy via `ThemeContext` or an equivalent minimal hook) + a no-flash inline `<head>` script that sets the `dark` class before first paint. Rejected system-only (no user override) and sharing-the-dashboard-setting (couples `(site)` and `(admin)`, cutting their isolation).

### Category/tag archives (SITE-04/05)
- **D-14 (Reuse archive template + BreadcrumbList):** `/category/[slug]` and `/tag/[slug]` reuse the main ArchiveList component, pre-filtered to the one taxon — consistent UX, less code. Inject `BreadcrumbList` JSON-LD (Home › Category/Tag) — closes the Phase 5 D-03 deferral alongside the per-route metadata.

### Reading time + TOC (SITE-13)
- **D-15 (Bangla-aware + H2/H3):** Reading time derived server-side from the body: word count via `Intl.Segmenter` (handles Bangla grapheme/word boundaries correctly — reuses the Phase 3 D-21 / Phase 5 D-10 Bangla-aware approach) × a tunable WPM constant (default ~200, adjustable for Bangla density); displayed "N min read". TOC = H2 + H3 (two levels), built from the rendered headings. Rejected naive whitespace word-count (Latin assumption under-counts Bangla reading time) and H2-only (too shallow for long-form).

### Empty / streaming states (cross-cutting)
- **D-16 (Skeletons + friendly empties):** Skeleton placeholders inside `<Suspense>` while view-count/related stream in; meaningful empty states ("No posts in this category yet" / "No results — try different terms"); a friendly 404 suggesting popular posts + the search box. Rejected spinners + plain text (less polish).

### Analytics (ANAL-01/02)
- **D-17 (Injection-only this phase):** Inject a `<script>` tag on the public site from a `settings`-stored script URL/ID (default Umami). GA4/Plausible are swappable by changing the settings value (decided at deploy). **The Umami instance itself deploys in Phase 7** (injection mechanism only this phase) — display of the view count is first-party (D-01), NOT analytics-dependent.

### Claude's Discretion
- Exact **`cacheLife`/`cacheTag` profile + Suspense boundary placement** on `/[slug]` (D-02 / the HIGHEST research flag — researcher confirms).
- The **public read-query module shape** (`src/lib/queries/` vs `src/lib/site/`) + exact published-only query signatures (integration point, no decision needed).
- Share targets (X/Facebook/LinkedIn/copy-link), read-progress bar mechanics, TOC active-state scroll-spy (D-05 — small client components).
- The **`username` generation/validation rules** + whether `user` already has a reusable slug field (D-11 — verify against `schema.ts`).
- Honeypot field name + rate-limit threshold/window (D-07); in-memory store shape.
- Exact **`settings` key names** (`contact.recipient_email`, the analytics script key, footer social-link keys) + seeds.
- Card aspect ratios, pagination page-size, the archive route's exact URL (`/archive` vs a `/blog` sub-path), "load more" vs numbered consistency (numbered is the default everywhere).
- The 404's "suggested posts" selection; empty-state copy; About page content (marketing — founder-authored at build time).

### Schema/seed deltas for Phase 6 (one migration via `drizzle-kit generate`)
- `posts.featured` — boolean, default false (D-04).
- `posts.views` — integer, default 0 (D-01).
- `user.username` — text, nullable, unique (D-11) — **verify first** whether `user` already has a reusable name/username field (Better Auth may provide one); avoid a redundant column.
- `settings` seeds — `contact.recipient_email`, the analytics script key (e.g. `analytics.script` / `analytics.umami_id`), footer social-link keys.
- **No new tables** (no `post_views`, no `contact_messages` per D-01/D-08).
- Clean-room migration test (`pnpm test:migrations`) catches drift — deferred to Phase 7 per PROJECT.md, but the deltas flow through `drizzle-kit generate` here.

### Folded Todos
None folded this phase.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project-level (stack + scope — authoritative)
- `CLAUDE.md` (repo root) — **"Performance requirements"** (ISR/PPR by default; PPR where pages mix static body + dynamic related; `next/image` only — never raw `<img>`; `revalidatePath`/`revalidateTag` on publish — no polling/rebuild; **no client-side data fetching on the public site for server-renderable content**; lean client JS); **"SEO requirements"** (generateMetadata per route sourced from `post_seo`/`settings`; redirects checked before 404; Bangla-aware validation); folder structure (the `(site)` route group, `components/site/`); "What NOT to do".
- `.claude/CLAUDE.md` — **verified 2026 version table + code shapes**: Next.js 16.2.9 (`cacheComponents:true` PPR; async `params`/`searchParams`; **2-arg `revalidateTag(tag, "max")`**; `proxy.ts`); React 19; **`Intl.Segmenter`** for Bangla word/grapheme counting; Zod v4.4.3 (shared client/server); drizzle-orm 0.45.2 pinned. Read before any dependency install or config.
- `.planning/PROJECT.md` — Core Value ("readers consume content at maximum speed — fast AND SEO-sound"); Key Decisions (pages table for legal/contact; About hard-coded; **Contact form → SMTP email, no DB storage, self-hosted, no paid API, honeypot + rate-limit**; `/blog` feed vs full archive split); Context (greenfield DB, growing traffic tens-of-thousands/month, small team 2–5, self-hosted/no-paid-API ethos).

### Phase-6-specific (requirements + roadmap)
- `.planning/REQUIREMENTS.md` — **SITE-01..17, ANAL-01..02** (the 19 requirements this phase must satisfy), plus Out-of-Scope rows (no comments, no i18n routing, no paid APIs, no Vercel tooling, no reader auth).
- `.planning/ROADMAP.md` §"Phase 6: Public Frontend" — goal, **5 success criteria**, **pitfalls owned** (#3 publish→visible verified on the real stack in Phase 7; #2 reinforced — re-sanitize at render before any `dangerouslySetInnerHTML`; cross-group leakage forbidden), **research flag (HIGHEST)**: Cache Components + `<Suspense>` boundary placement on `/[slug]` is the single most likely spike candidate; confirm `cacheLife`/`cacheTag` profile + Suspense placement for related-posts/view-count before building all archive routes.

### Prior-phase context (carries forward — DO NOT re-plan)
- `.planning/phases/03-content-engine/03-CONTEXT.md` — **D-19** (`/preview/[token]` already exists → **SITE-15 largely done**), **D-21** (`src/lib/excerpt` Bangla-aware → model for reading-time + meta), **D-25** (publish action ALREADY revalidates `/`, `/blog`, `/blog/[slug]`, category/tag/author archives, `/sitemap.xml`, `/rss.xml` — Phase 6 builds the targets), **CONT-03** (the `renderPostBody` SSR pipeline — reused for the post body).
- `.planning/phases/04-dashboard-chrome/04-CONTEXT.md` — **D-17** (T&C/Privacy/Contact seeded as `pages` rows → **SITE-11 content exists**), **D-19** (Contact **form** behavior deferred to here → SITE-10), **D-28** (`QueryClient` scoped to `(admin)` only → public site stays free of TanStack Query JS).
- `.planning/phases/05-seo-basics/05-CONTEXT.md` — **D-01** (`lib/seo/*` builders consumed per-route — Phase 6's `generateMetadata` is a one-liner), **D-03** (`BreadcrumbList` + `Person` author JSON-LD **deferred to Phase 6** — landed here in D-11/D-14), **D-05** (sitemap structured to extend with archive entries — Phase 6 adds category/tag/author archive entries), **D-09** (static OG fallback chain — no dynamic OG in v1), **D-12** (redirects-check wired into `not-found.tsx`), the `(site)` routes that exist (layout/page/preview only).

### Code (current state — scout-verified)
- `src/lib/post-render.ts` — `renderPostBody(bodyJson)` = `generateHTML` → `sanitizeBeforeRender`. The render contract for EVERY public/preview post body (Pitfall #2 site #2 — the security boundary before `dangerouslySetInnerHTML`). Reused unchanged.
- `src/lib/seo/metadata.ts` + `jsonld.ts` + `settings.ts` + `validation.ts` — `buildPostMetadata`, `buildArchiveMetadata`, `buildPageMetadata`, `buildSiteMetadata`; `blogPostingJsonLd`, `websiteJsonLd`, `organizationJsonLd`; cached `getSeoSettings()`; Bangla-aware meta validation. Consumed by Phase 6's per-route `generateMetadata` + JSON-LD injection.
- `src/lib/excerpt/` — Bangla-aware excerpt utility (Phase 3 D-21) — the model for the reading-time derivation (D-15).
- `src/lib/sanitize/`, `src/lib/image-loader.ts` (`cdnImageLoader`), `src/lib/email` (Phase-2 Resend wrapper — reused for the Contact form, D-07), `src/lib/permissions`, `src/lib/db` (`db, schema`).
- `src/actions/{posts,categories,tags,pages,media,settings}.ts` — admin-oriented `listPosts`/`getPost`/`listCategories`/`listTags`/`listPages`/`getPage` exist; **public published+slug reads are NEW this phase** (the `src/lib/queries/` integration point).
- `src/app/(site)/{layout.tsx,page.tsx,preview/[token]/page.tsx}` — existing; **layout is skeletal** (`<main>{children}</main>` only — no header/footer yet; already has `dark:` classes + site-wide JSON-LD); `page.tsx` is a placeholder; `preview/[token]` is the closest `/[slug]` analog (PPR `<Suspense>` + `generateMetadata` via `buildPostMetadata` + `renderPostBody` + `prose` classes — the template for the single-post page).
- `src/app/{sitemap.ts,robots.ts,rss.xml/route.ts,not-found.tsx}` — all done (Phase 5); Phase 6 extends the sitemap with archive entries (Phase 5 D-05) and styles the 404.
- `src/db/schema.ts` — `posts`, `postSeo`, `categories`, `tags`, `postTags`, `pages`, `settings`, `user`. **No `views`/`featured`/`username` columns yet** (added this phase — D-01/D-04/D-11); `user.id` is `text` UUID (why D-11 adds `username`).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`src/lib/post-render.ts` → `renderPostBody`** — the post body SSR pipeline (generateHTML → sanitizeBeforeRender); reused unchanged for the `/[slug]` body (Pitfall #2 site #2 — never raw `dangerouslySetInnerHTML`).
- **`src/lib/seo/*`** — per-route `generateMetadata` becomes a one-liner (`buildPostMetadata`/`buildArchiveMetadata`/`buildPageMetadata`); JSON-LD builders (`blogPostingJsonLd`, + the new `Person`/`BreadcrumbList` to add); cached `getSeoSettings()`.
- **`src/lib/excerpt/`** (Bangla-aware) — the model for reading-time derivation (D-15).
- **`src/lib/image-loader.ts` + `next.config.ts images.remotePatterns`** — feature/card/hero/OG images resolve unchanged.
- **`src/lib/email`** (Phase-2 Resend wrapper, fire-and-forget, never throws) — Contact form delivery (D-07).
- **`src/app/(site)/preview/[token]/page.tsx`** — the PPR `<Suspense>` + `generateMetadata` + `renderPostBody` pattern template for `/[slug]`.
- **Tailwind `prose` classes** (already used in the preview route) — post body typography.
- **`ThemeContext`** (Phase 1) — the class-strategy hook the public dark-mode toggle mirrors (D-13).

### Established Patterns
- **PPR under `cacheComponents:true`** — static shell + `<Suspense>` for dynamic holes; `'use cache'` for settings-driven `generateMetadata`; `params`-routes are dynamic-by-default (no `'use cache'` needed). This is the single-post page pattern (D-02/D-05).
- **Server Components by default in `(site)`**; `"use client"` only for genuine interactivity (dark toggle, share/progress, tag multi-select, contact form) — keep minimal per the perf bar.
- **Server Actions + shared Zod** (contact form, D-08); read-only public queries need NO permission checks (published content is public); the view-count `+1` is the only public write.
- **ESLint `no-restricted-imports`** keeps `(site)`/`(admin)` isolated; the new `lib/queries` + `components/site` live outside `app/` or strictly under `(site)` so no dashboard JS leaks the public bundle (PERF-02 audits in Phase 7).
- **`next/image` only** (never raw `<img>`); **`renderPostBody` before any `dangerouslySetInnerHTML`** (Pitfall #2 reinforced).
- **pnpm-only; migrations via `drizzle-kit generate`** (never hand-write SQL) — the `posts.featured`/`posts.views`/`user.username` deltas + `settings` seeds flow through the same pipeline.

### Integration Points
- **New `src/components/site/`** — `SiteHeader`, `SiteFooter`, `PostCard`, `ArchiveList` (reused by `/category` + `/tag`), `Toc`, `ShareButtons`, `ReadProgress`, `SearchForm`, `ContactForm`, `ThemeToggle`, skeletons.
- **New public read-query module** (`src/lib/queries/` or `src/lib/site/`) — published+slug fetches, related-posts (D-06), author + their posts, archive + filters, FTS search, view-count increment (D-02).
- **New `(site)` routes:** `[slug]/page.tsx`, `blog/page.tsx` (+ `page/[n]` pagination), the archive route, `category/[slug]`, `tag/[slug]`, `author/[username]`, `search/page.tsx`, `about/page.tsx`, `contact/page.tsx`, terms + privacy (fixed routes rendering the dashboard-managed `pages` rows).
- **Extended schema:** `posts.featured`, `posts.views`, `user.username`, `settings` seeds (one migration).
- **Analytics `<script>` injection** on `(site)/layout.tsx` (or a dedicated component reading `settings`).
- **Sitemap extension** — add category/tag/author archive entries (Phase 5 D-05 structured this for extension).

</code_context>

<specifics>
## Specific Ideas

- The founder consistently chose the **recommended (perf-bar-aligned, lean, reader-friendly) option across all 12 areas** — the implementation should default to minimal-client-JS, server-rendered, ISR-friendly patterns; reserve client components for genuine interactivity (dark toggle, share/progress, tag multi-select, contact form).
- **Editorial control over the home hero** (D-03 + D-04) — the founder wants the hero to be a curated featured post, not just the latest. The `featured` flag + magazine layout reflect this.
- **Reader-maximum-reach + no-paid-API ethos** — D-07 (reuse Resend as the accepted precedent for email; the founder treats the Phase-2 adoption as resolving the "no paid API" tension for email specifically) and D-08 (email-only, no DB — scope-lean).
- **Bangla-awareness carries through** — reading time via `Intl.Segmenter` (D-15), consistent with the excerpt (Phase 3 D-21) and meta-validation (Phase 5 D-10) decisions. Bangla is the actual content language; Latin assumptions are rejected where they'd under-serve it.
- **No aesthetic/branding references** (branding deferred per PROJECT.md) — these decisions are UX/behavior/scope/security choices (D-01..D-17), not look-and-feel.

</specifics>

<deferred>
## Deferred Ideas

- **Dynamic branded OG image generation → Phase 7+ fast-follow** (Phase 5 D-09) — a Route Handler rendering post title + site name → PNG via `satori` + `@resvg/resvg-js`.
- **Umami analytics instance deploy + GA4/Plausible swap decision → Phase 7** (ANAL-02 "decided at deploy"). This phase ships the injection mechanism only (D-17).
- **Persistent (Redis-backed) rate limiting + multi-instance view-count dedupe → v2 (SCALE-01)** — needed before a second Coolify replica. v1 uses in-memory rate-limit + no view-count de-dupe (D-01/D-07).
- **Production CWV/bundle-budget pass + publish→visible audit → Phase 7** (PERF-01/02/03). Phase 6 wires the routes + Suspense; Phase 7 verifies on the real Coolify/Cloudflare stack.
- **Menu builder + redirects manager UI → v2** (SETT-01/03). Nav is hard-coded for v1 (D-10); the redirects table ships empty and is filled later without a code change.
- **Comments / reader discussion → Out of Scope** (brand name only).

### Reviewed Todos (not folded)
- **"Configurable multi-destination backup system"** (pending todo, area: database, matched Phase 6 with score 0.6) — **reviewed, NOT folded.** False-positive keyword overlap. Already mutated into **Phase 8 — Backup & Disaster Recovery** (BACKUP-01..05) via the 2026-07-02 roadmap update; unrelated to the Public Frontend. Reviewed-and-not-folded in Phases 1, 2, 3, 4, 5, and now 6. See `.planning/todos/pending/2026-06-30-configurable-multi-destination-backup-system.md`.

</deferred>

---

*Phase: 6-Public Frontend*
*Context gathered: 2026-07-07*
