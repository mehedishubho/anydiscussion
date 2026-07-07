---
phase: 06-public-frontend
plan: 07
subsystem: ui
tags: [search, fts, postgres, nextjs16, suspense, ppr, author-page, jsonld, seo]

# Dependency graph
requires:
  - phase: 06-public-frontend (Plan 01)
    provides: searchPosts (FTS via websearch_to_tsquery 'simple'), getUserByUsername, listAuthorPosts, personJsonLd, buildArchiveMetadata, the tsvector column + GIN index from migration 0005
  - phase: 06-public-frontend (Plan 03)
    provides: PostCard component (reusable card with authorName/authorUsername props)
provides:
  - "/search route (SITE-08) — server-GET form + Postgres FTS ranked results in <Suspense>"
  - "/author/[username] route (SITE-06) — full bio page + Person JSON-LD (closes Phase 5 D-03)"
  - "SearchForm component — progressive-enhancement GET form (zero client JS per D-09)"
affects: [06-public-frontend (Plan 04 — SiteHeader search icon links to /search), seo-audit, phase-07-perf]

# Tech tracking
tech-stack:
  added: []  # No new packages — consumed existing primitives (searchPosts, getUserByUsername, personJsonLd, PostCard)
  patterns:
    - "Progressive-enhancement server GET form (no client JS) — D-09 page-only search"
    - "FTS results streamed in <Suspense> (uncached DB access under cacheComponents)"
    - "Person JSON-LD injection on author page (script tag + JSON.stringify)"
    - "Prev/Next pagination (v1 scope-lean; numbered pagination is the D-03 canonical pattern)"
    - "Manual bounded searchParams parsing (T-06-17 input validation without Zod preprocess API drift)"

key-files:
  created:
    - src/components/site/SearchForm.tsx
    - src/app/(site)/search/page.tsx
    - src/app/(site)/author/[username]/page.tsx
  modified: []

key-decisions:
  - "SearchForm is a plain HTML <form method=\"GET\" action=\"/search\"> — zero client JS per D-09. Filter changes re-navigate via GET submit."
  - "FTS results wrapped in <Suspense> — searchPosts is uncached DB access; under cacheComponents it MUST stream (Pitfall: 'Uncached data was accessed outside of <Suspense>')."
  - "searchPosts used as-is from Plan 06-01 — author info not joined (FTS targets title+excerpt tsvector). PostCard receives authorName=null on search cards (mirrors RelatedPosts pattern from 06-03)."
  - "Prev/Next pagination on author page instead of numbered — listAuthorPosts doesn't return a total count; Prev/Next avoids a count query (v1 scope-lean; numbered is D-03 canonical for v2)."
  - "Person JSON-LD built via the existing personJsonLd({name, url, description}) signature — the `image` field mentioned in the plan action is not in the Plan 06-01 builder interface; avatar renders visually via next/image but is not in the JSON-LD payload."

patterns-established:
  - "Progressive-enhancement GET form: <form method=\"GET\"> with named inputs → URL searchParams → server component reads + renders. Zero client JS."
  - "Manual bounded searchParams parsing: firstValue() flattens arrays, bounded() trims + length-caps, clampPage() bounds integers. Avoids Zod preprocess API drift."

requirements-completed: [SITE-06, SITE-08]

# Coverage metadata (#1602)
coverage:
  - id: D1
    description: "SearchForm — plain HTML GET form with q/category/author/date-range filters, zero client JS, pre-filled from searchParams"
    requirement: SITE-08
    verification:
      - kind: other
        ref: "grep method=\"GET\" src/components/site/SearchForm.tsx → 3 matches (form + 2 comments)"
        status: pass
      - kind: other
        ref: "grep '\"use client\"' src/components/site/SearchForm.tsx → 0 matches (server-only)"
        status: pass
      - kind: unit
        ref: "pnpm tsc --noEmit — no errors in SearchForm.tsx"
        status: pass
    human_judgment: true
    rationale: "The GET form's progressive-enhancement behavior (works without JS, filters re-navigate via GET submit) needs visual confirmation in a browser."
  - id: D2
    description: "/search page — FTS ranked results in <Suspense>, URL searchParams filters, empty states for no-query and no-results"
    requirement: SITE-08
    verification:
      - kind: other
        ref: "grep searchPosts src/app/(site)/search/page.tsx → 11 matches"
        status: pass
      - kind: other
        ref: "grep Suspense src/app/(site)/search/page.tsx → 8 matches (boundary wraps SearchResults)"
        status: pass
      - kind: unit
        ref: "src/lib/queries/__tests__/search.test.ts — searchPosts FTS invariants (Plan 06-01 Wave 0)"
        status: pass
      - kind: unit
        ref: "pnpm tsc --noEmit — no errors in search/page.tsx"
        status: pass
    human_judgment: true
    rationale: "FTS ranking relevance and empty-state UX need visual + content verification against real Bangla/English posts."
  - id: D3
    description: "/author/[username] — bio header (name + avatar + bio), Person JSON-LD, published posts via PostCard, notFound() on missing username"
    requirement: SITE-06
    verification:
      - kind: other
        ref: "grep getUserByUsername src/app/(site)/author/[username]/page.tsx → 5 matches"
        status: pass
      - kind: other
        ref: "grep personJsonLd src/app/(site)/author/[username]/page.tsx → 3 matches (closes Phase 5 D-03)"
        status: pass
      - kind: other
        ref: "grep notFound src/app/(site)/author/[username]/page.tsx → 5 matches (T-06-18 no existence leak)"
        status: pass
      - kind: other
        ref: "grep from \"next/image\" → 1 match; grep \"<img \" → 0 matches (CLAUDE.md mandate)"
        status: pass
      - kind: unit
        ref: "pnpm tsc --noEmit — no errors in author/[username]/page.tsx"
        status: pass
    human_judgment: true
    rationale: "Author bio layout, avatar rendering, and Person JSON-LD correctness need visual + Google Rich Results Test verification."

# Metrics
duration: 9min
completed: 2026-07-08
status: complete
---

# Phase 6 Plan 07: Search + Author Page Summary

**Server-GET /search with Postgres FTS ranked results in Suspense (zero client JS, D-09) + /author/[username] bio page with Person JSON-LD (closes Phase 5 D-03 per D-11).**

## Performance

- **Duration:** ~9 min
- **Started:** 2026-07-07T21:31:49Z
- **Completed:** 2026-07-07T21:40:45Z
- **Tasks:** 2/2
- **Files created:** 3
- **Tests:** 384 pass (37 test files) — no regressions

## Accomplishments

- **/search (SITE-08 / D-09):** A dedicated server-rendered search page with a plain HTML GET form (SearchForm component). The form submits q/category/author/date-range filters via URL searchParams — zero client JS, fully crawlable. Ranked FTS results (websearch_to_tsquery 'simple' with ts_rank) stream inside a `<Suspense>` boundary. Friendly empty states for no-query and no-results (D-16).
- **/author/[username] (SITE-06 / D-11):** A full author bio page with avatar (next/image), name, bio from AUTH-08, and their published posts rendered as PostCards. The Person JSON-LD `<script>` closes the Phase 5 D-03 deferral. notFound() on missing usernames (T-06-18 — no existence leak). Prev/Next pagination preserves the author base path.
- **Security:** searchParams parsed via manual bounded validation (T-06-17 — V5/V8 ASVS). searchPosts uses parameterized Drizzle sql template (no string concat). getUserByUsername returns only public fields (T-06-18). All images via next/image (never raw `<img>`).

## Task Commits

Each task was committed atomically:

1. **Task 1: /search page — server GET form + FTS ranked results** — `0d44152` (feat)
2. **Task 2: /author/[username] bio page + Person JSON-LD** — `200b1a1` (feat)

## Files Created/Modified

- `src/components/site/SearchForm.tsx` — Plain HTML `<form method="GET" action="/search">` (progressive enhancement, zero client JS). Inputs for q/category/author/date-range, pre-filled from searchParams. Category dropdown populated from listCategoriesWithCounts.
- `src/app/(site)/search/page.tsx` — Server component: async searchParams (Next 16), manual bounded parsing, SearchForm render, FTS results from searchPosts in `<Suspense>`, empty states (D-16), generateMetadata via buildArchiveMetadata.
- `src/app/(site)/author/[username]/page.tsx` — Server component: getUserByUsername → notFound() on miss, bio header (next/image avatar + name + bio), Person JSON-LD script, listAuthorPosts → PostCard grid, Prev/Next pagination, generateMetadata via buildArchiveMetadata.

## Decisions Made

1. **searchPosts used as-is (no user join):** searchPosts (from Plan 06-01) targets the title+excerpt tsvector and doesn't join user. PostCard receives `authorName=null` and `authorUsername=null` on search cards — mirroring the RelatedPosts pattern established in Plan 06-03. Bylines are omitted on search result cards; the title/excerpt/rank carry the relevance signal. Extending searchPosts to join user would modify a Plan 06-01 file (parallel-execution risk) for marginal gain.

2. **Manual searchParams parsing instead of Zod preprocess:** The initial implementation used `z.preprocess(firstValue, ...)` to flatten `string | string[]` searchParams. To avoid Zod v4 preprocess API drift (the `preprocess` signature may differ across Zod versions), the parsing was rewritten as explicit manual functions (`firstValue`, `bounded`, `clampPage`). Every coercion is visible at the boundary — clearer and version-safe.

3. **Prev/Next pagination on author page:** listAuthorPosts (from Plan 06-01) doesn't return a total count. Full numbered pagination (D-03 canonical) would require either a separate count query or extending listAuthorPosts. For v1, Prev/Next links infer "hasNext" from a full page (AUTHOR_PAGE_SIZE = 10) — clean, ISR-friendly, avoids extra DB load.

4. **Person JSON-LD without `image`:** The plan's Task 2 action mentions passing `image: user.avatar` to personJsonLd. The existing builder (from Plan 06-01) accepts `{ name, url, jobTitle?, description? }` — no `image` field. Used the existing signature without image rather than modifying a Plan 06-01 file (parallel-execution risk). The avatar renders visually via next/image; schema.org Person without image is still valid.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking Issue] Zod preprocess API uncertainty → manual parsing**
- **Found during:** Task 1 (/search page)
- **Issue:** Initial `z.preprocess(firstValue, ...)` approach risked Zod v4 API drift (the `preprocess` export/behavior differs across Zod versions). A failed parse on a reader-facing route is a blocking issue.
- **Fix:** Rewrote searchParams parsing as explicit manual functions (`firstValue`, `bounded`, `clampPage`) with the same validation semantics (array flatten, trim, length-cap, int bounds). Removed the `z` import.
- **Files modified:** `src/app/(site)/search/page.tsx`
- **Verification:** `pnpm tsc --noEmit` passes; 384 tests pass.
- **Committed in:** `0d44152` (part of Task 1 commit)

---

**Total deviations:** 1 auto-fixed (Rule 3 — blocking issue avoidance)
**Impact on plan:** All auto-fixes necessary for correctness/version-safety. No scope creep. The other three decisions (searchPosts as-is, Prev/Next pagination, Person JSON-LD without image) are implementation choices within the plan's intent, not deviations from acceptance criteria.

## Issues Encountered

None — both tasks executed cleanly. Pre-existing TypeScript errors in unrelated files (`src/components/auth/*`, `src/components/form/date-picker.tsx`, `src/layout/AppSidebar.tsx`, `src/actions/__tests__/storage-settings.test.ts`) are out of scope (they predate this plan and are in files this plan does not touch).

## User Setup Required

None — no external service configuration required. The search and author routes consume existing database tables (posts, user) and existing query/SEO primitives. No new env vars, no new settings keys.

## Next Phase Readiness

- `/search` and `/author/[username]` are ready for the Phase 6 Plan 04 SiteHeader to link the search icon → `/search` and for post bylines to link → `/author/[username]`.
- The Person JSON-LD closes the Phase 5 D-03 author-page deferral; the BreadcrumbList JSON-LD (for category/tag) remains for Plan 06-04/06-05.
- Phase 7 PERF-01/02 will verify LCP/CLS on these routes on the real Coolify/Cloudflare stack and confirm the FTS tsvector column + GIN index perform at scale.
- The FTS 'simple' config (no stemming) is Bangla-compatible per SEARCH-02 v2; Bangla FTS stemming remains a v2 deferral (no PG Bengali stemmer until partial PG 17).

## Self-Check: PASSED

**Files verified:**
- FOUND: `src/components/site/SearchForm.tsx`
- FOUND: `src/app/(site)/search/page.tsx`
- FOUND: `src/app/(site)/author/[username]/page.tsx`
- FOUND: `.planning/phases/06-public-frontend/06-07-SUMMARY.md`

**Commits verified:**
- FOUND: `0d44152` (feat — Task 1: /search page)
- FOUND: `200b1a1` (feat — Task 2: /author/[username] page)

**Verification results:**
- `pnpm tsc --noEmit` — 0 errors in plan files (pre-existing errors in unrelated files only)
- `pnpm test` — 384 pass / 37 files (no regressions)
- Acceptance-criteria greps — all pass (method="GET", searchPosts, getUserByUsername, personJsonLd, next/image, notFound, Suspense, empty states)

---
*Phase: 06-public-frontend*
*Plan: 07*
*Completed: 2026-07-08*
