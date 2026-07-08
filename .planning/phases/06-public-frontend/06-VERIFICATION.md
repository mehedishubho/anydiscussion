---
phase: 06
slug: public-frontend
status: passed
verified: 2026-07-08
verifier: inline (orchestrator) — gsd-verifier agent was interrupted by a usage-limit reset; checks run directly against the merged codebase
requirements_total: 19
requirements_verified: 19
human_verification_required: true
---

# Phase 06 — Verification

**Goal:** Readers can browse and consume the blog at maximum speed — home, feeds, archives, single posts, search, and marketing/legal pages — with the public site staying ISR/Cache Components-first and near-zero client JS, including the highest-complexity surface: the single-post page with a static Tiptap body streaming dynamic holes.

**Verdict: ✅ VERIFICATION PASSED** — all automated `must_haves` verified against the merged codebase on `main`; 5 inherently-manual items flagged for UAT / Phase 7 (see §Human Verification).

> Verification was performed inline by the orchestrator after the `gsd-verifier` subagent was terminated by a 5-hour usage-limit reset. Every check below is grounded in a real grep/read of the shipped code (commit `186eaf9` and ancestors), not SUMMARY claims. The full suite (`pnpm test`) is **384/384 green** across 37 files.

---

## Requirement Coverage (19/19)

| Req | Plan(s) | Verified via | Status |
|-----|---------|--------------|--------|
| SITE-01 Home (magazine) | 06-04 | `listFeatured` ×4 in `(site)/page.tsx` | ✅ |
| SITE-02 `/blog` feed | 06-04 | `blog/page.tsx` + `blog/page/[pageNumber]/page.tsx` (numbered pagination) | ✅ |
| SITE-03 `/archive` filterable | 06-04 | `listArchive` ×3 in `archive/page.tsx`; filter bar in ArchiveList | ✅ |
| SITE-04 `/category/[slug]` | 06-04 | reuses ArchiveList + `breadcrumbListJsonLd` ×3 | ✅ |
| SITE-05 `/tag/[slug]` | 06-04 | reuses ArchiveList + BreadcrumbList JSON-LD | ✅ |
| SITE-06 `/author/[username]` | 06-07 | `personJsonLd` ×3 + `getUserByUsername` + `notFound()` | ✅ |
| SITE-07 single post | 06-01, 06-03 | spike recipe — see §HIGHEST Spike | ✅ |
| SITE-08 `/search` FTS | 06-01, 06-07 | `websearch_to_tsquery('simple')` + `ts_rank`; GET form | ✅ |
| SITE-09 About | 06-06 | hard-coded TSX, 0 DB queries (`grep getPublishedPage|listPublished` = 0) | ✅ |
| SITE-10 Contact | 06-05 | honeypot + rate-limit; no `'use cache'`; no `requireCan`; `useTransition` | ✅ |
| SITE-11 T&C / Privacy | 06-06 | `renderPostBody` ×7 in terms page; `notFound()` on missing | ✅ |
| SITE-12 404 | 06-06 | 2× `<Suspense>` (RedirectChecker + SuggestedPosts); redirects-check preserved | ✅ |
| SITE-13 reading-time + TOC | 06-01, 06-03 | `Intl.Segmenter` reading-time; TOC `"use client"` island | ✅ |
| SITE-14 share + read-progress | 06-03 | ShareButtons + ReadProgress `"use client"` islands | ✅ |
| SITE-15 preview | 06-06 | verify-only — Phase 3 route intact, not rebuilt | ✅ |
| SITE-16 public dark mode | 06-02 | route-isolated `ThemeToggle`, `site-theme` key, no ThemeContext import | ✅ |
| SITE-17 view count | 06-01, 06-03 | atomic `+1` in `ViewCount` behind `connection()` | ✅ |
| ANAL-01 analytics inject | 06-02 | https-validated `<script>` injection; no `dangerouslySetInnerHTML` (comment-enforced) | ✅ |
| ANAL-02 Umami default | 06-02 | settings-driven, swappable; instance deploys Phase 7 | ✅ |

---

## HIGHEST Spike — Single-post `/blog/[slug]` (D-02 / SITE-07 / SITE-17)

This was the phase's single most likely failure point. Verified against `src/app/(site)/blog/[slug]/page.tsx` + `src/components/site/ViewCount.tsx`:

- ✅ **Body in `'use cache'`, NOT in `<Suspense>`** — `getPostForPublic` is the cached fetch (used by both `generateMetadata` L69 and the body L133); the body `<div>` is explicitly rendered with `NO <Suspense> around this div` (L225). This protects LCP.
- ✅ **Two SEPARATE `<Suspense>` holes** — `grep -c Suspense` = 11; ViewCount and RelatedPosts each get their own boundary (STREAMING HOLE #1 at L249, #2 for RelatedPosts). Landmine #2 (combined Suspense) avoided.
- ✅ **`ViewCount` calls `await connection()` FIRST** — L41, the per-request signal that opts out of the prerender so the increment runs once per real visit (Landmine #1 avoided). The increment is **not** in `'use cache'`.
- ✅ **cacheTag strings match `publishPost`'s 2-arg `revalidateTag(..., "max")`** — exact correspondence:

  | publishPost revalidateTag (posts.ts:363-368) | cacheTag in queries/RelatedPosts |
  |---|---|
  | `revalidateTag(\`post-${id}\`, "max")` | `cacheTag(\`post-${id}\`)` |
  | `revalidateTag(\`author-${aid}\`, "max")` | `cacheTag(\`author-${aid}\`)` |
  | `revalidateTag(\`category-${cid}\`, "max")` | `cacheTag(\`category-${cid}\`)` |
  | `revalidateTag("posts-list", "max")` | `cacheTag("posts-list")` |

---

## Security & Isolation (Pitfalls #2, #5, #7)

- ✅ **Pitfall #2 (re-sanitize at render):** every `dangerouslySetInnerHTML` in `(site)` flows through `renderPostBody` — `/blog/[slug]` body (×7), T&C/Privacy pages (×7), contact intro. No raw injection.
- ✅ **Landmine #5 (ThemeContext coupling):** no real `import` of `ThemeContext` anywhere in `src/app/(site)` or `src/components/site` (all `ThemeContext` grep hits are `// does NOT import` guard comments). Public `ThemeToggle` uses the isolated `site-theme` localStorage key + a no-flash `<head>` script.
- ✅ **Pitfall #7 (cached contact action):** `src/actions/contact.ts` has NO `'use cache'` directive (the 2 grep hits are `// NO 'use cache'` comments), no `requireCan` (unauthenticated), honeypot + per-IP rate-limit present. `ContactForm` uses `useTransition` (×6), not `useMutation`; no `@tanstack/react-query` in `(site)` (D-28 honored).
- ✅ **Analytics XSS:** `Analytics.tsx` emits a plain `<script src>` (https-validated); `dangerouslySetInnerHTML` explicitly forbidden (guard comment L19).

---

## Schema + FTS (D-01 / D-04 / D-09 / D-11)

- ✅ `src/db/schema.ts`: `posts.featured` (bool, default false — L90), `posts.views` (int, default 0 — L93), `user.username` (varchar, unique — L230). **No new tables** (no `post_views`, no `contact_messages`) per D-01/D-08.
- ✅ Migration `0005_add_featured_views_username_fts.sql`: adds the 3 columns + a generated `search_vector` tsvector (`to_tsvector('simple', title || excerpt)`, STORED) + a GIN index. One `drizzle-kit generate` migration.
- ✅ `/search` uses `websearch_to_tsquery('simple', q)` + `ts_rank` ordering against the tsvector column (`queries/posts.ts:294-330`). `'simple'` config (no PG Bangla stemmer — documented SEARCH-02 v2 caveat).
- ℹ️ DB push/migrate (applying the migration to a live DB) is **deferred to Phase 7** per PROJECT.md; the migration FILE existing is the Phase 6 bar. `verify-schema-drift` reports `block=false` (migration files in sync with `schema.ts`).

---

## Out-of-Scope Fences Respected

No comments, no i18n routing, no paid APIs, no Vercel tooling, no reader auth. Analytics is **injection-only** (the Umami instance deploys in Phase 7). Nav is **hard-coded for v1** (menu builder is v2 — SETT-01). Dynamic OG generation deferred (Phase 7+). Preview route was verified, not rebuilt (Phase 3 D-19).

---

## Human Verification (UAT / Phase 7 — inherently manual)

These cannot be asserted by automated greps; they are carried forward as UAT items / Phase 7 dependencies and do **not** block this verification:

| Behavior | Requirement | Why manual | When |
|---|---|---|---|
| Single-post LCP paints before the Suspense holes stream | SITE-07 | Visual PPR streaming inspection (browser + throttling) | UAT |
| Dark-mode toggle works, no FOUC on reload | SITE-16 | Browser interaction + visual check | UAT |
| Contact-form email delivery | SITE-10 | Requires `RESEND_API_KEY` + inbox check | UAT |
| View count increments +1 per real visit (not per ISR regen) | SITE-17 | Requires live DB + browser | UAT (Phase 7 real-stack) |
| Build labels `/blog/[slug]` as a PPR route | SITE-07 | `pnpm build` output inspection on the real stack | Phase 7 PERF pass |

---

## Deviations Noted (non-blocking; documented in plan SUMMARYs)

- 06-02: touched the shared root `src/app/layout.tsx` (added `suppressHydrationWarning` to `<html>` — Rule 2, additive/safe; benefits both route groups).
- 06-03: 3 Rule-3 deviations (Drizzle snake_case result keys; `listRelated` union normalization at consumer; default exports).
- 06-04: 4 Rule-2 deviations (added `countPublished`/`countArchive`/`listTags`/`listAuthors` to the 06-01 query module for pagination + filter dropdowns; leftJoin `user` for bylines; extracted shared `Pagination`).
- 06-06: 1 Rule-1 deviation (union-type normalization on `listPublished` rows, auto-fixed).
- 06-07: manual `searchParams` parsing (Rule 3, version-safety); `Person` JSON-LD without `image` (existing builder signature); prev/next pagination on author page (no count return).
- Pre-existing `tsc --noEmit` errors in **unrelated** prior-phase files (`storage-settings.test.ts`, `ResetPasswordForm`, `SignInForm`, `SignUpForm`, date-picker, `AppSidebar`) are **not Phase 6 regressions** — present at base `3635e7e`. Out of scope here; track separately.

---

*Verification performed 2026-07-08 against `main` (commit `186eaf9`). All 7 plans merged; 384/384 tests green.*
