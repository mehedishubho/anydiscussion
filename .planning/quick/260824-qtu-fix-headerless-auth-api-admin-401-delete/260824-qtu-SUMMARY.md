---
phase: quick-260824-qtu
plan: 01
subsystem: auth-admin-actions
tags: [better-auth, admin-plugin, server-actions, headers-forwarding, deleteUser, ban, 401-fix]
requires:
  - "260824-ptx — guarded deleteUser action + UsersTable delete UI (the live 401 surfaced through its alert)"
provides:
  - "Headers-forwarding contract for ALL middleware-gated auth.api calls (banUser/unbanUser/revokeUserSessions/removeUser) — the live 401 class eliminated"
  - "Honest deleteUser logging (success log after resolution) + readable failure message ('Failed to delete user — please try again.')"
  - "Regression test class pinning headers presence per gated endpoint + the deliberate headerless asymmetry (createUser, sendVerificationEmail)"
affects:
  - "src/actions/users.ts"
  - "src/actions/__tests__/users.test.ts"
  - "__tests__/ban.test.ts"
  - "__tests__/sessions.test.ts"
tech-stack:
  added: []
  patterns:
    - "headers: await headers() forwarded into middleware-gated better-auth admin endpoints (mirrors src/lib/permissions/index.ts:24 getSession pattern)"
key-files:
  created: []
  modified:
    - src/actions/users.ts
    - src/actions/__tests__/users.test.ts
    - __tests__/ban.test.ts
    - __tests__/sessions.test.ts
decisions:
  - "Forward headers ONLY at the four middleware-gated call sites; createUser + sendVerificationEmail stay headerless by design (caller-check skip / anti-enumeration) — asymmetry documented at the import and pinned by tests"
  - "deleteUser converts any removeUser rejection into a friendly thrown Error instead of rethrowing the raw APIError (blank-alert fix)"
metrics:
  duration: 13min
  completed: 2026-08-24T13:39:50Z
  tasks: 1
  files: 4
status: complete
---

# Quick Task 260824-qtu: Fix headerless auth.api admin calls (live 401 on delete/ban) Summary

Forward `await headers()` into the four middleware-gated better-auth admin endpoints in `src/actions/users.ts` (banUser, unbanUser, revokeUserSessions, removeUser) — adminMiddleware (`routes.mjs:16-20`) throws UNAUTHORIZED on headerless internal calls — plus honest deleteUser logging/erroring and a regression test class for the headerless-call bug.

## What Was Built

**Task 1 (TDD RED→GREEN, single task):**

- **RED first** (commit `6a839d3`): `vi.mock("next/headers", ...)` added to users.test.ts; existing deleteUser success assertion extended with `headers: expect.anything()`; new describe block `REGRESSION 260824-qtu` with 6 tests (ban/unban/revoke shape + `headers` key assertions, deleteUser failure path, log-ordering via `invocationCallOrder`, deliberate-asymmetry pin on createUser). RED run: exactly 6 designed failures, 567 pre-existing tests green.
- **GREEN** (commit `dd9578b`):
  - `import { headers } from "next/headers"` with a WHY comment documenting the gated/headerless asymmetry (routes.mjs:16-20 vs routes.mjs:146-149 vs anti-enumeration debug doc).
  - `headers: await headers()` added at exactly the 4 gated call sites (verified: `grep -c` == 4).
  - deleteUser: removeUser wrapped in try/catch — `log.info("user deleted")` now fires only AFTER resolution (ordering proven by `invocationCallOrder` test, precedent: AUTH-07); rejection → `log.error("deleteUser failed", ...)` + `throw new Error("Failed to delete user — please try again.")`.
  - Stale updateUser JSDoc corrected (name persists via direct db.update, not auth.api.updateUser).
  - Guard order and guard bodies byte-for-byte unchanged; createUser (×2) and sendVerificationEmail call shapes untouched.

## Verification Results

- `pnpm test` (full suite): **573/573 green across 56 files** — all pre-existing guard tests (permission-first FORBIDDEN ordering, self-delete, last-admin, has-posts, AUTH-07 block) pass unchanged.
- Structural: exactly 4 `headers: await headers()` occurrences in users.ts; zero in createUser/sendVerificationEmail call expressions (pinned by the asymmetry test + untouched AUTH-07 exact-match assertion).
- `pnpm exec tsc --noEmit`: error set byte-identical to the main checkout at base (see Deviations #3) — zero new type errors introduced.
- TDD gates: RED commit `6a839d3` → GREEN commit `dd9578b` — compliant.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Sibling test files needed the next/headers mock**
- **Found during:** Task 1 GREEN run
- **Issue:** `__tests__/ban.test.ts` (4 tests) and `__tests__/sessions.test.ts` (2 tests) also exercise banUser/unbanUser/revokeSessions success paths and do not mock `next/headers`. The planned change made the actions call `await headers()`, which throws "`headers` was called outside a request scope" outside a request store — 6 sibling tests failed.
- **Fix:** added the same `vi.mock("next/headers", () => ({ headers: async () => new Headers({ cookie: "test" }) }))` to both files, with a 260824-qtu comment. Their `objectContaining` assertions tolerate the extra `headers` key unchanged.
- **Files modified:** `__tests__/ban.test.ts`, `__tests__/sessions.test.ts`
- **Commit:** dd9578b (part of GREEN)

**2. [Rule 3 - Blocking] Fresh worktree had no node_modules**
- **Found during:** Task 1 RED run
- **Issue:** `pnpm test` failed — `vitest` not recognized; worktree had no node_modules.
- **Fix:** `pnpm install --frozen-lockfile` (pinned lockfile versions only, no new packages).
- **Commit:** no repo change (gitignored artifacts)

**3. [Environment - documented] tsc "clean" gate impossible at base; worktree lacked next-env.d.ts**
- **Found during:** Task 1 verify
- **Issue:** (a) `pnpm exec tsc --noEmit` is NOT clean on main at base — 4 pre-existing TS18048 errors in `src/actions/__tests__/storage-settings.test.ts`. (b) The fresh worktree additionally showed 16 bogus `TS2322 className/IntrinsicAttributes` errors in untouched TailAdmin icon usages, caused by the gitignored `next-env.d.ts` being absent (its `next/image-types/global` reference supplies next's `any`-typed `*.svg` declaration, overriding `src/svg.d.ts`'s string-typed default export).
- **Fix:** ran `pnpm exec next typegen` (official generator; output gitignored) → worktree tsc error set became byte-identical to main's (4 pre-existing errors, zero new). Pre-existing storage-settings errors logged to `deferred-items.md` — out of scope per the executor scope boundary.
- **Files modified:** none committed (next-env.d.ts + .next/ are gitignored)

**4. [Rule 1 - Bug] Plan's grep gate would count the explanatory comment**
- **Found during:** Task 1 verify
- **Issue:** the import comment originally quoted the literal string `headers: await headers()` inside backticks, which would make the plan's structural check `grep -c 'headers: await headers()' == 4` count 5.
- **Fix:** reworded the comment to "forward the caller's OWN live request headers via await headers()" — grep count verified exactly 4.
- **Files modified:** src/actions/users.ts
- **Commit:** dd9578b

## Auth Gates

None.

## Known Stubs

None — all four endpoints now forward real request headers; no placeholder data or unwired components.

## Threat Model Mitigations Applied

- **T-Q2-01 (EoP):** headers forwarded are exclusively the caller's own live `await headers()` — no fabricated/substituted principal; requireCan still fires first unchanged (FORBIDDEN ordering tests green).
- **T-Q2-02 (Spoofing):** no hand-built Headers or stored cookie strings in users.ts — only the live next/headers function (permissions/index.ts:24 precedent).
- **T-Q2-03 (Repudiation):** "user deleted" logs only after removeUser resolves; failures log `log.error("deleteUser failed", { userId, err })` — proven by the log-ordering and failure-path tests.
- **T-Q2-04 (UX DoS):** removeUser rejection converts to a readable thrown message rendered by the existing UsersTable shared alert.

## Manual Verification (deferred to next live session, per plan)

- Dashboard delete of a post-less junk user actually removes the DB row.
- Ban of a user results in a banned row (previously impossible live — DB had zero banned users).

## Self-Check: PASSED

- Files found: src/actions/users.ts, src/actions/__tests__/users.test.ts, __tests__/ban.test.ts, __tests__/sessions.test.ts, 260824-qtu-SUMMARY.md
- Commits found: 6a839d3 (RED), dd9578b (GREEN)
- Full suite: 573/573 green; tsc error set byte-identical to main base (zero new errors); grep count of `headers: await headers()` == 4
