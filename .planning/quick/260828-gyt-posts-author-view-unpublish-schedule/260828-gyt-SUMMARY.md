---
quick_id: 260828-gyt
phase: quick
plan: 01
subsystem: posts-dashboard
tags: [posts-list, unpublish, schedule, author-column, view-links, transition-post, revalidation, r7-funnel]
requires:
  - "260827-se8 URL-driven posts list (listPosts/countPosts + PostRowActions + ListFilterBar)"
  - "transitionPost R7 funnel + TRANSITIONS table (D-14b published→draft legal for all roles)"
  - "publishDueScheduledPosts every-minute worker (A6: draft + future publishedAt = scheduled)"
provides:
  - "listPosts rows carry authorName (joined user name, null when no match) alongside the full post row"
  - "unpublishPost action — assertOwnsPost-first, transitionPost funnel, full publishPost revalidation parity, no notify, no token rotation"
  - "setSchedule status-aware semantics — published+future unpublishes via the funnel with parity revalidation ({ ok, unpublished }), published+past rejects SCHEDULE_IN_PAST before any write"
  - "Posts list: Author column, per-row View link (/blog/{slug} or /preview/{token}, _blank), blue Scheduled badge, row Unpublish button (editor/admin)"
  - "PostForm: 'Save' label on published edits, Unpublish button flipping the form to draft, create-redirect to /dashboard/posts/{id}/edit"
  - "SchedulePicker: semantics-aware success toast ('Post unpublished — scheduled for …')"
affects:
  - "src/actions/posts.ts (listPosts mapping, setSchedule rewrite, new unpublishPost + revalidatePublicPostSurfaces)"
  - "src/app/(admin)/dashboard/posts/page.tsx (Author column, View link, Scheduled badge)"
  - "src/app/(admin)/dashboard/posts/components/PostRowActions.tsx (Unpublish action)"
  - "src/app/(admin)/dashboard/posts/PostForm.tsx (label semantics, Unpublish, create-redirect)"
  - "src/app/(admin)/dashboard/posts/components/SchedulePicker.tsx (semantics toast + helper text)"
tech-stack:
  added: []
  patterns:
    - "Module-local revalidatePublicPostSurfaces helper — 'use server' files can only export async functions, so shared revalidation helpers stay non-exported"
    - "invocationCallOrder proof for write-then-transition ordering inside one action"
    - "flatpickr config-capturing mock + fake-timer debounce flush (advanceTimersByTimeAsync(700)) for debounced action-call tests"
    - "Async Server Component awaited directly in jsdom (element rendered inside QueryClientProvider) for dashboard page tests"
key-files:
  created:
    - src/app/(admin)/dashboard/posts/__tests__/PostRowActions.test.tsx
    - src/app/(admin)/dashboard/posts/__tests__/posts-page.test.tsx
    - src/app/(admin)/dashboard/posts/__tests__/SchedulePicker.test.tsx
  modified:
    - src/actions/posts.ts
    - src/actions/__tests__/posts.test.ts
    - src/app/(admin)/dashboard/posts/page.tsx
    - src/app/(admin)/dashboard/posts/components/PostRowActions.tsx
    - src/app/(admin)/dashboard/posts/PostForm.tsx
    - src/app/(admin)/dashboard/posts/components/SchedulePicker.tsx
decisions:
  - "A6 stands: 'Scheduled' is derived (status=draft AND publishedAt in the future) — no new enum value; the worker's draft+publishedAt<=now query already republishes"
  - "setSchedule writes the date BEFORE funnels to draft (worker never observes draft + stale past date); CR-02 preserves the just-written future publishedAt through the published→draft flip"
  - "unpublishPost keeps the publish-rotated previewToken valid so the now-draft post stays previewable; no notifyUsers in v1 (quiet operation)"
  - "revalidatePublicPostSurfaces is module-local and NOT reused by publishPost — publishPost's behavior is pinned by existing tests and stays byte-identical"
  - "Create-redirect lives in the save mutation's GLOBAL onSuccess: TanStack v5 fires per-call callbacks in addition, so publish/submit chains inherit the redirect for new posts for free"
metrics:
  duration: 16 min
  completed: "2026-08-28T11:17:30Z"
  tasks: 3
  files: 9
status: complete
---

# Quick Task 260828-gyt: Posts list author/view/unpublish + schedule semantics — Summary

Closed the four most basic content-lifecycle gaps in the posts dashboard: the list now shows who wrote each post (Author column from the joined user), opens any post from the row (View → public /blog/{slug} or draft /preview/{token} in a new tab), distinguishes Scheduled posts at a glance (blue badge on draft + future publishedAt), and takes published posts offline — setSchedule on a published post with a future date now writes the date first, funnels published→draft through transitionPost (R7), revalidates every public surface with publishPost parity, and rejects past dates with SCHEDULE_IN_PAST before any write; a new unpublishPost action (assertOwnsPost-first, same funnel + parity, zero notify) is exposed as both a row button and a PostForm button that flips the form back to draft; PostForm's submit reads "Save" on published posts and creating a new post now router.pushes to /dashboard/posts/{id}/edit so Schedule/Preview become reachable.

## What Was Built

**Task 1 — Action layer (TDD: RED cdd7b2b → GREEN 016a5dd):**

- **listPosts**: rows now spread `{ ...row.posts, authorName: row.user?.name ?? null }` — every post field remains (slug/previewToken/publishedAt were ALWAYS in the full-row select); only authorName is new. The dashboard overview's other listPosts caller needs no change (additive fields on a non-literal assignment are type-safe).
- **revalidatePublicPostSurfaces(postId)** (module-local, non-exported): the publishPost step-3 select shape (posts leftJoin categories) followed by the exact parity set — revalidatePath `/blog/{slug}`, `/`, `/blog`, `/category/{categorySlug}` (when present), `/sitemap.xml`, `/rss.xml` + 2-arg revalidateTag `post-{id}`, `author-{authorId}`, `category-{id}` (when present), `posts-list`, all `"max"`. Best-effort on a missing lookup row (log + return — the transition already succeeded). publishPost deliberately does NOT call it.
- **unpublishPost(postId)**: assertOwnsPost FIRST (Pitfall #1; authors pass for their own per D-14b, editor/admin bypass) → transitionPost(postId, "draft") (R7 funnel) → revalidatePublicPostSurfaces → `{ ok: true }`. No notifyUsers, no rotatePreviewToken (the publish-rotated token stays valid so the draft is previewable).
- **setSchedule(postId, publishedAt)**: requireCan post:publish still first (D-15); now fetches status (NOT_FOUND on missing id); published + past/non-future date → throws `SCHEDULE_IN_PAST — pick a future date for a published post, or unpublish it first` BEFORE any write; then the bare db.update writes ONLY publishedAt + updatedAt (no status key — R7); when the fetched status was "published" it additionally awaits transitionPost(postId, "draft") + revalidatePublicPostSurfaces and returns `{ ok: true, unpublished: true }`; draft path unchanged semantics, returns `{ ok: true, unpublished: false }`.
- **Untouched per plan**: publishPost, transitionPost, system-publish.ts worker, the posts schema.
- Tests: 10 new cases in posts.test.ts — invocationCallOrder proof that the date write precedes the transition, updateSetMock payload-key proof (no `status`), MUST_NOT_BE_REACHED guards on the past-date and missing-id paths, full parity assertions mirrored from the publishPost suite, notifyUsers-never-called, INVALID_TRANSITION propagation with zero revalidation, and the authorName spread projection (null vs joined name).

**Task 2 — Posts list UI (TDD: RED 1987cec → GREEN 1d9e212):**

- **page.tsx**: local row type grows authorName/publishedAt/previewToken; Author header cell between Title and Status; Author cell renders `authorName ?? "—"`; SCHEDULED_BADGE (blue-100/blue-700 + dark blue-900/30/blue-300 — visually distinct from gray/amber/success) shown when `status === "draft" && publishedAt != null && new Date(publishedAt).getTime() > Date.now()`, else the existing raw-status badge; View link before PostRowActions in the actions div (brand-500 styling like Edit, `target="_blank" rel="noopener noreferrer"`): `/blog/{slug}` when published, `/preview/{previewToken}` when a token exists, no link otherwise.
- **PostRowActions.tsx**: unpublishMutation cloning the Return shape (D-27 non-optimistic: toast "Unpublished" + invalidate ["posts"]); canUnpublish = editor/admin AND status "published", included in the null-gate and the pending union; muted-gray "Unpublish"/"Unpublishing…" button.
- Tests: 2 NEW suites — PostRowActions.test.tsx (show/click/author-null/draft-no-button/pending-disabled) and posts-page.test.tsx (async Server Component awaited in jsdom with mocked actions + next/navigation: Jane Author cell, "—" for null authors, /blog/live-one anchor with _blank, exactly one /preview/tok-2 anchor, Scheduled badge, Unpublish button under admin).

**Task 3 — PostForm + SchedulePicker (TDD: RED 3b01fbd → GREEN 55596ac):**

- **PostForm.tsx**: useRouter + create-redirect in the save mutation's global onSuccess (`props.initialId == null && data?.id != null` → push `/dashboard/posts/{id}/edit` — per-call mutate callbacks fire in addition in TanStack v5, so publish/submit chains inherit it); unpublishMutation (toast + setCurrentStatus("draft") + invalidate) with canUnpublish = editor/admin AND currentStatus "published" AND initialId present; anyPending grows; submit label `Saving… / Save (published) / Save draft`; muted-gray Unpublish/Unpublishing… button.
- **SchedulePicker.tsx**: captures the setSchedule result — `{ unpublished: true }` → `Post unpublished — scheduled for {date.toLocaleString()}`, else `Schedule saved`; errors still toast err.message raw (SCHEDULE_IN_PAST reads as a human sentence); helper text now states the take-offline-until-due semantics.
- Tests: 5 new PostForm cases (label pair, Unpublish gating trio, click→flip-to-draft with Publish reappearing, create-redirect push, edit-save no-push) + 3 SchedulePicker cases (config-capturing flatpickr mock + fake-timer debounce flush; unpublished toast, plain saved toast, raw error toast).

## Commits

| Task | Phase | Commit | Subject |
| ---- | ----- | ------ | ------- |
| 1 | RED | cdd7b2b | test(260828-gyt): actions RED — setSchedule semantics, unpublishPost, listPosts authorName |
| 1 | GREEN | 016a5dd | feat(260828-gyt): setSchedule unpublishes on future schedule, add unpublishPost, listPosts authorName (GREEN) |
| 2 | RED | 1987cec | test(260828-gyt): posts list RED — Author column, View action, Scheduled badge, row Unpublish |
| 2 | GREEN | 1d9e212 | feat(260828-gyt): posts list — Author column, View action, Scheduled badge, Unpublish row action (GREEN) |
| 3 | RED | 3b01fbd | test(260828-gyt): PostForm label/unpublish/redirect + SchedulePicker toast RED |
| 3 | GREEN | 55596ac | feat(260828-gyt): PostForm Save label + Unpublish + create-redirect, SchedulePicker semantics toast (GREEN) |

## Verification Results

- **T1 targeted** `pnpm exec vitest run src/actions/__tests__/posts.test.ts`: 60/60 passed (RED proven first: the 10 new cases failed, 50 existing green)
- **T2/T3 targeted** `pnpm exec vitest run "src/app/(admin)/dashboard/posts/__tests__"`: 22/22 passed at GREEN (RED proven per task: T2 — 7 failures across the two new suites; T3 — 5 behavior-changing failures)
- **Full suite** `pnpm test`: **794/794 passed** (73 files) — baseline 767 + 27 new, zero regressions
- **Type check** `pnpm exec tsc --noEmit`: **8 errors — identical to the documented pre-existing TailAdmin scaffold baseline** (table in .planning/quick/260827-se8-dashboard-functional-gaps-make-dashboard/deferred-items.md); no new errors
- **Build gate**: SKIPPED per plan decision (no new route segments, no config, no 'use cache' components touched)
- **No `pnpm dev` run** — the owner's dev server owns :3000; changes HMR into it

## Deviations from Plan

None of the Rule 1–4 kinds — no auto-fixes, no scope additions, no blockers. Two minor implementation notes:

1. **[test-fixture adjustment, within plan intent]** The existing D-15 describe in posts.test.ts gained `selectPostMock.mockResolvedValue([{ id: 7, status: "draft" }])` in its beforeEach — setSchedule is now status-aware and selects before writing, so the two D-15 tests (whose 2026-08-01 fixture date is in the past) need a draft-status fixture to keep passing unchanged. Their assertions are byte-identical; the plan's "the two existing D-15 tests keep passing" requirement holds.
2. **[test-typing detail]** renderForm's prop type uses `Partial<ComponentProps<typeof PostForm>>` instead of importing a PostFormProps type (PostForm.tsx does not export its props interface; exporting it just for the test was unnecessary surface).

## Threat Model Disposition (all mitigations test-pinned)

- T-Q-gyt-01 (unpublishPost privilege): assertOwnsPost-first MUST_NOT_BE_REACHED test; TRANSITIONS funnel behind it; UI gating documented UX-only.
- T-Q-gyt-02 (status tampering via setSchedule): updateSetMock payload-key assertion (no `status` key) + transitionPost funnel invocation proof; D-15 author-block tests still green.
- T-Q-gyt-03 (cache integrity): full parity set asserted for BOTH the unpublish path and the schedule-unpublish path.
- T-Q-gyt-05 (time input): SCHEDULE_IN_PAST rejects before any write (MUST_NOT_BE_REACHED on db.update + transitionPost).
- T-Q-gyt-04 (preview link disclosure): accepted as-is (pre-existing rotated-UUID preview route behind the post:read-gated dashboard).

## Known Stubs

None — every surface added in this task is wired to real actions and real data.

## Self-Check: PASSED

- Files: src/actions/posts.ts, src/actions/__tests__/posts.test.ts, posts page.tsx, PostRowActions.tsx, PostForm.tsx, SchedulePicker.tsx, and the three new test files all present on disk.
- Commits cdd7b2b, 016a5dd, 1987cec, 1d9e212, 3b01fbd, 55596ac all present on the worktree branch.
- Owner UAT (no executor action): posts list shows Author/View/Scheduled; Unpublish takes a post offline (public /blog/{slug} falls out after revalidation); scheduling a published post to +5 min unpublishes now and the worker republishes at due time; /dashboard/posts/new lands on the new post's edit page.
