---
phase: quick-260823-4yc
plan: 01
subsystem: public-site
tags: [homepage, post-card, pagination, query-layer]
requires:
  - "listPublished/listFeatured/listRelated/listArchive/listAuthorPosts with 'use cache' + cacheTag('posts-list')"
  - "deriveReadingTime (src/lib/reading-time) — Bangla-aware, 200 WPM, min 1"
  - "next/image CI/CD loader (src/lib/image-loader.ts)"
provides:
  - "src/lib/post-card.ts — the ONE shared joined-row → PostCardProps mapper"
  - "src/components/site/HomeFeed.tsx — shared homepage content (Featured card + 12-post Latest grid + pagination)"
  - "/page/[pageNumber] route — homepage pagination (page 1 = \"/\", page N = \"/page/N\")"
  - "PostCard optional props: categoryName/categorySlug, authorAvatar, readTime"
  - "listPublished/countPublished excludeIds — hero exclusion across homepage pages"
  - "Pagination buildPageHref — named export, root-base normalization"
affects:
  - "/blog, /blog/page/N, /category/[slug], /tag/[slug], /archive, /author/[username] (cards now richer; layout unchanged)"
  - "RelatedPosts (fully wired — byline/avatar/category/read time render now)"
tech-stack:
  added: []
  patterns:
    - "shared row-to-props mapper (toPostCardProps) replacing 7 duplicated inline mappings"
    - "excludeIds filter on cached list/count queries for consistent hero exclusion"
key-files:
  created:
    - src/lib/post-card.ts
    - src/lib/__tests__/post-card.test.ts
    - src/components/site/HomeFeed.tsx
    - src/components/site/__tests__/pagination.test.ts
    - "src/app/(site)/page/[pageNumber]/page.tsx"
  modified:
    - src/lib/queries/posts.ts
    - src/lib/queries/archive.ts
    - src/lib/queries/users.ts
    - src/lib/queries/__tests__/posts.test.ts
    - src/components/site/PostCard.tsx
    - src/components/site/Pagination.tsx
    - src/components/site/RelatedPosts.tsx
    - src/app/(site)/page.tsx
    - src/app/(site)/blog/page.tsx
    - "src/app/(site)/blog/page/[pageNumber]/page.tsx"
    - "src/app/(site)/category/[slug]/page.tsx"
    - "src/app/(site)/tag/[slug]/page.tsx"
    - src/app/(site)/archive/page.tsx
    - "src/app/(site)/author/[username]/page.tsx"
    - src/app/(site)/search/page.tsx
decisions:
  - "Homepage pagination URL shape mirrors /blog convention at root: page 1 = \"/\", page N = \"/page/N\"; redirect/404 semantics identical to /blog/page/[pageNumber]"
  - "Hero excluded from the paginated feed via excludeIds on EVERY homepage page (not a page-1 post-filter), so totalPages and every page stay consistent"
  - "All decision-3 PostCard props are optional+nullable so /search (flat FTS rows, no joins) compiles and renders unchanged"
  - "buildPageHref stays in Pagination.tsx with a named export — importing next/link under the vitest node env works, so no separate tiny module was needed"
metrics:
  duration: 18 min
  completed: 2026-08-22
status: complete
---

# Quick Task 260823-4yc: Frontpage design — homepage + site-wide PostCard upgrade Summary

**One-liner:** Homepage rebuilt as Featured horizontal card + 12-post Latest grid with real /page/N pagination, and every PostCard consumer now renders category tag, author avatar (initial-letter fallback), and Bangla-aware "N min read" via one shared toPostCardProps mapper.

## What Was Built

### Task 1 — PostCard upgrade + query joins + shared mapper (TDD)

- **Query layer** (`src/lib/queries/posts.ts`, `archive.ts`, `users.ts`): every list/feed query (`listPublished`, `listFeatured`, `listRelated`, `listArchive`, `listAuthorPosts`) now left-joins `categories`; `listRelated` additionally left-joins `user` on both its branches (same-category + tag-fallback), so every row carries `posts + user + categories`. `listPublished`/`countPublished` accept optional `excludeIds` (pushes `not(inArray(posts.id, ...))`). All `'use cache'` + `cacheLife` + `cacheTag` calls preserved verbatim.
- **`src/lib/post-card.ts`** (new): the ONE shared mapper `toPostCardProps(row)` returning base props + `authorAvatar`, `categoryName`/`categorySlug`, and `readTime: deriveReadingTime(row.posts.body)` (never null, min 1). Pure module — type-only PostCardProps import, node-env testable.
- **`PostCard.tsx`**: four optional nullable props added; card body reordered to image → category tag (small uppercase brand-600/brand-400 label → `/category/[slug]`) → title → meta row (24px avatar via next/image or initial-letter circle, byline, date, `N min read`) → excerpt (line-clamp-3). Bullet separators render only between rendered pieces.
- **Tests**: new `src/lib/__tests__/post-card.test.ts` (7 tests: full mapping, null categories/user, readTime 2 for 400 words, readTime 1 for null body); `posts.test.ts` extended with excludeIds tests + awaitable chainable mock (`then` on the builder) for `countPublished`.

### Task 2 — Homepage rebuild + /page/[pageNumber] + Pagination root fix

- **`Pagination.tsx`**: `buildPageHref` normalizes the base by stripping trailing slashes — root basePath now yields `"/"` (page 1) and `"/page/N"` (page N), never the protocol-relative `//page/N` the old code produced. Byte-identical for every existing caller. Named export + 6 unit tests (`pagination.test.ts`).
- **`HomeFeed.tsx`** (new): shared homepage content. `HOME_PAGE_SIZE = 12`. Hero = `listFeatured(1)` with fallback to `listPublished({page:1, pageSize:1})` (fresh blogs still get a hero); hero excluded via `excludeIds` on every page; grid + count fetched in parallel; beyond-last-page guard → `notFound()`; D-16 empty state kept; Featured section renders on page 1 only. `FeaturedCard` = horizontal card (image left ~45% from lg, stacked 16/10 below; category tag; h1 title; 32px avatar-or-initial meta row; line-clamp-3 excerpt; brand Read More → link), props derived through the same `toPostCardProps`.
- **`page.tsx`**: rewritten thin shell — `generateMetadata` kept verbatim (`'use cache'` + `getSeoSettings` + `buildSiteMetadata`); category teasers, local helpers, and the taxonomy import deleted. No Trending/Newsletter/teasers/View-all (locked decision 1).
- **`page/[pageNumber]/page.tsx`** (new): mirrors the `/blog/page/[pageNumber]` pattern — `generateMetadata` via `buildArchiveMetadata` (`Home — Page N`), Suspense + `PostCardGridSkeleton`, non-numeric/`<1`/`===1` → `redirect("/")`, else `HomeFeed page={N}`.

### Task 3 — All remaining consumers wired to the shared mapper

- `/blog`, `/blog/page/N`, `/category/[slug]`, `/tag/[slug]`, `/archive`, `/author/[username]`: inline field-by-field mapping blocks replaced with `rows.map((r) => toPostCardProps(r as PostCardJoinedRow))`; dead local JoinedPostRow casts deleted. Author page keeps bio header, Person JSON-LD, and Prev/Next pagination untouched.
- `RelatedPosts.tsx`: the `"posts" in row` union normalization and null-author placeholder comments dropped — every `listRelated` branch now returns mapper-ready rows; cards render byline/avatar/category/read time.
- `/search` page: NOT touched logically — only its inline "Mirrors the RelatedPosts pattern" comment updated (that reference went stale); optional props keep it compiling and rendering exactly as before.

## Verification Results

| Check | Result |
| --- | --- |
| `pnpm test` (vitest, full suite) | PASS — 52 files, 522 tests (506 baseline + 16 new: 7 mapper + 3 excludeIds/count + 6 pagination) |
| `pnpm build` (production, includes TypeScript check) | PASS — exit 0; `/page/[pageNumber]` route present in the route table; all existing routes unchanged |
| `grep -rL toPostCardProps <7 consumers>` | EMPTY — every listed consumer uses the shared mapper |
| Runtime smoke test (`next start` + seeded local Postgres) | `/` shows Featured + Latest Posts (12) + `href="/page/2"`, Read More, 26 "min read" markers (13 cards × HTML+flight), 0 `//page/` double-slash hrefs; `/page/2` renders grid page 2 with NO Featured section and NO hero duplicate (hero title exactly once site-wide on page 1); `/page/1` + `/page/0` emit `NEXT_REDIRECT;replace;/;307`; `/page/99` streams 404 UI; `/blog` pagination hrefs byte-identical (`/blog`, `/blog/page/2`); `/archive`, `/category/technology`, `/author/ayesha` render min-read + category tags + initial-letter avatar fallbacks; single post's RelatedPosts renders byline + category + read time |

Honest notes:

- The `/page/1`, `/page/0` redirects and the beyond-last 404 arrive as streamed instructions (`NEXT_REDIRECT`/`NEXT_NOT_FOUND` digests) with a committed 200 shell — identical PPR posture to the existing `/blog/page/[pageNumber]` route this task mirrors; browsers follow the replace instruction.
- Raw `pnpm exec tsc --noEmit` reports ~13 pre-existing errors in files untouched by this task (`src/actions/__tests__/storage-settings.test.ts`, `src/components/auth/*Form.tsx`, `src/components/form/date-picker.tsx`, `src/layout/AppSidebar.tsx`) — present before these changes; the project's actual gate (`next build`'s TypeScript pass) is green. Logged to deferred-items as out of scope.
- One transient vitest worker crash (`emitUnexpectedExit`) on the first Task-3 run; immediate re-run was deterministically green (52/52 files).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Build environment needed a reachable Postgres**
- **Found during:** Task 2 verify (`pnpm build`)
- **Issue:** PPR prerender executes the cached list queries at build time; `ECONNREFUSED` — Docker Desktop (which hosts the compose dev Postgres) was not running.
- **Fix:** Started Docker Desktop, `docker compose up -d postgres` (worktree-scoped project name → fresh empty volume), applied `drizzle-kit migrate`, seeded 15 throwaway published posts (one featured) via a temp script, ran the build + runtime smoke tests, then `docker compose down -v` to remove the container and volume. No repo files changed; no artifacts committed.
- **Files modified:** none (environment only)

**2. [Rule 1 - Stale comment] Search page inline comment**
- **Found during:** Task 3
- **Issue:** The `/search` card comment said "Mirrors the RelatedPosts pattern" — stale once RelatedPosts gained real author data.
- **Fix:** Comment rewritten (plan explicitly authorized a staleness note); zero logic change.
- **Files modified:** `src/app/(site)/search/page.tsx`

Otherwise the plan executed exactly as written. Locked decisions 1–3 implemented with no scope additions (no Trending/Newsletter/teasers, no header/footer redesign, /search logic untouched).

## TDD Gate Compliance

- RED: `22b691a` — `test(260823-4yc)` commits the failing mapper suite (module did not exist; suite failed with "Cannot find module '../post-card'").
- GREEN: `e6eaf13` — `feat(260823-4yc)` implements mapper + joins + PostCard props; suite green.
- No refactor commit needed — GREEN-state code was final.

## Commits

| Task | Commit | Message |
| --- | --- | --- |
| 1 (RED) | 22b691a | test(260823-4yc): add failing tests for PostCard mapper + excludeIds queries |
| 1 (GREEN) | e6eaf13 | feat(260823-4yc): PostCard category/avatar/read-time props + query joins + shared mapper |
| 2 | ecc14a6 | feat(260823-4yc): homepage featured card + 12-post Latest grid + /page/N pagination |
| 3 | 2b46f15 | feat(260823-4yc): wire all PostCard consumers to category/avatar/read-time props |

## Known Stubs

None — all data paths are wired end-to-end (DB joins → mapper → cards).

## Threat Flags

None. New rendered surfaces stay within the plan's threat model: avatars render only via `next/image` (T-4yc-02), category hrefs are template-built `/category/ + slug`, no `dangerouslySetInnerHTML` introduced, no new endpoints or trust-boundary changes.

## Self-Check: PASSED

Created files exist on disk (src/lib/post-card.ts, src/lib/__tests__/post-card.test.ts, src/components/site/HomeFeed.tsx, src/components/site/__tests__/pagination.test.ts, "src/app/(site)/page/[pageNumber]/page.tsx"); all four commits (22b691a, e6eaf13, ecc14a6, 2b46f15) present on the worktree branch; no tracked-file deletions in any task commit; working tree clean except uncommitted docs artifacts (this SUMMARY, per the orchestrator contract).
