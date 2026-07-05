---
phase: 04-dashboard-chrome
plan: 01
subsystem: ui
tags: [nextjs, tailadmin, tanstack-query, react-hook-form, rbac, app-router]

# Dependency graph
requires:
  - phase: 03-content-engine
    provides: Posts/Taxonomy/Media Server Actions + Tiptap editor + RHF+Zod post form
  - phase: 02-auth-rbac
    provides: Better Auth session.user.role + requireCan/requireRole helpers + middleware.ts auth gate
provides:
  - "/dashboard/* URL prefix for every admin surface (posts/profile/calendar relocated)"
  - "CMS-focused AppSidebar with UX-only role filter (admin/editor/author visible items differ)"
  - "Lean server-rendered /dashboard overview (posts-by-status counts, pending-review list, media count, New post CTA)"
  - "(admin)-scoped QueryProvider — TanStack QueryClient available dashboard-wide"
  - "PostForm retrofit onto useMutation (the dashboard-wide form/mutation baseline)"
  - "Auth-gate test markers synced to the new overview string"
affects: [04-02, 04-03, 04-04, 04-05, phase-05-seo, phase-06-public-frontend, phase-07-perf-deploy]

# Tech tracking
tech-stack:
  added: ["@tanstack/react-query-devtools@5.101.2 (devDependency — official TanStack devtools; @tanstack/react-query@5.101.2 is its peer)"]
  patterns:
    - "RHF + Zod + TanStack useMutation dashboard-wide form/mutation pattern (PostForm retrofit is the canonical example)"
    - "(admin)-scoped QueryClientProvider — lives INSIDE AdminShell, never in root app/layout.tsx, never in (site)"
    - "Server Component dashboard list page over Phase-3 actions (used by overview + every /dashboard/* list page Plan 04-02..04-04 will add)"
    - "UX-only role filter: server passes session.user.role through AdminShell → AppSidebar; hasRole() helper hides role-restricted items; server-side requireCan remains authoritative"

key-files:
  created:
    - "src/app/(admin)/QueryProvider.tsx — TanStack QueryClient scoped to (admin) (D-28)"
  modified:
    - "src/layout/AppSidebar.tsx — CMS nav + Components reference group + UX-only role filter (D-02/D-05)"
    - "src/app/(admin)/AdminShell.tsx — accepts role prop, wraps {children} with QueryProvider (D-05/D-28)"
    - "src/app/(admin)/layout.tsx — passes session.user.role through to AdminShell (D-05)"
    - "src/app/(admin)/dashboard/page.tsx — lean real-stats overview (D-04)"
    - "src/app/(admin)/dashboard/posts/PostForm.tsx — useMutation retrofit (D-26/D-27)"
    - "src/app/(admin)/dashboard/posts/page.tsx — internal hrefs reprefixed /dashboard/*"
    - "src/components/header/UserDropdown.tsx — /profile → /dashboard/profile (3 instances)"
    - "scripts/test-auth-gate.mjs — dashboardMarkers + HTTP check synced to 'Dashboard overview' (Pitfall 5)"
    - "package.json + pnpm-lock.yaml — added react-query-devtools devDependency"
  moved:
    - "src/app/(admin)/posts/* → src/app/(admin)/dashboard/posts/* (D-01)"
    - "src/app/(admin)/(others-pages)/profile/page.tsx → src/app/(admin)/dashboard/profile/page.tsx (D-01)"
    - "src/app/(admin)/(others-pages)/calendar/page.tsx → src/app/(admin)/dashboard/calendar/page.tsx (D-01)"
  deleted:
    - "src/app/(admin)/(others-pages)/blank/page.tsx"
    - "src/app/(admin)/(others-pages)/(chart)/{bar-chart,line-chart}/page.tsx"
    - "src/app/(admin)/(others-pages)/(forms)/form-elements/page.tsx"
    - "src/app/(admin)/(others-pages)/(tables)/basic-tables/page.tsx"
    - "src/components/charts/{bar/BarChartOne,line/LineChartOne}.tsx (used only by deleted demos)"
    - "src/components/form/form-elements/* (10 files — used only by deleted demo)"
    - "src/components/tables/BasicTableOne.tsx (used only by deleted demo)"

key-decisions:
  - "Kept (ui-elements)/ at its current path (route-group parens add no URL segment) rather than moving under /dashboard/* — minimal churn, URLs stay /alerts etc., D-01's /dashboard/* mandate names only real CMS surfaces"
  - "Role filter lives in AppSidebar as a pure hasRole(role, required) helper; the role is propagated from the server AuthGate via AdminShell as a prop — no client-side session fetch needed"
  - "listPosts()/listMedia() actions called directly for the lean overview (their built-in requireCan RBAC fires); posts partitioned by status client-side because listPosts's status filter is a documented Phase-3 stub (out of scope to fix here). Counts cap at POSTS_READ_CAP=500 / MEDIA_READ_CAP=2000 — generous for the small-team volume called out in PROJECT.md."
  - "PostForm submit uses mutation.mutate (not mutateAsync) so mutation.isPending drives button-disabled state — RHF's isSubmitting would otherwise flip false too quickly"
  - "Auth-gate marker string: 'Dashboard overview' (the <h1>) — chosen for uniqueness within the dashboard shell"

patterns-established:
  - "Pattern: QueryProvider scope (D-28) — provider wraps {children} inside AdminShell only; never in app/layout.tsx, never imported from (site). ESLint no-restricted-imports is the static guard; Phase 7 PERF-02 audits the dynamic boundary."
  - "Pattern: UX-only role filter (D-05) — server propagates role via props; hasRole() filters navItems; comment 'UX ONLY — every mutating Server Action still re-checks permissions server-side' is mandatory."
  - "Pattern: TanStack mutation wrapper for RHF submit (D-26/D-27) — useMutation({mutationFn: serverAction, onSuccess: invalidate queries}); mutation.isPending drives disabled; mutation.error?.message surfaces failures; NOT optimistic for high-stakes mutations (post save)."

requirements-completed: [DASH-01, DASH-06, DASH-07, DASH-08]

# Coverage metadata — per-deliverable verification matrix (#1602)
coverage:
  - id: D1
    description: "Admin sub-pages (posts, profile, calendar) reachable only under /dashboard/* (no root-level /posts, /profile, /calendar)"
    requirement: DASH-01
    verification:
      - kind: integration
        ref: "scripts/test-auth-gate.mjs (structural + HTTP checks — /dashboard route moves confirmed in build route table; /posts no longer registered)"
        status: pass
      - kind: other
        ref: "pnpm build route table — /dashboard/posts, /dashboard/profile, /dashboard/calendar all present; old /posts route absent"
        status: pass
    human_judgment: false

  - id: D2
    description: "Sidebar shows focused CMS nav (Posts/Categories/Tags/Media/Pages/Users/Settings/Profile/Calendar) + collapsed Components reference group; no Ecommerce/Forms/Tables/Charts demo entries"
    requirement: DASH-07
    verification:
      - kind: other
        ref: "src/layout/AppSidebar.tsx — grep 'Ecommerce' returns 0; grep 'basic-tables|form-elements|line-chart|bar-chart' returns 0; UX ONLY comment + hasRole() helper present"
        status: pass
    human_judgment: true
    rationale: "Sidebar visual layout + role-filtering behavior across admin/editor/author roles requires human verification in a running browser (sign in as each role, confirm Users/Settings visibility differs). Static grep proves the strings are gone but not that the UI renders correctly."

  - id: D3
    description: "Role filter wired and documented as UX-only (admin sees all; editor hides Users/Settings; author hides Users/Settings)"
    requirement: DASH-07
    verification:
      - kind: other
        ref: "src/layout/AppSidebar.tsx — requiredRole field on NavItem + hasRole() helper; src/app/(admin)/layout.tsx passes session.user.role through AdminShell"
        status: pass
    human_judgment: true
    rationale: "Three-role visual verification requires signing in as admin, editor, and author and confirming the visible nav differs. Static analysis proves the wiring but not the per-role rendering."

  - id: D4
    description: "Lean /dashboard overview renders server-side real stats (posts-by-status counts, pending-review preview, media count, New post CTA) — no placeholder, no charts"
    requirement: DASH-07
    verification:
      - kind: integration
        ref: "scripts/test-auth-gate.mjs — 'Dashboard overview' marker confirmed present in authenticated render, absent from the static prerender shell"
        status: pass
      - kind: other
        ref: "src/app/(admin)/dashboard/page.tsx — Server Component, no 'use client', calls listPosts + listMedia actions (RBAC fires); 'Dashboard content will be wired' string is gone (grep returns 0)"
        status: pass
    human_judgment: true
    rationale: "Visual layout of stat tiles + pending-review list + dark mode rendering requires a running browser session with seeded posts/media."

  - id: D5
    description: "(admin)-scoped QueryProvider — TanStack QueryClient wraps AdminShell children only; devtools in dev only"
    requirement: DASH-06
    verification:
      - kind: other
        ref: "src/app/(admin)/QueryProvider.tsx exists; useState-init QueryClient; QueryClientProvider + devtools-only-in-dev; src/app/(admin)/AdminShell.tsx wraps {children} with <QueryProvider>; app/layout.tsx NOT modified (root layout stays free of TanStack JS)"
        status: pass
    human_judgment: false

  - id: D6
    description: "PostForm retrofitted with TanStack useMutation — savePost wrapped, onSuccess invalidates ['posts'], isPending drives button, mutation.error?.message surfaces failures; NOT optimistic (D-27)"
    requirement: DASH-06
    verification:
      - kind: other
        ref: "src/app/(admin)/dashboard/posts/PostForm.tsx — useMutation present (grep >=1), 'NOT optimistic' comment present (D-27), useState(submitError) removed, mutation.isPending drives disabled"
        status: pass
      - kind: unit
        ref: "pnpm test (178 tests pass — no Phase 3 regression in posts action tests)"
        status: pass
    human_judgment: false

  - id: D7
    description: "Dark mode renders correctly on /dashboard, /dashboard/posts/*, /dashboard/profile, /dashboard/calendar (D-06 verify-don't-rebuild)"
    requirement: DASH-08
    verification: []
    human_judgment: true
    rationale: "Dark mode is a visual property — ThemeContext already provides it (D-06 no-op-by-design). Verifying coverage on the new routes requires a running browser with the dark toggle applied to each route."

  - id: D8
    description: "Chart/form/table demo routes + their now-unused component files deleted; (ui-elements) showcase preserved as collapsed Components reference group"
    requirement: DASH-07
    verification:
      - kind: other
        ref: "pnpm build route table — /blank, /bar-chart, /line-chart, /form-elements, /basic-tables all absent; /alerts, /avatars, /badge, /buttons, /images, /modals, /videos all present (ui-elements preserved)"
        status: pass
      - kind: other
        ref: "git show fd5bde3 — 18 file deletions (5 demo routes + 13 now-unused component files: components/charts/{bar,line}/*, components/form/form-elements/* (10 files), components/tables/BasicTableOne.tsx)"
        status: pass
    human_judgment: false

# Metrics
duration: 18min
completed: 2026-07-05
status: complete
---

# Phase 4 Plan 01: Dashboard Shell Foundation Summary

**CMS sidebar + `/dashboard/*` URL restructure + `(admin)`-scoped TanStack QueryClient + lean real-stats overview + PostForm `useMutation` retrofit — establishing the dashboard-wide form/mutation pattern every later Phase-4 plan reuses.**

## Performance

- **Duration:** 18 min
- **Started:** 2026-07-05T17:21:26Z
- **Completed:** 2026-07-05T17:40:24Z
- **Tasks:** 3
- **Files modified:** 39 (8 modified/created + 12 moved + 19 deleted)

## Accomplishments

- Every admin surface now lives under `/dashboard/*` — old `/posts`, `/profile`, `/calendar` URLs return 404. Internal hrefs (New Post button, per-row Edit link, UserDropdown, sidebar logo) reprefixed.
- TailAdmin's default sidebar (Ecommerce/Forms/Tables/Charts demo entries) replaced with a focused CMS nav (Posts, Categories, Tags, Media, Pages, Users, Settings, Profile, Calendar) plus a collapsed "Components" reference group preserving the `(ui-elements)` showcase.
- UX-only role filter wired: `(admin)/layout.tsx` AuthGate passes `session.user.role` through `AdminShell` into `AppSidebar`; `hasRole()` hides Users/Settings from editor/author. Documented as UX-only — server-side `requireCan` remains authoritative.
- Deleted 5 demo routes + 13 now-unused component files (`components/charts/*`, `components/form/form-elements/*`, `components/tables/BasicTableOne.tsx`) after grep-verified they were used only by deleted demos. `components/{form,tables}/` retained for Plan 04-02..04-04 reuse.
- Phase-3 placeholder string replaced with a server-rendered real-stats overview: 3 stat tiles (Draft / Pending review / Published counts), pending-review preview list (max 5), media count tile, "+ New post" CTA. No charts (D-04).
- New `(admin)/QueryProvider.tsx` (TanStack QueryClient via `useState` initializer, devtools in dev only) wired inside `AdminShell` — TanStack JS stays out of the root layout and `(site)` bundle (D-28 / PERF-02).
- `PostForm.tsx` retrofit onto `useMutation({ mutationFn: savePost, onSuccess: invalidate ['posts'] })` — the canonical dashboard-wide form/mutation pattern. D-27 explicit comment: NOT optimistic on post save.
- `scripts/test-auth-gate.mjs` markers synced to the new overview string ("Dashboard overview"). Both structural and HTTP checks pass.

## Task Commits

Each task was committed atomically:

1. **Task 1: Route restructure — move posts/profile/calendar under /dashboard/* (D-01)** — `b871831` (refactor)
2. **Task 2: Sidebar CMS nav (D-02/D-05) + demo cleanup (D-03)** — `fd5bde3` (feat)
3. **Task 3: Lean overview (D-04) + (admin)-scoped QueryClient (D-28) + PostForm useMutation retrofit (D-26) + auth-gate test markers (Pitfall 5)** — `669d882` (feat)

## Files Created/Modified

- `src/app/(admin)/QueryProvider.tsx` — new client component. `useState`-init QueryClient (30s staleTime, refetchOnWindowFocus=false) + dev-only ReactQueryDevtools.
- `src/app/(admin)/AdminShell.tsx` — accepts `role` prop, forwards to AppSidebar; wraps `{children}` with `<QueryProvider>` (D-28).
- `src/app/(admin)/layout.tsx` — AuthGate passes `session.user.role` through to AdminShell (D-05).
- `src/layout/AppSidebar.tsx` — full rewrite. CMS navItems (Posts/Categories/Tags/Media/Pages/Users admin-only/Settings admin-only/Profile/Calendar) + othersItems (collapsed Components ref linking the preserved ui-elements routes). `hasRole()` helper + `requiredRole` NavItem field. `isActive()` improved to prefix-match.
- `src/app/(admin)/dashboard/page.tsx` — full rewrite. Server Component calling `listPosts` + `listMedia` actions; renders stat tiles + pending-review preview + media count + New post CTA. Marker: `<h1>Dashboard overview</h1>`.
- `src/app/(admin)/dashboard/posts/PostForm.tsx` — useMutation retrofit. Removed `useState(submitError)`; `mutation.isPending` drives button; `mutation.error?.message` surfaces failures; `onSuccess` invalidates `["posts"]`. D-27 comment.
- `src/app/(admin)/dashboard/posts/page.tsx` — internal hrefs `/posts/new` → `/dashboard/posts/new`, `/posts/${id}/edit` → `/dashboard/posts/${id}/edit`.
- `src/components/header/UserDropdown.tsx` — 3 × `href="/profile"` → `href="/dashboard/profile"`.
- `scripts/test-auth-gate.mjs` — `dashboardMarkers[0]` and HTTP body check both reference "Dashboard overview" (was "Dashboard content will be wired").
- `package.json` + `pnpm-lock.yaml` — added `@tanstack/react-query-devtools@5.101.2` as devDependency (legitimacy verified: `react-query@5.101.2` is its peer; official TanStack package).

**Moved (path change, content largely unchanged):**

- `src/app/(admin)/posts/{page,PostForm,schema-client,new/page,[id]/edit/page,components/*}.tsx` → `src/app/(admin)/dashboard/posts/*`
- `src/app/(admin)/(others-pages)/profile/page.tsx` → `src/app/(admin)/dashboard/profile/page.tsx`
- `src/app/(admin)/(others-pages)/calendar/page.tsx` → `src/app/(admin)/dashboard/calendar/page.tsx`

**Deleted (D-03):**

- `src/app/(admin)/(others-pages)/{blank,(chart)/(bar|line)-chart,(forms)/form-elements,(tables)/basic-tables}/page.tsx`
- `src/components/charts/{bar/BarChartOne,line/LineChartOne}.tsx`
- `src/components/form/form-elements/{CheckboxComponents,DefaultInputs,DropZone,FileInputExample,InputGroup,InputStates,RadioButtons,SelectInputs,TextAreaInput,ToggleSwitch}.tsx`
- `src/components/tables/BasicTableOne.tsx`

## Decisions Made

- **`(ui-elements)` kept at current path** rather than moved under `/dashboard/*`. The route-group parens add no URL segment, so moving wouldn't add a `/dashboard/` prefix anyway (would need a folder rename, more churn). D-01's `/dashboard/*` mandate names only the real CMS surfaces (posts/calendar/profile), not the showcase. Documented in AppSidebar file header.
- **Role filter implementation: server-side propagation via props, not client-side session fetch.** The AuthGate already calls `getSession()`, so passing `session.user.role` through AdminShell as a prop is zero-cost and avoids adding a client-side Better Auth fetch. `hasRole()` is a pure helper in AppSidebar.
- **Lean overview uses action calls + client-side partition** rather than direct DB count queries. Respects the established "pages call actions" pattern; the action's `requireCan` RBAC fires. `listPosts` doesn't filter by status server-side (Phase-3 stub), so partition client-side. Caps at 500 posts / 2000 media — generous for the small-team volume per PROJECT.md.
- **PostForm uses `mutation.mutate` (not `mutateAsync`).** RHF's `handleSubmit` doesn't need to await; `mutation.isPending` drives the button-disabled state instead. Cleaner than threading `mutateAsync` through RHF's submit lifecycle.
- **Auth-gate marker = "Dashboard overview"** (the `<h1>` text). Chosen for uniqueness within the dashboard shell.

## Deviations from Plan

None — plan executed exactly as written. The four sub-edits in Task 3 (3a overview, 3b QueryProvider, 3c PostForm retrofit, 3d test markers) all landed in one commit as the plan mandated (Pitfall 5 — auth-gate test must never go red on main).

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required. The new devDependency (`@tanstack/react-query-devtools`) is installed via `pnpm install` automatically; no env vars added in this plan (`SETTINGS_ENCRYPTION_KEY` lands in Plan 04-05, Cloudinary in Plan 04-05).

## Next Phase Readiness

**Ready for the rest of Phase 4:**

- **Plan 04-02 (taxonomy + media + picker)** can build `/dashboard/categories`, `/dashboard/tags`, `/dashboard/media` against the established list-page-over-action pattern + reuse the (admin)-scoped QueryClient + the RHF+Zod+useMutation form pattern.
- **Plan 04-03 (users + profile)** can build `/dashboard/users` (admin-only — sidebar already filters it) + wire the moved `/dashboard/profile` to real user data using the role-prop wiring established here.
- **Plan 04-04 (pages)** can build `/dashboard/pages` against the same patterns.
- **Plan 04-05 (storage settings)** ships the `/dashboard/settings/storage` route the sidebar already links (admin-only).

**Manual verification still owed (UAT, not blockers):**

- Dark mode toggle works on `/dashboard`, `/dashboard/posts/*`, `/dashboard/profile`, `/dashboard/calendar` (D-06 / DASH-08) — `ThemeContext` already provides it; this plan only needs visual confirmation.
- Sidebar role filter visibly differs when signed in as admin vs editor vs author (D-05).
- `/dashboard` overview renders the seeded data shape correctly (needs a running DB + seeded posts).

**No blockers.** Plan 04-01 unblocks every later Phase-4 plan as designed.

## Self-Check: PASSED

All claimed files exist; all task commits (`b871831`, `fd5bde3`, `669d882`) found in git log; all deletions verified (no longer on disk).

**Files verified FOUND:** `src/app/(admin)/QueryProvider.tsx`, `src/app/(admin)/AdminShell.tsx`, `src/app/(admin)/layout.tsx`, `src/layout/AppSidebar.tsx`, `src/app/(admin)/dashboard/page.tsx`, `src/app/(admin)/dashboard/posts/PostForm.tsx`, `src/app/(admin)/dashboard/posts/page.tsx`, `src/app/(admin)/dashboard/posts/new/page.tsx`, `src/app/(admin)/dashboard/posts/[id]/edit/page.tsx`, `src/app/(admin)/dashboard/profile/page.tsx`, `src/app/(admin)/dashboard/calendar/page.tsx`, `src/components/header/UserDropdown.tsx`, `scripts/test-auth-gate.mjs`, `.planning/phases/04-dashboard-chrome/04-01-SUMMARY.md`.

**Deletions verified GONE:** `src/app/(admin)/posts/`, `src/app/(admin)/(others-pages)/`, `src/components/charts/bar/BarChartOne.tsx`, `src/components/tables/BasicTableOne.tsx`.

---
*Phase: 04-dashboard-chrome*
*Plan: 01*
*Completed: 2026-07-05*
