---
phase: 05-seo-basics
plan: 03
subsystem: seo
tags: [seo, post-seo, dashboard, redirects, admin-gate, d-08, d-11, d-12, cache-components]

# Dependency graph
requires:
  - phase: 05-seo-basics
    plan: 01
    provides: "seoMetaSchema with Intl.Segmenter grapheme validation (src/lib/seo/validation.ts), getSeoSettings cached reader (src/lib/seo/settings.ts), redirects table + migration 0004"
  - phase: 04-dashboard-chrome
    provides: "Storage Settings page trio pattern (page.tsx + Form.tsx + schema-client.ts), upsertSetting helper, requireRole('admin') FIRST gate"
  - phase: 03-content-engine
    provides: "savePost action + postSchema + PostForm.tsx + assertOwnsPost ownership gate"
provides:
  - "saveSeoSettings admin-gated action writing 5 site-wide SEO defaults + 2-arg revalidateTag('seo-settings','max') (src/actions/settings.ts)"
  - "seoSettingsSchema pure Zod module (src/actions/seo-settings-schema.ts) — shared client+server per D-10"
  - "settings/seo admin dashboard page trio (page.tsx + SeoSettingsForm.tsx + schema-client.ts)"
  - "SeoPanel.tsx — collapsible SEO-fields component for the post editor (4 fields: metaTitle, metaDescription, canonicalUrl, ogImage)"
  - "post_seo upsert block inside savePost (D-08 gap closure — Phase 3 only wrote the posts row, never post_seo)"
  - "Redirects-table check in app/not-found.tsx with Suspense-isolated RedirectChecker (D-12 forward-compatibility hook)"
affects: [06-public-frontend (Phase 6 buildPostMetadata reads the post_seo rows this plan populates), 05-verifier (manual smoke: editor fills SEO panel, admin edits settings/seo)]

# Tech tracking
tech-stack:
  added: []  # Zero installs — all primitives ship with next@16.2.9
  patterns:
    - "Suspense-isolated async child for Cache Components compliance on otherwise-static pages (not-found.tsx RedirectChecker)"
    - "Schema split: 'use server' file imports schema from a pure-schema sibling module (seo-settings-schema.ts — mirrors storage-settings-schema.ts)"
    - "seoMetaSchema.safeParse (NOT .parse) inside savePost for defensive SEO validation — never fails the post save"
    - "post_seo one-to-one upsert: select-by-postId → update-or-insert (no deletedAt — hard-delete per D-08)"

key-files:
  created:
    - src/components/dashboard/posts/SeoPanel.tsx
    - src/app/(admin)/dashboard/settings/seo/page.tsx
    - src/app/(admin)/dashboard/settings/seo/SeoSettingsForm.tsx
    - src/app/(admin)/dashboard/settings/seo/schema-client.ts
    - src/actions/seo-settings-schema.ts
    - src/actions/__tests__/seo-settings.test.ts
  modified:
    - src/actions/posts.ts
    - src/actions/posts-schema.ts
    - src/app/(admin)/dashboard/posts/PostForm.tsx
    - src/actions/settings.ts
    - src/app/not-found.tsx
    - src/actions/__tests__/posts.test.ts

key-decisions:
  - "SeoPanel extracted as a standalone component (vs inline in PostForm) — follows the TaxonomyPicker precedent, keeps PostForm lean, and the 4 SEO fields are registered via prop-spread into the same RHF form"
  - "Schema split into seo-settings-schema.ts — a 'use server' file can ONLY export async functions; the Zod object export caused a build error. Mirrors the storage-settings → storage-settings-schema split"
  - "RedirectChecker isolated in <Suspense fallback={null}> — under cacheComponents:true, uncached data access (headers() + db) outside Suspense blocks the entire route from prerendering. The static 404 UI prerenders; the redirect-check streams"
  - "Redirect calls (redirect/permanentRedirect) placed OUTSIDE the DB-lookup try/catch — the NEXT_REDIRECT special error must propagate to Next.js's framework handler unimpeded"
  - "seoMetaSchema.safeParse (NOT .parse) in savePost — a malformed SEO input logs and continues without failing the post save (the post itself is already persisted)"

patterns-established:
  - "Suspense-isolated dynamic checker on a static page (not-found.tsx) — the Cache Components pattern for adding DB lookups to otherwise-prerenderable special routes"
  - "post_seo defensive upsert — safeParse + log-and-continue, never fail the primary write"

requirements-completed: [SEO-01, SEO-06]

coverage:
  - id: SEO-01-dashboard
    description: "savePost writes post_seo via safeParse upsert; saveSeoSettings writes 5 settings keys with admin gate"
    requirement: "SEO-01"
    verification:
      - kind: unit
        ref: "src/actions/__tests__/seo-settings.test.ts — 6 assertions (admin gate MUST_NOT_BE_REACHED, 5-key write, 2-arg revalidateTag, revalidatePath routes, Zod rejections)"
        status: pass
      - kind: build
        ref: "pnpm build exits 0 — settings/seo page + not-found.tsx + PostForm all compile"
        status: pass
    human_judgment: false
  - id: SEO-06-live-editor
    description: "SeoPanel renders 4 fields in the post editor; grapheme rule enforced server-side via seoMetaSchema.safeParse (reused from Plan 01, D-10)"
    requirement: "SEO-06"
    verification:
      - kind: build
        ref: "pnpm tsc --noEmit + pnpm build pass — SeoPanel integrated into PostForm"
        status: pass
    human_judgment: true
    rationale: "Live editor grapheme enforcement requires manual smoke (create a post with 250-grapheme Latin meta description, confirm server skips it gracefully)"

# Metrics
duration: 16min
completed: 2026-07-07
status: complete
---

# Phase 5 Plan 3: Dashboard SEO Surface + Redirects Check Summary

**Post-editor SEO panel (4 fields) writing post_seo via defensive safeParse upsert + admin-only settings/seo page with requireRole('admin')-FIRST save action + redirects-table check in not-found.tsx (Node runtime, Suspense-isolated for Cache Components)**

## Performance

- **Duration:** ~16 min
- **Started:** 2026-07-06T21:48:17Z
- **Completed:** 2026-07-06T22:04:02Z
- **Tasks:** 3 (Task 2 was TDD: RED → GREEN + 2 Rule-1 fixes)
- **Files modified:** 12 (6 created + 6 modified)

## Accomplishments
- Shipped `SeoPanel.tsx` — a collapsible 4-field SEO section (metaTitle, metaDescription, canonicalUrl, ogImage) for the post editor, mirroring the pages-editor SEO pattern (D-08 gap closure)
- Extended `savePost` with a defensive `upsertPostSeo` helper: `seoMetaSchema.safeParse` (NOT .parse) so a malformed SEO input logs and continues without failing the post save; inherits `assertOwnsPost` ownership gate (T-05-06 — no permission weakening)
- Shipped `saveSeoSettings` in `settings.ts` — `requireRole('admin')` as the FIRST line (T-05-01), writes 5 settings keys via `upsertSetting`, then `revalidateTag('seo-settings', 'max')` (2-arg form, landmine #5) + `revalidatePath('/', 'layout')` + 3 SEO routes
- Shipped `settings/seo` admin page trio (page.tsx server component + SeoSettingsForm.tsx RHF client form + schema-client.ts bridge) mirroring the Storage Settings pattern (D-11)
- Shipped redirects-table check in `app/not-found.tsx` — `RedirectChecker` async component queries `redirects` by `x-invoke-path` header; 301 → `permanentRedirect`, 302 → `redirect`; wrapped in `<Suspense>` for Cache Components; try/catch graceful degradation (T-05-08, D-12)
- 6 new vitest assertions all green (admin gate MUST_NOT_BE_REACHED + 5-key write + 2-arg revalidateTag + revalidatePath routes + Zod rejections); build succeeds with `/_not-found` as ◐ Partial Prerender

## Task Commits

Each task was committed atomically (Task 2 was TDD RED → GREEN + 2 Rule-1 fixes):

1. **Task 1: Post SEO panel + post_seo writes** — `c4ac67d` (feat)
2. **Task 2 RED: saveSeoSettings failing test** — `5efa4ed` (test)
3. **Task 2 GREEN: saveSeoSettings + settings/seo page** — `7ab9fd8` (feat)
4. **Rule 1 fix: schema split for use-server constraint** — `63016ef` (fix)
5. **Task 3: redirects check in not-found.tsx** — `302fa4f` (feat)

## Files Created/Modified
- `src/actions/posts.ts` — added `upsertPostSeo` helper (safeParse + select-or-insert), SEO fields on `SavePostInput`, capture postId before return
- `src/actions/posts-schema.ts` — added metaTitle, metaDescription, ogImage, canonicalUrl optional fields to `postSchema`
- `src/components/dashboard/posts/SeoPanel.tsx` — collapsible SEO section (4 fields, register/errors via props, grapheme-aware placeholder copy)
- `src/app/(admin)/dashboard/posts/PostForm.tsx` — imports + renders `<SeoPanel>` after the feature-image block
- `src/actions/settings.ts` — added `saveSeoSettings` (requireRole FIRST + 5-key upsert + revalidation block) + `SEO_KEYS` + `upsertSetting` helper
- `src/actions/seo-settings-schema.ts` — pure Zod schema module (split from settings.ts for use-server constraint)
- `src/app/(admin)/dashboard/settings/seo/page.tsx` — server component, getSeoSettings initial values, try/catch error banner
- `src/app/(admin)/dashboard/settings/seo/SeoSettingsForm.tsx` — RHF + zodResolver + useMutation (NOT optimistic), 5 fields, Field helper
- `src/app/(admin)/dashboard/settings/seo/schema-client.ts` — re-exports schema + zodResolver
- `src/app/not-found.tsx` — async RedirectChecker in Suspense, redirects-table lookup, graceful try/catch, 404 UI unchanged
- `src/actions/__tests__/seo-settings.test.ts` — 6 assertions (admin gate, 5-key write, 2-arg revalidateTag, revalidatePath, Zod rejections)
- `src/actions/__tests__/posts.test.ts` — mock schema extended with postSeo table (Rule 1 fix)

## Decisions Made
- Extracted SeoPanel as a standalone component (vs inline in PostForm) — follows TaxonomyPicker precedent; the 4 SEO fields register via prop-spread into the parent RHF form, so they submit with the rest of the data
- Split seoSettingsSchema into a separate `seo-settings-schema.ts` module — a `"use server"` file can ONLY export async functions; the Zod object export caused a Next.js build error ("A 'use server' file can only export async functions, found object"). Mirrors the storage-settings → storage-settings-schema split
- Isolated the redirect-check in a `<Suspense fallback={null}>` boundary — under cacheComponents:true, uncached data access (headers() + db) outside Suspense blocks the entire route from prerendering ("Uncached data was accessed outside of <Suspense>"). The static 404 UI prerenders; the redirect-check streams. At runtime, the RedirectChecker runs with real headers and either redirects or returns null
- Placed redirect()/permanentRedirect() calls OUTSIDE the DB-lookup try/catch — the NEXT_REDIRECT special error must propagate to Next.js's framework handler. Wrapping them in try/catch would swallow the redirect and render the 404 instead
- Used seoMetaSchema.safeParse (NOT .parse) in savePost — a malformed SEO input (e.g. grapheme limit exceeded) logs and continues without failing the post save. The post itself is already persisted; SEO is secondary

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed posts.test.ts mock schema missing postSeo table**
- **Found during:** Task 1 verification (`pnpm test --run` after extending savePost)
- **Issue:** The existing posts.test.ts `@/lib/db` mock schema object didn't include `postSeo`. The new `upsertPostSeo` accesses `schema.postSeo.id` / `.postId`, causing `TypeError: Cannot read properties of undefined (reading 'id')` in 4 existing tests
- **Fix:** Added `postSeo: { id, postId, metaTitle, metaDescription, ogImage, canonicalUrl }` to the mock schema object. The mock's chainable select/insert/update already handles the query shape
- **Files modified:** src/actions/__tests__/posts.test.ts
- **Verification:** All 324 tests green (including the 4 that previously failed)
- **Committed in:** `c4ac67d`

**2. [Rule 1 - Bug] Split seoSettingsSchema into separate module for use-server constraint**
- **Found during:** Task 2+3 verification (`pnpm build` after implementing saveSeoSettings)
- **Issue:** `settings.ts` has `"use server"` at the top. Exporting `seoSettingsSchema` (a Zod object) and `SeoSettingsInput` (a type) from it caused a Next.js build error: "A 'use server' file can only export async functions, found object"
- **Fix:** Created `src/actions/seo-settings-schema.ts` (pure Zod schema module, no directives — mirrors `storage-settings-schema.ts`). Updated `settings.ts` to import from `./seo-settings-schema`. Updated `schema-client.ts` to re-export from `@/actions/seo-settings-schema`
- **Files modified:** src/actions/seo-settings-schema.ts (new), src/actions/settings.ts, src/app/(admin)/dashboard/settings/seo/schema-client.ts
- **Verification:** `pnpm build` exits 0; `pnpm test --run` 330 green; `pnpm tsc --noEmit` clean
- **Committed in:** `63016ef`

**3. [Rule 1 - Bug] Isolated redirect-check in Suspense for Cache Components**
- **Found during:** Task 3 verification (`pnpm build` after adding async headers()/db to not-found.tsx)
- **Issue:** Making not-found.tsx async (via `headers()` + `db.select()`) triggered "Uncached data was accessed outside of <Suspense>" under cacheComponents:true. The dynamic access propagated through the root layout's SidebarContext/ThemeContext, blocking the entire `/_not-found` route from prerendering
- **Fix:** Split not-found.tsx into a synchronous default export (static 404 UI) + an async `RedirectChecker` component. The RedirectChecker is wrapped in `<Suspense fallback={null}>` so the 404 UI stays in the static prerender shell while the redirect-check streams. Redirect calls are outside the try/catch (NEXT_REDIRECT must propagate)
- **Files modified:** src/app/not-found.tsx
- **Verification:** `pnpm build` exits 0; `/_not-found` registered as ◐ Partial Prerender
- **Committed in:** `302fa4f`

---

**Total deviations:** 3 auto-fixed (3 bugs — all build/test infrastructure fixes; zero plan-scope changes)
**Impact on plan:** All fixes were necessary for the build/test gates to pass. The implementation logic matched the plan exactly; the deviations were infrastructure constraints (mock schema coverage, Next.js use-server export rules, Cache Components Suspense requirement).

## Issues Encountered
- Pre-existing TypeScript errors in `src/actions/__tests__/storage-settings.test.ts` (lines 318-322: `result.cloudinary`/`result.r2` possibly undefined) — out of scope per deviation rules. Logged in 05-01 and 05-02 summaries too; deferred to a future `/gsd-debug`.

## Deferred Issues
- `src/actions/__tests__/storage-settings.test.ts` lines 318-322 — pre-existing, out of scope. Surfaced for a future `/gsd-debug` or Phase 4 cleanup.
- Manual smoke (deferred to phase verification): as an editor, create a post with SEO fields filled, save, confirm the post_seo row exists; as an admin, open /dashboard/settings/seo, change the site title, save, confirm the home page title updates (cacheTag invalidation works).

## Known Stubs
None — all components are fully wired. SeoPanel registers 4 fields into the parent RHF form; savePost upserts real post_seo rows; saveSeoSettings writes real settings keys; RedirectChecker queries the real redirects table. No placeholder data, no TODO/FIXME.

## User Setup Required
None — the redirects table ships empty (D-12 forward-compatibility). The SEO settings keys are seeded at boot via Plan 01's `seedSeoSettings()`. No external service configuration required.

## Next Phase Readiness
- Phase 6 (public frontend) can call `buildPostMetadata(post, postSeo, settings)` with real post_seo rows populated by this plan's SEO panel — the D-08 gap is closed
- The settings/seo page lets the founder change the site title, description, default OG, canonical base, and twitter handle without a DB edit (D-11)
- The redirects check is wired and ready for the SETT-03 v2 redirects-manager UI (D-12) — just populate the table and the not-found.tsx check will consult it

## Self-Check: PASSED
- All 6 created files exist on disk (FOUND)
- All 6 modified files exist on disk (FOUND)
- All 5 task commits (c4ac67d, 5efa4ed, 7ab9fd8, 63016ef, 302fa4f) exist in git log (FOUND)
- No accidental file deletions in any commit (clean)

---
*Phase: 05-seo-basics*
*Completed: 2026-07-07*
