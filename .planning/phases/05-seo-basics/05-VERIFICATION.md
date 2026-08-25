---
phase: 05-seo-basics
verified: 2026-08-25T15:20:07Z
status: human_needed
score: 5/5 must-haves verified
behavior_unverified: 2
overrides_applied: 0
requirements:
  SEO-01: satisfied
  SEO-02: satisfied
  SEO-03: satisfied
  SEO-04: satisfied
  SEO-05: satisfied
  SEO-06: satisfied
  SEO-07: satisfied
  SEO-08: satisfied
re_verification:
  previous_status: human_needed
  previous_score: 5/5
  gaps_closed:
    - "SC-3 per-post BlogPosting JSON-LD: the prior deferral to Phase 6 (SITE-07) is RESOLVED — src/app/(site)/blog/[slug]/page.tsx now exists and injects blogPostingJsonLd via jsonLdScript (L177-194)"
    - "Prior human items (UAT 2026-08-24, 05-UAT.md): test 1 (home HTML) PASS, test 4 (settings cache invalidation live) PASS — old behavior_unverified[0] DISCHARGED by live user confirmation"
    - "UAT gaps 1-4 (publish UI, toasts, sidebar SEO entry, redirects blocker) closed at code level by plans 05-04/05/05/06 (verified below); live re-run outstanding — see human_verification"
  gaps_remaining: []
  regressions: []
behavior_unverified_items:
  - truth: "A post published via the new Publish button appears in /sitemap.xml and /rss.xml on the next request (UI -> publishPost -> revalidatePath -> route refresh)"
    test: "As an editor, publish a draft from /dashboard/posts/new (or the posts-list row action), then curl /sitemap.xml and /rss.xml"
    expected: "The new /blog/{slug} entry (0.8/weekly) appears in the sitemap and one <item> appears in RSS on the next request — no restart. Success/error toasts fire on every step."
    why_human: "The revalidatePath('/sitemap.xml') + ('/rss.xml') calls exist in publishPost (src/actions/posts.ts L363-364) and every UI element is wired, but the full cross-system loop (button -> action -> revalidation -> route output) is exercised by no test; UAT test 2 was blocked from verifying this before the fix landed and was never re-run."
  - truth: "A redirects-table row (301/302) makes visiting old_path return a real HTTP 308/307 on the running server (middleware Node-runtime lookup)"
    test: "On a running dev or production server with rows /old->/new (301) and /old2->/new2 (302) in the redirects table, curl -I /old and /old2; also curl -I /nonexistent"
    expected: "308 -> /new and 307 -> /new2 respectively; /nonexistent returns 404 UI without crashing (T-05-08 graceful degradation)."
    why_human: "src/middleware.ts L120-133 implements the lookup + status mapping and the executor live-verified it during 05-04 (curl table in 05-04-SUMMARY — executor evidence, not independent), but __tests__/middleware.test.ts covers ONLY the 4 auth branches; no test exercises the redirects branch, and the post-fix UAT re-run (test 5) has not happened."
human_verification:
  - test: "Re-run UAT test 2/3 flow: as an editor, create a post in the rebuilt WordPress-classic editor (Visual/Text tabs, toolbar, live word-count footer), fill the 4 SEO panel fields, Publish, then curl /sitemap.xml, /rss.xml, and view the post page source"
    expected: "Typing moves the live word count; save/publish show sonner toasts; the post page source shows <link rel=canonical> at /blog/{slug}, OG/Twitter tags from post_seo, and a <script type='application/ld+json'> BlogPosting block; sitemap lists /blog/{slug} (0.8/weekly); RSS contains one full-text <item>. Covers behavior_unverified[0] + the live editor + post_seo persistence through the real form (old human item 3)."
    why_human: "Builders, middleware, actions, and the editor component are all unit/component-tested (590 green), but the live dashboard flow (typing -> RHF -> savePost -> post_seo row) and the final streamed HTML are runtime behaviors grep/tests at this level cannot observe."
  - test: "Re-run UAT test 5: curl -I /old (301 row), /old2 (302 row), /nonexistent on the running server; insert a new row after boot and hit it within 5s"
    expected: "308 -> /new, 307 -> /new2, 404 UI for unmatched; a row inserted after boot applies within the 5s TTL without restart. Covers behavior_unverified[1]."
    why_human: "Middleware redirects branch has no unit test; only the auth branches are covered. Executor's live curl table is execution-time evidence, not an independent post-fix verification."
  - test: "Admin opens /dashboard/settings/seo via the Settings submenu (not URL), edits a field, saves, reloads /"
    expected: "Sidebar 'SEO' entry navigates to the page; save persists and the site-wide title/JSON-LD refresh on the next request."
    why_human: "Sidebar entry (AppSidebar.tsx L93) and the page are code-verified; UAT test 4 confirmed the page works but reached it by URL (the sidebar entry shipped after that UAT). One live click-through closes it fully."
---

# Phase 5: SEO Basics — Verification Report

**Phase Goal:** Every public-facing route emits accurate, source-of-truth metadata so posts are indexable, shareable, and canonical-correct — sourced from `post_seo`/`settings`, including Bangla-aware validation and an RSS feed.
**Verified:** 2026-08-25T15:20:07Z
**Status:** human_needed
**Re-verification:** Yes — prior VERIFICATION.md (2026-07-07, human_needed, no gaps section) superseded by this pass, which additionally covers the UAT gap-closure plans 05-04..05-06 and the three review-critical fixes.

## Goal Achievement

### Observable Truths (the 5 ROADMAP Success Criteria + gap-closure truths)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Each public route produces correct title/description/canonical/OG/Twitter via `generateMetadata`, sourced from `post_seo`/`settings`, respecting `canonical_url` override else slug-derived. | ✓ VERIFIED | All 16 `(site)` route files export `generateMetadata` calling `getSeoSettings()` + the Phase-5 builders (grep-verified, table below). `buildPostMetadata` (src/lib/seo/metadata.ts L87-124): D-04 override `seo?.canonicalUrl \|\| /blog/${post.slug}` (L97 — CR-01 fixed), D-09 OG chain `seo.ogImage -> featureImage -> defaultOgImage` (L99), article OG + twitter card logic (L106-122). Unit-tested in metadata.test.ts (CR-01 cases at L64-72) — all green in the 590-test run. |
| 2 | `/sitemap.xml` lists every published post + managed page (per-type priority/changefreq); `/robots.txt` correct; both update without full rebuild. | ✓ VERIFIED | sitemap.ts L34-61: real Drizzle queries filtered `status='published' AND deletedAt IS NULL` (L44, L54); home 1.0/daily, posts 0.8/weekly, pages 0.5/monthly (L67-106). robots.ts L23-33: allow '/', disallow preview/dashboard/auth, sitemap pointer. Revalidation wired: publishPost revalidates `/sitemap.xml` + `/rss.xml` (posts.ts L363-364); saveSeoSettings revalidates sitemap/robots/rss (settings.ts). 14+ unit tests green. UAT test 2 confirmed live structure incl. published page entry. |
| 3 | A published post page injects valid `BlogPosting` JSON-LD. | ✓ VERIFIED (deferral RESOLVED — route now exists) | `src/app/(site)/blog/[slug]/page.tsx` L177-194: real `<script type="application/ld+json">` with `jsonLdScript(blogPostingJsonLd({...}))` — headline/dates/author/publisher/mainEntityOfPage from jsonld.ts L73-98. Prior verification deferred this to Phase 6 (D-01); Phase 6 shipped the route, so the truth now holds in the codebase. XSS-escaped (CR-03). |
| 4 | Long Bangla meta description passes byte/grapheme-aware validation, not Latin char limits. | ✓ VERIFIED (behaviorally proven) | validation.ts L35-38 `graphemeCount` via `Intl.Segmenter(locale, {granularity:"grapheme"})`; seoMetaSchema grapheme refines (L44-63, 80/200 limits). validation.test.ts: L44 "PASS: 59-grapheme Bangla metaDescription is accepted", L60 "FAIL: 250-grapheme Latin rejected" — both green in the suite run. Enforced server-side in savePost (safeParse, posts.ts L190) and surfaced in the editor SeoPanel. |
| 5 | RSS feed at `/rss.xml` publishes latest posts. | ✓ VERIFIED | rss.xml/route.ts GET (L33-86): `Content-Type: application/rss+xml; charset=utf-8`, RSS 2.0 shape, published-only SQL filter, RSS_LIMIT=30, full-text body via renderPostBody in CDATA, escapeXml on 5 chars (L127-134), RFC-822 pubDate. 14 RSS unit tests green. UAT test 2 confirmed content-type live. |
| 6 | (gap-closure 05-04) Redirects rows produce real HTTP 308/307; unmatched paths render 404 without crashing; no restart needed. | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | Code verified: src/middleware.ts `export const runtime = "nodejs"` (L59), whole-table 5s-TTL snapshot cache (L73-92), 301->308 / 302->307 mapping (L125), graceful try/catch (L128-132), broadened matcher (L162-168); not-found.tsx fallback reads `x-incoming-path` (L73) with redirects OUTSIDE try/catch (L91-99). Executor live-verified dev+prod during 05-04, but middleware.test.ts covers only the 4 auth branches — no test exercises the redirects branch, and the post-fix UAT re-run has not happened. → Human item 2. |
| 7 | (gap-closure 05-05) WordPress-classic editor surface (tabs, ordered toolbar, min-height area, live word count) on every EditorProvider consumer. | ✓ VERIFIED (component-level) | TiptapEditor.tsx: Visual/Text tabs (L108-121), min-h-[350px] areas (L128, L137), `Words: N` footer from useEditorState (L64, L146), Text-tab setContent({emitUpdate:true}) pipe (L84-89). extensions.ts L76/L80: TextAlign(heading+paragraph) + CharacterCount pinned 3.27.1 (package.json). jsdom smoke tests (tiptap-editor-surface.test.tsx: tab swap, onChange fires, footer count updates) + round-trip align tests green in the suite. Live-dashboard confirmation folded into human item 1. |
| 8 | (gap-closure 05-06) Role-aware Publish / Submit-for-review UI + toast feedback; publish operable without DB edits. | ✓ VERIFIED (code) — end-to-end loop ⚠️ see behavior_unverified[0] | PostForm.tsx: publishPost/submitForReview imports (L45), role/status-aware canPublish/canSubmit (L190-), brand-500 Publish + Submit buttons (L354-371), toast.success/error on every outcome (L114-159); PostRowActions.tsx (complete client component, toasts + invalidation); posts/page.tsx reads viewer role and renders row actions (L51-53, L106); sonner@2.0.8 Toaster mounted in AdminShell only (L71). Server chain unchanged and permission-gated (transitionPost -> requireCan). |
| 9 | (gap-closure 05-04) SEO settings page reachable from the Settings submenu. | ✓ VERIFIED | AppSidebar.tsx L93 `{ name: "SEO", path: "/dashboard/settings/seo" }` between Storage and Backup; page trio shipped by 05-03; UAT test 4 confirmed the page + live cache invalidation work. Live click-through is human item 3 (sidebar shipped after the UAT). |

**Score:** 5/5 roadmap SCs verified (truths 6's runtime aspect and 8's end-to-end loop are the 2 behavior-unverified items routed to human; all code present and wired).

### Deferred Items

None. The prior verification's single deferral (SC-3 per-post BlogPosting -> Phase 6) is resolved: `src/app/(site)/blog/[slug]/page.tsx` exists and injects the BlogPosting JSON-LD (verified above), so the item moved from `deferred` to VERIFIED.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/lib/seo/metadata.ts` | 4 builders + interfaces | ✓ VERIFIED | buildPostMetadata (L87), buildPageMetadata (L130), buildArchiveMetadata (L152), buildSiteMetadata (L191); metadataBase-as-string documented for 'use cache' serializability. |
| `src/lib/seo/jsonld.ts` | 3 Phase-5 builders + jsonLdScript | ✓ VERIFIED | blogPostingJsonLd (L73), websiteJsonLd (L105), organizationJsonLd (L125); jsonLdScript CR-03 helper (L30-37) escaping `< > &` U+2028/U+2029; + Phase-6 person/breadcrumb builders. |
| `src/lib/seo/validation.ts` | seoMetaSchema, graphemeCount, limits | ✓ VERIFIED | L18/L21/L35/L44; Intl.Segmenter-based. |
| `src/lib/seo/settings.ts` | getSeoSettings 'use cache' + cacheTag | ✓ VERIFIED | L60-83: `"use cache"` + `cacheTag("seo-settings")`, 5 keys, env fallback single-source (Pitfall 7). |
| `src/app/sitemap.ts` / `robots.ts` / `rss.xml/route.ts` | 3 standalone SEO routes | ✓ VERIFIED | All real-DB, unit-tested, wired to getSeoSettings (see truths 2/5). |
| `src/app/(site)/blog/[slug]/page.tsx` | generateMetadata + BlogPosting JSON-LD | ✓ VERIFIED | L66-91 + L177-194 (see truth 3). |
| `src/actions/posts.ts` | upsertPostSeo + publish revalidation + CR-02 | ✓ VERIFIED | upsertPostSeo safeParse (L183-227); publishPost revalidation block (L356-373, 2-arg tags); CR-02 conditional publishedAt spread (L133-138). |
| `src/lib/permissions/post-transitions.ts` | CR-02 stamp-on-publish | ✓ VERIFIED | L84-93: stamps `publishedAt: new Date()` when target=published and prior value null. |
| `src/actions/settings.ts` | saveSeoSettings admin-first + revalidation | ✓ VERIFIED | requireRole("admin") FIRST; 5-key write; revalidateTag('seo-settings','max') + 4 revalidatePath. MUST_NOT_BE_REACHED test green. |
| `src/middleware.ts` | Node-runtime redirects lookup | ✓ VERIFIED | runtime="nodejs", 5s TTL cache, 308/307 mapping, x-incoming-path overwrite, graceful catch (see truth 6). |
| `src/db/schema.ts` | post_seo + redirects tables | ✓ VERIFIED | postSeo L112-120 (metaTitle/metaDescription/ogImage/canonicalUrl); redirects L197-207 (oldPath unique, statusCode 301/302). |
| `src/components/dashboard/posts/SeoPanel.tsx` | 4-field collapsible SEO section | ✓ VERIFIED | Imported (PostForm L48) and rendered (L327); fields flow into savePost input. |
| `src/app/(admin)/dashboard/settings/seo/{page,SeoSettingsForm,schema-client}.tsx` | admin-only settings trio | ✓ VERIFIED | Files present; UAT test 4 exercised the page live (PASS). |
| `src/app/not-found.tsx` | RedirectChecker streamed fallback | ✓ VERIFIED | Reads x-incoming-path (L73), redirect outside try/catch (L91-99), separate Suspense boundaries. |
| `src/components/editor/{extensions,TiptapEditor,toolbar/Toolbar}` + 2 pinned deps | WordPress-classic surface | ✓ VERIFIED | See truth 7; deps exact-pinned in package.json (`@tiptap/extension-text-align@3.27.1`, `@tiptap/extension-character-count@3.27.1`, `sonner@2.0.8`). |
| `PostRowActions.tsx` + AdminShell Toaster + PostForm buttons | publish UI + toast channel | ✓ VERIFIED | See truth 8. |
| `src/lib/seo/__tests__/*` + middleware/seo-settings/posts tests | full test coverage | ✓ VERIFIED | Part of the 57-file / 590-test green suite. |

### Key Link Verification

| From | To | Via | Status |
|------|----|----|--------|
| getSeoSettings | layout, home, blog/[slug], preview, sitemap, robots, rss, category/tag/author/search/about/contact/legal pages | import + await | ✓ WIRED (grep-verified across all 16 routes) |
| cacheTag('seo-settings') | revalidateTag('seo-settings','max') in saveSeoSettings | 2-arg tag call | ✓ WIRED (settings.ts L62 ↔ action; asserted in seo-settings.test.ts L128) |
| redirects table | middleware lookup + not-found fallback | db.select where oldPath | ✓ WIRED (middleware L82/L123; not-found L76-80) |
| seoMetaSchema | savePost safeParse + SeoPanel | shared Zod | ✓ WIRED (posts.ts L190; PostForm L327) |
| renderPostBody | rss.xml full-text | import + CDATA | ✓ WIRED (route.ts L19/L57/L115) |
| publishPost | /sitemap.xml + /rss.xml + /blog/{slug} + tags | revalidatePath/2-arg revalidateTag | ✓ WIRED (posts.ts L356-373) |
| Publish buttons / PostRowActions | publishPost/submitForReview -> transitionPost -> requireCan | useMutation call sites | ✓ WIRED (PostForm L45/L138/L152; PostRowActions L18/L30/L41) |
| AppSidebar SEO entry | /dashboard/settings/seo | subItem link | ✓ WIRED (AppSidebar L93) |
| jsonLdScript | all 6 JSON-LD injection sites | dangerouslySetInnerHTML | ✓ WIRED (layout x2, blog/[slug], category, tag, author — grep: zero raw stringify ld+json sites remain) |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| blog/[slug] generateMetadata | post/post_seo/author | getPostForPublic (Drizzle leftJoin) + getSeoSettings | ✓ real DB query | ✓ FLOWING |
| sitemap.ts | publishedPosts/publishedPages | Drizzle select, published+non-deleted filter | ✓ | ✓ FLOWING |
| rss.xml GET | posts | Drizzle select, limit 30, published-only | ✓ | ✓ FLOWING |
| savePost -> post_seo | parsed.data | seoMetaSchema.safeParse -> insert/update | ✓ | ✓ FLOWING |
| SeoSettingsForm | initial | getSeoSettings in page.tsx | ✓ | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full vitest suite | `pnpm vitest run` | 57 files, 590/590 passed (4.29s) | ✓ PASS |
| Review-fix commits exist | `git log 5da67e1 4d7a999 cabf58a` | CR-01/CR-02/CR-03 commits present with exact hashes/messages | ✓ PASS |
| Bangla grapheme validation (SC-4) | validation.test.ts L44/L60 in suite | Bangla-passes + Latin-fails both green | ✓ PASS |
| CR-01 canonical fix pinned | metadata.test.ts L64-72 + sitemap.test.ts L177 drift guard | `/blog/${slug}` expected + metadata↔sitemap cross-check green | ✓ PASS |
| CR-03 XSS escape round-trip | jsonld.test.ts describe "CR-03" (L91+) | breakout-neutralized + JSON.parse deep-equal green | ✓ PASS |
| Middleware auth branches | `__tests__/middleware.test.ts` (4 tests) | green | ✓ PASS (note: redirects branch untested — see truth 6) |

Step 7c (probes): SKIPPED — no `scripts/*/tests/probe-*.sh` declared for this phase; verification runs via vitest + build (both evidenced).

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| SEO-01 | 05-01, 05-03, 05-04 | generateMetadata per public route from post_seo/settings | ✓ SATISFIED | All 16 (site) routes wired (truth 1); dashboard data side: SeoPanel + savePost upsert + settings/seo page + sidebar entry. |
| SEO-02 | 05-02, 05-05, 05-06 | Dynamic sitemap.ts + robots.ts | ✓ SATISFIED | Truth 2; revalidation wired on publish + settings save. |
| SEO-03 | 05-01 | JSON-LD BlogPosting per post | ✓ SATISFIED | Truth 3 — per-post route now delivers it (prior deferral resolved). |
| SEO-04 | 05-01, 05-04 | Canonical override else slug-derived | ✓ SATISFIED | metadata.ts L97 (override || `/blog/{slug}`); unit + drift-guard tests; redirects runtime supports slug-change continuity (truth 6 code-verified). |
| SEO-05 | 05-01 | OG + Twitter images with fallback chain | ✓ SATISFIED | metadata.ts L99/L116-122; unit-tested. |
| SEO-06 | 05-01, 05-03, 05-05 | Bangla-aware meta validation | ✓ SATISFIED | Truth 4 — behavioral test evidence. |
| SEO-07 | 05-02, 05-06 | RSS feed of published posts | ✓ SATISFIED | Truth 5; publish UI (05-06) makes posts reachable from the dashboard. |
| SEO-08 | 05-02 | Sitemap priority/changefreq per type | ✓ SATISFIED | sitemap.ts L67-106 + tests. |

No ORPHANED requirements — all 8 SEO IDs claimed by plans (05-01..05-06) and satisfied.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| src/app/sitemap.ts | 59 | `// Phase 6 TODO: append category/tag/author archive entries here (D-05).` — Phase 6 is complete; comment is stale, but SC-2/SEO-02 never required archive entries (posts+pages only) | ℹ️ Info | Cosmetic; suggests updating the comment or adding archives in a later pass |
| `__tests__/middleware.test.ts` | 69 | Test title "config.matcher gates dashboard + auth pages only" is stale — matcher has 5 entries since 05-04 (assertions use toContain, so still green) | ℹ️ Info | Cosmetic; title misleads about coverage — the redirects branch has NO test (tracked as behavior-unverified) |
| src/app/rss.xml/route.ts | 115 | CDATA `]]>` breakout (WR-03, open by user decision) | ℹ️ Info | Edge-case feed malformation only; SC-5 holds for normal content |
| src/actions/posts.ts | 99-170 | savePost update path has no revalidation (WR-08, open by user decision) | ℹ️ Info | Stale public page up to cache TTL on edits of published posts; publish path (the SC-2 concern) revalidates fully |

No TBD/FIXME/XXX anywhere in phase files. The 9 Warnings + 7 Infos from 05-REVIEW.md remain open by explicit user decision (`fix_scope: critical` in 05-REVIEW-FIX.md) — none breaks a success criterion; the 3 Criticals are verified fixed in code (CR-01 metadata.ts L97, CR-02 posts.ts L133-138 + post-transitions.ts L84-93, CR-03 jsonld.ts L30-37 at all 6 injection sites).

### Security Invariants (Cross-Checked)

| Invariant | Status | Evidence |
|-----------|--------|----------|
| saveSeoSettings requireRole('admin') FIRST | ✓ VERIFIED | First statement; MUST_NOT_BE_REACHED test green |
| upsertPostSeo inherits assertOwnsPost coverage | ✓ VERIFIED | Called inside savePost after step-1 gate (posts.ts L161-167) |
| 2-arg revalidateTag everywhere | ✓ VERIFIED | settings.ts + posts.ts L368-373; asserted in tests |
| JSON-LD XSS escape at every injection site | ✓ VERIFIED | jsonLdScript at all 6 sites; zero raw stringify ld+json remaining (grep) |
| Redirects lookup degrades gracefully; DB stays out of edge runtime | ✓ VERIFIED | runtime="nodejs"; try/catch in both middleware and not-found; redirect calls outside catch |
| seoMetaSchema.safeParse (not .parse) in savePost | ✓ VERIFIED | posts.ts L190 |
| RSS XML escaping + sanitized body | ✓ VERIFIED | escapeXml + renderPostBody + CDATA |

### Human Verification Required

3 items need human testing (2 behavior-unverified truths are covered by items 1-2) — see the `human_verification` list in frontmatter. These are the post-gap-closure UAT re-runs: live publish flow -> sitemap/RSS/post-page HTML (UAT tests 2+3), live redirects 308/307 (UAT test 5), and the sidebar SEO click-through (UAT test 4 completion). Everything code-checkable has been checked and passes.

### Gaps Summary

**No code gaps found.** All 5 ROADMAP success criteria are verified in the codebase with unit-test behavioral evidence; the prior SC-3 deferral is resolved (the /blog/[slug] route now injects BlogPosting JSON-LD); all UAT gap-closure deliverables (05-04 middleware redirects, 05-05 editor surface, 05-06 publish UI + toasts, sidebar entry) are present, substantive, and wired; the 3 review Criticals are fixed at the cited lines with tests; the full suite is green at exactly the claimed 590/590 across 57 files; all 8 SEO requirements are satisfied with no orphans.

The phase routes to **human_needed** solely because the gap-closure work (05-04..05-06) landed AFTER the 2026-08-24 UAT that motivated it, and the live re-verification of those fixes — publish a post from the UI and watch it appear in sitemap/RSS, fire a redirect from a redirects row, click the sidebar SEO entry — has not yet been re-run by a human. Two cross-system runtime invariants (publish->feeds loop, middleware redirect firing) have no test coverage and are flagged `behavior_unverified`.

---

_Verified: 2026-08-25T15:20:07Z_
_Verifier: Claude (gsd-verifier)_
