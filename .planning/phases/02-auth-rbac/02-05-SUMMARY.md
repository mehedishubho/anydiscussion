---
phase: 02-auth-rbac
plan: 05
subsystem: auth-rbac
tags: [auth, rbac, proxy, gap-closure, security, server-component, ppr, middleware]
requires: [02-01, 02-04]
provides:
  - "Server-side getSession() auth gate in (admin) layout (authoritative RBAC boundary)"
  - "Extracted AdminShell client component (sidebar/header/backdrop shell)"
  - "middleware.ts with registered manifest (UX cookie-existence gate)"
  - "scripts/test-auth-gate.mjs integration regression test"
affects:
  - "src/app/(admin)/layout.tsx — converted from client to Server Component"
  - "proxy.ts → middleware.ts — renamed for Turbopack 16.2.9 manifest registration"
  - "__tests__/proxy.test.ts → __tests__/middleware.test.ts"
tech-stack:
  added: []
  patterns:
    - "PPR Suspense boundary around dynamic auth gate (cacheComponents compatibility)"
    - "connection()/headers() dynamic API inside Suspense for PPR-safe dynamic routes"
    - "middleware.ts over proxy.ts for Turbopack middleware-manifest registration"
key-files:
  created:
    - "src/app/(admin)/AdminShell.tsx"
    - "middleware.ts"
    - "__tests__/middleware.test.ts"
    - "scripts/test-auth-gate.mjs"
  modified:
    - "src/app/(admin)/layout.tsx"
    - "package.json"
  deleted:
    - "proxy.ts"
    - "__tests__/proxy.test.ts"
decisions:
  - "Suspense-wrapped auth gate chosen over force-dynamic (incompatible with cacheComponents:true) and bare headers() (triggers PPR 'uncached data outside Suspense' build error)"
  - "Branch A chosen: middleware.ts populates middleware-manifest.json correctly where proxy.ts did not (Turbopack 16.2.9 bug observation)"
metrics:
  duration: "19 min"
  tasks: 3
  files: 6
  completed: "2026-07-03"
status: complete
---

# Phase 02 Plan 05: AUTH-03 Dashboard Auth-Gate Gap Closure Summary

Server-side `getSession()` auth gate in the `(admin)` layout (wrapped in Suspense for PPR/cacheComponents compatibility), proxy.ts renamed to middleware.ts fixing Turbopack 16.2.9 manifest registration, and a real HTTP integration test proving unauthenticated `/dashboard` redirects to `/signin`.

## What Was Built

### Task 1: Authoritative server-side auth gate in the (admin) layout

- **`src/app/(admin)/AdminShell.tsx`** (new): Client component extracted from the former client layout — contains the sidebar/header/backdrop shell (`useSidebar()` hook, `AppSidebar`, `Backdrop`, `AppHeader`, children container). Pure relocation with zero structural changes.
- **`src/app/(admin)/layout.tsx`** (rewritten): Converted from `"use client"` to an async Server Component. Calls `getSession()` inside an `AuthGate` component wrapped in `<Suspense>`. When session is null → `redirect("/signin")` (throws at runtime, short-circuits render). When session exists → renders `<AdminShell>{children}</AdminShell>`.

### Task 2: proxy.ts → middleware.ts rename (Branch A)

- **`middleware.ts`** (renamed from `proxy.ts`): Function renamed `proxy` → `middleware`. All logic identical (cookie-existence UX gate). Comment documents the Turbopack 16.2.9 observation: `proxy.ts` compiles but never registers in `middleware-manifest.json`; `middleware.ts` registers correctly with all 4 matchers.
- **`__tests__/middleware.test.ts`** (renamed from `proxy.test.ts`): Import path and function references updated from `proxy` to `middleware`. All 4 test cases identical in behavior.

### Task 3: Integration regression test

- **`scripts/test-auth-gate.mjs`** (new): Two-phase integration test. (b) Structural check: verifies `/dashboard` is not fully static and its PPR shell contains no dashboard content. (c) HTTP check: spawns `next start`, sends `redirect:"manual"` no-cookie fetch to `/dashboard`, asserts 307 redirect to `/signin`. Falls back to structural-only if server can't boot.
- **`package.json`**: Added `"test:auth-gate": "node scripts/test-auth-gate.mjs"` alongside `test:migrations`.

## Task Summary

| Task | Description | Commit | Status |
|------|-------------|--------|--------|
| 1 | Server-side getSession() auth gate + AdminShell extraction | `a3d64a8` | PASS |
| 2 | proxy.ts → middleware.ts rename (Branch A — manifest populates) | `e02a0eb` | PASS |
| 3 | Auth-gate integration regression test | `bb5d6de` | PASS |

## Verification Results

| Check | Result |
|-------|--------|
| `pnpm build` | PASS — 24/24 pages, `/dashboard` is `◐ (PPR)` not `○ (Static)` |
| Prerender shell content | PASS — 1774 bytes, NO dashboard/sidebar/header content |
| `pnpm test` (vitest) | PASS — 11 files, 61 tests |
| `pnpm test:auth-gate` structural | PASS — PPR shell safe, middleware-manifest: 1 entry / 4 matchers |
| `pnpm test:auth-gate` HTTP | PASS — `GET /dashboard` (no cookie) → 307 → `/signin?next=%2Fdashboard` |
| Build output middleware | `ƒ Proxy (Middleware)` — middleware IS registered |

## Deviations from Plan

### Rule 3: PPR/cacheComponents incompatibility with force-dynamic (Task 1)

- **Found during:** Task 1 — converting `(admin)` layout to Server Component
- **Issue:** The plan said "Do not add force-dynamic or any config flag — the headers() usage alone is sufficient." Under `cacheComponents: true` (PPR), this is NOT correct:
  1. `export const dynamic = "force-dynamic"` → Next.js 16 build error: `"dynamic" is not compatible with nextConfig.cacheComponents`
  2. Bare `headers()`/`connection()` in the layout → build error: `"Uncached data was accessed outside of <Suspense>"` (the root layout's client context providers `SidebarProvider`/`ThemeProvider` with `useState` are flagged when dynamic content flows through them without a Suspense boundary)
- **Fix:** Wrapped the dynamic auth check (`getSession()` + `redirect()`) in an `AuthGate` async Server Component inside `<Suspense fallback={null}>`. PPR now prerenders the root layout shell (html/body/providers — 1774 bytes, NO dashboard content) as the static fallback, while the per-request auth gate streams dynamically. An unauthenticated visitor sees only the bare skeleton before the redirect fires — never dashboard content.
- **Files modified:** `src/app/(admin)/layout.tsx`
- **Commit:** `a3d64a8`
- **Verification:** Build succeeds, PPR shell verified to contain zero dashboard markers, HTTP test confirms 307 redirect

### Rule 3: Structural check adapted for PPR (Task 3)

- **Found during:** Task 3 — writing `test-auth-gate.mjs`
- **Issue:** The plan's structural check expected `/dashboard` to be absent from `prerender-manifest.json` routes (fully dynamic). With the Suspense/PPR approach, `/dashboard` IS in the manifest as `PARTIALLY_STATIC` (it has a static shell). The plan's check would falsely fail.
- **Fix:** Adapted the structural check to verify what actually matters: the static shell for `/dashboard` must NOT contain dashboard content (no sidebar, header, AdminShell, or dashboard text). Checks `renderingMode !== "STATIC"` AND scans the prerendered HTML for dashboard markers. This is a stronger guarantee than the original "not in manifest" check.
- **Files modified:** `scripts/test-auth-gate.mjs`
- **Commit:** `bb5d6de`

## AUTH-03 Gap Closure Evidence

The original bug (from `.planning/debug/dashboard-auth-gate-bypass.md`): `curl -sI http://localhost:3000/dashboard` returned HTTP 200 (dashboard rendered for unauthenticated users).

After this plan: `curl -sI http://localhost:3000/dashboard` returns HTTP 307 with `Location: /signin?next=%2Fdashboard` (proven by the HTTP integration test in Task 3).

Two independent layers now enforce the auth boundary:
1. **Authoritative (Task 1):** Server-side `getSession()` in the `(admin)` layout — redirects to `/signin` when no valid session. This is the real RBAC boundary (DB-backed, not cookie-existence).
2. **UX (Task 2):** `middleware.ts` cookie-existence gate — now actually registered in the manifest and running. Prevents the dashboard shell from flashing to logged-out users.

## Known Stubs

None. All functionality is wired to real auth (`getSession()` → Better Auth DB-backed session check).

## Self-Check: PASSED

**Files verified:**
- FOUND: src/app/(admin)/AdminShell.tsx
- FOUND: src/app/(admin)/layout.tsx
- FOUND: middleware.ts
- FOUND: __tests__/middleware.test.ts
- FOUND: scripts/test-auth-gate.mjs
- FOUND: package.json (test:auth-gate script)

**Commits verified:**
- FOUND: a3d64a8 (feat: server-side auth gate)
- FOUND: e02a0eb (fix: proxy.ts → middleware.ts)
- FOUND: bb5d6de (test: auth-gate integration test)

**Deletions verified:**
- proxy.ts deleted (intentional rename to middleware.ts)
- __tests__/proxy.test.ts deleted (intentional rename to __tests__/middleware.test.ts)
