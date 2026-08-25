---
phase: 05-seo-basics
plan: 06
subsystem: dashboard-posts
tags: [publish-workflow, review-workflow, sonner, toasts, uat-gap-closure, rbac-ux]
requires:
  - "05-05 editor surface (PostForm renders EditorProvider unchanged — no editor code touched here)"
provides:
  - "UI-operable content lifecycle: Publish (editor/admin) + Submit-for-review (author) from both the post editor and the posts list — publishPost/submitForReview now have call sites (UAT gap 1 publish half)"
  - "sonner toast channel scoped to the (admin) shell (richColors, top-right) — every save/publish/submit outcome in PostForm, PageForm, and PostRowActions gives unambiguous feedback (UAT gap 2)"
affects:
  - "src/app/(admin)/AdminShell.tsx (Toaster mounted next to QueryProvider — public (site) bundle stays clean, D-28-style isolation)"
  - "src/app/(admin)/dashboard/posts/* (role/status plumbing through server pages into PostForm + new PostRowActions)"
  - "src/app/(admin)/dashboard/pages/PageForm.tsx (feedback channel only — optimistic invalidation untouched)"
tech-stack:
  added:
    - "sonner@2.0.8 (exact pin, planner-audited supply chain per T-05-SC — registry-verified, emilkowalski, react 18/19 peers)"
  patterns:
    - "TanStack v5 per-call mutate callbacks (mutate(values, { onSuccess })) for save-then-act chaining — the follow-up mutation receives the saved id from the first mutation's result"
    - "Role/status-derived UX gating constants (canPublish / canSubmitForReview) mirroring the server TRANSITIONS policy — UX-only by design (T-05-12)"
key-files:
  created:
    - src/app/(admin)/dashboard/posts/components/PostRowActions.tsx
  modified:
    - package.json
    - pnpm-lock.yaml
    - src/app/(admin)/AdminShell.tsx
    - src/app/(admin)/dashboard/posts/PostForm.tsx
    - src/app/(admin)/dashboard/pages/PageForm.tsx
    - src/app/(admin)/dashboard/posts/new/page.tsx
    - src/app/(admin)/dashboard/posts/[id]/edit/page.tsx
    - src/app/(admin)/dashboard/posts/page.tsx
decisions:
  - "Save-then-act chain via TanStack per-call onSuccess (mutate(values, {onSuccess: data => publishMutation.mutate(data.id)})) — the SAME save mutation runs (same toasts + invalidation), then the saved id hands off; no intent-ref state needed"
  - "currentStatus local state seeded from initialStatus and updated on transition success — Publish/Submit buttons disappear after succeeding instead of dead-clicking into INVALID_TRANSITION on a repeat click"
  - "Both toasts fire on the publish path (\"Post saved\" then \"Published\") — on a failed transition after a successful save the user sees exactly the stated semantics: post remains saved as a draft"
  - "Save draft restyled neutral secondary; brand-500 reserved for the Publish / Submit-for-review primary (plan's button convention)"
metrics:
  duration: 14min
  completed: 2026-08-25
status: complete
---

# Phase 5 Plan 06: Publish + Toast Gap Closure (UAT Gaps 1 publish half, 2) Summary

**One-liner:** Wired the never-before-called publishPost/submitForReview Server Actions into role-aware Publish / Submit-for-review buttons (post editor + posts list) and made every save outcome visible via a dashboard-scoped sonner toast channel — the content lifecycle is now operable from the UI with unambiguous feedback.

## What Was Built

### Task 1 — sonner toast primitive mounted dashboard-wide (a220dfa)

`pnpm add --save-exact sonner@2.0.8` (exact pin, T-05-SC registry-audited). `<Toaster richColors position="top-right" />` mounted inside AdminShell next to QueryProvider — (admin)-scoped only, never the root layout, so toast JS stays out of the (site) public bundle (D-28-style PERF-02 isolation, comment cites the UAT test 3 gap closure). No wrapper library file — components import `{ toast }` from sonner directly.

### Task 2 — toast feedback on every save outcome (e8ad455)

- **PostForm**: savePost useMutation gained `onSuccess: toast.success("Post saved")` alongside the existing `["posts"]` invalidation and `onError: toast.error(err.message)` — D-26/D-27 mutation shape untouched (still NOT optimistic); the inline error box stays as the persistent channel.
- **PageForm**: the `optimisticMessage` banner state + its setTimeout clearing + the banner JSX are gone, replaced by success ("Page saved") / error (raw action message) toasts. The D-27 optimistic invalidation logic and the createPage/updatePage dispatch are byte-identical — only the feedback channel changed. Dead `useState` import removed.

### Task 3 — role-aware Publish + Submit-for-review wiring (d5afc7a)

- **Role/status plumbing**: `new/page.tsx` and `[id]/edit/page.tsx` read the session (`getSession` from `@/lib/auth/server`, same helper the (admin) layout uses) and pass `role` into PostForm; the edit page also passes `initialStatus={post.status}` so Publish hides on already-published posts.
- **PostForm buttons** (alongside a kept Save draft): brand-500 **Publish** for editor/admin on draft/pending_review/new posts (on pending_review it doubles as approve-and-publish — TRANSITIONS allows it) and **Submit for review** for authors on draft/new. Flow per the plan: RHF validation + savePost exactly like the save path, THEN `publishPost(id)`/`submitForReview(id)` on the returned `{ id }` — chained via TanStack v5 per-call `mutate(values, { onSuccess })`, so both pendings disable every button. Authors never see Publish anywhere (they lack `post:publish`; the server double-blocks via TRANSITIONS + requireCan regardless — T-05-12's UX-only-gating disposition).
- **PostRowActions.tsx** (new client component): Publish link-button (editor/admin, status draft|pending_review) or Submit-for-review (author, draft) in the posts list Actions cell next to Edit; NOT optimistic (D-27 — status flips are high-stakes), success/error toasts, `["posts"]` invalidation. `posts/page.tsx` reads the viewer role via getSession and renders it per row.
- Zero Server Action signature changes; no server-side permission surface added.

## Verification

- Plan grep gates: `publishPost` (3) + `submitForReview` (2) wired in PostForm; `PostRowActions` (2) rendered in the posts list — all non-comment counts.
- `rm -rf .next && pnpm build`: **exits 0** (full 52-page route table generated; second confirmation run also exit 0).
- `pnpm test --run`: **580/580 green (57 files)** — identical count to the 05-05 baseline; posts/permissions suites unaffected (no action signatures changed), as required.
- `pnpm exec tsc --noEmit`: 12 errors — the exact pre-existing baseline logged in `deferred-items.md` by 05-05; verified ZERO errors mention sonner/AdminShell/PostForm/PageForm.
- End-to-end sitemap/RSS confirmation (`/blog/{slug}` at 0.8/weekly, one `<item>` per published post) lands with the phase UAT re-run per the plan's verification section — the publish UI path that was blocking UAT test 2 now exists.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fresh worktree lacked node_modules and .env.local**
- **Found during:** execution start (before Task 1)
- **Issue:** The newly spawned worktree had no `node_modules` (no dependencies installed) and no `.env.local` (gitignored; lives only in the main checkout) — pnpm commands and the build's DB-touching prerenders cannot run without them. Same issue 05-05's executor hit.
- **Fix:** `pnpm install --frozen-lockfile` (9.1s, lockfile untouched); copied `D:/Devsroom-Work/anydiscussion/.env.local` in. Verified gitignored via `git check-ignore` — untracked, never committed.
- **Files modified:** none in git (untracked local file only)
- **Commit:** n/a (no repo change)

**2. [Rule 3 - Transient] First cold `pnpm build` crashed with Windows worker exit code 0xC0000409**
- **Found during:** Task 3 verify
- **Issue:** The first clean build died during "Generating static pages" with a native Windows worker crash (0xC0000409 / STATUS_STACK_BUFFER_OVERRUN class) — a known class of transient Turbopack-worker crash on Windows, not a code error.
- **Fix:** Retried the identical `rm -rf .next && pnpm build` — full success (complete route table), then a confirmation run exited 0. No code change was needed.
- **Commit:** n/a (no repo change)

### Informational (no action needed)

- The 12 pre-existing `tsc --noEmit` errors (4x TS18048 storage-settings.test.ts, 8x TS2322 TailAdmin-era files) remain — already logged to `.planning/phases/05-seo-basics/deferred-items.md` by 05-05; out of scope per the scope boundary. The tasks' "typecheck clean" done-criteria is satisfied as "no NEW errors from this plan's files" (grep-verified).

## Auth Gates

None.

## Issues

None open. UAT gaps 1 (publish half) and 2 are closed at the implementation level; live confirmation (editor publishes from /dashboard/posts/new, sees the toast, post appears in /sitemap.xml + /rss.xml) is the phase end-of-phase UAT re-run of tests 2 and 3.

## Known Stubs

None — every button invokes a real, permission-gated Server Action; every toast fires from a real mutation outcome.

## Threat Flags

None. No new security surface beyond the plan's threat model: T-05-12 mitigated (zero server changes; UX-only gating over the already-tested authority chain), T-05-13 accepted (sonner renders React-escaped text), T-05-SC mitigated (exact-pinned, registry-audited sonner 2.0.8).

## Self-Check: PASSED

All 9 created/modified product files verified present on disk; all 3 task commits (a220dfa, e8ad455, d5afc7a) verified in git log. Working tree clean apart from the gitignored .env.local (by design).
