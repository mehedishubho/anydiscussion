---
phase: 05-seo-basics
verified: 2026-07-07T04:30:00Z
status: human_needed
score: 5/5 must-haves verified at Phase 5 scope (1 sub-item deferred to Phase 6 per D-01)
behavior_unverified: 2
overrides_applied: 0
re_verification:
  previous_status: none
  previous_score: N/A
  gaps_closed: []
  gaps_remaining: []
  regressions: []
deferred:
  - truth: "A published post page injects valid BlogPosting JSON-LD structured data (SC-3, per-post route)"
    addressed_in: "Phase 6 — Public Frontend (SITE-07)"
    evidence: "Phase 6 goal: 'single post (Cache Components + Suspense)'; SITE-07 = 'Single post page'. Phase 5 ships the blogPostingJsonLd builder + site-wide WebSite/Organization JSON-LD per D-01; the per-post /[slug] route that would render BlogPosting is Phase 6's scope."
behavior_unverified_items:
  - truth: "Settings changes become visible on the public site without a container restart (the cacheTag ↔ revalidateTag wiring)."
    test: "Edit /dashboard/settings/seo as admin (change site title), save, then reload / in a browser."
    expected: "The new <title> and JSON-LD render on the next request — no restart needed. Proves revalidateTag('seo-settings','max') actually invalidates the getSeoSettings 'use cache' snapshot."
    why_human: "The 2-arg revalidateTag call is asserted in seo-settings.test.ts, but the actual cache-invalidation behavior at runtime is not exercised by any test. presence of the calls + unit test of the call shape cannot prove the cache refreshes end-to-end."
  - truth: "app/not-found.tsx falls through to the 404 UI (does NOT crash) when the redirects table is missing or the lookup throws."
    test: "Visit an unmatched path on a fresh environment without the redirects migration applied; then visit one with the table present but empty."
    expected: "Both render the static 404 UI — the try/catch in RedirectChecker swallows the error and the component returns null."
    why_human: "The graceful-degradation try/catch is present in code, but the actual runtime behavior (missing table vs. empty table vs. valid header) across environments is a state-dependent path no test exercises."
human_verification:
  - test: "Run `pnpm dev`, open http://localhost:3000/ in a browser, view page source."
    expected: "`<title>Any Discussion</title>` (or the seeded site.title) is present; two `<script type='application/ld+json'>` tags appear in the body — one WebSite (with potentialAction SearchAction), one Organization. Confirms SC-1 at the runtime-HTML level."
    why_human: "generateMetadata + JSON-LD builders are unit-tested and the build registers the route, but the actual streamed HTML output is a runtime behavior grep/build cannot observe."
  - test: "With at least one published post + page in the DB, curl http://localhost:3000/sitemap.xml and http://localhost:3000/rss.xml and http://localhost:3000/robots.txt."
    expected: "sitemap.xml lists home (priority 1.0/daily) + the post (/blog/{slug}, 0.8/weekly) + the page (/{slug}, 0.5/monthly); no draft or soft-deleted rows. rss.xml returns application/rss+xml with one <item> per published post (full-text body in CDATA). robots.txt shows the allow/disallow list + sitemap pointer."
    why_human: "The SQL filters (status='published' AND deletedAt IS NULL) are unit-tested with fixtures, but the actual DB query against real rows + the rendered XML output is a runtime check."
  - test: "As an editor, create a post filling the four SEO panel fields (meta title, meta description, canonical URL, OG image), save, then inspect the post_seo row in the DB."
    expected: "The post_seo row exists with the four fields populated (grapheme-valid inputs persist; grapheme-invalid inputs are logged and skipped without failing the save)."
    why_human: "The upsertPostSeo safeParse logic is in code, but the live editor → DB row flow is a user-flow check."
  - test: "As an admin, open /dashboard/settings/seo, edit the five fields, save, then reload / in a browser."
    expected: "The home page <title> and JSON-LD update on the next request (the cacheTag invalidation works at runtime). Also covers behavior_unverified_items[0]."
    why_human: "Build passes + the 2-arg revalidateTag call is asserted, but the actual cache-invalidation behavior end-to-end is a runtime invariant."
  - test: "Visit an unmatched path (e.g. /nonexistent) on a running dev server; confirm the 404 UI renders. Then visit a path with a redirects row populated (manually insert one) and confirm the redirect fires."
    expected: "Empty redirects table → 404 UI renders (no crash). Populated row → permanentRedirect/redirect fires for the configured newPath."
    why_human: "Redirects table ships empty in v1; the x-invoke-path header + DB lookup + redirect behavior is a runtime path. Also covers behavior_unverified_items[1]."
---

# Phase 5: SEO Basics — Verification Report

**Phase Goal:** Every public-facing route emits accurate, source-of-truth metadata so posts are indexable, shareable, and canonical-correct — sourced from `post_seo`/`settings`, including Bangla-aware validation and an RSS feed.
**Verified:** 2026-07-07T04:30:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Scope Boundary (D-01 — read this before reading SC-3 as a gap)

Per the locked decision D-01, Phase 5 ships the SEO **engine + wiring on EXISTING `(site)` routes only** (site-wide layout + home + preview). The live per-post detail route (`/[slug]`) that would render `blogPostingJsonLd` + per-post `buildPostMetadata` is **Phase 6's scope (SITE-07)**. Therefore:

- **SC-1** is met at the helper + existing-route level this phase (site-wide + home + preview). The preview route IS a per-post-metadata route wired this phase, proving the helper works on a real Next.js route.
- **SC-3** (BlogPosting JSON-LD): the **builder** is verified + unit-tested; site-wide JSON-LD (WebSite + Organization) is rendered on the layout. BlogPosting injection on the individual post route is **deferred to Phase 6** — see the `deferred` section. This is NOT a gap.

## Goal Achievement

### Observable Truths (the 5 ROADMAP Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Each public route produces correct `<title>`, meta description, canonical, OG/Twitter via `generateMetadata` from `post_seo`/`settings` (canonical_url override else slug-derived). | ✓ VERIFIED (scope: existing routes per D-01) | `buildPostMetadata` (metadata.ts L85-121) resolves title/description/canonical (D-04 override)/ogImage (D-09 fallback)/openGraph.type="article"/twitter card — 30 unit assertions pass. `buildSiteMetadata` returns metadataBase + title template + OG type "website". Wiring: (site)/layout.tsx + (site)/page.tsx + (site)/preview/[token]/page.tsx each export async `generateMetadata` calling `getSeoSettings()` + the builders. Build passes under `cacheComponents:true` (landmine #4 cleared — 'use cache' correctly placed). Runtime HTML inspection is a human item (see Human Verification). |
| 2 | `/sitemap.xml` lists every published post + managed page (per-type priority/changefreq); `/robots.txt` correct; both update via revalidation, not full rebuild. | ✓ VERIFIED | sitemap.ts (L34-61): queries published posts + pages (status='published' AND deletedAt IS NULL), returns [home (1.0/daily), ...posts (0.8/weekly), ...pages (0.5/monthly)]; pure helpers extracted. robots.ts (L23-33): userAgent '*', allow '/', disallow ['/preview/','/dashboard/','/signin','/signup','/forgot-password'], sitemap pointer. D-13 carry-forward confirmed: posts.ts L358-359 call `revalidatePath('/sitemap.xml')` + `revalidatePath('/rss.xml')` in publishPost; settings.ts L124-127 adds `/robots.txt`. 14 sitemap/robots unit tests pass. Build registers /sitemap.xml (ƒ Dynamic), /robots.txt (○ Static 15m revalidate). |
| 3 | Published post page injects valid `BlogPosting` JSON-LD. | ✓ VERIFIED (builder + site-wide JSON-LD) — per-post route DEFERRED to Phase 6 per D-01 | `blogPostingJsonLd` (jsonld.ts L52-77) returns correct schema.org shape (@context, @type BlogPosting, headline, datePublished ISO 8601, author Person, publisher Organization, mainEntityOfPage WebPage @id). 16 jsonld unit assertions pass. Site-wide JSON-LD rendered on (site)/layout.tsx via real `<script type="application/ld+json" dangerouslySetInnerHTML>` (WebSite + Organization — Pitfall 2 mitigation). **Per-post BlogPosting injection on /[slug] is Phase 6 SITE-07** — see deferred section. |
| 4 | Long Bangla meta description passes validation via byte/reasonable-char (grapheme) rule, not Latin limit. | ✓ VERIFIED (behaviorally proven) | validation.ts: `graphemeCount` uses `Intl.Segmenter(locale, {granularity:"grapheme"})` (L35-38); `seoMetaSchema` (L44-63) applies `.max()` byte/code-unit ceilings + grapheme `refine` (title ≤80, desc ≤200). validation.test.ts L44: "PASS: 59-grapheme Bangla metaDescription is accepted"; L60: "FAIL: 250-grapheme Latin metaDescription is rejected by the grapheme refine". 11 validation tests pass — this is the one truth with full behavioral evidence. |
| 5 | RSS feed at `/rss.xml` publishes latest posts. | ✓ VERIFIED | rss.xml/route.ts (L33-86): `GET()` returns `Response` with `Content-Type: application/rss+xml; charset=utf-8`, RSS 2.0 XML with `<rss>`/`<channel>`/`<title>`/`<link>`/`<description>` + one `<item>` per latest published post. Each item: title, link, guid (isPermaLink), description, content:encoded (CDATA-wrapped `renderPostBody`), pubDate (RFC-822). `escapeXml` covers 5 special chars (T-05-04). RSS_LIMIT=30 cap with defensive slice. 14 RSS unit tests pass. Build registers /rss.xml (ƒ Dynamic). |

**Score:** 5/5 truths verified at Phase 5 scope (1 sub-item deferred to Phase 6 per D-01; 2 behavior-unverified invariants routed to human verification).

### Deferred Items

| # | Item | Addressed In | Evidence |
|---|------|-------------|----------|
| 1 | SC-3 per-post: BlogPosting JSON-LD injection on the `/[slug]` published-post route | Phase 6 — Public Frontend (SITE-07) | Phase 6 goal explicitly names "single post (Cache Components + Suspense)"; SITE-07 = "Single post page". Phase 5 ships the `blogPostingJsonLd` builder + the site-wide WebSite/Organization JSON-LD (verified above); the per-post route is Phase 6's scope per D-01. The P5↔P6 seam is documented in 05-01-PLAN key_links. |

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/lib/seo/metadata.ts` | buildPostMetadata, buildPageMetadata, buildArchiveMetadata, buildSiteMetadata + interfaces | ✓ VERIFIED | All 4 builders exported (L85, L127, L149, L178); PostLike/PostSeoLike/PageLike/SeoSettings/ArchiveMetadataInput interfaces defined. |
| `src/lib/seo/jsonld.ts` | blogPostingJsonLd, websiteJsonLd, organizationJsonLd | ✓ VERIFIED | All 3 builders exported (L52, L84, L104); plain schema.org objects, consumer JSON.stringify's. |
| `src/lib/seo/validation.ts` | seoMetaSchema, graphemeCount, TITLE_MAX_GRAPHEMES, DESC_MAX_GRAPHEMES | ✓ VERIFIED | All exported (L18, L21, L35, L44); Intl.Segmenter-based; 80/200 grapheme limits per D-10. |
| `src/lib/seo/settings.ts` | getSeoSettings with 'use cache' + cacheTag('seo-settings') | ✓ VERIFIED | L60-83: `"use cache"` directive (L61) + `cacheTag("seo-settings")` (L62); reads 5 keys with NEXT_PUBLIC_SITE_URL fallback. First Cache Components cached reader in repo. |
| `src/db/schema.ts` | `redirects` pgTable (oldPath/newPath/statusCode/createdAt/updatedAt) | ✓ VERIFIED | L154-164: columns match spec; unique on old_path; ships empty per D-12. |
| `src/db/migrations/0004_gigantic_black_tom.sql` | CREATE TABLE redirects DDL | ✓ VERIFIED | 9-line migration with old_path/new_path/status_code/created_at/updated_at + unique constraint. Generated by `pnpm db:generate` (not hand-written). |
| `src/lib/storage/seed.ts` | seedSeoSettings seeding the 5 D-11 keys | ✓ VERIFIED | L79-: seedSeoSettings() inserts site.title, site.description, seo.default_og_image, site.canonical_base_url, seo.twitter_handle idempotently. |
| `src/instrumentation.ts` | calls seedSeoSettings after seedStorageSettings | ✓ VERIFIED | L55: `await seedSeoSettings()` under the nodejs-runtime guard. |
| `src/app/(site)/layout.tsx` | async generateMetadata + WebSite + Organization JSON-LD script tags | ✓ VERIFIED | L38-42 generateMetadata with 'use cache'; L58-81 two real `<script type="application/ld+json" dangerouslySetInnerHTML>` tags (NOT metadata.other — Pitfall 2). |
| `src/app/(site)/page.tsx` | async generateMetadata (no static export) | ✓ VERIFIED | L17-21: async generateMetadata with 'use cache' calling getSeoSettings + buildSiteMetadata. |
| `src/app/(site)/preview/[token]/page.tsx` | async generateMetadata preserving robots noindex | ✓ VERIFIED | L45-77: awaits params (Next 16), looks up post by token, returns buildPostMetadata + `robots: { index:false, follow:false }`. |
| `src/app/sitemap.ts` | default async sitemap() + pure helpers | ✓ VERIFIED | L34-61 + buildHomeSitemapEntry/buildPostSitemapEntry/buildPageSitemapEntry (L67, L79, L95). |
| `src/app/robots.ts` | default async robots() | ✓ VERIFIED | L23-33; disallow list + sitemap pointer; reads getSeoSettings. |
| `src/app/rss.xml/route.ts` | GET() Route Handler + escapeXml + buildRssItem + RSS_LIMIT | ✓ VERIFIED | L33-86 + escapeXml (L127) + buildRssItem (L96) + RSS_LIMIT=30 (L23). |
| `src/components/dashboard/posts/SeoPanel.tsx` | collapsible 4-field SEO section | ✓ VERIFIED | L53-132: metaTitle/metaDescription/canonicalUrl/ogImage inputs registered via prop spread; "use client" directive; mirrors PageForm pattern. |
| `src/app/(admin)/dashboard/posts/PostForm.tsx` | renders `<SeoPanel>` | ✓ VERIFIED | L46 import; L233 `<SeoPanel register={register} errors={errors} />` after feature-image block. |
| `src/actions/posts.ts` | upsertPostSeo block (safeParse) | ✓ VERIFIED | L162 call; L178-222 upsertPostSeo helper: seoMetaSchema.safeParse (L185, NOT .parse), select-by-postId → update-or-insert, runs after assertOwnsPost (T-05-06 inherited). |
| `src/actions/posts-schema.ts` | metaTitle/metaDescription/ogImage/canonicalUrl optional fields | ✓ VERIFIED | L43-46: four optional fields with simple .max() caps (grapheme rule enforced server-side in savePost). |
| `src/actions/settings.ts` | saveSeoSettings (admin gate FIRST + 2-arg revalidateTag) | ✓ VERIFIED | L100-131: `requireRole("admin")` at L105 (FIRST line, before parse/write — T-05-01); 2-arg `revalidateTag("seo-settings","max")` at L123 (landmine #5); revalidatePath('/', 'layout') + 3 SEO routes (L124-127). |
| `src/actions/seo-settings-schema.ts` | pure Zod schema module (split for use-server constraint) | ✓ VERIFIED | L26-32: seoSettingsSchema; split from settings.ts because a "use server" file can only export async functions (mirrors storage-settings pattern). |
| `src/app/(admin)/dashboard/settings/seo/{page,SeoSettingsForm,schema-client}.tsx` | admin-only settings page trio | ✓ VERIFIED | All 3 files exist; page.tsx is a Server Component (no "use client"); form uses RHF + zodResolver + useMutation (not optimistic). |
| `src/app/not-found.tsx` | redirects-table lookup + permanentRedirect branch (Node runtime) | ✓ VERIFIED | L47-81 RedirectChecker async component in `<Suspense>` (L92-94); queries redirects by x-invoke-path; 301→permanentRedirect, 302→redirect OUTSIDE try/catch (NEXT_REDIRECT must propagate); try/catch graceful degradation (T-05-08). |
| `src/lib/seo/__tests__/{shared-fixtures,metadata,jsonld,validation,sitemap,robots,rss}.test.ts` | full test suite | ✓ VERIFIED | All 7 files present; 330/330 vitest assertions pass across the whole suite. |
| `src/actions/__tests__/seo-settings.test.ts` | MUST_NOT_BE_REACHED admin gate test | ✓ VERIFIED | L78-185: 6 assertions — non-admin FORBIDDEN before db.write (L88-111), 5-key write (L113), 2-arg revalidateTag (L128), revalidatePath routes (L144), Zod rejections (L160, L173). All pass. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| getSeoSettings (lib/seo/settings.ts) | (site)/layout.tsx, (site)/page.tsx, (site)/preview, sitemap.ts, robots.ts, rss.xml/route.ts | direct import + await | ✓ WIRED | All 6 consumers import getSeoSettings and await it; canonicalBaseUrl flows everywhere from the single source (Pitfall 7). |
| cacheTag('seo-settings') in getSeoSettings | revalidateTag('seo-settings','max') in saveSeoSettings | 2-arg revalidateTag call | ✓ WIRED | settings.ts L62 cacheTag ↔ settings.ts L123 revalidateTag (2-arg). seo-settings.test.ts L128-142 asserts the call shape. Runtime invalidation behavior → behavior_unverified. |
| redirects table (schema.ts L154) | app/not-found.tsx RedirectChecker | db.select().from(schema.redirects).where(eq(oldPath)) | ✓ WIRED | not-found.tsx L55-59; try/catch wrapped; redirect calls outside the catch. |
| seoMetaSchema (validation.ts) | savePost upsert + SeoPanel client form | safeParse server-side; zodResolver-equivalent client-side via postSchema | ✓ WIRED | posts.ts L185 safeParse; posts-schema.ts L43-46 client fields. Grapheme rule enforced server-side (D-10). |
| renderPostBody (Phase 3) | rss.xml/route.ts | import + call on p.body | ✓ WIRED | rss.xml/route.ts L19 import, L57 call; CDATA defense-in-depth (T-05-02). |
| publishPost revalidation | /sitemap.xml + /rss.xml | revalidatePath calls | ✓ WIRED | posts.ts L358-359 (D-13 carry-forward). |
| SeoPanel ← PostForm | rendered after feature-image block | `<SeoPanel register={register} errors={errors} />` | ✓ WIRED | PostForm.tsx L233; imports at L46. |
| saveSeoSettings ↔ settings/seo page | form mutation → action | useMutation calling saveSeoSettings | ✓ WIRED | SeoSettingsForm.tsx L22 import; page.tsx renders the form with initial values. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|----|
| (site)/layout.tsx generateMetadata | `s` (SeoSettings) | getSeoSettings() → db.select from settings table (5 keys) | ✓ (DB query, env fallback) | ✓ FLOWING |
| sitemap.ts | `publishedPosts` / `publishedPages` | db.select from posts/pages where status='published' AND deletedAt IS NULL | ✓ (real DB query) | ✓ FLOWING |
| rss.xml/route.ts GET | `posts` | db.select from posts (published, non-deleted, limit 30) | ✓ (real DB query) | ✓ FLOWING |
| SeoSettingsForm | `initial` | getSeoSettings() in page.tsx → passed as prop | ✓ (DB-sourced initial values) | ✓ FLOWING |
| upsertPostSeo | `parsed.data` | seoMetaSchema.safeParse(input) → db.update/insert post_seo | ✓ (real upsert) | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full vitest suite (330 tests) | `pnpm test --run` | 31 files, 330/330 pass | ✓ PASS |
| Targeted seo-settings admin-gate test | `npx vitest run src/actions/__tests__/seo-settings.test.ts` | 1 file, 6/6 pass (incl. MUST_NOT_BE_REACHED) | ✓ PASS |
| Targeted Bangla grapheme validation test (SEO-06) | `npx vitest run src/lib/seo/__tests__/validation.test.ts` | 1 file, 11/11 pass (Bangla passes, Latin fails) | ✓ PASS |
| TypeScript typecheck | `pnpm tsc --noEmit` | exit 1 — **only** 4 pre-existing errors in src/actions/__tests__/storage-settings.test.ts (Phase 4 file); zero Phase 5 file errors | ✓ PASS (Phase 5 scope clean; pre-existing errors documented as out-of-scope in all 3 SUMMARYs) |
| Next.js build under cacheComponents:true | `pnpm build` | exit 0; all SEO routes registered — `/` ◐ PPR, `/_not-found` ◐ PPR, `/robots.txt` ○ Static 15m, `/rss.xml` ƒ Dynamic, `/sitemap.xml` ƒ Dynamic, `/dashboard/settings/seo` ◐ PPR 15m | ✓ PASS (landmine #4 cleared) |

### Probe Execution

Step 7c: SKIPPED — no `scripts/*/tests/probe-*.sh` probes declared for this phase (the phase verifies via vitest + build, both run above).

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| SEO-01 | 05-01, 05-03 | generateMetadata per public route from post_seo/settings | ✓ SATISFIED (at Phase 5 scope) | Builders verified + existing (site) routes wired + dashboard data-population surface (SeoPanel + saveSeoSettings) shipped. Per-post detail route is Phase 6 (deferred, not orphaned). |
| SEO-02 | 05-02 | Dynamic sitemap.ts (posts+pages) + robots.ts | ✓ SATISFIED | sitemap.ts + robots.ts wired + unit-tested + revalidation paths confirmed. |
| SEO-03 | 05-01 | JSON-LD BlogPosting schema per post | ✓ SATISFIED (builder) — per-post route DEFERRED | blogPostingJsonLd builder verified + site-wide JSON-LD (WebSite/Organization) rendered on layout. Per-post BlogPosting injection on /[slug] is Phase 6 SITE-07. |
| SEO-04 | 05-01 | Canonical handling (override else slug) | ✓ SATISFIED | buildPostMetadata L94: `seo?.canonicalUrl || /${post.slug}` (D-04); unit-tested. |
| SEO-05 | 05-01 | OG + Twitter card images (fallback chain) | ✓ SATISFIED | buildPostMetadata D-09 chain (seo.ogImage → featureImage → defaultOgImage); twitter card summary_large_image/summary logic; unit-tested. |
| SEO-06 | 05-01, 05-03 | Bangla-aware meta validation (grapheme, not Latin) | ✓ SATISFIED | Intl.Segmenter grapheme rule; 11 validation tests pass incl. Bangla-passes + Latin-fails; live editor form wired (SeoPanel placeholder documents the grapheme rule). |
| SEO-07 | 05-02 | RSS feed at /rss.xml | ✓ SATISFIED | rss.xml/route.ts GET handler; full-text via renderPostBody; 14 RSS tests pass. |
| SEO-08 | 05-02 | Sitemap priority/changefreq per content type | ✓ SATISFIED | home 1.0/daily, posts 0.8/weekly, pages 0.5/monthly; unit-tested in sitemap.test.ts. |

No ORPHANED requirements — all 8 SEO IDs (SEO-01..08) are claimed by plans and satisfied at Phase 5's scope.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| src/app/sitemap.ts | 59 | `// Phase 6 TODO: append category/tag/author archive entries here (D-05).` | ℹ️ Info | NOT a debt marker — references formal follow-up work (Phase 6 + decision D-05). The extensibility seam is intentional; the TODO documents where Phase 6 adds archive entries. No action required. |

No TBD/FIXME/XXX in any Phase 5 file. No placeholder/stub patterns in output paths. The single TODO references a Phase 6 decision (D-05) and is therefore acceptable per the debt-marker gate.

### Security Invariants (Cross-Checked)

| Invariant | Expected | Status | Evidence |
|-----------|----------|--------|----------|
| saveSeoSettings requireRole('admin') FIRST | Gate before any parse/DB write | ✓ VERIFIED | settings.ts L105 `await requireRole("admin")` is the first statement; seo-settings.test.ts L88-111 asserts FORBIDDEN is thrown before db.update/db.insert (MUST_NOT_BE_REACHED). |
| savePost SEO writes inherit ownership | assertOwnsPost covers upsertPostSeo | ✓ VERIFIED | posts.ts L156-157 comment confirms; upsertPostSeo (L178) is called inside savePost after the step-1 ownership/permission gate. No new auth check needed (T-05-06). |
| 2-arg revalidateTag | `revalidateTag('seo-settings', 'max')` not single-arg | ✓ VERIFIED | settings.ts L123; seo-settings.test.ts L128-142 asserts the second arg is 'max' (landmine #5). |
| JSON-LD via real `<script dangerouslySetInnerHTML>` | NOT metadata.other | ✓ VERIFIED | (site)/layout.tsx L58-81 renders two real `<script type="application/ld+json">` tags with dangerouslySetInnerHTML (Pitfall 2 mitigation). |
| not-found.tsx in Node runtime (not middleware) | Drizzle/pg NOT in edge middleware; no src/proxy.ts created | ✓ VERIFIED | No src/proxy.ts exists (confirmed). Root middleware.ts (62 lines) contains NO redirects/db/schema/drizzle/permanentRedirect references (confirmed by grep) — stays edge-runtime auth-only. not-found.tsx is a Server Component in Node runtime by default (landmine #2). RedirectChecker isolated in `<Suspense>` for Cache Components (landmine cleared during execution per 05-03-SUMMARY). |
| seoMetaSchema.safeParse (NOT .parse) in savePost | Malformed SEO never fails the post save | ✓ VERIFIED | posts.ts L185 `seoMetaSchema.safeParse(...)`; L191-198 logs and returns on failure (defensive). |
| escapeXml on 5 special chars in RSS | XML injection vector closed (T-05-04) | ✓ VERIFIED | rss.xml/route.ts L127-134; unit-tested in rss.test.ts. |
| renderPostBody sanitize + CDATA in RSS | Stored-XSS via RSS body mitigated (T-05-02) | ✓ VERIFIED | rss.xml/route.ts L57 + L115 CDATA wrap; renderPostBody is the Phase 3 double-sanitize pipeline. |

### Human Verification Required

5 items need human testing — see the `human_verification` list in frontmatter. Two of these are the behavior-unverified invariants (cache invalidation runtime, redirects graceful-degradation runtime); the other three are runtime-HTML / user-flow checks the build cannot observe.

### Gaps Summary

**No gaps found.** All 5 ROADMAP success criteria are met at Phase 5's scope boundary (D-01). All 22+ required artifacts exist, are substantive (no stubs), and are wired. All 8 key links are connected. All 8 SEO requirements are satisfied (SEO-03's per-post route wiring is explicitly deferred to Phase 6 SITE-07, not a gap). All security invariants are verified in code. The full vitest suite (330 tests) passes; the build passes under `cacheComponents:true`.

The phase is routed to **human_needed** solely because runtime/behavioral aspects require human eyes: the actual streamed HTML output, the live editor/admin dashboard flows, the cache-invalidation behavior end-to-end, and the redirects-check runtime behavior. These are inherent to a metadata-heavy phase where build-passing + unit tests prove the logic but not the final rendered output.

---

_Verified: 2026-07-07T04:30:00Z_
_Verifier: Claude (gsd-verifier)_
