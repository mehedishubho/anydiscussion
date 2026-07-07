---
phase: 06-public-frontend
plan: 01
subsystem: public-frontend-foundation
tags: [schema, queries, reading-time, toc, rate-limit, jsonld, fts, migration]
requires:
  - "Phase 3 (excerpt/collectText, renderPostBody)"
  - "Phase 5 (seo/jsonld.ts, seo/settings.ts cacheTag pattern)"
  - "publishPost's existing 2-arg revalidateTag calls (actions/posts.ts L363-368)"
provides:
  - "src/lib/queries/posts.ts — getPostForPublic, incrementViewCount, listPublished, listFeatured, listRelated, searchPosts"
  - "src/lib/queries/taxonomy.ts — getCategoryBySlug, getTagBySlug, listCategoriesWithCounts"
  - "src/lib/queries/users.ts — getUserByUsername, listAuthorPosts"
  - "src/lib/queries/pages.ts — getPublishedPage"
  - "src/lib/queries/archive.ts — listArchive"
  - "src/lib/reading-time/index.ts — deriveReadingTime"
  - "src/lib/toc/index.ts — buildToc"
  - "src/lib/rate-limit/index.ts — tryConsume"
  - "src/lib/seo/jsonld.ts — personJsonLd, breadcrumbListJsonLd"
  - "Migration 0005_add_featured_views_username_fts.sql"
affects:
  - "src/db/schema.ts (posts.featured, posts.views, posts.searchVector + GIN, user.username)"
  - "src/lib/excerpt/index.ts (collectText now exported)"
  - "src/lib/storage/seed.ts (seedPublicFrontendSettings)"
  - "src/instrumentation.ts (seedPublicFrontendSettings call)"
tech-stack:
  added: []
  patterns:
    - "tsvector customType for PG FTS (Drizzle vector() is pgvector embeddings, not tsvector)"
    - "Intl.Segmenter { granularity: 'word' } with isWordLike filtering for Bangla-aware word count"
    - "Unicode-safe heading slugifier (\\p{L}\\p{N} with /u flag) for Bangla TOC IDs"
    - "In-memory Map-based rate-limit (D-07, single-instance v1)"
key-files:
  created:
    - src/lib/queries/posts.ts
    - src/lib/queries/taxonomy.ts
    - src/lib/queries/users.ts
    - src/lib/queries/pages.ts
    - src/lib/queries/archive.ts
    - src/lib/reading-time/index.ts
    - src/lib/toc/index.ts
    - src/lib/rate-limit/index.ts
    - src/lib/queries/__tests__/posts.test.ts
    - src/lib/queries/__tests__/search.test.ts
    - src/lib/queries/__tests__/users.test.ts
    - src/lib/reading-time/__tests__/reading-time.test.ts
    - src/lib/toc/__tests__/toc.test.ts
    - src/lib/rate-limit/__tests__/rate-limit.test.ts
    - src/db/migrations/0005_add_featured_views_username_fts.sql
  modified:
    - src/db/schema.ts
    - src/lib/excerpt/index.ts
    - src/lib/storage/seed.ts
    - src/instrumentation.ts
    - src/lib/seo/jsonld.ts
    - src/lib/seo/__tests__/jsonld.test.ts
    - src/db/migrations/meta/_journal.json
key-decisions:
  - "D-09: FTS uses tsvector customType, not Drizzle vector() — vector() requires pgvector dimensions and is for embeddings, not full-text search"
  - "D-15: Intl.Segmenter isWordLike filtering prevents punctuation from inflating word count"
  - "D-20: TOC heading IDs use \\p{L}\\p{N} Unicode property escapes, not validateSlug (Latin-only)"
requirements-completed:
  - SITE-07
  - SITE-08
  - SITE-13
  - SITE-17
duration: "23 min"
completed: 2026-07-07
status: complete
coverage:
  - deliverable: "Schema migration with featured/views/username/searchVector + GIN"
    verification:
      - kind: command
        ref: "pnpm drizzle-kit generate --name add_featured_views_username_fts"
        status: pass
      - kind: command
        ref: "pnpm tsc --noEmit (zero errors in 06-01 files)"
        status: pass
    human_judgment: false
  - deliverable: "Published-only query module (5 modules, 13 exports)"
    verification:
      - kind: tests
        ref: "src/lib/queries/__tests__/posts.test.ts"
        status: pass
      - kind: tests
        ref: "src/lib/queries/__tests__/users.test.ts"
        status: pass
      - kind: tests
        ref: "src/lib/queries/__tests__/search.test.ts"
        status: pass
      - kind: command
        ref: "grep -rl requireCan src/lib/queries/ returns nothing"
        status: pass
    human_judgment: false
  - deliverable: "JSON-LD builders (personJsonLd, breadcrumbListJsonLd)"
    verification:
      - kind: tests
        ref: "src/lib/seo/__tests__/jsonld.test.ts#personJsonLd+breadcrumbListJsonLd"
        status: pass
    human_judgment: false
  - deliverable: "Reading-time utility (Bangla-aware via Intl.Segmenter)"
    verification:
      - kind: tests
        ref: "src/lib/reading-time/__tests__/reading-time.test.ts"
        status: pass
    human_judgment: false
  - deliverable: "TOC utility (H2/H3 extraction, Unicode-safe IDs, dedupe)"
    verification:
      - kind: tests
        ref: "src/lib/toc/__tests__/toc.test.ts"
        status: pass
    human_judgment: false
  - deliverable: "Rate-limit utility (in-memory per-IP windowed)"
    verification:
      - kind: tests
        ref: "src/lib/rate-limit/__tests__/rate-limit.test.ts"
        status: pass
    human_judgment: false
  - deliverable: "Settings seeds (contact.email, analytics, footer socials)"
    verification:
      - kind: command
        ref: "grep seedPublicFrontendSettings src/lib/storage/seed.ts src/instrumentation.ts"
        status: pass
    human_judgment: false
---

# Phase 6 Plan 1: Public Frontend Foundation Slice Summary

Schema migration (featured/views/username/FTS tsvector+GIN) + published-only read-query module (5 modules) + atomic view-count write + Bangla-aware reading-time (Intl.Segmenter) + TOC builder (H2/H3, Unicode-safe IDs) + in-memory rate-limit + Person/BreadcrumbList JSON-LD builders + settings seeds + Wave 0 test scaffolds.

**Duration:** 23 min | **Start:** 2026-07-07T15:19:22Z | **End:** 2026-07-07T15:42:41Z
**Tasks:** 3/3 complete | **Test files:** 6 new (54 tests) | **Full suite:** 384 tests green

## Accomplishments

- **Schema migration generated** (`0005_add_featured_views_username_fts.sql`): `posts.featured` (bool D-04), `posts.views` (int D-01), `posts.searchVector` (generated tsvector D-09 with 'simple' config + GIN index), `user.username` (varchar unique D-11). Posts table switched to 3-arg pgTable form for the GIN index.
- **5 published-only query modules created** (`src/lib/queries/{posts,taxonomy,users,pages,archive}.ts`): 13 exports total, all filtering `status='published' AND deletedAt IS NULL` (T-06-02), no permission gates. cacheTag strings match publishPost's existing 2-arg `revalidateTag(..., "max")` calls.
- **Atomic view-count increment** (`incrementViewCount`): `UPDATE posts SET views = views + 1 RETURNING views` — the ONE public write, no cache, runs per-request under PPR via `connection()` (plan 06-03).
- **FTS search** (`searchPosts`): `websearch_to_tsquery('simple', query)` with `ts_rank` ordering — 'simple' config has no stemming (Bangla-compatible per SEARCH-02).
- **Bangla-aware reading-time** (`deriveReadingTime`): reuses exported `collectText` from `@/lib/excerpt` + `Intl.Segmenter` with `isWordLike` filtering for accurate cross-script word counting (D-15).
- **TOC builder** (`buildToc`): recursive ProseMirror walker extracting H2/H3 only, with `\p{L}\p{N}` Unicode-safe slugifier (handles Bangla headings) and dedupe suffix (NOT `@/lib/slug` which rejects non-Latin per D-20).
- **In-memory rate-limit** (`tryConsume`): `Map<string, {count, resetAt}>` per-IP windowed store (D-07). v1 single-instance; v2 swaps for Redis (SCALE-01).
- **JSON-LD builders** (`personJsonLd`, `breadcrumbListJsonLd`): closes Phase 5 D-03 deferrals for author pages (SITE-06) and taxonomy archives (SITE-04/05).
- **Settings seeds**: `contact.recipient_email`, `analytics.script`, `analytics.umami_id`, `footer.social_{twitter,facebook,linkedin}` — empty defaults, wired into `instrumentation.ts` after `seedSeoSettings()`.
- **Wave 0 tests**: 6 new test files (54 tests) covering published-only invariants, atomic increment, cacheTag presence, FTS 'simple' config, reading-time (Bangla + English + empty), TOC (H2/H3 + dedupe + nested), rate-limit (per-IP window + reset + independent IPs).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Drizzle `vector()` is pgvector, not tsvector**
- **Found during:** Task 1 — drizzle-kit generate
- **Issue:** The plan (and RESEARCH A1) assumed `vector()` from `drizzle-orm/pg-core` maps to PostgreSQL's `tsvector`. It does NOT — `vector()` is for the pgvector extension (embeddings) and requires a `dimensions` argument. `drizzle-kit generate` failed with `TypeError: Cannot read properties of undefined (reading 'dimensions')`.
- **Fix:** Defined a `customType<{ data: string }>({ dataType() { return "tsvector" } })` column type. `generatedAlwaysAs` works on custom columns. The generated migration produces correct `tsvector GENERATED ALWAYS AS (...) STORED` DDL.
- **Files modified:** `src/db/schema.ts`
- **Commit:** d8eade1

**2. [Rule 1 - Bug] Intl.Segmenter counted punctuation segments as words**
- **Found during:** Task 3 — GREEN phase reading-time tests
- **Issue:** `segmenter.segment(text)` iterates ALL segments (words, punctuation, whitespace). Counting without filtering inflated the word count (e.g., 400 words + 399 spaces = ~799 "words").
- **Fix:** Added `if (seg.isWordLike) words++;` to only count word-like segments.
- **Files modified:** `src/lib/reading-time/index.ts`
- **Commit:** 46b0655

**3. [Rule 1 - Test bug] Bangla reading-time test had insufficient repetitions**
- **Found during:** Task 3 — GREEN phase reading-time tests
- **Issue:** The Bangla test text (14 words/sentence × 20 repetitions = ~260 words) produced 1 min at 200 WPM, but the assertion expected >= 2.
- **Fix:** Increased repetitions from 20 to 30 (~420 words → ~2 min).
- **Files modified:** `src/lib/reading-time/__tests__/reading-time.test.ts`
- **Commit:** 46b0655

**Total deviations:** 3 auto-fixed (3 Rule 1 bugs). **Impact:** All deviations are corrected and verified. The tsvector customType produces correct migration SQL; the isWordLike filter and test adjustment produce accurate reading-time calculations.

## TDD Gate Compliance

This plan used task-level TDD (Tasks 2 and 3 have `tdd="true"`). Gate sequence verified in git log:

- **Task 2:** `test(06-01)` commit (226d8e1, RED) → `feat(06-01)` commit (112916a, GREEN) ✓
- **Task 3:** `test(06-01)` commit (4137d01, RED) → `feat(06-01)` commit (46b0655, GREEN) ✓

Both RED gates failed for the right reason (modules not yet implemented). Both GREEN gates passed all tests.

## Known Stubs

None. All functions are fully implemented with real database queries (no mock/placeholder data flows).

## Verification Results

- `pnpm drizzle-kit generate --name add_featured_views_username_fts` → migration `0005_add_featured_views_username_fts.sql` generated ✓
- `pnpm tsc --noEmit` → zero type errors in 06-01 files (pre-existing TailAdmin date-picker/AppSidebar errors are out of scope) ✓
- `pnpm test` → 384 tests pass (37 files), including 54 new Wave 0 tests ✓
- `grep -rl "requireCan" src/lib/queries/` → nothing returned (no permission gates in public reads) ✓
- Migration SQL contains `ALTER TABLE posts ADD COLUMN featured`, `ADD COLUMN views`, `ADD COLUMN search_vector ... GENERATED ALWAYS AS`, `CREATE INDEX ... USING gin`, `ADD COLUMN username`, `CONSTRAINT user_username_unique` ✓

## Next Steps

Ready for plan 06-02 (Site chrome: header/footer/dark-mode/analytics injection) and plan 06-03 (single-post page with PPR + Suspense). All foundation primitives are in place: the query modules, reading-time, TOC, rate-limit, and JSON-LD builders are consumed by every downstream plan in this phase.
