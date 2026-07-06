---
phase: 05-seo-basics
plan: 02
subsystem: seo
tags: [sitemap, robots, rss, rss-2.0, route-handler, metadata-route, seo, escaping, cdata]

# Dependency graph
requires:
  - phase: 05-seo-basics
    plan: 01
    provides: "getSeoSettings cached reader (src/lib/seo/settings.ts) — the single source for canonicalBaseUrl"
  - phase: 03-content-engine
    provides: "renderPostBody sanitized HTML pipeline (src/lib/post-render.ts) — reused for RSS full-text body"
  - phase: 03-content-engine
    provides: "publishPost revalidation block (src/actions/posts.ts L284-285) — revalidatePath('/sitemap.xml') + revalidatePath('/rss.xml') already wired (D-13)"
provides:
  - "app/sitemap.ts default export sitemap() returning MetadataRoute.Sitemap (SEO-02, SEO-08)"
  - "app/robots.ts default export robots() returning MetadataRoute.Robots (SEO-02)"
  - "app/rss.xml/route.ts GET() Route Handler returning application/rss+xml (SEO-07)"
  - "Pure helpers: buildHomeSitemapEntry / buildPostSitemapEntry / buildPageSitemapEntry (sitemap.ts); escapeXml / buildRssItem (rss.xml/route.ts)"
  - "RSS_LIMIT = 30 module-scope cap (D-07)"
affects: [06-public-frontend (Phase 6 extends sitemap with category/tag/author archive entries — D-05 seam), 05-03 (saveSeoSettings revalidatePath('/robots.txt') target)]

# Tech tracking
tech-stack:
  added: []  # Zero installs — all primitives ship with next@16.2.9
  patterns:
    - "MetadataRoute.Sitemap / MetadataRoute.Robots special Route Handlers (cached by default, refreshed via revalidatePath)"
    - "RSS 2.0 hand-rolled Route Handler (~30 lines) — escapeXml on 5 special chars + CDATA body wrap (defense-in-depth)"
    - "Pure-helper extraction from Route Handlers for DB-free unit testing (buildPostSitemapEntry, escapeXml, buildRssItem)"
    - "vi.hoisted for schema mock identity-checking in chainable Drizzle query mocks"

key-files:
  created:
    - src/app/sitemap.ts
    - src/app/robots.ts
    - src/app/rss.xml/route.ts
    - src/lib/seo/__tests__/sitemap.test.ts
    - src/lib/seo/__tests__/robots.test.ts
    - src/lib/seo/__tests__/rss.test.ts
  modified:
    - src/lib/seo/__tests__/shared-fixtures.ts  # extended with post-row + page-row + XML-special-char fixtures

key-decisions:
  - "RSS_LIMIT=30 chosen (midpoint of D-07's 20-50 range); defensive .slice(0, RSS_LIMIT) added after the SQL .limit() as defense-in-depth"
  - "CDATA wraps the sanitized body even though renderPostBody already sanitizes — T-05-02 mandates both layers"
  - "escapeXml applied to title/excerpt/link/guid but NOT the body (body is CDATA-wrapped per RSS content-module convention)"
  - "Pure helpers exported from the route files themselves (not a separate builders file) — fewer files, same testability"

patterns-established:
  - "Special Route Handler test pattern: vi.hoisted for schema mock + chainable select/from/where/orderBy/limit returning fixture rows"
  - "escapeXml + CDATA as the standard XML-output sanitization contract (reusable if future XML feeds are added)"

requirements-completed: [SEO-02, SEO-07, SEO-08]

coverage:
  - id: SEO-02-sitemap
    description: "sitemap.ts lists home + every published post + page; draft/soft-deleted excluded via SQL filter"
    requirement: "SEO-02"
    verification:
      - kind: unit
        ref: "src/lib/seo/__tests__/sitemap.test.ts — 10 assertions (entry count, priority/changefreq, exclusion, base-url source)"
        status: pass
      - kind: build
        ref: "pnpm build registers /sitemap.xml as a special Route Handler (ƒ Dynamic)"
        status: pass
    human_judgment: false
  - id: SEO-02-robots
    description: "robots.ts allows '/', disallows /preview/ /dashboard/ /signin /signup /forgot-password, sitemap pointer"
    requirement: "SEO-02"
    verification:
      - kind: unit
        ref: "src/lib/seo/__tests__/robots.test.ts — 4 assertions (userAgent, allow, disallow list, sitemap pointer)"
        status: pass
      - kind: build
        ref: "pnpm build registers /robots.txt (○ Static, 15m revalidate)"
        status: pass
    human_judgment: false
  - id: SEO-07
    description: "RSS 2.0 feed at /rss.xml with full-text body, escaping, CDATA, RSS_LIMIT cap"
    requirement: "SEO-07"
    verification:
      - kind: unit
        ref: "src/lib/seo/__tests__/rss.test.ts — 14 assertions (Content-Type, namespaces, channel fields, item fields, escaping, CDATA, cap)"
        status: pass
      - kind: build
        ref: "pnpm build registers /rss.xml as Route Handler (ƒ Dynamic)"
        status: pass
    human_judgment: false
  - id: SEO-08
    description: "Per-content-type priority (home 1.0 / posts 0.8 / pages 0.5) + changeFrequency (daily/weekly/monthly)"
    requirement: "SEO-08"
    verification:
      - kind: unit
        ref: "src/lib/seo/__tests__/sitemap.test.ts — priority/changefreq assertions per entry type + pure-builder tests"
        status: pass
    human_judgment: false
  - id: T-05-04-escaping
    description: "escapeXml covers the 5 XML-special chars; raw chars never reach the XML output"
    requirement: "SEO-07 (T-05-04 mitigation)"
    verification:
      - kind: unit
        ref: "src/lib/seo/__tests__/rss.test.ts — T-05-04 describe block + escapeXml pure-helper test"
        status: pass
    human_judgment: false

# Metrics
duration: 9min
completed: 2026-07-07
status: complete
---

# Phase 5 Plan 2: Standalone SEO Routes Summary

**Dynamic sitemap.ts (home + published posts + pages with per-type priority/changefreq) + robots.ts (allow/disallow + sitemap pointer) + rss.xml Route Handler (full-text RSS 2.0 with escapeXml + CDATA) — all reading canonicalBaseUrl from the cached getSeoSettings snapshot, refreshed by the publish action's existing revalidatePath calls (D-13)**

## Performance

- **Duration:** ~9 min
- **Started:** 2026-07-07T03:32:07Z
- **Completed:** 2026-07-07T03:41:00Z
- **Tasks:** 2 (both TDD: RED → GREEN)
- **Files modified:** 7 (6 created + 1 extended)

## Accomplishments
- Shipped `app/sitemap.ts` — home (1.0/daily) + published posts (0.8/weekly) + published pages (0.5/monthly); SQL filter excludes drafts + soft-deleted (T-05-05); Phase 6 extensibility comment left for category/tag/author archive entries (D-05)
- Shipped `app/robots.ts` — allow "/", disallow /preview/, /dashboard/, /signin, /signup, /forgot-password; sitemap pointer at {base}/sitemap.xml (D-06)
- Shipped `app/rss.xml/route.ts` — full-text RSS 2.0 (D-07); renderPostBody sanitize pipeline + CDATA defense-in-depth (T-05-02); escapeXml on all text fields closes XML injection (T-05-04); RSS_LIMIT=30 cap with defensive slice
- All three routes read canonicalBaseUrl from `getSeoSettings()` (Pitfall 7 — single source, never process.env directly)
- 28 new vitest assertions (14 sitemap/robots + 14 RSS) all green; build registers all three routes correctly
- Pure helpers (`buildHomeSitemapEntry`, `buildPostSitemapEntry`, `buildPageSitemapEntry`, `escapeXml`, `buildRssItem`) exported for DB-free unit testing

## Task Commits

Each task was committed atomically (TDD RED → GREEN):

1. **Task 1: sitemap.ts + robots.ts + tests** — `a25041c` (feat)
2. **Task 2: rss.xml Route Handler + tests** — `0f46719` (feat)

## Files Created/Modified
- `src/app/sitemap.ts` — default `sitemap()` + pure helpers `buildHomeSitemapEntry`/`buildPostSitemapEntry`/`buildPageSitemapEntry`
- `src/app/robots.ts` — default `robots()` returning `MetadataRoute.Robots` with the verified disallow list
- `src/app/rss.xml/route.ts` — `GET()` Route Handler + `escapeXml` + `buildRssItem` + `RSS_LIMIT = 30`
- `src/lib/seo/__tests__/sitemap.test.ts` — 10 assertions (SEO-02, SEO-08, T-05-05)
- `src/lib/seo/__tests__/robots.test.ts` — 4 assertions (SEO-02 robots side)
- `src/lib/seo/__tests__/rss.test.ts` — 14 assertions (SEO-07, T-05-02, T-05-04, RSS_LIMIT cap)
- `src/lib/seo/__tests__/shared-fixtures.ts` — extended with `fakeSitemapPosts`, `fakeSitemapPages`, `fakeRssPosts`, `fakeRssPostWithSpecialChars`, `MOCK_RENDERED_BODY`, draft/soft-deleted slug constants

## Decisions Made
- RSS_LIMIT=30 chosen (midpoint of D-07's 20-50 range) — defensible cap that covers most readers without overloading the feed
- Added defensive `.slice(0, RSS_LIMIT)` AFTER the SQL `.limit()` — defense-in-depth so the route caps correctly even if the SQL limit is ever misconfigured; the test provides 35 rows and asserts 30 items to verify
- CDATA wraps the sanitized body even though renderPostBody already sanitizes (T-05-02 mandates both layers — sanitize is the primary defense, CDATA is defense-in-depth against residual HTML entities breaking the XML parser)
- escapeXml applied to title/excerpt/link/guid but NOT the body (body is CDATA-wrapped per the RSS content-module convention — escaping inside CDATA would double-encode)
- Pure helpers exported from the route files themselves (not a separate `sitemap-builders.ts`) — fewer files, same testability; the route files' named exports are not treated specially by Next.js

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed vitest vi.mock hoisting TDZ error in sitemap.test.ts**
- **Found during:** Task 1 GREEN phase (first test run)
- **Issue:** `vi.mock("@/lib/db", ...)` factory referenced `const schemaMock` declared at module level, but `vi.mock` is hoisted above all top-level code by vitest, causing a `ReferenceError: Cannot access 'schemaMock' before initialization`
- **Fix:** Moved `schemaMock` into a `vi.hoisted()` call so it is available when the hoisted mock factory executes; kept `postsResult`/`pagesResult` as module-level `let` since they are only read inside callback closures that run later during test execution
- **Files modified:** src/lib/seo/__tests__/sitemap.test.ts
- **Verification:** All 14 sitemap tests green
- **Committed in:** `a25041c`

**2. [Rule 1 - Bug] Fixed TypeScript Extract<> type narrowing to `never` in robots.test.ts**
- **Found during:** Task 1 — `pnpm tsc --noEmit` after tests passed
- **Issue:** `r.rules as Extract<typeof r.rules, { userAgent: string }>` resolved to `never` because the `MetadataRoute.Robots.rules` union shape didn't match the Extract predicate exactly, making `.disallow` access a type error
- **Fix:** Replaced the `Extract` cast with a direct `{ userAgent: string; allow: string; disallow: string[] }` cast (justified — our `robots()` always returns the single-rule-object form, never the array form)
- **Files modified:** src/lib/seo/__tests__/robots.test.ts
- **Verification:** `pnpm tsc --noEmit` clean for all sitemap/robots/rss files
- **Committed in:** `a25041c`

**3. [Rule 1 - Bug] Fixed incorrect test assertion for escaped ampersand in rss.test.ts**
- **Found during:** Task 2 GREEN phase (first test run)
- **Issue:** `expect(itemTitle).not.toContain("&")` failed because the escaped entities (`&amp;`, `&lt;`, etc.) legitimately contain the `&` character as part of the entity name
- **Fix:** Removed the over-broad `not.toContain("&")` assertion; the regex assertion `not.toMatch(/(^|[^&])&($|[^a-z])/i)` (already present on the next line) correctly checks that no RAW ampersand appears outside an entity
- **Files modified:** src/lib/seo/__tests__/rss.test.ts
- **Verification:** All 14 RSS tests green
- **Committed in:** `0f46719`

---

**Total deviations:** 3 auto-fixed (3 bugs — all test/type-safety fixes; zero plan-scope changes)
**Impact on plan:** All fixes were in test files (test infrastructure correctness); the implementation files matched the plan exactly. No scope creep.

## Issues Encountered
- Pre-existing TypeScript errors in `src/actions/__tests__/storage-settings.test.ts` (lines 318-322: `result.cloudinary`/`result.r2` possibly undefined) — out of scope per deviation rules (not caused by this plan's changes). Logged in 05-01-SUMMARY too; deferred to a future `/gsd-debug`.

## Deferred Issues
- `src/actions/__tests__/storage-settings.test.ts` lines 318-322: `result.cloudinary`/`result.r2` possibly undefined — pre-existing, out of scope. Surfaced for a future `/gsd-debug` or Phase 4 cleanup.
- Manual smoke (curl /sitemap.xml, /robots.txt, /rss.xml on a running server with a populated DB) deferred to phase verification per VALIDATION.md "Manual-Only Verifications".

## Known Stubs
None — all three routes are fully wired to the DB via Drizzle queries and read real settings via `getSeoSettings()`. No placeholder data, no TODO/FIXME in the output paths.

## User Setup Required
None — the routes are self-contained and read from the existing `posts`/`pages` tables + the seeded SEO settings (from Plan 01's `seedSeoSettings()`). No external service configuration required.

## Next Phase Readiness
- Phase 6 (public frontend) can extend `sitemap.ts` by appending category/tag/author archive entries after the `pageEntries` spread (the D-05 extensibility comment marks the seam)
- Plan 03 (`saveSeoSettings`) can call `revalidatePath("/robots.txt")` + `revalidatePath("/sitemap.xml")` + `revalidatePath("/rss.xml")` to refresh these routes when the admin edits the canonical base URL or site title
- The `escapeXml` + CDATA pattern established here is reusable if future XML feeds (Atom, sitemap-index) are added

## Self-Check: PASSED
- All 7 created/modified files exist on disk (FOUND)
- Both task commits (`a25041c`, `0f46719`) exist in git log (FOUND)
- No accidental file deletions in either commit (clean)

---
*Phase: 05-seo-basics*
*Completed: 2026-07-07*
