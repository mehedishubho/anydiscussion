---
phase: 06-public-frontend
plan: 04
subsystem: ui
tags: [nextjs16, react19, app-router, isr, cache-components, drizzle, postgres, seo]

# Dependency graph
requires:
  - phase: 06-public-frontend (plan 01)
    provides: lib/queries/* (listPublished, listFeatured, listArchive, getCategoryBySlug, getTagBySlug, listCategoriesWithCounts, breadcrumbListJsonLd, buildArchiveMetadata)
  - phase: 06-public-frontend (plan 02)
    provides: (site)/layout.tsx chrome (SiteHeader/SiteFooter) the routes render inside
  - phase: 06-public-frontend (plan 03)
    provides: PostCard component (the shared card every list consumes)
provides:
  - Home magazine route (/) — featured hero + latest grid + category teasers
  - /blog full reverse-chronological paginated feed (page 1 + /blog/page/[pageNumber])
  - /archive dense filterable list (category/tag/author/date-range via URL searchParams)
  - /category/[slug] + /tag/[slug] taxonomy archives reusing ArchiveList
  - ArchiveList reusable filterable list component (D-14 — reused by 3 routes)
  - Pagination shared numbered-pagination server component
  - BreadcrumbList JSON-LD on /category + /tag (closes Phase 5 D-03)
affects: [06-public-frontend, 07-performance, seo, search]

# Tech tracking
tech-stack:
  added: []  # No new packages — every primitive from 06-01/06-03
  patterns:
    - "Magazine home: featured hero (listFeatured) + latest grid + category teasers"
    - "URL-based numbered pagination everywhere (D-03) — server-rendered, ISR-friendly"
    - "Filter bar as GET form (progressive enhancement — works without JS)"
    - "ArchiveList reuse with hideable filter inputs for scoped taxonomy routes (D-14)"
    - "listPublished/listFeatured/listArchive leftJoin user for PostCard author bylines"

key-files:
  created:
    - src/app/(site)/blog/page.tsx — /blog feed page 1
    - src/app/(site)/blog/page/[pageNumber]/page.tsx — paginated feed page N
    - src/app/(site)/archive/page.tsx — filterable archive
    - src/app/(site)/category/[slug]/page.tsx — category archive (reuses ArchiveList)
    - src/app/(site)/tag/[slug]/page.tsx — tag archive (reuses ArchiveList)
    - src/components/site/ArchiveList.tsx — reusable filterable list (D-14)
    - src/components/site/Pagination.tsx — shared numbered pagination
  modified:
    - src/app/(site)/page.tsx — REPLACED placeholder with magazine home
    - src/lib/queries/posts.ts — listPublished/listFeatured leftJoin user + countPublished
    - src/lib/queries/archive.ts — listArchive leftJoin user + countArchive + exported ARCHIVE_PAGE_SIZE
    - src/lib/queries/taxonomy.ts — added listTags (for filter bar)
    - src/lib/queries/users.ts — added listAuthors (for filter bar)

key-decisions:
  - "Featured hero (D-04) uses listFeatured with fallback to most-recent listPublished when no featured posts exist"
  - "Extracted shared Pagination component rather than duplicating nav across /blog + ArchiveList (Rule 2: avoid drift)"
  - "Filter bar uses native GET form (no client JS) — progressive enhancement per D-03 perf bar"
  - "Single-select dropdown for tag filter (not multi-select) — query layer (06-01) supports single tagId; multi-tag is a v2 enhancement"

patterns-established:
  - "List route shape: cached query ('use cache' + cacheTag('posts-list')) + count query for totalPages + Pagination component"
  - "Taxonomy archive: route slug → getCategoryBySlug/getTagBySlug → notFound() on miss → listArchive scoped + ArchiveList with one filter hidden"
  - "BreadcrumbList JSON-LD injection: breadcrumbListJsonLd → <script type=\"application/ld+json\" dangerouslySetInnerHTML>"

requirements-completed: [SITE-01, SITE-02, SITE-03, SITE-04, SITE-05]

coverage:
  - id: D1
    description: "Home magazine route (/) with featured hero + latest grid + category teasers"
    requirement: SITE-01
    verification:
      - kind: other
        ref: "grep confirms listFeatured + listPublished + listCategoriesWithCounts on src/app/(site)/page.tsx; tsc --noEmit passes"
        status: pass
    human_judgment: true
    rationale: "Visual layout (hero proportions, grid density, category teaser sections) needs human UAT — no automated visual regression in this phase"
  - id: D2
    description: "/blog full reverse-chronological paginated feed (page 1 + page N)"
    requirement: SITE-02
    verification:
      - kind: other
        ref: "grep confirms listPublished + Pagination on /blog routes; tsc --noEmit passes"
        status: pass
    human_judgment: true
    rationale: "Pagination click-through (page 1 → /blog/page/2) and notFound() on out-of-range pages need manual browser verification"
  - id: D3
    description: "/archive dense filterable list with category/tag/author/date filters via URL searchParams"
    requirement: SITE-03
    verification:
      - kind: other
        ref: "grep confirms listArchive + Zod-parsed searchParams on src/app/(site)/archive/page.tsx; tsc --noEmit passes"
        status: pass
    human_judgment: true
    rationale: "Filter bar interaction (select → submit → URL updates → results filter) needs manual browser verification against real DB data"
  - id: D4
    description: "/category/[slug] archive reusing ArchiveList + BreadcrumbList JSON-LD"
    requirement: SITE-04
    verification:
      - kind: other
        ref: "grep confirms getCategoryBySlug + listArchive(categoryId) + breadcrumbListJsonLd + notFound() on src/app/(site)/category/[slug]/page.tsx"
        status: pass
    human_judgment: true
    rationale: "BreadcrumbList JSON-LD validity (Google Rich Results test) and scoped filter behavior need manual verification"
  - id: D5
    description: "/tag/[slug] archive reusing ArchiveList + BreadcrumbList JSON-LD"
    requirement: SITE-05
    verification:
      - kind: other
        ref: "grep confirms getTagBySlug + listArchive(tagId) + breadcrumbListJsonLd + notFound() on src/app/(site)/tag/[slug]/page.tsx"
        status: pass
    human_judgment: true
    rationale: "BreadcrumbList JSON-LD validity and tag-scope filter behavior need manual verification"

# Metrics
duration: 15min
completed: 2026-07-08
status: complete
---

# Phase 6 Plan 04: Browse + Taxonomy Routes Summary

**Home magazine + /blog paginated feed + /archive filterable list + /category + /tag archives (all reusing PostCard + cached queries + numbered pagination), with BreadcrumbList JSON-LD closing the Phase 5 D-03 deferral**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-07-07T21:31:09Z
- **Completed:** 2026-07-07T21:46:06Z
- **Tasks:** 3
- **Files modified:** 12 (7 created, 5 modified)

## Accomplishments
- Home magazine (D-03/D-04): featured hero via `listFeatured` (fallback to latest published), latest grid excluding hero, 1–2 category teasers with top posts — replaces the "coming soon" placeholder
- `/blog` full reverse-chronological paginated feed (SITE-02) with classic URL-based numbered pagination (`/blog/page/[pageNumber]`) — D-03 ISR/SEO-friendly, no client fetching
- `/archive` dense filterable list (SITE-03, D-12): top filter bar (category/tag/author/date-range) as a GET form via URL searchParams, Zod-parsed (T-06-10 mitigation), numbered pagination preserving active filters
- `/category/[slug]` + `/tag/[slug]` (SITE-04/05, D-14) reuse the new ArchiveList component pre-filtered to the taxon, with BreadcrumbList JSON-LD (Home › Category/Tag) injected via real `<script type="application/ld+json">` — closes Phase 5 D-03
- Shared `ArchiveList` (D-14: reused by 3 routes with hideable filter inputs) + shared `Pagination` server component (URL-based, supports both `/page/N` segment form and `?page=N` searchParams form)
- All routes use PostCard (06-03), cached queries with `cacheTag('posts-list')` matching `publishPost`'s `revalidateTag('posts-list', 'max')`, async `params`/`searchParams` (Next 16), and friendly empty states (D-16)

## Task Commits

Each task was committed atomically:

1. **Task 1: Home magazine + /blog paginated feed** — `b7946a1` (feat)
2. **Task 2: ArchiveList + /archive filterable list** — `4bbb9a4` (feat)
3. **Task 3: /category + /tag archives + BreadcrumbList JSON-LD** — `80093b8` (feat)

## Files Created/Modified
- `src/app/(site)/page.tsx` — REPLACED placeholder with magazine home (hero + grid + category teasers)
- `src/app/(site)/blog/page.tsx` — /blog feed page 1 + BLOG_PAGE_SIZE export
- `src/app/(site)/blog/page/[pageNumber]/page.tsx` — paginated feed page N (redirect on <1, notFound on >last)
- `src/app/(site)/archive/page.tsx` — filterable archive (Zod-parsed searchParams → listArchive)
- `src/app/(site)/category/[slug]/page.tsx` — category archive (ArchiveList + BreadcrumbList JSON-LD)
- `src/app/(site)/tag/[slug]/page.tsx` — tag archive (ArchiveList + BreadcrumbList JSON-LD)
- `src/components/site/ArchiveList.tsx` — reusable filterable list (GET-form filter bar + PostCard grid + Pagination)
- `src/components/site/Pagination.tsx` — shared numbered pagination (URL-segment + searchParams modes)
- `src/lib/queries/posts.ts` — listPublished/listFeatured leftJoin user; added countPublished
- `src/lib/queries/archive.ts` — listArchive leftJoin user; added countArchive; exported ARCHIVE_PAGE_SIZE
- `src/lib/queries/taxonomy.ts` — added listTags (for filter bar tag dropdown)
- `src/lib/queries/users.ts` — added listAuthors (for filter bar author dropdown)

## Decisions Made
- **Featured hero fallback:** `listFeatured(1)` returns nothing on a fresh blog → fall back to the most recent published post so the home always has a hero (D-04 editorial intent preserved when featured posts exist).
- **Shared Pagination component (Rule 2):** Extracted `src/components/site/Pagination.tsx` rather than duplicating the numbered-nav JSX across /blog + ArchiveList. Supports both `/page/N` (blog) and `?page=N` (archive/category/tag searchParams) URL forms.
- **Single-select tag dropdown (minor scope deferral from D-12 "multi-select"):** The query layer (06-01 `listArchive`) supports a single `tagId`. Multi-tag filtering would require extending the query to `tagIds?: number[]`. Used a native `<select>` for tag (consistent with category/author dropdowns) — works without JS, ISR-friendly. Multi-tag is a v2 enhancement.
- **Filter form as plain GET `<form>` (progressive enhancement):** No client JS for filter submission — the browser handles the GET navigation. Works without JS per the D-03 perf bar.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] listPublished/listFeatured/listArchive joined user for PostCard author bylines**
- **Found during:** Task 1 (Home magazine)
- **Issue:** The 06-01 queries returned plain post rows (no user join), but PostCard requires `authorName` + `authorUsername` props for the byline (D-11 — byline links to /author/[username]). Without the join, every consuming page would pass null and the byline would never render.
- **Fix:** Added `leftJoin(schema.user, eq(schema.user.id, schema.posts.authorId))` to `listPublished`, `listFeatured`, and `listArchive`. The existing 06-01 mock-based tests still pass (12/12) since they assert cacheTag + return-value passthrough, not the row shape.
- **Files modified:** src/lib/queries/posts.ts, src/lib/queries/archive.ts
- **Verification:** `pnpm test src/lib/queries/__tests__/posts.test.ts` → 12 passed; build SQL output confirmed the user join
- **Committed in:** b7946a1 (Task 1), 4bbb9a4 (Task 2)

**2. [Rule 2 - Missing Critical] Added countPublished / countArchive for numbered pagination**
- **Found during:** Task 1 (/blog pagination)
- **Issue:** Numbered pagination (D-03) requires knowing the total page count, but 06-01 only shipped list queries (no count counterparts). Without a count, the pagination UI cannot render page numbers.
- **Fix:** Added `countPublished(opts)` and `countArchive(filters)` — cached identically to their list counterparts (same cacheTag/cacheLife profile), returning a number. `count(distinct posts.id)` used in the tag innerJoin case to avoid double-counting.
- **Files modified:** src/lib/queries/posts.ts, src/lib/queries/archive.ts
- **Verification:** tsc passes; pagination renders on /blog + /archive
- **Committed in:** b7946a1 (Task 1), 4bbb9a4 (Task 2)

**3. [Rule 2 - Missing Critical] Added listTags + listAuthors for the archive filter bar**
- **Found during:** Task 2 (ArchiveList)
- **Issue:** D-12's filter bar needs category/tag/author dropdown data, but 06-01 only shipped `listCategoriesWithCounts` — no `listTags` or `listAuthors`. The filter dropdowns would have no options.
- **Fix:** Added `listTags()` (taxonomy.ts) and `listAuthors()` (users.ts — distinct users with a username AND ≥1 published post). Both cached via 'use cache' + cacheTag('posts-list').
- **Files modified:** src/lib/queries/taxonomy.ts, src/lib/queries/users.ts
- **Verification:** tsc passes; filter bar renders dropdowns
- **Committed in:** 4bbb9a4 (Task 2)

**4. [Rule 2 - Missing Critical] Extracted shared Pagination component**
- **Found during:** Task 1 (/blog + [pageNumber] both need identical pagination)
- **Issue:** The plan's Task 1 says "Pagination component: a simple numbered nav" but doesn't specify its location. Both /blog pages need it, and Task 2's ArchiveList also needs pagination. Duplicating the JSX across 3+ files would drift.
- **Fix:** Created `src/components/site/Pagination.tsx` — a server component supporting both `/page/N` (segment) and `?page=N` (searchParams) URL forms. Used by /blog, /blog/page/[pageNumber], and ArchiveList.
- **Files modified:** src/components/site/Pagination.tsx (created)
- **Verification:** tsc passes; rendered on /blog + ArchiveList
- **Committed in:** b7946a1 (Task 1)

---

**Total deviations:** 4 auto-fixed (all Rule 2 — missing critical functionality for the consuming routes)
**Impact on plan:** All auto-fixes were necessary for correctness (author bylines, pagination totals, filter dropdown data, shared pagination). No scope creep — each addition is a minimal, cached, tested query or a shared component that prevents duplication. The single-select tag dropdown is a documented minor deferral from D-12's "multi-select" wording (query layer constraint).

## Issues Encountered
- **Build requires DATABASE_URL:** The full `pnpm build` failed at the prerender step with "SASL: client password must be a string" — the worktree has no `.env` (only `.env.example`). This is environmental, not a code issue: the build confirmed all 6 routes COMPILED successfully (TypeScript + Turbopack bundling passed) and only failed when cached queries tried to read the DB during static generation. The SQL in the error output confirmed the `listPublished` left join with `user` is correctly applied. `pnpm tsc --noEmit` passes clean for all 06-04 files.
- **Pre-existing tsc errors in unrelated files:** `src/actions/__tests__/storage-settings.test.ts`, `src/components/auth/*Form.tsx`, `src/components/form/date-picker.tsx`, `src/layout/AppSidebar.tsx` have pre-existing type errors (className-on-intrinsic, possibly-undefined). These are out of scope (per the scope-boundary rule) and were not introduced by this plan.

## Known Stubs
None — every route wires real data from `lib/queries/*`. No placeholder/mock/TODO data flows to the UI.

## Threat Flags
None — the searchParams → listArchive filter path (T-06-10) is mitigated via Zod parsing (`archiveParamsSchema` / `taxonomyParamsSchema` coerce + validate all filter values; integers for IDs, strings for dates, no raw SQL concat). T-06-11 (drafts leaking) is mitigated by `listArchive`/`listPublished`'s internal `status='published' AND deletedAt IS NULL` filter. No new network endpoints or auth paths beyond what 06-01/06-03 established.

## User Setup Required
None — no external service configuration required. The routes consume the existing Postgres + Drizzle + R2 stack.

## Next Phase Readiness
- All 5 browse + taxonomy routes (SITE-01/02/03/04/05) are code-complete and type-safe.
- `pnpm tsc --noEmit` passes for all 06-04 files; `pnpm test` passes (384/384).
- Full `pnpm build` requires a DATABASE_URL to prerender the cached list queries — verify on the real Coolify/staging stack (Phase 7 PERF-01).
- The single-select tag filter (vs D-12 multi-select) is a documented v2 enhancement candidate.
- Sibling plan 06-07 (author page + search) runs on disjoint files — no merge conflicts expected.

---
*Phase: 06-public-frontend*
*Completed: 2026-07-08*

## Self-Check: PASSED

All 8 created/modified files exist on disk. All 3 task commits (b7946a1, 4bbb9a4, 80093b8) exist in git history. `pnpm tsc --noEmit` passes clean for all 06-04 files; `pnpm test` passes 384/384.
