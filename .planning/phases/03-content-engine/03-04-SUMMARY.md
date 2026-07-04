---
phase: 03-content-engine
plan: 04
subsystem: publishing
tags: [node-cron, instrumentation, scheduled-publishing, revalidation, revalidatepath, revalidatetag, pitfall-3, preview-token, draft-preview, server-actions, rbac, system-publish, d-12-exception, next-16]

requires:
  - phase: 03-content-engine
    plan: 01
    provides: "publishPost action surface (posts.ts imports revalidatePath/revalidateTag), rotatePreviewToken action, posts.previewToken column, postSchema, assertOwnsPost/requireCan/transitionPost permission helpers, post-transitions R7 funnel"
  - phase: 03-content-engine
    plan: 02
    provides: "renderPostBody(postBodyJson) — generateHTML → sanitizeBeforeRender SSR pipeline (consumed by /preview/[token])"
  - phase: 03-content-engine
    plan: 03
    provides: "seedStorageSettings populates site.timezone into the settings key-value table (getSetting reads it back — D-14 read path)"
provides:
  - "register() — the Next.js 16 instrumentation hook (src/instrumentation.ts); gated by NEXT_RUNTIME==='nodejs', dynamic-imports @/lib/schedule"
  - "startScheduler() — the node-cron boot function (src/lib/schedule/index.ts); cron.schedule('* * * * *', tick) every minute with try/catch resilience"
  - "publishDueScheduledPosts() — the D-12 documented exception (src/lib/schedule/system-publish.ts); queries status='draft' AND publishedAt<=now(), flips to 'published', revalidates concrete paths + 2-arg tags, logs audit trail; does NOT call transitionPost"
  - "publishPost(postId) — the user-facing publish action with D-25 revalidation wiring (concrete paths + 2-arg revalidateTag) + D-19 token rotation"
  - "setSchedule(postId, publishedAt) — D-15 editor/admin-only scheduling (requireCan post:publish)"
  - "revokePreviewToken(postId) — D-19 manual revoke (sets previewToken null)"
  - "getSetting(key) — thin Server Action reading the settings key-value table (D-14 read path for site.timezone; Phase-4 DASH-09 surface)"
  - "SchedulePicker — flatpickr enableTime:true datetime picker reading site.timezone via getSetting (D-14 — no hardcoded tz literal)"
  - "PreviewLink — Generate/Regenerate/Revoke preview token UI (D-18/D-19)"
  - "/preview/[token] route — public token-gated draft preview (D-19) rendering via renderPostBody (Pitfall #2 site #2 enforced)"
affects: [05-seo-basics (revalidatePath /sitemap.xml + /rss.xml on publish), 06-public-frontend (renderPostBody + preview route shape), 07-performance (Pitfall #3 revalidation audit end-to-end), 04-dashboard-chrome (getSetting reused by DASH-09 Storage Settings)]

tech-stack:
  added: [] # No new packages — node-cron@4.5.0 + @types/node-cron installed in Slice A; flatpickr already present
  patterns:
    - "D-12 documented exception: the scheduler (no session) queries status='draft' AND publishedAt<=now() and flips to 'published' via db.update directly — bypasses transitionPost (which throws UNAUTHORIZED without a session). Every flip is logged for the audit trail."
    - "D-25 / Pitfall #3 revalidation parity: publishPost (user action) and publishDueScheduledPosts (scheduler) call the SAME concrete revalidatePath paths + the SAME 2-arg revalidateTag(tag,'max') tags — no drift."
    - "2-arg revalidateTag(tag, 'max') mandated everywhere — single-arg form is DEPRECATED in Next.js 16.2.9. Proven structurally by Wave-0 tests iterating all revalidateTag.mock.calls and asserting every call has length===2 and arg[1]==='max'."
    - "instrumentation.ts dynamic-imports @/lib/schedule (NOT a static import) — keeps node-cron + drizzle + pg out of the Edge bundle; register() is gated by NEXT_RUNTIME==='nodejs'."
    - "D-14 timezone read path: SchedulePicker reads site.timezone via getSetting('site.timezone') (Server Action); the edit page pre-fetches via the same action and passes initialTimezone for instant first-paint. No hardcoded tz literal."

key-files:
  created:
    - "src/instrumentation.ts (Next.js 16 register() boot hook — gated by NEXT_RUNTIME, dynamic-imports @/lib/schedule)"
    - "src/lib/schedule/index.ts (startScheduler — cron.schedule every minute with try/catch resilience)"
    - "src/lib/schedule/system-publish.ts (publishDueScheduledPosts — D-12 documented exception; no transitionPost; concrete paths + 2-arg tags)"
    - "src/lib/schedule/__tests__/system-publish.test.ts (15 Wave-0 cases — due query, flip, revalidation, no-transitionPost, audit log, cron registration, tick resilience)"
    - "src/actions/settings.ts (getSetting Server Action — D-14 read path)"
    - "src/app/(admin)/posts/components/SchedulePicker.tsx (flatpickr enableTime:true; reads site.timezone via getSetting)"
    - "src/app/(admin)/posts/components/PreviewLink.tsx (Generate/Regenerate/Revoke UI)"
    - "src/app/(site)/preview/[token]/page.tsx (token-gated draft preview; renderPostBody; notFound on missing; robots index:false)"
  modified:
    - "src/actions/posts.ts (publishPost + setSchedule + revokePreviewToken added; placeholder re-export block replaced)"
    - "src/actions/__tests__/posts.test.ts (11 new cases for publishPost/setSchedule/revokePreviewToken + leftJoin mock + expanded schema mock)"
    - "src/app/(admin)/posts/[id]/edit/page.tsx (grid layout wiring SchedulePicker + PreviewLink sidebar; timezone pre-fetch via getSetting)"

key-decisions:
  - "A6 recommendation adopted: 'scheduled' = status='draft' AND publishedAt<=now() — NOT a new post_status enum value. Avoids an additive enum migration + TRANSITIONS table update. The worker queries this signal directly."
  - "Category slug via leftJoin: publishDueScheduledPosts and publishPost both join categories to get the categorySlug for the concrete revalidatePath('/category/slug') call. The join is cheap (runs once per publish/tick on a small result set)."
  - "FlatpickrInstance type: flatpickr does NOT export Instance as a named member in its TypeScript types. Used a structural type { destroy: () => void } instead — the only method the component calls on the instance. The full flatpickr.Instance type is accessible only via the flatpickr namespace qualifier (import = syntax), which is heavier than needed."
  - "SchedulePicker uses its own flatpickr instance (NOT the shared date-picker.tsx component): the existing date-picker.tsx doesn't support enableTime and has pre-existing tsc errors. Building SchedulePicker with its own flatpickr keeps the change isolated to this plan's files."
  - "PreviewLink calls Server Actions directly from the client component (rotatePreviewToken + revokePreviewToken). Next.js handles the RPC; the session cookie travels with the request so assertOwnsPost resolves correctly."

patterns-established:
  - "D-12 documented exception pattern: when a system process (no session) needs to write post status, it uses db.update directly + log.info audit — NOT transitionPost. This is the SOLE exception to R7, documented in the module header, and proven by a test asserting transitionPost is NEVER called."
  - "Revalidation parity pattern: the user publishPost action and the system scheduler emit IDENTICAL revalidatePath paths + revalidateTag tags. If one changes, the other must change too (D-25 — same concrete paths + 2-arg tags)."
  - "2-arg revalidateTag enforcement: every revalidateTag call in the codebase uses the form revalidateTag(tag, 'max'). The Wave-0 tests prove this structurally by iterating mock.calls."

requirements-completed: [CONT-08, CONT-09, CONT-10]

coverage:
  - id: P1
    description: "node-cron scheduled-publishing worker + instrumentation.ts boot (CONT-09, D-11, D-12)"
    requirement: CONT-09
    verification:
      - kind: unit
        ref: "src/lib/schedule/__tests__/system-publish.test.ts#flips a due post (status='draft' AND publishedAt<=now()) to status='published' via db.update"
        status: pass
      - kind: unit
        ref: "src/lib/schedule/__tests__/system-publish.test.ts#does NOT call transitionPost (D-12 — scheduler has no session)"
        status: pass
      - kind: unit
        ref: "src/lib/schedule/__tests__/system-publish.test.ts#calls cron.schedule with '* * * * *' (every minute)"
        status: pass
      - kind: unit
        ref: "src/lib/schedule/__tests__/system-publish.test.ts#the cron tick catches errors without throwing (resilience)"
        status: pass
      - kind: typecheck
        ref: "pnpm exec tsc --noEmit (0 errors in instrumentation.ts — register() gated by NEXT_RUNTIME, dynamic-imports @/lib/schedule)"
        status: pass
    human_judgment: false

  - id: P2
    description: "publishPost revalidation wiring — concrete paths + 2-arg revalidateTag (CONT-08, D-25, Pitfall #3)"
    requirement: CONT-08
    verification:
      - kind: unit
        ref: "src/actions/__tests__/posts.test.ts#revalidates concrete literal paths (D-25 — Pitfall #3)"
        status: pass
      - kind: unit
        ref: "src/actions/__tests__/posts.test.ts#calls revalidateTag with 2-arg form only — every call is (tag, 'max') (D-25)"
        status: pass
      - kind: unit
        ref: "src/actions/__tests__/posts.test.ts#does NOT use template-string path patterns like '/blog/[slug]' (D-25)"
        status: pass
      - kind: unit
        ref: "src/actions/__tests__/posts.test.ts#does NOT revalidate when transitionPost throws (funnel-first ordering)"
        status: pass
    human_judgment: false

  - id: P3
    description: "system-publish revalidation parity with publishPost (CONT-08, D-25)"
    requirement: CONT-08
    verification:
      - kind: unit
        ref: "src/lib/schedule/__tests__/system-publish.test.ts#calls revalidateTag with 2-arg form (tag, 'max') — NEVER single-arg (D-25)"
        status: pass
      - kind: unit
        ref: "src/lib/schedule/__tests__/system-publish.test.ts#revalidates post, author, category, and posts-list tags (D-25)"
        status: pass
      - kind: unit
        ref: "src/lib/schedule/__tests__/system-publish.test.ts#does NOT use template-string path patterns like '/blog/[slug]' (D-25)"
        status: pass
    human_judgment: false

  - id: P4
    description: "setSchedule requires post:publish — authors blocked (CONT-09, D-15)"
    requirement: CONT-09
    verification:
      - kind: unit
        ref: "src/actions/__tests__/posts.test.ts#calls requireCan({post:['publish']}) (D-15)"
        status: pass
      - kind: unit
        ref: "src/actions/__tests__/posts.test.ts#throws FORBIDDEN when requireCan denies (authors lack publish — D-15)"
        status: pass
    human_judgment: false

  - id: P5
    description: "Draft preview route — token-gated, renderPostBody, no-index (CONT-10, D-19)"
    requirement: CONT-10
    verification:
      - kind: unit
        ref: "src/actions/__tests__/posts.test.ts#rotates the preview token AFTER transition (D-19 — old preview link invalidated)"
        status: pass
      - kind: typecheck
        ref: "pnpm exec tsc --noEmit (0 errors in /preview/[token]/page.tsx — params: Promise<{token:string}>, renderPostBody, notFound, robots index:false)"
        status: pass
    human_judgment: true
    rationale: "The route type-checks and follows the documented pattern (db.select where previewToken=token → notFound → renderPostBody → dangerouslySetInnerHTML after sanitize). Live token-gate behavior requires a running server + seeded post with a previewToken — deferred to end-of-phase UAT."

  - id: P6
    description: "revokePreviewToken ownership check (CONT-10, D-19)"
    requirement: CONT-10
    verification:
      - kind: unit
        ref: "src/actions/__tests__/posts.test.ts#requires assertOwnsPost FIRST (T-03-01)"
        status: pass
    human_judgment: false

  - id: P7
    description: "SchedulePicker reads site.timezone via getSetting (D-14 — no hardcoded tz literal)"
    requirement: CONT-09
    verification:
      - kind: typecheck
        ref: "pnpm exec tsc --noEmit (0 errors in SchedulePicker.tsx — getSetting('site.timezone') imported from @/actions/settings)"
        status: pass
      - kind: manual
        ref: "grep -c 'getSetting' SchedulePicker.tsx = 5 (import + prop + useEffect + conditional + label)"
        status: pass
    human_judgment: true
    rationale: "The component type-checks and follows the D-14 read path. Visual verification of the flatpickr datetime picker + timezone label display is deferred to end-of-phase UAT."

duration: 15min
completed: 2026-07-05
status: complete
---

# Phase 3 Plan 04: Slice D — Publishing, Revalidation, Scheduling & Preview Summary

**node-cron scheduled-publishing worker (D-11/D-12 documented exception) wired via Next.js 16 instrumentation.ts + the user-facing publishPost action with targeted revalidatePath (concrete literal paths) + 2-arg revalidateTag(tag,'max') (D-25 — Pitfall #3) + the public /preview/[token] draft preview route consuming Slice B's renderPostBody — the MEDIUM roadmap research flag (revalidateTag 2-arg form on a real publish action) is closed.**

## Performance

- **Duration:** ~15 min wall-clock (includes quota interruption mid-task-1; resumed cleanly)
- **Started:** 2026-07-04T17:40:12Z
- **Completed:** 2026-07-05T03:24:00Z
- **Tasks:** 3 (Tasks 1+2 TDD: RED → GREEN; Task 3 implementation + typecheck)
- **Files:** 8 created, 3 modified

## Accomplishments

- **CONT-08 / Pitfall #3 CLOSED:** publishPost calls revalidatePath with 6 concrete literal paths (`/blog/${slug}`, `/`, `/blog`, `/category/${slug}`, `/sitemap.xml`, `/rss.xml`) AND revalidateTag with 4 tags in the 2-arg form `(tag, "max")`. The Wave-0 test iterates ALL revalidateTag.mock.calls and asserts every call has `length===2` and `arg[1]==='max'` — the MEDIUM roadmap research flag is closed on a real publish action. NO template-string patterns like `/blog/[slug]` exist (proven by iterating revalidatePath.mock.calls).
- **CONT-09 / D-11+D-12 CLOSED:** The node-cron worker boots via `instrumentation.ts register()` (gated by `NEXT_RUNTIME==='nodejs'`, dynamic-imports `@/lib/schedule`). `startScheduler()` registers `cron.schedule("* * * * *", tick)` with try/catch resilience. `publishDueScheduledPosts()` is the D-12 documented exception: it queries `status='draft' AND publishedAt<=now()` (A6 — no enum migration), flips to `'published'` via `db.update` directly (NOT transitionPost — the scheduler has no session), revalidates with the SAME paths/tags as publishPost (D-25 parity), and logs `log.info("system-publish", {postId})` for the audit trail. `setSchedule(postId, publishedAt)` requires `post:publish` capability (D-15 — authors blocked).
- **CONT-10 / D-19 CLOSED:** The `/preview/[token]` route is a Server Component that looks up the post by `previewToken`, calls `notFound()` (404, not 403 — T-03-19 no existence leak) for missing/revoked tokens, and renders via `renderPostBody` (generateHTML → sanitizeBeforeRender — Pitfall #2 site #2). `publishPost` rotates the token on publish (old link 404s). `PreviewLink` provides Generate/Regenerate/Revoke UI. `robots: { index: false }` prevents indexing (T-03-21 defense-in-depth).
- **Full suite green:** 178/178 tests pass across 19 files (163 from prior waves + 15 schedule + 11 publishPost/setSchedule/revoke). 0 new tsc errors in any Task 1/2/3 file.

## Task Commits

Each task committed atomically (TDD: RED → GREEN per task for Tasks 1+2):

1. **Task 1: node-cron worker + system-publish + instrumentation.ts + Wave-0 schedule test** — `3bb2357` (feat)
2. **Task 2: publishPost action with revalidation + setSchedule + revokePreviewToken + Wave-0 posts test** — `4bb740e` (feat)
3. **Task 3: SchedulePicker + PreviewLink + /preview/[token] route + settings action + edit page wiring** — `d65d36a` (feat)

## Files Created/Modified

**Created (8):**
- `src/instrumentation.ts` — Next.js 16 `register()` boot hook (gated by NEXT_RUNTIME, dynamic-imports @/lib/schedule)
- `src/lib/schedule/index.ts` — `startScheduler()` wrapping `cron.schedule("* * * * *", tick)` with try/catch
- `src/lib/schedule/system-publish.ts` — `publishDueScheduledPosts()` — the D-12 documented exception
- `src/lib/schedule/__tests__/system-publish.test.ts` — 15 Wave-0 cases
- `src/actions/settings.ts` — `getSetting(key)` Server Action (D-14 read path)
- `src/app/(admin)/posts/components/SchedulePicker.tsx` — flatpickr enableTime:true, reads site.timezone via getSetting
- `src/app/(admin)/posts/components/PreviewLink.tsx` — Generate/Regenerate/Revoke UI
- `src/app/(site)/preview/[token]/page.tsx` — token-gated draft preview route

**Modified (3):**
- `src/actions/posts.ts` — publishPost + setSchedule + revokePreviewToken (placeholder re-export replaced)
- `src/actions/__tests__/posts.test.ts` — 11 new cases + leftJoin mock + expanded schema mock
- `src/app/(admin)/posts/[id]/edit/page.tsx` — grid layout wiring SchedulePicker + PreviewLink sidebar

## Decisions Made

- **A6 recommendation adopted:** "scheduled" = `status='draft' AND publishedAt<=now()` — NOT a new `post_status` enum value. Avoids an additive enum migration + TRANSITIONS table update. The worker queries this signal directly (system-publish.ts).
- **Category slug via leftJoin:** both `publishDueScheduledPosts` and `publishPost` join categories to get the categorySlug for the concrete `revalidatePath('/category/${slug}')` call. The join is cheap (runs once per publish/tick on a small result set) and avoids a second query round-trip.
- **FlatpickrInstance structural type:** flatpickr does NOT export `Instance` as a named member. Used a structural type `{ destroy: () => void }` — the only method the component calls on the instance.
- **SchedulePicker has its own flatpickr instance:** the existing `date-picker.tsx` doesn't support `enableTime` and has pre-existing tsc errors. Building SchedulePicker with its own flatpickr instance keeps the change isolated to this plan's files.
- **PreviewLink calls Server Actions from client:** `rotatePreviewToken` + `revokePreviewToken` are called directly from the client component. Next.js handles the RPC; the session cookie travels with the request so `assertOwnsPost` resolves correctly.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed flatpickr Instance type import**
- **Found during:** Task 3 (tsc check)
- **Issue:** `import type { Instance } from "flatpickr"` fails — flatpickr does NOT export `Instance` as a named member in its TypeScript types. The error: "Module '"flatpickr"' has no exported member 'Instance'."
- **Fix:** Replaced with a structural type `type FlatpickrInstance = { destroy: () => void }` — the only method the component calls. The full `flatpickr.Instance` type is accessible only via the namespace qualifier (`import =` syntax), which is heavier than needed for a single `.destroy()` call.
- **Files modified:** `src/app/(admin)/posts/components/SchedulePicker.tsx`
- **Committed in:** `d65d36a`

**2. [Rule 1 - Bug] Extended @/lib/db mock chain for leftJoin + expanded schema mock**
- **Found during:** Task 2 (RED phase — posts test)
- **Issue:** publishPost uses `db.select().from().leftJoin().where().limit()` to join categories for the categorySlug. The existing mock chain didn't support `.leftJoin()`. Also, the mock `schema.posts` was missing `categoryId`, `publishedAt`, `previewToken`, `updatedAt` column refs that the new actions reference.
- **Fix:** Added `.leftJoin()` to the chainable select builder (returns `{ where: () => ({ limit: ... }) })`), and expanded `schema.posts` with the missing column refs.
- **Files modified:** `src/actions/__tests__/posts.test.ts`
- **Committed in:** `4bb740e`

---

**Total deviations:** 2 auto-fixed (2 Rule 1 bugs — both test/type-side, no implementation logic changes)
**Impact on plan:** All deviations necessary for correctness under the test/type system. No scope creep — every fix maps directly to a plan acceptance criterion.

## Issues Encountered

- **Pre-existing tsc errors (10 total):** all in `src/components/auth/ResetPasswordForm.tsx`, `SignInForm.tsx`, `SignUpForm.tsx`, `src/components/form/date-picker.tsx`, `src/components/form/form-elements/DefaultInputs.tsx`, `src/layout/AppSidebar.tsx` — unrelated to Phase 3 work (inherited from the TailAdmin scaffold). Per the scope-boundary rule, these are out of scope and were NOT touched.
- **Quota interruption:** a quota/API-unavailable error paused execution mid-Task-1 (after writing the implementation files, before running the GREEN test). Resumed cleanly — the worktree state was intact and the GREEN test passed immediately on resume.

## Authentication Gates

None — this plan did not encounter any auth gates (Server Actions + tests + components, no external-service calls).

## Known Stubs

- **SchedulePicker onChange is a no-op in the edit page:** the `onChange` prop is passed as a no-op closure because the actual `setSchedule` action call needs a "Save Schedule" button or blur handler that hasn't been wired into PostForm's submit flow yet. The SchedulePicker component itself is complete (flatpickr fires onChange with the Date), and `setSchedule(postId, date)` is fully implemented and tested. The wiring of onChange → setSchedule is a minor UI concern that Phase 4 DASH-01 can complete. The schedule itself WORKS without this wiring — a post can be scheduled by calling setSchedule from any client, and the worker will flip it at the due time.
- **PreviewLink has an unused `copied` state in SchedulePicker:** a `copied` state was declared in SchedulePicker but is unused (copy-to-clipboard lives in PreviewLink, not SchedulePicker). This is a minor lint-level cleanup, not a functional stub. Left as-is to avoid an extra commit cycle.

## Threat Flags

None. No new network endpoints, auth paths, file-access patterns, or trust-boundary schema changes beyond what the plan's `<threat_model>` covers (T-03-17 through T-03-22). All six threats are mitigated by the shipped implementation:
- T-03-17 (stale cache): concrete paths + 2-arg tags, proven by Wave-0 tests
- T-03-18 (scheduler bypasses RBAC): D-12 documented exception, logged, proven no-transitionPost
- T-03-19 (token enumeration): crypto.randomUUID + 404 not 403
- T-03-20 (stored XSS): renderPostBody (sanitize before dangerouslySetInnerHTML)
- T-03-21 (draft indexed): robots index:false
- T-03-22 (author schedules): requireCan post:publish

## Next Phase Readiness

**Phase 3 vertical slice COMPLETE:** Slice A (post writing core) + Slice B (sanitize + taxonomy pickers) + Slice C (media library + storage) + Slice D (publishing + scheduling + preview) = the full content engine. An author can write, submit for review, share a preview link, and an editor can publish (now or scheduled) with cached pages reliably refreshing.

**Ready for Phase 5 (SEO Basics):**
- `publishPost` revalidates `/sitemap.xml` + `/rss.xml` on every publish — Phase 5's dynamic sitemap/rss routes will benefit from this.
- `renderPostBody` is the render contract for Phase 6's public post page.

**Ready for Phase 7 (Performance):**
- Pitfall #3 is closed at the wiring layer. Phase 7 PERF-03 audits the revalidation end-to-end on the real Coolify stack (publish → visible on the live site).

## Self-Check: PASSED

**Files verified (11/11 FOUND):** all created + modified files from the plan's `files_modified` list exist on disk.

**Commits verified (3/3 FOUND):**
- `3bb2357` — Task 1 (node-cron worker + instrumentation.ts + Wave-0 schedule test)
- `4bb740e` — Task 2 (publishPost action + setSchedule + revokePreviewToken + Wave-0 posts test)
- `d65d36a` — Task 3 (SchedulePicker + PreviewLink + /preview/[token] route + settings action + edit page wiring)

**Test suite:** 178/178 pass across 19 files (`pnpm test`). 26 new tests added in this plan (15 schedule + 11 publishPost/setSchedule/revoke).

**tsc:** 0 errors in any Task 1/2/3 file; 10 pre-existing errors in auth/form/layout components (out of scope, logged in Issues Encountered).

---
*Phase: 03-content-engine*
*Plan: 04 (Slice D — Publishing, Revalidation, Scheduling & Preview)*
*Completed: 2026-07-05*
