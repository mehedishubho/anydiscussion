---
phase: quick
plan: 260708-n9b
subsystem: branding
tags: [branding, dashboard-chrome, public-site, logo, tailadmin-cleanup]
status: complete
requirements: [QUICK-sees-branding]
key-files:
  created: []
  modified:
    - src/layout/AppSidebar.tsx
    - src/layout/AppHeader.tsx
    - src/components/site/SiteHeader.tsx
  deleted:
    - src/layout/SidebarWidget.tsx
decisions:
  - QUICK-D01: single sees-logo.png serves both light/dark themes (no separate dark variant)
  - QUICK-D02: collapsed-sidebar logo-icon.svg branch kept byte-identical
  - QUICK-D03: SidebarWidget promo component + file removed entirely
metrics:
  duration: 5min
  tasks: 1
  files: 4
---

# Quick 260708-n9b: Swap Dashboard + Site Logos to SEES Brand Asset Summary

Swapped all chrome surfaces (dashboard sidebar, dashboard mobile header, public site header) to the SEES wordmark via a single next/image `<Image>` per surface, and deleted the leftover TailAdmin SidebarWidget promo component.

## What Changed

### AppSidebar.tsx (expanded branch)
- Replaced the light/dark `<Image>` pair (`logo.svg` + `logo-dark.svg`, 150×40) with a single `<Image src="/images/logo/sees-logo.png" alt="SEES" width={150} height={32} />` — one asset for both themes.
- Dropped `dark:hidden` / `hidden dark:block` classNames.
- Removed `import SidebarWidget from "./SidebarWidget"` and the `{isExpanded || isHovered || isMobileOpen ? <SidebarWidget /> : null}` render expression.
- Collapsed branch (`logo-icon.svg`, 32×32) left byte-identical (QUICK-D02).

### AppHeader.tsx (mobile header)
- Replaced the light/dark `<Image>` pair (154×32) with a single `<Image src="/images/logo/sees-logo.png" alt="SEES" width={154} height={32} />`.
- Dropped `dark:hidden` / `hidden dark:block` classNames.

### SiteHeader.tsx (public site)
- Flipped `logoUrl` from `null` to `"/images/logo/sees-logo.png"` (TODO comment preserved verbatim).
- Restructured the logo/title branch: when `logoUrl` is truthy, renders only the SEES wordmark `<Image>` (150×32, priority) in place of the title text; when falsy, renders `<span>{seo.siteTitle}</span>` as the fallback. Old 32×32 icon-sized `<Image>` with `h-8 w-8` removed.

### SidebarWidget.tsx — DELETED
- TailAdmin "Upgrade To Pro" promo box component, unreferenced after AppSidebar cleanup.

## Verification Results

- **pnpm lint** (on edited files): no new errors introduced. One pre-existing `react-hooks/set-state-in-effect` warning in AppSidebar's submenu auto-open `useEffect` (line 314) — confirmed present at HEAD before this task, out of scope.
- **pnpm exec tsc --noEmit**: no new type errors from this task. Two pre-existing errors in `src/actions/__tests__/storage-settings.test.ts` — confirmed at HEAD, unrelated to branding changes.
- **Grep gates**:
  - Zero `SidebarWidget` references under `src/` — PASS
  - Zero `logo-dark.svg` / `/images/logo/logo.svg` references in edited files — PASS
  - `logo-icon.svg` still present in AppSidebar collapsed branch (line 361) — PASS
- **[CITED: ...] header comments**: preserved intact in AppSidebar.tsx and AppHeader.tsx (AppHeader had none).

## Deviations from Plan

None — plan executed exactly as written. The only note: `public/images/logo/sees-logo.png` was already committed in a prior user WIP commit (`45e3c66`), so the "untracked asset" assumption in the plan was stale — no extra `git add` was needed for the asset; it was already in the HEAD tree.

## Self-Check: PASSED

- `src/layout/AppSidebar.tsx` — FOUND (modified, committed)
- `src/layout/AppHeader.tsx` — FOUND (modified, committed)
- `src/components/site/SiteHeader.tsx` — FOUND (modified, committed)
- `src/layout/SidebarWidget.tsx` — DELETED (confirmed via `git diff --diff-filter=D`)
- Commit `1ea60f6` — FOUND in git log
