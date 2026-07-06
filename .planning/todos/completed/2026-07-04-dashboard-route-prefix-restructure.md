---
created: 2026-07-04T22:43:01Z
title: Move admin routes under /dashboard/* prefix
area: dashboard
resolves_phase: 4
files:
  - src/app/(admin)/ (move dashboard sub-pages under a shared /dashboard URL segment)
  - src/proxy.ts (update auth-gate matcher to /dashboard/*)
  - src/layout/AppSidebar.tsx (internal nav hrefs → /dashboard/*)
  - src/app/(admin)/posts/page.tsx (New Post + edit links → /dashboard/posts/*)
source: Phase 3 UAT (03-UAT.md test 2)
---

## Problem

The dashboard currently uses a **root-URL convention** for its sub-pages. The `(admin)`
route group (parentheses = no URL segment) places every admin page at a root path:
`/dashboard` (overview only), `/posts`, `/posts/new`, `/posts/[id]/edit`, `/alerts`,
`/calendar`, `/profile`, `/form-elements`, etc. This was the Phase 1 convention;
Phase 3 followed it correctly by putting posts at `/posts`.

During Phase 3 UAT (test 2 — visual editor UAT), the founder reported that the URL
`http://localhost:3000/posts/new` "is wrong, it must follow /dashboard/*". After
confirming this is a project-wide convention (not a Phase 3 defect), the founder
chose **option A: move admin routes under `/dashboard/*`**.

## Decision

Restructure the `(admin)` route group so all dashboard sub-pages live under a real
`/dashboard` URL segment:

- `/dashboard` (overview) — unchanged
- `/posts` → `/dashboard/posts`
- `/posts/new` → `/dashboard/posts/new`
- `/posts/[id]/edit` → `/dashboard/posts/[id]/edit`
- Eventually also: `/alerts`, `/calendar`, `/profile`, `/form-elements`, `/categories`,
  `/tags`, `/media`, `/users`, `/settings/*` → `/dashboard/*`

## Implementation approach (for Phase 4 planning)

The cleanest Next.js App Router way to add a URL segment while keeping the shared
`(admin)` layout: introduce a real `dashboard` segment folder under the group, e.g.
`src/app/(admin)/dashboard/posts/new/page.tsx`. Move all current top-level admin
sub-pages (`posts/`, future `categories/`/`tags/`/`media/`/`users/`/`settings/`) under
`dashboard/`. Keep `(admin)/layout.tsx` and `AdminShell.tsx` at the group root so the
sidebar/header shell still wraps everything.

Then:
1. Update `src/proxy.ts` auth-gate matcher from the current per-route list to
   `/dashboard/*` (simpler, single matcher — a side benefit of the restructure).
2. Update internal links: `AppSidebar.tsx` nav `href`s, the "+ New Post" button and
   per-row edit link in `(admin)/dashboard/posts/page.tsx`, and any `router.push`/redirect
   calls that target admin paths.
3. Update Phase 2 auth-gate tests (`scripts/test-auth-gate.mjs`) to target `/dashboard/*`.

## Why Phase 4, not a Phase 3 gap

Phase 3 (Content Engine) built the post pages following the existing Phase 1 convention
and is correct as-built. The restructure is a cross-cutting dashboard-chrome change that
matches Phase 4's stated scope ("TailAdmin wired to real data"). Surfacing it here so
Phase 4's `/gsd-discuss-phase` picks it up via `cross_reference_todos`.
