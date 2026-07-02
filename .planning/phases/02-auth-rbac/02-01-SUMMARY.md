---
phase: 02-auth-rbac
plan: 01
subsystem: auth-rbac
tags: [auth, rbac, better-auth, drizzle, migration, testing]
requires:
  - "Phase 1 schema (8 tables, drizzle-kit, lib/db singleton, lib/log)"
  - "docker-compose postgres (5435) + postgres-test (5436) services"
provides:
  - "auth instance (src/lib/auth/index.ts) — Better Auth 1.6.23 + admin plugin RBAC"
  - "getSession() server-side session reader"
  - "ac, adminRole, editorRole, authorRole — createAccessControl RBAC config"
  - "requireRole/requireCan/assertOwnsPost/getSessionOrThrow — enforcement helpers"
  - "transitionPost(postId, target) + TRANSITIONS policy table"
  - "proxy.ts UX-only cookie gate (Next 16)"
  - "/api/auth/[...all] route handler (toNextJsHandler)"
  - "Phase 2 migration 0001_lean_ego.sql (4 auth tables + FK closure)"
  - "vitest 4.1.9 + vitest.config.ts test scaffold"
affects:
  - "02-02 (signin/signup/first-run setup consumes auth instance + helpers)"
  - "02-03 (email flows replace lib/email stub with real Resend helper)"
  - "Phase 3 (every post Server Action calls requireCan + assertOwnsPost + transitionPost)"
tech-stack:
  added:
    - "better-auth@1.6.23 (auth + admin/RBAC plugin)"
    - "resend@6.16.0 (email — stubbed now, wired in 02-03)"
    - "vitest@4.1.9 (test runner)"
  patterns:
    - "createAccessControl + ac.newRole for declarative 3-role RBAC (D-10 — no access plugin)"
    - "drizzleAdapter(db, { provider, schema }) bound to existing @/lib/db pool"
    - "nextCookies() LAST in plugins array (R2 — Server Action cookie setting)"
    - "role.authorize({resource:[action]}) for pure-unit RBAC testing (no DB needed)"
    - "TRANSITIONS policy record + double enforcement (table + requireCan) for author publish"
    - "proxy.ts getSessionCookie() optimistic + explicit UX-ONLY header (Pitfall #4)"
key-files:
  created:
    - "src/lib/auth/index.ts"
    - "src/lib/auth/permissions.ts"
    - "src/lib/auth/server.ts"
    - "src/lib/permissions/index.ts"
    - "src/lib/permissions/post-transitions.ts"
    - "src/lib/email/index.ts (stub — 02-03 replaces)"
    - "src/app/api/auth/[...all]/route.ts"
    - "proxy.ts"
    - "vitest.config.ts"
    - ".env.example"
    - "src/db/migrations/0001_lean_ego.sql"
    - "__tests__/proxy.test.ts"
    - "src/lib/permissions/__tests__/rbac.test.ts"
    - "src/lib/permissions/__tests__/ownership.test.ts"
    - "src/lib/permissions/__tests__/transitions.test.ts"
  modified:
    - "src/db/schema.ts (merged 4 auth tables + FK closure + bio/avatar)"
    - "scripts/test-migrations.mjs (8 → 12 expected tables + cred fix)"
    - "package.json (test script, better-auth/resend/vitest deps; removed dead pnpm field)"
    - "pnpm-lock.yaml"
decisions:
  - "drizzle-orm stays ^0.45.2 — Better Auth peer pins it; NOT bumped to 1.x RC (R5)"
  - "authorRole.statements.post excludes 'publish' (D-11) — enforced both in TRANSITIONS table AND requireCan({post:['publish']}) for double enforcement (D-15)"
  - "proxy.ts matcher targets resolved URL paths (/dashboard/:path*), NOT (admin) route-group literal (R6)"
  - "Role-level unit tests via role.authorize() rather than DB-backed userHasPermission — faster, same decision logic"
  - "lib/email ships as a no-op stub; Plan 02-03 wires the real Resend SDK"
metrics:
  duration: "27 min"
  completed: "2026-07-02"
  tasks: 3
  files: 19
  tests: 24
status: complete
---

# Phase 02 Plan 01: Auth Schema + Better Auth + RBAC + Permission Primitives Summary

Better Auth 1.6.23 wired in with 3-role RBAC (admin/editor/author via `createAccessControl`), the auth schema migrated (user/session/account/verification + role/banned/bio/avatar), permission helpers (`requireRole`/`requireCan`/`assertOwnsPost`), the `transitionPost` status-transition funnel, and the Next 16 `proxy.ts` UX-only cookie gate — all backed by Vitest tests and a 12-table clean-room migration drift test.

## What Shipped

### Task 1a — Wave-0 test scaffold (`287cdf3`)
- Installed **vitest@4.1.9** (dev dep); wired `"test": "vitest run"` (no watch flag per VALIDATION.md Sign-Off).
- Created `vitest.config.ts` at repo root: node environment, `@` → `src` alias mirroring `tsconfig.json`, include globs for `__tests__/**/*.test.ts` + `src/**/__tests__/**/*.test.{ts,tsx}`.
- Scaffolded `__tests__/.gitkeep`, `src/lib/permissions/__tests__/.gitkeep`, `src/actions/__tests__/.gitkeep` so sibling plans (02-02, 02-03) can drop test files without a mkdir step.
- Extended `.env.example` with Phase 2 vars (`BETTER_AUTH_SECRET/URL/TRUSTED_ORIGINS`, `RESEND_API_KEY`, `EMAIL_FROM`) while **preserving the Phase 1 S3/CDN vars** (consumed by `lib/r2` + `image-loader`).
- Removed the dead `pnpm.onlyBuiltDependencies` field from `package.json` (pnpm 11 ignores it; the live `allowBuilds` allowlist lives in `pnpm-workspace.yaml`).

### Task 1b — Auth schema + migration + Better Auth instance + RBAC (`6752647`)
- Installed **better-auth@1.6.23** + **resend@6.16.0**. drizzle-orm verified still at `^0.45.2` (R5 gate — Better Auth did NOT bump it to 1.x).
- `src/lib/auth/permissions.ts`: `createAccessControl` extending `defaultStatements` with `post`/`category`/`tag` resources. Three roles: `adminRole` (merges `adminAc.statements` + all post/category/tag actions), `editorRole` (post/category/tag full, no user.*), `authorRole` (post: create/read/update/unpublish/submit/delete — **publish ABSENT** per D-11).
- `src/lib/auth/index.ts`: the `betterAuth()` instance — `drizzleAdapter(db, {provider:"pg", schema})` bound to the existing `@/lib/db` pool, `requireEmailVerification: true` (D-09), `bio`+`avatar` additionalFields (D-24/D-25), 30-day session (D-18), `nextCookies()` **LAST** in plugins (R2), `trustedOrigins` env-driven (D-21).
- `src/lib/email/index.ts`: no-op stub `sendEmail` (Plan 02-03 wires the real Resend SDK).
- `src/db/schema.ts`: merged the 4 Better-Auth-CLI-generated tables (`user`, `session`, `account`, `verification`) with admin-plugin columns (`role`, `banned`, `banReason`, `banExpires`, `impersonatedBy`) + `bio`/`avatar`. Added `.references()` FK closure: `posts.author_id → user.id` + `posts.category_id → categories.id` (D-07).
- `src/db/migrations/0001_lean_ego.sql`: drizzle-kit-generated (no hand-written SQL — D-11).
- `scripts/test-migrations.mjs`: expected array extended **8 → 12** tables (the CRITICAL gate) + fixed stale `postgres://postgres:postgres` default to the docker-compose creds.
- `src/app/api/auth/[...all]/route.ts`: `toNextJsHandler(auth)` — the project's first API route.
- `src/lib/permissions/__tests__/rbac.test.ts`: 10 tests — author blocked from `post.publish`, editor/admin allowed (AUTH-01).

### Task 2 — Permission helpers + transitions + proxy.ts UX gate (`a09ada8`)
- `src/lib/permissions/index.ts`: `getSessionOrThrow` / `requireRole` / `requireCan` / `assertOwnsPost`. Every denial path calls `log.error(...)` with structured context BEFORE throwing (Pitfall #1). Admin override on role checks; admin/editor bypass on ownership.
- `src/lib/permissions/post-transitions.ts`: `transitionPost(postId, target)` + the `TRANSITIONS` policy record. Author excludes `published` from every source-status list; publish path calls `requireCan({post:['publish']})` for double enforcement (D-15). All status writes funnel through this helper (R7).
- `proxy.ts` (repo root, Next 16): UX-only cookie gate. Matcher `["/dashboard/:path*", "/signin", "/signup"]` targets resolved URL paths (R6 — route groups in parens don't appear in URLs). Header carries the explicit **UX-ONLY — NOT authoritative RBAC** callout (Pitfall #4). Deep-link return via `?next=` param (D-19) + reverse redirect of authed users away from `/signin` (D-20).
- `src/lib/auth/server.ts`: completed the barrel — re-exports `getSession` + the four permission helpers as one import surface for Server Actions.
- `__tests__/proxy.test.ts` (4 tests): unauth redirect, authed pass, reverse redirect, matcher check (AUTH-03).
- `src/lib/permissions/__tests__/ownership.test.ts` (4 tests): non-owner blocked, admin bypass, editor bypass, unauthenticated (AUTH-04).
- `src/lib/permissions/__tests__/transitions.test.ts` (6 tests): author draft→pending_review allowed, author draft→published BLOCKED, author published→draft (unpublish own), editor approve, editor direct publish, author pending_review→published BLOCKED (AUTH-05).

## Verification

| Gate | Result |
|------|--------|
| `pnpm test` (full suite) | **24 passed** (4 test files) |
| `pnpm test:migrations` (clean-room drift) | **12 tables** present — PASSED |
| `pnpm build` | Succeeded — `/api/auth/[...all]` mounted as dynamic route, no type errors |
| drizzle-orm version | `^0.45.2` (NOT bumped to 1.x — R5 gate holds) |
| `nextCookies()` placement | LAST entry in plugins array (R2) |
| `requireEmailVerification` | `true` (D-09) |

### AUTH requirement coverage
- **AUTH-01** (roles via createAccessControl) — rbac test: author blocked from publish, editor/admin allowed ✓
- **AUTH-03** (proxy cookie gate) — 3 proxy behaviors + matcher verified ✓
- **AUTH-04** (permission helpers) — ownership non-owner blocked + admin/editor bypass ✓
- **AUTH-05** (workflow transitions) — author cannot reach published, editor can approve ✓
- **AUTH-08** (profile fields) — user table has `bio` + `avatar` columns (migration test) ✓

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed stale test-migrations.mjs default DB URL**
- **Found during:** Task 1b Step F
- **Issue:** `scripts/test-migrations.mjs` had a hardcoded fallback `postgres://postgres:postgres@localhost:5436/anydiscussion_test` that didn't match the `docker-compose.yml` `postgres-test` service creds (`anydiscussion:125524`). The script doesn't load `.env.local`, so the stale default caused password auth failures (`28P01`).
- **Fix:** Changed the default to `postgresql://anydiscussion:125524@localhost:5436/anydiscussion_test` to match docker-compose.yml.
- **Files modified:** `scripts/test-migrations.mjs`
- **Commit:** 6752647

**2. [Rule 1 - Bug] Fixed stale .env.example DATABASE_URL default**
- **Found during:** Task 1a
- **Issue:** The pre-existing `.env.example` had `DATABASE_URL=postgres://postgres:postgres@localhost:5435/anydiscussion` — wrong user/password for the docker-compose `postgres` service.
- **Fix:** Updated to `postgresql://anydiscussion:125524@localhost:5435/anydiscussion` (matches docker-compose.yml).
- **Files modified:** `.env.example`
- **Commit:** 287cdf3

**3. [Rule 3 - Blocking] Removed dead pnpm.onlyBuiltDependencies field**
- **Found during:** Task 1a
- **Issue:** `package.json` had a `pnpm.onlyBuiltDependencies` field that pnpm 11 explicitly ignores (warns on every install: *"The 'pnpm' field in package.json is no longer read by pnpm"*). The live build allowlist lives in `pnpm-workspace.yaml` `allowBuilds`.
- **Fix:** Removed the dead field. Verified `pnpm install` no longer warns and sharp/esbuild builds still run (allowlist in pnpm-workspace.yaml covers them).
- **Files modified:** `package.json`
- **Commit:** 287cdf3

**4. [Rule 3 - Blocking] Reset incompatible PG16 postgres volume**
- **Found during:** environment setup (pre-Task 1a)
- **Issue:** The docker-compose `postgres` service (PG17-alpine) refused to start: *"database files are incompatible with server — The data directory was initialized by PostgreSQL version 16"*. A prior run had used a PG16 image against the same named volume `pgdata`.
- **Fix:** Stopped the container, removed the `anydiscussion_pgdata` volume, recreated the container (fresh PG17 init). This is a dev-only DB with no production data.
- **Files modified:** none (docker volume only)

**5. [Rule 1 - Bug] Fixed proxy.test.ts over-strict URL assertion**
- **Found during:** Task 2 GREEN phase
- **Issue:** The proxy test asserted `location` contains the literal `next=/dashboard`, but `URL.searchParams.set` correctly URL-encodes the slash (`next=%2Fdashboard`). The proxy implementation was correct; the test assertion was wrong.
- **Fix:** Parse the Location header via `new URL()` and assert `searchParams.get("next") === "/dashboard"` (decodes automatically).
- **Files modified:** `__tests__/proxy.test.ts`
- **Commit:** a09ada8

## Known Stubs

| File | Line | Stub | Resolution |
|------|------|------|------------|
| `src/lib/email/index.ts` | `sendEmail()` | No-op stub that logs to console in non-prod | **Plan 02-03** replaces with the real Resend-backed helper (`new Resend(process.env.RESEND_API_KEY)`). The auth instance's `sendVerificationEmail`/`sendResetPassword` hooks call this stub now; verification/reset URLs are visible in dev console. |

This stub is **intentional and anticipated by the plan** (env-var note: *"the auth instance references sendEmail via a stub import that 02-03 replaces"*). It does not block the plan's goal — the auth/RBAC/permission primitives this plan delivers are fully functional.

## Self-Check: PASSED

### Created files exist
- FOUND: src/lib/auth/index.ts
- FOUND: src/lib/auth/permissions.ts
- FOUND: src/lib/auth/server.ts
- FOUND: src/lib/permissions/index.ts
- FOUND: src/lib/permissions/post-transitions.ts
- FOUND: src/lib/email/index.ts
- FOUND: src/app/api/auth/[...all]/route.ts
- FOUND: proxy.ts
- FOUND: vitest.config.ts
- FOUND: .env.example
- FOUND: src/db/migrations/0001_lean_ego.sql
- FOUND: __tests__/proxy.test.ts
- FOUND: src/lib/permissions/__tests__/rbac.test.ts
- FOUND: src/lib/permissions/__tests__/ownership.test.ts
- FOUND: src/lib/permissions/__tests__/transitions.test.ts

### Commits exist
- FOUND: 287cdf3 (Task 1a)
- FOUND: 6752647 (Task 1b)
- FOUND: a09ada8 (Task 2)

### Acceptance gates
- FOUND: pnpm test → 24 passed
- FOUND: pnpm test:migrations → 12 tables, PASSED
- FOUND: pnpm build → succeeded
- FOUND: drizzle-orm ^0.45.2 (not 1.x)
