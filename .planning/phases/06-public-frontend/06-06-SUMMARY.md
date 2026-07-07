---
phase: 06-public-frontend
plan: "06"
subsystem: ui
tags: [nextjs16, cache-components, suspense, renderPostBody, pages-rows, seo, ppr]

# Dependency graph
requires:
  - phase: 06-01
    provides: getPublishedPage (published pages-row read), listPublished (cached published-posts feed)
  - phase: 05-seo-basics
    provides: buildPageMetadata, getSeoSettings, not-found.tsx RedirectChecker (D-12)
  - phase: 03-content-engine
    provides: renderPostBody (Pitfall #2 security gate), preview/[token] route (D-19)
  - phase: 04-dashboard-chrome
    provides: seeded pages rows (D-17 — terms-and-conditions, privacy-policy)
provides:
  - "About page (hard-coded TSX marketing surface, zero DB queries — SITE-09)"
  - "T&C + Privacy pages rendering dashboard-managed pages rows via renderPostBody (SITE-11)"
  - "Friendly 404 with SuggestedPosts (second Suspense) + search link (SITE-12)"
  - "Preview route verified intact post-06-01 (SITE-15 — verify-only, not rebuilt)"
affects: [06-verify, 07-performance, site-launch]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Hard-coded TSX route with cached generateMetadata (About — no DB, no dangerouslySetInnerHTML)"
    - "Legal page route pattern: getPublishedPage → notFound() → renderPostBody → dangerouslySetInnerHTML"
    - "Two-Suspense 404: RedirectChecker + SuggestedPosts as separate streaming boundaries (Pitfall 6)"
    - "Union-type normalization for listPublished rows (plain post vs joined row)"

key-files:
  created:
    - src/app/(site)/about/page.tsx
    - src/app/(site)/terms-and-conditions/page.tsx
    - src/app/(site)/privacy-policy/page.tsx
  modified:
    - src/app/not-found.tsx
  verified_only:
    - src/app/(site)/preview/[token]/page.tsx

key-decisions:
  - "About reuses buildPageMetadata with a static PageLike literal for metadata consistency (no DB row backs it)"
  - "T&C/Privacy use Promise.all for parallel page + settings fetch in generateMetadata; static fallback metadata when row is missing"
  - "SuggestedPosts deliberately uses lightweight plain links, NOT PostCard, to keep the 404 bundle minimal (D-16)"
  - "Preview route left unchanged — Phase 3 D-19 implementation already correct (single Suspense, renderPostBody gate, dark mode)"

patterns-established:
  - "Fixed-route legal page: getPublishedPage(slug) → notFound() on missing/unpublished → renderPostBody before dangerouslySetInnerHTML (Pitfall 8 gate)"
  - "Two-Suspense 404: existing RedirectChecker Suspense preserved; new dynamic slot (SuggestedPosts) in its own Suspense (Pitfall 6 / T-06-16)"

requirements-completed: [SITE-09, SITE-11, SITE-12, SITE-15]

coverage:
  - id: D1
    description: "About page — hard-coded TSX marketing surface with zero DB queries and no dangerouslySetInnerHTML (SITE-09)"
    requirement: "SITE-09"
    verification:
      - kind: other
        ref: "grep -c 'getPublishedPage|listPublished|getPostForPublic' src/app/(site)/about/page.tsx → 0"
        status: pass
      - kind: other
        ref: "grep -c 'dangerouslySetInnerHTML' src/app/(site)/about/page.tsx → 0"
        status: pass
      - kind: other
        ref: "pnpm tsc --noEmit (about/page.tsx clean)"
        status: pass
    human_judgment: true
    rationale: "Founder-authored marketing copy is placeholder until launch; visual layout/prose styling needs human review."
  - id: D2
    description: "T&C + Privacy pages render dashboard-managed published pages rows via getPublishedPage + renderPostBody; notFound() on missing/unpublished (SITE-11, Pitfall 8)"
    requirement: "SITE-11"
    verification:
      - kind: other
        ref: "grep renderPostBody on terms-and-conditions + privacy-policy page.tsx (present)"
        status: pass
      - kind: other
        ref: "grep getPublishedPage + notFound on both legal pages (present)"
        status: pass
      - kind: other
        ref: "pnpm tsc --noEmit (legal pages clean)"
        status: pass
    human_judgment: true
    rationale: "Rendered legal content depends on the seeded pages rows (Phase 4 D-17) being published; visual render of Tiptap body needs human confirmation."
  - id: D3
    description: "404 page extended with SuggestedPosts inside its own Suspense + search link; existing RedirectChecker Suspense preserved (SITE-12, Pitfall 6 / T-06-16)"
    requirement: "SITE-12"
    verification:
      - kind: other
        ref: "grep -c '<Suspense' src/app/not-found.tsx → 2 boundaries (RedirectChecker + SuggestedPosts)"
        status: pass
      - kind: other
        ref: "grep listPublished + href='/search' + RedirectChecker in not-found.tsx (all present)"
        status: pass
      - kind: other
        ref: "pnpm tsc --noEmit (not-found.tsx clean)"
        status: pass
    human_judgment: true
    rationale: "Friendly 404 styling, suggested-posts layout, and search-link placement are visual and need human review."
  - id: D4
    description: "Preview route verified intact post-06-01 — renderPostBody gate preserved, no ViewCount/RelatedPosts added, single Suspense, dark mode present (SITE-15, Phase 3 D-19)"
    requirement: "SITE-15"
    verification:
      - kind: other
        ref: "grep renderPostBody on preview/[token]/page.tsx (present, unchanged)"
        status: pass
      - kind: other
        ref: "grep ViewCount|RelatedPosts on preview (0 — verify-only, not rebuilt)"
        status: pass
      - kind: other
        ref: "grep 'dark:' on preview (5 — dark mode supported)"
        status: pass
    human_judgment: true
    rationale: "Preview polish/consistency with 06-03 blog styling is a visual judgment; route was not rebuilt per D-19."

# Metrics
duration: ~25min execution (wall-clock spanned ~5h13m including a usage-limit pause)
completed: 2026-07-08
status: complete
---

# Phase 6 Plan 06: Marketing/Legal Pages + 404 + Preview Summary

**Hard-coded About page (zero DB), T&C/Privacy rendering dashboard-managed pages rows through the renderPostBody security gate, and a friendly two-Suspense 404 with suggested posts + search**

## Performance

- **Duration:** ~25 min execution (wall-clock included a 5-hour usage-limit pause)
- **Started:** 2026-07-07T15:58:01Z
- **Completed:** 2026-07-08T03:12:25Z
- **Tasks:** 3
- **Files modified:** 4 (3 created, 1 extended; 1 verified-only)

## Accomplishments
- About page (`/about`) is a hard-coded TSX marketing surface — zero DB queries, zero `dangerouslySetInnerHTML`; metadata via cached `buildPageMetadata` with a static `PageLike` literal
- T&C (`/terms-and-conditions`) and Privacy (`/privacy-policy`) render the dashboard-managed `pages` rows seeded in Phase 4 D-17 via `getPublishedPage` + `renderPostBody` (Pitfall 8 gate enforced before every `dangerouslySetInnerHTML`); `notFound()` on missing/unpublished
- 404 page extended with a `SuggestedPosts` async component inside its OWN `<Suspense>` (Pitfall 6 / T-06-16) streaming 3 recent posts, plus a "Search the site" link; existing `RedirectChecker` Suspense preserved unchanged
- Preview route (`/preview/[token]`) verified intact — `renderPostBody` gate, single Suspense, dark mode all correct from Phase 3 D-19; NOT rebuilt per SITE-15

## Task Commits

Each task was committed atomically:

1. **Task 1: About page (SITE-09, hard-coded TSX)** — `02dbb1f` (feat)
2. **Task 2: T&C + Privacy pages (SITE-11, Pitfall 8)** — `e640727` (feat)
3. **Task 3: 404 SuggestedPosts + search link + preview verify (SITE-12/SITE-15)** — `b2e1937` (feat)

## Files Created/Modified
- `src/app/(site)/about/page.tsx` — Hard-coded TSX About page; cached `generateMetadata` via `buildPageMetadata` with static `PageLike`; prose layout with mission/team/content/contact CTA
- `src/app/(site)/terms-and-conditions/page.tsx` — Renders published `pages` row "terms-and-conditions" via `getPublishedPage` + `renderPostBody`; `notFound()` on missing; "Last updated" from `updatedAt`
- `src/app/(site)/privacy-policy/page.tsx` — Same pattern as T&C for slug "privacy-policy"
- `src/app/not-found.tsx` — EXTENDED (not rewritten): added `SuggestedPosts` async component (calls `listPublished({page:1,pageSize:3})`) in a second `<Suspense>`; added "Search the site" link; `RedirectChecker` Suspense preserved
- `src/app/(site)/preview/[token]/page.tsx` — VERIFIED ONLY (no changes); Phase 3 D-19 implementation confirmed correct

## Decisions Made
- **About metadata via `buildPageMetadata` with a static `PageLike` literal** — reuses the pages-row builder for canonical/OG/title consistency even though no DB row backs the page (the `updatedAt` sentinel is unused by the builder since only post metadata reads `modifiedTime`)
- **Parallel fetch in legal-page `generateMetadata`** — `Promise.all([getPublishedPage(slug), getSeoSettings()])` for efficiency; static title/description fallback when the row is missing so `notFound()` still has metadata
- **SuggestedPosts uses plain links, not PostCard** — keeps the 404 bundle lightweight per D-16 ("friendly 404 suggesting popular posts", not a content surface)
- **Preview left unchanged** — Phase 3 D-19 already correct; 06-03's `/blog/[slug]` runs on disjoint files in parallel so cross-styling consistency is deferred to verify

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed union-type error on `listPublished` rows in SuggestedPosts**
- **Found during:** Task 3 (404 SuggestedPosts)
- **Issue:** `listPublished` returns a union type — plain posts row (when called without `tagId`) or a joined `{ posts, postTags }` row (with `tagId`). TypeScript could not resolve `post.id`/`post.slug`/`post.title` on the union, producing TS2339.
- **Fix:** Normalized row access with `"posts" in row ? row.posts : row` inside the `.map()` callback (same narrowing pattern used by `listRelated` in `src/lib/queries/posts.ts`).
- **Files modified:** `src/app/not-found.tsx`
- **Verification:** `pnpm tsc --noEmit` clean on not-found.tsx after the fix
- **Committed in:** `b2e1937` (Task 3 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Necessary for type-safety; no scope creep. The narrowing matches the established pattern in `listRelated`.

## Issues Encountered
- Pre-existing `pnpm tsc --noEmit` errors in unrelated files (auth forms `ResetPasswordForm`/`SignInForm`/`SignUpForm`, `date-picker.tsx`, `AppSidebar.tsx`, `storage-settings.test.ts`) — out of scope per the scope-boundary rule; logged here, NOT fixed.

## User Setup Required
None — no external service configuration required. The T&C/Privacy pages depend on the `pages` rows seeded in Phase 4 D-17 being published (status `published`); if unpublished, `notFound()` renders the styled 404 (defense-in-depth). The About page copy is placeholder marketing text the founder should replace before launch (CONTEXT.md discretion item).

## Threat Flags

No new security-relevant surface introduced beyond what the plan's `<threat_model>` already assigned:
- T-06-15 (renderPostBody gate on pages-row bodies) — mitigated and verified via grep on both legal pages
- T-06-16 (SuggestedPosts DB read inside its own Suspense) — mitigated and verified via grep (2 Suspense boundaries)

## Next Phase Readiness
- All non-post public surfaces (About, T&C, Privacy, 404, preview) are wired
- 06-06's outputs are consumed by: the header/footer nav (06-05 links to About/Contact), the footer legal links (T&C/Privacy), and the 404 (suggested posts + search)
- Ready for Phase 7 (performance/CWV pass) — the public routes now exist for Lighthouse auditing
- No blockers

## Self-Check: PASSED

- [x] `src/app/(site)/about/page.tsx` exists (FOUND)
- [x] `src/app/(site)/terms-and-conditions/page.tsx` exists (FOUND)
- [x] `src/app/(site)/privacy-policy/page.tsx` exists (FOUND)
- [x] `src/app/not-found.tsx` extended (FOUND)
- [x] `src/app/(site)/preview/[token]/page.tsx` verified unchanged (FOUND)
- [x] Commit `02dbb1f` exists (FOUND)
- [x] Commit `e640727` exists (FOUND)
- [x] Commit `b2e1937` exists (FOUND)
- [x] `pnpm test` — 384/384 pass (PASS)

---
*Phase: 06-public-frontend*
*Completed: 2026-07-08*
