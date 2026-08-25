---
phase: 05-seo-basics
fixed_at: 2026-08-25T17:15:00Z
review_path: .planning/phases/05-seo-basics/05-REVIEW.md
iteration: 1
findings_in_scope: 3
fixed: 3
skipped: 0
status: all_fixed
---

# Phase 05: Code Review Fix Report

**Fixed at:** 2026-08-25T17:15:00Z
**Source review:** .planning/phases/05-seo-basics/05-REVIEW.md
**Iteration:** 1
**Scope:** critical only (user-selected `fix_scope: critical` — CR-01, CR-02, CR-03)

**Summary:**
- Findings in scope: 3 (Critical)
- Fixed: 3
- Skipped: 0
- Verification: `pnpm vitest run` green after every commit — final state 57 files / 590 tests passing (baseline 580; +10 new tests). `tsc --noEmit` reports zero errors in any modified file (pre-existing TailAdmin legacy errors in untouched files remain, unchanged).

## Fixed Issues

### CR-01: Post canonical URLs derived as `/{slug}` — actual post route is `/blog/[slug]`

**Files modified:** `src/lib/seo/metadata.ts`, `src/lib/seo/__tests__/metadata.test.ts`, `src/lib/seo/__tests__/sitemap.test.ts`
**Commit:** 5da67e1
**Applied fix:** `buildPostMetadata` now derives the canonical as `/blog/${post.slug}` (doc comment updated to match). The two tests that pinned the wrong `/{slug}` path (metadata.test.ts:64-73) now expect `/blog/${slug}` and carry a CR-01 marker. Added a drift-guard cross-check in sitemap.test.ts asserting `canonicalBaseUrl + buildPostMetadata(...).alternates.canonical` equals `buildPostSitemapEntry(...).url` exactly — the metadata and sitemap derivations can no longer diverge silently. Consumer check: `/preview/[token]` spreads `buildPostMetadata` but overrides with `robots: {index:false, follow:false}` — noindex preview, canonical value immaterial for indexing; it now simply stays consistent with the real route. No preview change needed. `blog/[slug]/page.tsx:163` (`canonicalRel`) already used `/blog/` — untouched.

### CR-02: `savePost` update path nulls `publishedAt` on every edit — publish-date data loss

**Files modified:** `src/actions/posts.ts`, `src/lib/permissions/post-transitions.ts`, `src/actions/__tests__/posts.test.ts`, `src/lib/permissions/__tests__/transitions.test.ts`
**Commit:** 4d7a999
**Applied fix:**
- `savePost` update branch: `publishedAt: data.publishedAt ?? null` replaced with a conditional spread that includes the column ONLY when the payload explicitly provides it — the column is entirely absent from the UPDATE when PostForm omits the field (it always does), so the existing DB value survives; an explicit date (manual schedule path) still writes. The create branch's null default is intentionally preserved (nothing to preserve on create).
- `transitionPost` (the R7 status funnel): when the target status is `published` and the post's `publishedAt` is null, the same UPDATE now stamps `publishedAt: new Date()` — a publish without a prior `setSchedule` can no longer leave a NULL publish date. An existing (scheduled or prior-publish) date is preserved verbatim.
- Tests: both test files' db mocks now capture the `.set()`/`.values()` write payloads (`updateSetMock`/`insertValuesMock`). New coverage (6 tests): update omits `publishedAt` when payload omits it; update writes it when explicit; create still defaults null; transition stamps on publish-with-NULL; transition preserves an existing date (column absent from write); non-publish transitions never stamp.
- Status note: this is a logic fix, but the behavior is pinned by the new unit tests asserting exact write payloads — verified beyond syntax level.

### CR-03: Stored XSS via unescaped JSON-LD `<script>` injection

**Files modified:** `src/lib/seo/jsonld.ts`, `src/lib/seo/__tests__/jsonld.test.ts`, `src/app/(site)/blog/[slug]/page.tsx`, `src/app/(site)/layout.tsx`, `src/app/(site)/category/[slug]/page.tsx`, `src/app/(site)/tag/[slug]/page.tsx`, `src/app/(site)/author/[username]/page.tsx`
**Commit:** cabf58a
**Applied fix:** Added shared `jsonLdScript(obj)` helper in `src/lib/seo/jsonld.ts`: `JSON.stringify` followed by escaping the characters less-than, greater-than, ampersand, and the Unicode line (U+2028) / paragraph (U+2029) separators into their six-character JSON backslash-u escape-sequence forms. That escape form keeps the payload valid JSON that parses back to the identical string (unlike HTML entities, which would corrupt parsed values). All six JSON-LD injection sites across the codebase now route through it — the two the review cited (blog post page BlogPosting, site layout WebSite+Organization) plus four more sites found by grepping `application/ld+json` (category/tag BreadcrumbList, author Person — same XSS class via admin/editor/user-controlled names and bios). Grep confirms zero remaining raw stringify ld+json sites. New unit tests (3): a `</script><img onerror=...>` headline breakout is neutralized (no raw less-than/greater-than/ampersand in output); full round-trip `JSON.parse(jsonLdScript(x))` deep-equals `x` (escapes semantically inert); U+2028/U+2029 escaped and round-trip.
- Note on new code: no new files created; `jsonLdScript` lives in the existing `src/lib/seo/jsonld.ts` as the review suggested.

## Skipped Issues

None — all 3 in-scope Critical findings were fixed.

### Out of scope (fix_scope: critical — user-selected)

The following REVIEW.md findings were NOT attempted per the scope override (recorded here for traceability):

- **Warnings (9):** WR-01 (upsertSetting dead insert fallback), WR-02 (autosavePost skips storage sanitize), WR-03 (RSS CDATA breakout), WR-04 (post_seo.post_id not UNIQUE), WR-05 (listPosts not author-scoped), WR-06 (savePost no existence check), WR-07 (tagIds silently discarded), WR-08 (published-post edit never revalidates), WR-09 (sequential boot seeds, no isolation).
- **Info (7):** IN-01 … IN-07 as listed in REVIEW.md.

---

_Fixed: 2026-08-25T17:15:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
