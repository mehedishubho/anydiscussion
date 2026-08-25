---
phase: 05-seo-basics
plan: 08
subsystem: dashboard-posts
tags: [rsc-boundary, gap-closure, scheduling, setSchedule, sonner, uat-gap-closure, regression-pin]
requires:
  - "05-06 dashboard toast channel (Toaster in AdminShell) + role plumbing on the edit page — both reused as-is"
  - "Phase 3 setSchedule action (actions/posts.ts:391 — permission-gated by requireCan({post:['publish']}), unit-tested, D-15)"
provides:
  - "Renderable /dashboard/posts/[id]/edit page — the RSC serialization throw (inline function prop crossing the server-to-client boundary) is deleted at the root, not worked around (05-UAT R1 blocker root cause)"
  - "Persisted Schedule picker: flatpickr onChange -> ~700ms debounce -> setSchedule(postId, date) with success/error sonner toasts — setSchedule's first UI call site"
  - "Structural regression pin (edit-page-rsc-boundary.test.ts) — fails the suite if any on*-prefixed event-handler prop reappears on the edit page's client-component boundary or in SchedulePickerProps"
affects:
  - "src/app/(admin)/dashboard/posts/[id]/edit/page.tsx (stub prop deleted; Publish card hidden from authors — UX-only)"
  - "src/app/(admin)/dashboard/posts/components/SchedulePicker.tsx (function prop removed; direct debounced setSchedule call)"
  - "src/actions/posts.ts — NOT modified (zero action signature/permission changes; the action gains a call site only)"
tech-stack:
  added: []
  patterns:
    - "Client components owned by Server Component render sites must not demand function props — the client side calls the Server Action directly (flatpickr onChange option) instead of receiving a handler"
    - "Debounce-collapsed action calls for slider-like inputs (flatpickr enableTime fires once per date pick AND once per time tick — one settled value, one call, one toast)"
    - "Comment-stripped source-scan structural tests (r2-destination.test.ts convention) pin RSC boundary invariants that tsc and next build cannot see"
key-files:
  created:
    - src/app/(admin)/dashboard/posts/__tests__/edit-page-rsc-boundary.test.ts
  modified:
    - src/app/(admin)/dashboard/posts/[id]/edit/page.tsx
    - src/app/(admin)/dashboard/posts/components/SchedulePicker.tsx
decisions:
  - "setSchedule is called DIRECTLY from SchedulePicker's flatpickr onChange option (not via a page-provided handler) — functions cannot cross the RSC server-to-client boundary, so the interface declares no function member at all; the structural test enforces the class stays dead"
  - "~700ms useRef debounce before the action call — mandatory because enableTime:true fires onChange per calendar pick AND per time-slider increment; teardown clears the pending timer alongside fpRef.destroy()"
  - "Clear-to-empty is a guard-only no-op (cancel pending, return WITHOUT calling the action) — setSchedule requires a non-null Date and flatpickr's default readonly input makes a UI clear unreachable; the persisted value stays (minimal option from the UAT missing[] list)"
  - "Publish sidebar card hidden from authors (role already in scope from 05-06) — UX-only hide mirroring 05-06's Publish button; Phase 3 D-15's requireCan gate in setSchedule stays the authority (Preview card stays role-visible per D-19)"
metrics:
  duration: 11min
  completed: 2026-08-25
status: complete
---

# Phase 5 Plan 08: Edit-Page RSC Fix + Schedule Persistence (UAT Gap Closure, R1) Summary

**One-liner:** Deleted the function-prop stub that threw at RSC serialization time on every edit-page visit and gave the never-called setSchedule action its first live call site — a debounced, toast-feedback Schedule picker persisted client-side, plus a structural regression test that pins the entire bug class.

## What Was Built

### Task 1 — RSC boundary fix + direct setSchedule wiring (937d6cc)

Both files landed atomically (removing the interface member breaks the page until the stub is gone, and vice versa):

- **Edit page (Server Component)**: the entire inline no-op `onChange` stub prop block — handler plus its three explanatory comment lines — is deleted; `SchedulePicker` now receives ONLY serializable props (`postId`, `publishedAt`, `initialTimezone`). The sidebar **Publish card is hidden from authors** (`role !== "author" &&`), because Phase 3 D-15 makes `setSchedule` editor/admin-only — without the hide, authors would get a control whose every use ends in a FORBIDDEN toast. Hide is UX-only (05-06 pattern); the action's `requireCan({post:["publish"]})` gate is untouched and remains the authority. The **Preview card stays visible to every role** (preview tokens are author-accessible per D-19). File history comment documents the 05-08 root-cause fix.
- **SchedulePicker ('use client')**: the `onChange` member is removed from `SchedulePickerProps` and the destructured params — the interface no longer demands any function prop (its only render site is a Server Component). The flatpickr config's own `onChange` OPTION now persists directly: a non-empty `dates` array resets a **~700ms debounce timer held in a useRef** which then calls `setSchedule(postId, dates[0])` — mandatory because `enableTime:true` fires the option once per calendar-date pick AND once per time-slider increment (one settled value → one action call → one toast). An **empty dates array cancels any pending debounced call and returns without invoking the action** (setSchedule requires a non-null Date; flatpickr's default readonly input makes a UI clear unreachable — defensive guard only). Teardown clears the pending timer alongside the existing `fpRef.destroy()`. Toasts per the 05-06 convention: `toast.success("Schedule saved")`; error carries the raw action message (`err.message`) so FORBIDDEN/network failures are diagnosable. Header comment rewritten — no more "wired from the page" fiction; D-13/D-14/D-15 citations kept.
- PostForm, PreviewLink, and the new-posts page untouched (UAT diagnosis confirmed no other function props cross the boundary; SchedulePicker's only render site is this edit page).

### Task 2 — structural regression pin (b13db8e)

`src/app/(admin)/dashboard/posts/__tests__/edit-page-rsc-boundary.test.ts` — plain node environment, pure source scan via `readFileSync(path.resolve(process.cwd(), ...))`; importing the page would drag 'use server' machinery and DB-touching actions into the test:

- **Test 1** — extracts the edit page's `<SchedulePicker ... />` JSX span, asserts it EXISTS (sanity: the picker is still rendered for non-author viewers) and contains NO on*-prefixed PascalCase prop assignment (`/\bon[A-Z]\w*\s*=/`).
- **Test 2** — extracts the `interface SchedulePickerProps` block (scoped strictly to the interface span; flatpickr's legitimate `onChange` option elsewhere in the file is not punished) and asserts it declares no event-handler member (`/\bon[A-Z]\w*\s*\??:/`).
- Comments are stripped before asserting (r2-destination.test.ts convention) so documentation mentioning handler names cannot false-positive. Test comments cite the 05-UAT R1 blocker so a future failure reads as a boundary violation, not a lint annoyance.

## Verification

- Plan grep gates: no `onChange=` in the edit page's non-comment lines (PASS); `setSchedule` appears 2× (import + call) in SchedulePicker's non-comment lines (PASS).
- `pnpm exec vitest run` on the new suite: **2/2 pass**; full `pnpm test`: **601/601 green across 60 files** (599 pre-existing + 2 new — no action signatures changed, posts/permissions suites unaffected, as required).
- `rm -rf .next && pnpm build`: **exits 0** — `/dashboard/posts/[id]/edit` listed in the route table as Partial Prerender (◐). A base-vs-change attribution dance was run (see Deviations) confirming a first-attempt worker crash was a transient Windows flake, not the change; the change build passed clean from cold `.next`.
- `pnpm exec tsc --noEmit`: output is **byte-identical to the main-repo baseline** — exactly the 4 pre-existing TS18048 errors in `src/actions/__tests__/storage-settings.test.ts` (logged in `deferred-items.md` since 05-05; root cause refined there by this plan). ZERO new errors from this plan's files.
- Definitive live verification (editor opens edit page, picker saves + survives reload, post in /sitemap.xml + /rss.xml) is the staged 05-UAT R1 re-test, run by the UAT flow after this plan — by design, not in-plan.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fresh worktree lacked `.env.local`; first build failed on DB-less prerenders**
- **Found during:** Task 1 verify (build gate)
- **Issue:** The gitignored `.env.local` (DATABASE_URL, BETTER_AUTH_SECRET, …) exists only in the main checkout; the fresh worktree's `pnpm build` crashed during static generation ("SASL: client password must be a string"). Same issue 05-05/05-06 executors hit.
- **Fix:** Copied `D:/Devsroom-Work/anydiscussion/.env.local` into the worktree; verified gitignored via `git check-ignore` — untracked, never committed.
- **Files modified:** none in git (untracked local file only)
- **Commit:** n/a (no repo change)

**2. [Rule 1/3 - Verification attribution] Transient first-build worker crash + missing `next-env.d.ts` triage**
- **Found during:** Task 1 verify
- **Issue:** (a) First `pnpm build` with the changes died at "Generating static pages (0/52)" with Windows worker exit 0xC0000409 — the same transient Turbopack-worker crash class 05-06's executor logged. (b) The worktree's standalone `tsc --noEmit` showed 8 extra `className/IntrinsicAttributes` errors beyond the 4-error main-repo baseline.
- **Fix:** Ran a controlled attribution: reverted both task files to base (copies kept in /tmp), rebuilt base → **exit 0**; rebuilt with changes from cold `.next` → **exit 0** (crash was a flake, not the change). The 8 extra tsc errors were root-caused to the gitignored `next-env.d.ts` being absent in the fresh worktree until the first `next build` generates it — after the build, `tsc --noEmit` output diffed **identical** to the main repo's. Deferred-items.md updated with the root-cause split (8 = worktree artifact; 4 = real pre-existing test looseness).
- **Files modified:** .planning/phases/05-seo-basics/deferred-items.md (documentation only)
- **Commit:** included in this plan's docs commit

### Informational (no action needed)

- The 4 pre-existing TS18048 errors in `storage-settings.test.ts` remain — out of scope per the scope boundary; refine logged in `deferred-items.md` for a future `/gsd-quick`.

## Auth Gates

None.

## Issues

None open. The R1 re-test gap ("The post edit page renders, and the Schedule picker persists picked dates") is closed at the implementation level; the live end-to-end confirmation (editor → edit page loads → pick date → toast → reload survives → sitemap/RSS entries) is the staged UAT re-run that follows this plan.

## Known Stubs

None — the picker invokes the real, permission-gated `setSchedule` Server Action; every toast fires from a real action outcome.

## Threat Flags

None. No security surface beyond the plan's threat model: T-05-14 mitigated (zero server changes — the existing requireCan gate is the authority and stays unchanged; author-side picker additionally hidden UX-only), T-05-15 accepted (postId tampering stays within editor/admin global post:publish by design; authors fail requireCan before any write), T-05-16 accepted (sonner renders React-escaped action-originated strings), T-05-SC accepted (zero package installs).

## Self-Check: PASSED

All 5 created/modified tracked files verified present on disk; all 3 plan commits (937d6cc fix, b13db8e test, 1ce390f docs) verified in git log on worktree-agent-a7dabe586ff706dea. Working tree clean apart from gitignored worktree-local artifacts (.env.local, next-env.d.ts, .next — by design, never committed).
