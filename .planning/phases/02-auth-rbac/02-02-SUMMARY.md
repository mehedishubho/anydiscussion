---
phase: 02-auth-rbac
plan: 02
subsystem: auth-rbac
tags: [auth, signin, signup, first-run-setup, d-08-security, better-auth, server-actions, remember-me]
requires:
  - "02-01: auth instance, RBAC config, permission helpers, proxy.ts, test scaffold"
  - "docker-compose postgres (5435) + postgres-test (5436) services UP"
provides:
  - "authClient (src/lib/auth/client.ts) — Better Auth browser client with adminClient plugin"
  - "createFirstAdmin action (src/actions/users.ts) — D-08 self-disable proven by test"
  - "createUser/banUser/unbanUser/revokeSessions actions — permission-check-first convention"
  - "Repurposed signup page — first-run admin-creation wizard that self-closes"
  - "SignInForm wired to authClient.signIn.email — rememberMe (D-18) + callbackURL (D-19)"
affects:
  - "02-03 (email flows — createUser triggers sendVerificationEmail via the auth instance)"
  - "Phase 4 (dashboard user management UI calls createUser/banUser/unbanUser/revokeSessions)"
tech-stack:
  added:
    - "@testing-library/react@16.3.2 (dev — component testing)"
    - "@testing-library/dom@10.4.1 (dev — companion)"
    - "jsdom@29.1.1 (dev — DOM environment for component tests)"
  patterns:
    - "vi.hoisted() for hoist-safe mock spies (Vitest 4 hoisting requirement)"
    - "vi.mock('next/navigation') to stub useSearchParams in component tests"
    - "Suspense-wrapped async Server Component for PPR-compatible dynamic count query"
    - "connection() / Suspense boundary replaces `export const dynamic` under cacheComponents"
    - "adminApi type cast: Better Auth plugin endpoints are flat in TS but nested at runtime"
key-files:
  created:
    - "src/lib/auth/client.ts"
    - "src/actions/users.ts"
    - "src/actions/__tests__/users.test.ts"
    - "src/components/auth/__tests__/SignInForm.test.tsx"
  modified:
    - "src/app/(full-width-pages)/(auth)/signup/page.tsx (repurposed as setup wizard)"
    - "src/components/auth/SignUpForm.tsx (rebound to createFirstAdmin)"
    - "src/components/auth/SignInForm.tsx (wired to authClient.signIn.email)"
    - "package.json (added 3 component-test dev deps)"
    - "pnpm-lock.yaml"
decisions:
  - "D-08 self-disable enforced by structural test ordering: auth.api mock throws MUST_NOT_BE_REACHED if count-check fails to fire first"
  - "adminApi type cast used because Better Auth's TS inference surfaces plugin endpoints flat (UnionToIntersection merge) while runtime nests them under auth.api.admin"
  - "signup page uses Suspense-wrapped async child instead of `export const dynamic = force-dynamic` because cacheComponents (PPR) disallows the latter"
  - "callbackURL rejects absolute URLs and protocol-relative URLs (//evil.com) — T-02-08 mitigation"
  - "Social-auth buttons removed from both forms (locked exclusion — out of scope for v1)"
metrics:
  duration: "22 min"
  completed: "2026-07-02"
  tasks: 2
  files: 9
  tests: 35
status: complete
---

# Phase 02 Plan 02: Sign-In + First-Run Admin Setup Wizard Summary

Shipped the first-run admin-creation wizard (D-06/D-07/D-08 — the single most security-critical feature in Phase 2), the Better Auth browser client, the `src/actions/users.ts` Server Actions file with permission-check-first convention, the repurposed signup/setup page that self-disables once an admin exists, and the SignInForm wired to `authClient.signIn.email` with remember-me (D-18) + deep-link callbackURL (D-19).

## What Shipped

### Task 1 — createFirstAdmin + authClient + repurposed signup + SignUpForm + users test (`dcc5421`)

- **`src/lib/auth/client.ts`**: Better Auth browser client. `createAuthClient` from `better-auth/react` + `adminClient` plugin with the 3 roles (admin/editor/author) imported from `./permissions`. No `"use client"` at module top (factory, not component).
- **`src/actions/users.ts`** (`"use server"`): 5 exported actions:
  - `createFirstAdmin` — the D-08 bootstrap. The `db.select({n: count()}).from(schema.user).where(eq(schema.user.role,"admin"))` statement appears textually and executionally BEFORE any `adminApi.createUser` call. When count > 0: `log.error` + `throw new Error("FORBIDDEN")`. When count===0: creates with `role:"admin"` + `emailVerified:true`.
  - `createUser` — `requireCan({user:["create"]})` FIRST, then `adminApi.createUser`.
  - `banUser` — `requireCan({user:["ban"]})` FIRST, then `adminApi.banUser` (D-16).
  - `unbanUser` — `requireCan({user:["ban"]})` FIRST, then `adminApi.unbanUser`.
  - `revokeSessions` — `requireCan({user:["revoke-session"]})` FIRST, then `adminApi.revokeUserSessions` (D-17).
  - **adminApi type cast**: Better Auth's TS inference merges plugin endpoints flat (via `UnionToIntersection`), but at runtime they nest under `auth.api.admin.*`. A typed `AdminApi` interface + `const adminApi = (auth.api as unknown as { admin: AdminApi }).admin` bridges this without `any`.
- **`src/app/(full-width-pages)/(auth)/signup/page.tsx`**: Server Component repurposed as the first-run admin-creation screen (D-06/D-07). Renders `<Suspense><SetupGate/></Suspense>` where `SetupGate` queries `count(admins)` — if > 0, `redirect("/signin")` (setup self-closes). Uses Suspense because `cacheComponents` (PPR) requires uncached data access inside a Suspense boundary; `export const dynamic = "force-dynamic"` is incompatible with cacheComponents.
- **`src/components/auth/SignUpForm.tsx`**: Rebound to `createFirstAdmin` via `useActionState`. Social-auth buttons removed. Fields: name/email/password (matching the action signature). Error + success messaging. "Create Admin Account" heading.
- **`src/actions/__tests__/users.test.ts`** (7 tests):
  - "createFirstAdmin zero" — count===0 → creates role:admin via auth.api.admin.createUser (asserts on body args).
  - "createFirstAdmin blocked" (SECURITY-CRITICAL D-08) — count=1 → throws FORBIDDEN + createUser NEVER reached (mocked to throw `MUST_NOT_BE_REACHED` — proves count-check fires first by execution order, not just that refusal happens).
  - 4 permission-check-first tests: createUser/banUser/unbanUser/revokeSessions each throw FORBIDDEN when requireCan denies, BEFORE reaching the auth.api body.

### Task 2 — SignInForm wiring + signin page + SignInForm test (`b5819fd`)

- **`src/components/auth/SignInForm.tsx`**: Wired to `authClient.signIn.email({ email, password, rememberMe: isChecked, callbackURL })`. The "Keep me logged in" Checkbox `isChecked` state maps to `rememberMe` (D-18). The `next` search param (set by proxy.ts on bounce) maps to `callbackURL` with `/dashboard` fallback (D-19). Absolute URLs and protocol-relative URLs (`//evil.com`) rejected (T-02-08). `useSearchParams` wrapped in `<Suspense>` (Next 16 cacheComponents). Social-auth buttons removed. Generic error message on invalid credentials (T-02-07 — no email enumeration).
- **`src/components/auth/__tests__/SignInForm.test.tsx`** (4 tests, jsdom environment):
  - rememberMe checked → spy called with `rememberMe: true` (D-18).
  - rememberMe unchecked → spy called with `rememberMe: false` (D-18).
  - `?next=/dashboard/posts/42` → spy called with `callbackURL: "/dashboard/posts/42"` (D-19 deep-link).
  - No `next` param → spy called with `callbackURL: "/dashboard"` (D-19 fallback).
  - Mocks: `@/lib/auth/client` (signIn.email spy), `next/navigation` (useSearchParams stub), `@/icons` (inert stubs — jsdom rejects SVG data-URI Name production).

## Verification

| Gate | Result |
|------|--------|
| `pnpm test` (full suite) | **35 passed** (6 test files — 24 prior + 7 users + 4 SignInForm) |
| `pnpm build` | Succeeded — `/signup` shows `◐ (Partial Prerender)`, no type errors |
| D-08 count-before-createUser ordering | Count statement (line 67) BEFORE adminApi.createUser (line 80) — enforced structurally by the "blocked" test |
| Permission-check-first | createUser/banUser/unbanUser/revokeSessions each start with `requireCan(...)` |
| callbackURL same-origin only | Rejects absolute + protocol-relative URLs (T-02-08) |
| drizzle-orm version | `^0.45.2` (NOT bumped — R5 gate holds) |

### AUTH requirement coverage
- **AUTH-02** (signin working; accounts created by admin) — SignInForm wired; createFirstAdmin bootstrap proven; setup self-disables ✓
- **D-08** (self-disable HARD security) — "createFirstAdmin blocked" test green (security-critical) ✓
- **D-18** (remember-me) — checkbox checked/unchecked asserts on spy arg ✓
- **D-19** (deep-link callbackURL) — next param + /dashboard fallback asserts on spy arg ✓

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] vi.mock factory hoisting — top-level variable references fail in Vitest 4**
- **Found during:** Task 1 RED phase
- **Issue:** Declaring mock spies as `const createUserMock = vi.fn()` then referencing them inside `vi.mock()` factory fails: `ReferenceError: Cannot access 'createUserMock' before initialization`. Vitest hoists `vi.mock()` calls above all top-level declarations.
- **Fix:** Used `vi.hoisted()` to declare the mock spies in a hoisted scope, making them available to the hoisted factory functions.
- **Files modified:** `src/actions/__tests__/users.test.ts`
- **Commit:** dcc5421

**2. [Rule 1 - Bug] Better Auth admin plugin endpoint types surface flat, not nested under `auth.api.admin`**
- **Found during:** Task 1 build
- **Issue:** TypeScript error: `Property 'admin' does not exist on type 'InferAPI<...>'`. Better Auth's plugin endpoint merge uses `UnionToIntersection` which flattens the admin plugin's endpoints (createUser, banUser, etc.) rather than nesting them under an `admin` namespace. The runtime DOES nest them under `auth.api.admin.*`, but the type system can't express the dynamic grouping.
- **Fix:** Added a typed `AdminApi` interface and a minimal cast: `const adminApi = (auth.api as unknown as { admin: AdminApi }).admin`. No `any` — the cast is to a specific typed shape. All action bodies reference `adminApi.*` instead of `auth.api.admin.*`.
- **Files modified:** `src/actions/users.ts`
- **Commit:** dcc5421

**3. [Rule 3 - Blocking] Next 16 cacheComponents disallows `export const dynamic = "force-dynamic"`**
- **Found during:** Task 1 build
- **Issue:** Build error: `Route segment config "dynamic" is not compatible with nextConfig.cacheComponents`. The signup page is a Server Component that reads live DB state (admin count), which Next 16 PPR detects as "uncached data accessed outside of Suspense".
- **Fix:** Restructured the page as `<Suspense fallback={null}><SetupGate/></Suspense>` where `SetupGate` is an async child that performs the count query + redirect. The static shell is prerendered; the dynamic count streams from the server. Result: `/signup` shows `◐ (Partial Prerender)` in the build output.
- **Files modified:** `src/app/(full-width-pages)/(auth)/signup/page.tsx`
- **Commit:** dcc5421

**4. [Rule 1 - Bug] TailAdmin InputField component doesn't accept autoComplete/required/minLength props**
- **Found during:** Task 1 build
- **Issue:** TypeScript error: `Property 'autoComplete' does not exist on type 'InputProps'`. The TailAdmin `Input` component's props interface is limited (type, id, name, placeholder, etc.) and doesn't include standard HTML input attributes.
- **Fix:** Removed `autoComplete`, `required`, and `minLength` props from the SignUpForm Input fields. Client-side validation is handled by the `setupAction` wrapper (checks for empty fields).
- **Files modified:** `src/components/auth/SignUpForm.tsx`
- **Commit:** dcc5421

**5. [Rule 3 - Blocking] jsdom rejects SVG data-URI Name production in icon components**
- **Found during:** Task 2 RED phase
- **Issue:** `InvalidCharacterError: "data:image/svg+xml,..." did not match the Name production`. jsdom's DOMParser rejects the `name` attribute derived from SVG data URIs used by the TailAdmin icon components (ChevronLeftIcon, EyeIcon, EyeCloseIcon).
- **Fix:** Mocked `@/icons` in the test file with inert stub components (`() => null`) so the component tree renders without triggering jsdom's Name validation.
- **Files modified:** `src/components/auth/__tests__/SignInForm.test.tsx`
- **Commit:** b5819fd

**6. [Rule 3 - Blocking] useSearchParams returns null in jsdom without Next.js runtime**
- **Found during:** Task 2 GREEN phase
- **Issue:** `TypeError: Cannot read properties of null (reading 'get')`. The `useSearchParams()` hook from `next/navigation` returns `null` when rendered outside a Next.js server runtime (i.e., in a vitest jsdom environment).
- **Fix:** Mocked `next/navigation` to provide a `useSearchParams` stub controlled by `searchParamsMock` (a `vi.fn()` returning a `URLSearchParams` object set per-test via `setNextParam`).
- **Files modified:** `src/components/auth/__tests__/SignInForm.test.tsx`
- **Commit:** b5819fd

**7. [Rule 1 - Bug] Missing DOM cleanup between component tests caused state leakage**
- **Found during:** Task 2 GREEN phase
- **Issue:** The "unchecked rememberMe" test received `rememberMe: true` and the "no next param" test received `callbackURL: "/dashboard"` even with the next param set. Root cause: `@testing-library/react` doesn't auto-cleanup the DOM between tests in vitest without explicit configuration.
- **Fix:** Added `afterEach(() => cleanup())` to both describe blocks and imported `cleanup` from `@testing-library/react`.
- **Files modified:** `src/components/auth/__tests__/SignInForm.test.tsx`
- **Commit:** b5819fd

## Known Stubs

None. All actions have functional bodies. The form wiring is complete. No placeholder data or TODO markers remain in the shipped code.

## Self-Check: PASSED

### Created files exist
- FOUND: src/lib/auth/client.ts
- FOUND: src/actions/users.ts
- FOUND: src/actions/__tests__/users.test.ts
- FOUND: src/components/auth/__tests__/SignInForm.test.tsx

### Modified files exist
- FOUND: src/app/(full-width-pages)/(auth)/signup/page.tsx (repurposed)
- FOUND: src/components/auth/SignUpForm.tsx (rebound)
- FOUND: src/components/auth/SignInForm.tsx (wired)

### Commits exist
- FOUND: dcc5421 (Task 1)
- FOUND: b5819fd (Task 2)

### Acceptance gates
- FOUND: pnpm test → 35 passed (6 files)
- FOUND: pnpm build → succeeded
- FOUND: D-08 count-before-createUser ordering — count at line 67, createUser at line 80
- FOUND: createUser/banUser/unbanUser/revokeSessions each start with requireCan
- FOUND: "createFirstAdmin blocked" test green (D-08 security-critical)
- FOUND: SignInForm rememberMe + callbackURL tests green (D-18/D-19)
