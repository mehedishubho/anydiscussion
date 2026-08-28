---
quick_id: 260828-g2h
phase: quick
plan: 01
subsystem: dashboard-shell
tags: [tanstack-query, ssr, admin-shell, d-28, bundle-isolation, regression-fix]
requires:
  - "260827-se8 header islands (GlobalSearch, NotificationDropdown) mounted in AppHeader"
provides:
  - "AdminShell supplies the QueryClient to its own header — no outer provider needed on any dashboard route"
  - "Regression pin: src/app/(admin)/__tests__/AdminShell.test.tsx (full-shell jsdom render, no outer QueryClientProvider)"
affects:
  - "src/app/(admin)/AdminShell.tsx (provider placement + D-28 comments)"
  - "src/app/(admin)/QueryProvider.tsx (comment-only)"
tech-stack:
  added: []
  patterns:
    - "Full-shell jsdom render test with vi.hoisted action spies keeping 'use server'/drizzle modules out of the browser env"
key-files:
  created:
    - src/app/(admin)/__tests__/AdminShell.test.tsx
  modified:
    - src/app/(admin)/AdminShell.tsx
    - src/app/(admin)/QueryProvider.tsx
decisions:
  - "Provider hoist moves WHERE QueryProvider renders (around AppHeader + p-4 page content, still inside the flex-1 main-content div) — never WHO imports it, so D-28 static/dynamic boundaries hold unchanged"
  - "Test-only stubs required for the full-shell jsdom render: usePathname (null outside Next → AppSidebar prefix-match TypeError) and @/icons/index (vitest inlines .svg as data-URI strings jsdom rejects as element types)"
metrics:
  duration: 9 min
  completed: "2026-08-28T05:51:10Z"
  tasks: 1
  files: 3
status: complete
---

# Quick Task 260828-g2h: Fix QueryClient SSR error in dashboard header — Summary

Hoisted AdminShell's QueryProvider over AppHeader + the p-4 page-content div, fixing the "No QueryClient set" SSR recoverable-error banner that 260827-se8's live TanStack header islands (GlobalSearch, NotificationDropdown) triggered on every dashboard page — with the regression pinned by a full-shell jsdom test and D-28 (admin)-only bundle isolation verified intact (sole-importer grep gate).

## What Was Built

**Task 1 (TDD, RED→GREEN):**

- **RED — `src/app/(admin)/__tests__/AdminShell.test.tsx`** (new): renders the FULL AdminShell tree in jsdom with deliberately NO outer QueryClientProvider (only ThemeProvider + SidebarProvider, exactly what the real tree provides outside the shell). Three tests:
  1. Both header islands render — search input (`placeholder "Search or type command..."`) and bell button (`name /^Notifications/i`) — plus the children text, with no provider anywhere in the wrapper.
  2. Probe child calling `useQueryClient()` inside {children} renders its `data-testid="query-client-probe"` marker — pins the hoist against overcorrection (children must stay inside the provider).
  3. The bell's mount-time unread query fires (`countUnreadNotifications` mock called) — proves the island's query rides the shell's own provider.
  Mocks: `@/actions/search` + `@/actions/notifications` via `vi.hoisted` spies (countUnreadNotifications → 0, globalSearch → empty groups, listNotifications → [], markNotificationsRead → ok) so no "use server"/drizzle/better-auth module loads in jsdom; avatar null → UserDropdown initials fallback (no next/image).
- **GREEN — `src/app/(admin)/AdminShell.tsx`**: QueryProvider, still inside the flex-1 main-content div, now wraps BOTH AppHeader and the p-4 page-content div; {children} sit directly in the p-4 div. ONE provider instance. AppSidebar, Backdrop, mainContentMargin logic, every className, and the Toaster (outside the provider) byte-identical.
- **Comment refresh (same GREEN commit):** AdminShell D-28 header block now describes the header+content wrap and the SSR throw it fixes (260828-g2h), noting the D-28 guarantee itself is unchanged; inline comment at the provider site updated; `QueryProvider.tsx` wrapping-description sentence extended (AdminShell mounts it around AppHeader + page content since 260828-g2h) with zero code change there.

## Verification Results

| Gate | Result |
|------|--------|
| Targeted vitest (`src/app/(admin)/__tests__/AdminShell.test.tsx`) | 3/3 passed (RED first: test 1 failed with `Error: No QueryClient set, use QueryClientProvider to set one` from GlobalSearch.tsx:102 pre-fix) |
| Full suite (`pnpm test`) | 70 files, **767/767 passed** (764 baseline + 3 new, zero regressions) |
| D-28 grep gate | `grep -rln "import QueryProvider" src` → exactly **1** file: `src/app/(admin)/AdminShell.tsx` |
| tsc (`pnpm exec tsc --noEmit`) | **8** errors = the documented pre-existing TailAdmin scaffold baseline (all `TS2322` SVG-icon `className` in auth forms / date-picker / AppSidebar — files untouched by this task); gate ≤ 8 met, no new errors |
| Untouched per plan | (site) files, src/app/layout.tsx, eslint.config.mjs, AppHeader, both header islands, vitest.config.ts — verified untouched in the commits |

## Commits

| Phase | Hash | Message |
|-------|------|---------|
| RED | `5b097e0` | test(260828-g2h): AdminShell regression RED — header islands throw without provider |
| GREEN | `077a67a` | fix(260828-g2h): hoist QueryProvider over AppHeader + page content (GREEN) |

## TDD Gate Compliance

- RED gate: `test(260828-g2h)` commit (5b097e0) exists and was proven failing — targeted run showed all 3 tests failing with the pinned `No QueryClient set` error from GlobalSearch's useQuery.
- GREEN gate: `fix(260828-g2h)` commit (077a67a) exists after it; targeted run 3/3 green.
- No refactor phase needed (comment + placement change only).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking issue] Two jsdom render blockers the plan's "verified facts" did not cover**

- **Found during:** Task 1 RED
- **Issue:** The plan asserted the whole AdminShell subtree renders in jsdom with only SidebarProvider + ThemeProvider. In practice two unrelated failures aborted the render BEFORE the header islands, masking the "No QueryClient set" pin:
  - (a) `next/navigation`'s `usePathname()` returns `null` outside Next (PathnameContext default is `null` in installed 16.3.3 — verified in `node_modules/next/dist/shared/lib/hooks-client-context.shared-runtime.js`), and AppSidebar's active-item prefix match calls `pathname.startsWith(path + "/")` → TypeError on null.
  - (b) AppSidebar imports ten icons from `src/icons/index.tsx`, which imports `.svg` assets. Under webpack/SVGR these are components; under vitest (no SVGR plugin, and vitest.config.ts is off-limits per the plan) Vite inlines them as `data:image/svg+xml` strings; React uses the string as an element type and jsdom throws `InvalidCharacterError: "data:image/svg+xml,..." did not match the Name production`.
- **Fix:** Test-only mocks (no production change): `vi.mock("next/navigation", () => ({ usePathname: () => "/dashboard" }))` and `vi.mock("@/icons/index", ...)` stubbing the ten icons AppSidebar imports as `() => null`. Both documented in the test header.
- **Files modified:** src/app/(admin)/__tests__/AdminShell.test.tsx (only)
- **Commit:** 5b097e0 (part of RED)

**2. [Expectation nuance — no code impact] Plan said probe test "passes today"**

- **Found during:** Task 1 RED
- **Issue:** Plan expected test (2) (useQueryClient probe in {children}) to pass pre-fix. In fact all three tests failed pre-fix: the header island's throw aborts the entire shell render before {children} mount, so the probe never renders.
- **Resolution:** Not a defect — the plan's required RED gate ("test (1) MUST fail with the thrown 'No QueryClient set' error") held exactly as specified, and all three pass post-fix. Recorded here for accuracy.

## Threat Model Disposition

- **T-Q-g2h-01 (medium, mitigate)** — MITIGATED and verified: the hoist moved only where the provider renders; the automated grep gate proves `AdminShell.tsx` remains the sole `import QueryProvider` site in src/, root layout and (site) untouched (nothing outside `src/app/(admin)/` in either commit).
- **T-Q-g2h-02 (low, accept)** — unchanged: single provider instance, same main-content div, useState lazy init untouched.

## Auth Gates

None.

## Known Stubs

None — no placeholder data or unwired components introduced (the ten icon stubs and action mocks exist only inside the test file).

## Self-Check: PASSED

- Files exist: src/app/(admin)/__tests__/AdminShell.test.tsx, src/app/(admin)/AdminShell.tsx, src/app/(admin)/QueryProvider.tsx — all present (committed in 5b097e0 / 077a67a)
- Commits exist on branch worktree-agent-a5d027c0e1423ea23: 5b097e0 (test RED), 077a67a (fix GREEN)
- All five automated gates pass (targeted 3/3, full 767/767, D-28 sole importer, D-28 count 1, tsc 8 ≤ 8)
