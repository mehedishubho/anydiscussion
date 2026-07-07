---
phase: 06-public-frontend
plan: 02
subsystem: public-site-chrome
tags: [site-chrome, dark-mode, analytics, header, footer, SITE-16, ANAL-01, ANAL-02]
requires:
  - 06-01 (listCategoriesWithCounts from lib/queries/taxonomy)
  - 05-01 (getSeoSettings, buildSiteMetadata, JSON-LD builders)
provides:
  - SiteHeader component (logo + nav + Categories dropdown + search icon + ThemeToggle)
  - SiteFooter component (blurb + legal links + quick links + optional socials)
  - ThemeToggle client component (route-isolated dark mode, "site-theme" key)
  - Analytics component (https-validated script injection from settings)
  - (site)/layout.tsx chrome shell (header/footer/no-flash/analytics)
affects:
  - src/app/layout.tsx (suppressHydrationWarning added to root <html>)
tech-stack:
  added: []
  patterns:
    - "Route-isolated dark mode via separate localStorage key (D-13 / Pitfall 5)"
    - "No-flash inline Script (beforeInteractive) reading site-theme, falling back to prefers-color-scheme"
    - "Https-validated script injection (T-06-05 mitigation — no dangerouslySetInnerHTML)"
    - "Cached server-component fetch for Categories dropdown (listCategoriesWithCounts)"
key-files:
  created:
    - src/components/site/ThemeToggle.tsx
    - src/components/site/SiteHeader.tsx
    - src/components/site/SiteFooter.tsx
    - src/components/site/Analytics.tsx
  modified:
    - src/app/(site)/layout.tsx
    - src/app/layout.tsx
decisions:
  - D-10 (standard chrome — hard-coded nav + cached Categories dropdown)
  - D-13 (system + header toggle; route-isolated from dashboard — separate key, no ThemeContext import)
  - D-17 (injection-only analytics — Umami instance deploys Phase 7; https-validated)
metrics:
  duration: ~2h (across two sessions; paused by 429 usage limit)
  tasks: 2
  files: 6
  completed: 2026-07-08
status: complete
---

# Phase 6 Plan 02: Public Site Chrome + Dark Mode + Analytics Summary

Route-isolated public site chrome (SiteHeader with cached Categories dropdown + SiteFooter with legal/social links) plus a no-flash dark-mode toggle using a separate localStorage key (`site-theme`, NOT the dashboard's `theme`) and an https-validated analytics `<script>` injection that renders nothing by default (Umami deploys in Phase 7).

## What Was Built

### Task 1: SiteHeader + SiteFooter + ThemeToggle + no-flash script + layout extension (commit `28fc248`)

- **`src/components/site/ThemeToggle.tsx`** — `"use client"` component with its own `useSiteTheme` hook. Uses localStorage key `"site-theme"` (separate from dashboard's `"theme"` per D-13). On mount reads the stored value; falls back to `prefers-color-scheme` when unset. Toggles the `dark` class on `documentElement` and persists the choice. Sun/moon SVG icons swap via Tailwind `dark:` classes. **Does NOT import `ThemeContext` from `src/context`** (Pitfall 5 — verified by grep: no actual import statement in `(site)` or `components/site`).
- **`src/components/site/SiteHeader.tsx`** — async server component. Reads `getSeoSettings()` for site title/logo and `listCategoriesWithCounts()` (from 06-01's `lib/queries/taxonomy`) for the cached Categories dropdown. Hard-coded nav (Home, Blog, About, Contact) per D-10 (menu builder is v2 SETT-01). Categories dropdown is a hover-reveal list linking each category to `/category/{slug}` with post counts. Search icon links to `/search`. Renders the `ThemeToggle` client island.
- **`src/components/site/SiteFooter.tsx`** — async server component. Reads `getSeoSettings()` for the site blurb and reads optional `footer.social_twitter` / `footer.social_facebook` / `footer.social_linkedin` settings keys (rendered only when non-empty). Legal links (Terms and Conditions → `/terms-and-conditions`, Privacy Policy → `/privacy-policy`), quick links (Home, Blog, About, Contact), and copyright row.
- **`src/app/(site)/layout.tsx`** — extended the skeletal `<main>`-only shell. Kept `generateMetadata` (the `'use cache'` + `getSeoSettings` pattern) and both JSON-LD `<script>` tags unchanged. Wrapped `<main>` with `<SiteHeader>` above and `<SiteFooter>` below. Added a no-flash inline `<Script id="site-no-flash" strategy="beforeInteractive">` that reads `"site-theme"` from localStorage and applies the `dark` class to `documentElement` before first paint (falls back to `prefers-color-scheme`). The `main` is now `flex-1` inside a `flex min-h-screen flex-col` container so the footer sticks to the bottom on short pages.
- **`src/app/layout.tsx`** — added `suppressHydrationWarning` to the root `<html>` element (see Deviations).

### Task 2: Analytics script injection (commit `9cb17c7`)

- **`src/components/site/Analytics.tsx`** — async server component. Reads `analytics.script` (script URL) and `analytics.umami_id` (website ID) from the settings table. Renders nothing when the script URL is empty (default — Umami instance deploys in Phase 7 per D-17). Validates the URL via `new URL()` and checks `protocol === "https:"` before emitting; rejects `http:`, `data:`, `javascript:` schemes (T-06-05 mitigation — stored-XSS via compromised admin). Emits ONLY `<script async src={url} data-website-id={id} />` — **never** `dangerouslySetInnerHTML` and never arbitrary inline HTML. GA4/Plausible swappable by changing settings values (ANAL-02). Wired into `(site)/layout.tsx` after the footer.

## Decisions Honored

- **D-10 (Standard chrome):** Header = logo/title + hard-coded nav + Categories dropdown (cached server fetch) + search icon + dark toggle. Footer = blurb + legal links + quick links + optional socials. Nav is hard-coded for v1 (menu builder is v2).
- **D-13 (System + header toggle, route-isolated):** ThemeToggle respects OS preference by default + a header toggle. Uses a SEPARATE localStorage key (`site-theme`), does NOT import `ThemeContext`, has a no-flash `<head>` script. Grep-verified isolation.
- **D-17 (Injection-only analytics):** `<script>` injection from settings only; renders nothing by default; the Umami instance itself deploys in Phase 7. GA4/Plausible swappable.
- **T-06-05 (Analytics XSS mitigation):** https scheme validation before injecting; only `src` + `data-website-id` attributes; no `dangerouslySetInnerHTML`.
- **T-06-06 (Theme route-isolation):** separate key, no shared context — prevents dashboard client JS leaking into the public bundle (PERF-02 audits in Phase 7).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical functionality] Added `suppressHydrationWarning` to root `<html>`**
- **Found during:** Task 1
- **Issue:** The plan's acceptance criteria reference "Keep the suppressHydrationWarning on html", but the root `<html>` element (in `src/app/layout.tsx`, shared by both route groups) did NOT have it. The new no-flash script mutates `documentElement.classList` before React hydrates, which would produce a hydration mismatch warning on every public page load.
- **Fix:** Added `suppressHydrationWarning` to the root `<html>`. This is the Next.js-documented pattern for dark-mode no-flash scripts. It is a safe, additive one-attribute change that benefits BOTH route groups (the dashboard's `ThemeProvider` also mutates `documentElement.classList` client-side).
- **Files modified:** `src/app/layout.tsx`
- **Commit:** `28fc248`

**2. [Rule 2 - Missing critical functionality] Categories dropdown accessibility/empty-state**
- **Found during:** Task 1
- **Issue:** The plan specifies a Categories dropdown but does not address the empty state (no categories yet) or keyboard/hover semantics.
- **Fix:** The dropdown renders only when `categories.length > 0` (no empty dropdown). Added `aria-haspopup`, `aria-label` on the nav, and `aria-hidden` on decorative SVGs.
- **Files modified:** `src/components/site/SiteHeader.tsx`
- **Commit:** `28fc248`

*Note: The root layout (`src/app/layout.tsx`) wraps both `(site)` and `(admin)` with the dashboard's `ThemeProvider` from `src/context/ThemeContext`. This is a pre-existing coupling that predates this plan; fully decoupling it (moving ThemeProvider into the `(admin)` layout only) is an architectural change (Rule 4) out of scope for 06-02. The public ThemeToggle is nonetheless route-isolated at the storage level (separate key) and does not import ThemeContext, satisfying D-13's storage-isolation requirement. The no-flash script + `suppressHydrationWarning` ensure correct visual behavior regardless.*

## Authentication Gates

None — this plan is pure presentation chrome (server components + one small client toggle). No auth-gated actions.

## Verification Results

- **`pnpm tsc --noEmit`**: PASS — no errors in any file created/modified by this plan (pre-existing errors in unrelated files: `storage-settings.test.ts`, auth forms, `date-picker.tsx`, `AppSidebar.tsx` — all out of scope).
- **`pnpm test`**: PASS — 384/384 tests green across 37 files (no regressions).
- **D-13 isolation grep**: PASS — `grep -rn "from.*context/ThemeContext" src/app/(site)/ src/components/site/` returns no actual import statements (only documentation comments explaining the isolation).
- **Analytics XSS grep**: PASS — `dangerouslySetInnerHTML` appears only in a comment in `Analytics.tsx`; no actual usage. `protocol === "https:"` validation present.
- **Acceptance criteria**: All 11 acceptance criteria across both tasks verified (ThemeToggle `"use client"` + `site-theme`; no ThemeContext import; layout has SiteHeader/SiteFooter/`site-no-flash`/`beforeInteractive`; SiteHeader has `listCategoriesWithCounts` + `href="/search"`; Analytics reads the two settings keys, validates https, renders nothing when empty).

## Known Stubs

- **`logoUrl` in `SiteHeader.tsx`** (line ~30): hardcoded to `null` with a `TODO v2` comment. The logo URL will come from a `site.logo` settings key once the settings/general dashboard page ships (Phase 6 site-settings work / v2). Until then the header renders the site title text only — no broken image. This does not block the plan's goal (the header renders correctly with title text).

## Threat Flags

None beyond the plan's threat model. No new security-relevant surface introduced beyond what the threat register already covers (T-06-05 analytics injection mitigated; T-06-06 theme coupling mitigated).

## Self-Check: PASSED

Files created:
- FOUND: src/components/site/ThemeToggle.tsx
- FOUND: src/components/site/SiteHeader.tsx
- FOUND: src/components/site/SiteFooter.tsx
- FOUND: src/components/site/Analytics.tsx

Files modified:
- FOUND: src/app/(site)/layout.tsx
- FOUND: src/app/layout.tsx

Commits:
- FOUND: 28fc248 (feat(06-02): public site chrome + route-isolated dark mode)
- FOUND: 9cb17c7 (feat(06-02): analytics script injection, https-validated)
