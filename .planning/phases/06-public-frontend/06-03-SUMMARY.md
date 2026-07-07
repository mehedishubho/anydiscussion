---
phase: 06-public-frontend
plan: 03
subsystem: single-post-route
tags: [cache-components, ppr, suspense-streaming, view-count, related-posts, toc, share, reading-time, post-body-render]
requires:
  - "06-01 (lib/queries/posts.ts: getPostForPublic/incrementViewCount/listRelated; lib/reading-time; lib/toc; lib/seo/jsonld: blogPostingJsonLd)"
  - "Phase 3 (lib/post-render.ts: renderPostBody; lib/excerpt: collectText)"
  - "Phase 5 (lib/seo/metadata.ts: buildPostMetadata; lib/seo/settings.ts: getSeoSettings)"
  - "publishPost's existing 2-arg revalidateTag tags in src/actions/posts.ts L363-368"
provides:
  - "src/app/(site)/blog/[slug]/page.tsx — the spike: cached LCP body + two streaming <Suspense> holes"
  - "src/components/site/PostCard.tsx — reusable server component for all list/related routes"
  - "src/components/site/ViewCount.tsx — async server component: connection() + atomic increment"
  - "src/components/site/RelatedPosts.tsx — async server component: 'use cache' + matching cacheTags"
  - "src/components/site/Toc.tsx — client island with IntersectionObserver scroll-spy (mobile + desktop variants)"
  - "src/components/site/ShareButtons.tsx — client island (X/FB/LinkedIn/copy-link)"
  - "src/components/site/ReadProgress.tsx — client island (thin top scroll-progress bar)"
  - "src/components/site/skeletons.tsx — ViewCountSkeleton + RelatedPostsSkeleton (animate-pulse)"
affects:
  - "src/app/(site)/blog/[slug]/page.tsx (the route — consumes every primitive above)"
tech-stack:
  added: []
  patterns:
    - "Cache Components spike resolved: body in 'use cache' (LCP, NOT in Suspense); ViewCount + RelatedPosts in TWO SEPARATE <Suspense> holes at the bottom"
    - "connection() from next/server as the per-request signal before the view-count increment (Pitfall 1 mitigation)"
    - "Heading-ID post-processing: renderPostBody → injectHeadingIds (idempotent; only adds id attrs to existing h2/h3 — preserves the sanitize gate, Pitfall #8)"
    - "Toc variant prop: same client island renders mobile card (inside article) + desktop sticky sidebar (grid column 2 sibling)"
    - "SSR-safe client islands: ShareButtons builds hrefs in useEffect (avoid hydration mismatch); ReadProgress reads scroll in useEffect"
key-files:
  created:
    - src/app/(site)/blog/[slug]/page.tsx
    - src/components/site/PostCard.tsx
    - src/components/site/ViewCount.tsx
    - src/components/site/RelatedPosts.tsx
    - src/components/site/Toc.tsx
    - src/components/site/ShareButtons.tsx
    - src/components/site/ReadProgress.tsx
    - src/components/site/skeletons.tsx
  modified: []
key-decisions:
  - "Route path /blog/[slug] (NOT /[slug]) — matches sitemap.ts URLs and publishPost's revalidatePath literals (the codebase is the source of truth over RESEARCH Pattern 1's /[slug])"
  - "Body renders SYNCHRONOUSLY from the cached fetch (the LCP element) — NO <Suspense> around it (wrapping would make it stream, tanking LCP — RESEARCH Anti-Pattern #1)"
  - "Two SEPARATE <Suspense> boundaries (Pitfall 2 — don't combine): view-count streams independently of the related-posts join"
  - "ViewCount's FIRST line is `await connection()` — the per-request signal that prevents build hangs / silent caching (Pitfall 1); the increment fires once per real visit, NEVER per ISR regeneration"
  - "Heading IDs post-processed AFTER renderPostBody (the sanitize gate) via injectHeadingIds — matches buildToc's slugifier; only adds id attrs, never introduces new HTML (preserves the security boundary)"
  - "Toc split into mobile + desktop variants via a variant prop (rather than two files) — co-locates styles, lets each variant use its own IntersectionObserver safely"
requirements-completed:
  - SITE-07
  - SITE-13
  - SITE-14
  - SITE-17
duration: "~50 min (across two sessions, resumed after 429 reset)"
completed: 2026-07-08
status: complete
coverage:
  - deliverable: "/blog/[slug] route with cached LCP body + two streaming Suspense holes"
    verification:
      - kind: command
        ref: "grep -c '<Suspense fallback' src/app/(site)/blog/[slug]/page.tsx"
        status: pass
        detail: "2 (>= 2 required)"
      - kind: command
        ref: "grep -c 'import { connection } from' src/components/site/ViewCount.tsx"
        status: pass
      - kind: command
        ref: "grep -c 'renderPostBody' src/app/(site)/blog/[slug]/page.tsx"
        status: pass
        detail: "7 references (import + calls + comments)"
      - kind: command
        ref: "pnpm tsc --noEmit (zero errors in 06-03 files)"
        status: pass
    human_judgment: false
  - deliverable: "PostCard reusable server component"
    verification:
      - kind: command
        ref: "grep -c 'next/image' src/components/site/PostCard.tsx"
        status: pass
      - kind: command
        ref: "pnpm tsc --noEmit"
        status: pass
    human_judgment: false
  - deliverable: "Toc/ShareButtons/ReadProgress client islands"
    verification:
      - kind: command
        ref: "grep -c 'use client' src/components/site/{Toc,ShareButtons,ReadProgress}.tsx"
        status: pass
      - kind: command
        ref: "grep -c 'IntersectionObserver' src/components/site/Toc.tsx"
        status: pass
      - kind: command
        ref: "grep -c 'encodeURIComponent' src/components/site/ShareButtons.tsx"
        status: pass
      - kind: command
        ref: "isolation check (no imports from @/app/(admin) or @/context/ThemeContext)"
        status: pass
    human_judgment: false
  - deliverable: "Full test suite"
    verification:
      - kind: command
        ref: "pnpm test"
        status: pass
        detail: "384 tests passed (37 files); 06-03 introduces no new test files (Wave 0 tests landed in 06-01)"
    human_judgment: false
---

# Phase 6 Plan 03: Single-post /blog/[slug] Summary

**One-liner:** Implemented the HIGHEST-complexity spike — `/blog/[slug]` with Cache Components (cached LCP body via `'use cache'` getPostForPublic, NOT in Suspense) + two separate `<Suspense>` holes streaming per-request (ViewCount via `connection()` + atomic `+1`) and cached (RelatedPosts via matching `cacheTag`s). Delivered PostCard, Toc (scroll-spy), ShareButtons, ReadProgress, and skeleton fallbacks.

## What Was Built

### 1. The spike route — `src/app/(site)/blog/[slug]/page.tsx`

The single-post page implementing the resolved Cache Components recipe (HIGH confidence from bundled next@16.2.9 docs):

- **`generateMetadata`** — one-liner via `buildPostMetadata` (Phase 5). Reads the SAME cached `getPostForPublic` so body + metadata share a cache entry.
- **Body (LCP)** — rendered SYNCHRONOUSLY via `renderPostBody(post.body)`. NO `<Suspense>` around it (wrapping would make it stream, tanking LCP — RESEARCH Anti-Pattern #1). `dangerouslySetInnerHTML` flows through the generateHTML → sanitizeBeforeRender gate (Pitfall #8).
- **Heading-ID post-processing** — `injectHeadingIds(html, toc)` runs AFTER sanitize and only adds `id` attributes to existing `<h2>`/`<h3>` tags. IDs match `buildToc`'s slugifier (same walker order), so TOC anchor `#id` links resolve to the rendered headings. Never introduces new HTML — preserves the security boundary.
- **Meta row** — author byline (links to `/author/${username}` when D-11 username is set), reading time via `deriveReadingTime` (Bangla-aware `Intl.Segmenter` from 06-01), published date via `Intl.DateTimeFormat`, ShareButtons client island.
- **BlogPosting JSON-LD** — real `<script type="application/ld+json">` per Phase 5 Pitfall 2 (the Metadata API explicitly excludes `<script>` tags).
- **Two streaming `<Suspense>` holes** (Pitfall 2 — separate boundaries so each streams independently):
  - `<ViewCount postId={post.id} />` — `connection()` first, then atomic `+1`, then render.
  - `<RelatedPosts postId={post.id} categoryId={post.categoryId} />` — `'use cache'` + matching `cacheTag`s.

### 2. PostCard — `src/components/site/PostCard.tsx`

Reusable pure server component (no `"use client"`). Feature image via `next/image` (CLAUDE.md mandate — never raw `<img>`), title linking to `/blog/${slug}`, excerpt (line-clamped), published date, author byline linking to `/author/${username}` when set. Consumed by Home, /blog, /archive, /category, /tag, /author, and RelatedPosts (Wave 3 plans 06-04/06-07).

### 3. ViewCount — `src/components/site/ViewCount.tsx`

Async server component (NO `"use client"`, NO `'use cache'`). First line: `await connection()` (next/server) — the per-request signal that prevents build hangs and silent caching (Pitfall 1). Then `incrementViewCount(postId)` (the atomic `UPDATE views = views + 1 RETURNING views` from 06-01). Renders `{n} views` via `Intl.NumberFormat`. The increment fires exactly once per real visit — the streaming slot is never part of the cached prerender, so ISR regeneration does NOT re-invoke it.

### 4. RelatedPosts — `src/components/site/RelatedPosts.tsx`

Async server component with `'use cache'`. `cacheLife("hours")` + `cacheTag('posts-list')` + `cacheTag('category-${categoryId}')` match `publishPost`'s existing 2-arg `revalidateTag(..., "max")` calls so publishes refresh the slot. Calls `listRelated(postId, categoryId, 3)` (D-06: same-category first, tag-sharing fallback) and renders PostCards.

### 5. Toc — `src/components/site/Toc.tsx`

`"use client"` island with IntersectionObserver scroll-spy. Variant prop controls rendering:
- `variant="mobile"` — collapsible "On this page" card (`lg:hidden`), placed inside the article after the body.
- `variant="desktop"` — sticky sidebar (`hidden lg:block`), placed as the grid's column 2 sibling.

Active-section highlighting via state. Smooth-scroll on click; `history.replaceState` updates the URL hash. Renders nothing when `items` is empty.

### 6. ShareButtons — `src/components/site/ShareButtons.tsx`

`"use client"` island (D-14). X (twitter.com/intent/tweet), Facebook (sharer), LinkedIn (share-offsite), copy-link. Share-target hrefs built in `useEffect` (avoids SSR/client hydration mismatch); uses `encodeURIComponent`. Copy-link uses `navigator.clipboard.writeText` with "Copied!" feedback. Progressive enhancement — share targets are plain anchors (work without JS).

### 7. ReadProgress — `src/components/site/ReadProgress.tsx`

`"use client"` island (D-14). Thin fixed top bar (3px). Scroll listener in `useEffect` computes `scrollY / (scrollHeight - viewportHeight) * 100`, clamped to [0, 100]. Passive listeners; cleanup on unmount. Dark-mode aware via `dark:` classes. `aria-hidden` (decorative).

### 8. skeletons — `src/components/site/skeletons.tsx`

Pure presentational fallbacks:
- `ViewCountSkeleton` — small inline-block pulsing placeholder matching the view-count span dimensions.
- `RelatedPostsSkeleton` — 3-card pulsing grid matching PostCard dimensions.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Drizzle leftJoin result key naming**
- **Found during:** Task 1
- **Issue:** The plan's RESEARCH Pattern 1 used `const { posts: post, postSeo: seo, user: author } = data;` but Drizzle's leftJoin uses the TABLE NAME (snake_case) as the result key, not the schema variable name. So `postSeo` → `post_seo`, `user` → `user`. TypeScript error TS2339.
- **Fix:** Changed destructuring to `const { posts: post, post_seo: seo, user: author } = data;` with an explanatory comment.
- **Files modified:** `src/app/(site)/blog/[slug]/page.tsx`
- **Commit:** 3a9d136

**2. [Rule 3 - Blocking] listRelated returns a discriminated union**
- **Found during:** Task 2
- **Issue:** 06-01's `listRelated` returns `(posts | { posts, postTags })[]` — the same-category branch returns bare posts, the tag-fallback branch returns the joined `{posts, postTags}` shape. The dedupe `.filter()` in listRelated doesn't unwrap the joined rows, leaving a union that prevented the consuming `RelatedPosts.tsx` from accessing `.id`/`.title`/etc. uniformly (TS2339).
- **Fix:** Normalized at the consumer: `const related = rows.map((row) => ("posts" in row ? row.posts : row));`. Chose consumer-side normalization over modifying the committed 06-01 file (less invasive).
- **Files modified:** `src/components/site/RelatedPosts.tsx`
- **Commit:** 2bf6edf

**3. [Rule 3 - Blocking] ViewCount/RelatedPosts default exports**
- **Found during:** Task 2
- **Issue:** Page imported `<ViewCount />` and `<RelatedPosts />` as default imports, but the components were declared with named exports (`export async function`).
- **Fix:** Changed both to `export default async function` for consistency with PostCard's convention.
- **Files modified:** `src/components/site/ViewCount.tsx`, `src/components/site/RelatedPosts.tsx`
- **Commit:** 2bf6edf

**4. [Plan interpretation] TOC client island placement**
- **Plan ambiguity:** Task 1 description said "render the Toc client component (Task 3)" but Task 1's tsc-clean acceptance criterion can't forward-reference a Task 3 file. Task 1's action also said "the TOC inline... Task 3 swaps to the Toc client island" — contradictory.
- **Resolution:** Task 1 rendered the TOC inline as server-side anchor links (tsc-clean). Task 3 replaced the inline TOC with the Toc client island. The Toc component takes a `variant: "mobile" | "desktop"` prop so the mobile card can live inside the article (after the body, before view-count) while the desktop sticky sidebar lives as the grid's column 2 sibling — both variants share the same scroll-spy logic.
- **Commits:** 3a9d136 (inline TOC), d3667ae (Toc client island)

## Verification Evidence

- `pnpm tsc --noEmit` passes (zero errors in 06-03 files; pre-existing errors in unrelated files like ResetPasswordForm/SignInForm/storage-settings tests are out of scope per deviation Rule scope boundary).
- `pnpm test` passes: 384 tests / 37 files (06-03 introduces no new test files — Wave 0 tests for the read-query module, reading-time, toc, etc. landed in plan 06-01).
- `grep -c '<Suspense fallback' src/app/(site)/blog/[slug]/page.tsx` = **2** (the two separate boundaries).
- `grep 'connection' src/components/site/ViewCount.tsx` — `import { connection } from "next/server"` present; FIRST line of the component body is `await connection()`.
- `grep 'renderPostBody' src/app/(site)/blog/[slug]/page.tsx` — present (the body div's `dangerouslySetInnerHTML` flows through it).
- The prose body div has NO parent `<Suspense>` — verified by inspecting lines around the body div.
- `cacheTag` strings in `lib/queries/posts.ts` and `components/site/RelatedPosts.tsx` match `publishPost`'s 2-arg `revalidateTag(..., "max")` tags: `post-${id}`, `author-${authorId}`, `category-${categoryId}`, `posts-list`.

## Known Limitations / Follow-ups

- **listRelated union return type**: The consumer-side normalization (Deviation #2) is a workaround. The cleaner fix is to normalize `listRelated` itself to return `posts[]` — left for a future tidying pass to avoid touching the committed 06-01 file.
- **PostCard author fields in RelatedPosts**: `listRelated` doesn't leftJoin `user`, so RelatedPosts renders PostCards with `authorName={null}` / `authorUsername={null}` (no byline on related cards). Documented in the component; extending `listRelated` with a user join is a future enhancement when bylines on related cards become a requirement.
- **Build / PPR verification**: `pnpm build` requires a live database and was not run in the worktree (out of scope for an isolated parallel executor). The recipe is verified via the in-repo precedents (`not-found.tsx` does per-request DB work in Suspense; `preview/[token]/page.tsx` is the structural analog) and the bundled next@16.2.9 docs. The Phase 7 PERF pass will verify the route renders as `(PPR)` in the build output on the real stack.

## Self-Check: PASSED

**Files (all created):**
- `src/app/(site)/blog/[slug]/page.tsx` — FOUND
- `src/components/site/PostCard.tsx` — FOUND
- `src/components/site/ViewCount.tsx` — FOUND
- `src/components/site/RelatedPosts.tsx` — FOUND
- `src/components/site/Toc.tsx` — FOUND
- `src/components/site/ShareButtons.tsx` — FOUND
- `src/components/site/ReadProgress.tsx` — FOUND
- `src/components/site/skeletons.tsx` — FOUND

**Commits:**
- 3a9d136 — feat(06-03): single-post /blog/[slug] route with cached LCP body + PostCard — FOUND
- 2bf6edf — feat(06-03): ViewCount + RelatedPosts streaming in two separate Suspense holes — FOUND
- d3667ae — feat(06-03): Toc + ShareButtons + ReadProgress client islands (SITE-13/14) — FOUND
