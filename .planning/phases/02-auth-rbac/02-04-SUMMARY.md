---
phase: 02-auth-rbac
plan: 04
subsystem: auth
tags: [auth, password-reset, gap-closure, AUTH-06, ui]
requires:
  - "02-02 (Better Auth client + signin/signup forms — sibling form pattern, proxy.ts, authClient export)"
  - "02-03 (sendResetPassword email hook wired at src/lib/auth/index.ts:55)"
provides:
  - "/forgot-password page + ForgotPasswordForm (triggers sendResetPassword via authClient.requestPasswordReset)"
  - "/reset-password page + ResetPasswordForm (completes reset via authClient.resetPassword, reads token from URL)"
  - "Fixed SignInForm 'Forgot password?' link (was 404 → now /forgot-password)"
  - "proxy.ts gates /forgot-password (logged-in bounce); /reset-password left public (token-gated)"
affects:
  - "src/components/auth/SignInForm.tsx (Forgot password? link href fixed)"
  - "proxy.ts (isAuthPage + matcher updated)"
tech-stack:
  added: []
  patterns:
    - "vi.hoisted + vi.mock spy pattern for authClient (mirrors SignInForm.test.tsx)"
    - "useSearchParams token extraction + Suspense boundary (Next 16 PPR requirement)"
    - "Email-enumeration protection (T-02-04): always show generic 'check your email' regardless of API result"
    - "Non-null assertion on narrowed const inside hoisted function declaration (TS control-flow limitation)"
key-files:
  created:
    - "src/components/auth/ForgotPasswordForm.tsx"
    - "src/app/(full-width-pages)/(auth)/forgot-password/page.tsx"
    - "src/components/auth/__tests__/ForgotPasswordForm.test.tsx"
    - "src/components/auth/ResetPasswordForm.tsx"
    - "src/app/(full-width-pages)/(auth)/reset-password/page.tsx"
    - "src/components/auth/__tests__/ResetPasswordForm.test.tsx"
  modified:
    - "src/components/auth/SignInForm.tsx"
    - "proxy.ts"
decisions:
  - "D-02-04-1: /reset-password intentionally NOT added to proxy isAuthPage or matcher — reached via email link by a logged-out user carrying a token; token is the authorization (validated server-side by Better Auth). Adding it would break the flow for users with stale session cookies."
  - "D-02-04-2: ForgotPasswordForm shows identical 'check your email' confirmation for both success and error responses (T-02-04 email-enumeration protection — never reveals whether the email exists)."
metrics:
  duration: "~9 min"
  completed: "2026-07-03"
  tasks: 2
  files-created: 6
  files-modified: 2
  tests-added: 8
status: complete
---

# Phase 2 Plan 4: Forgot/Reset Password UI Summary

Built the missing /forgot-password and /reset-password pages that close the AUTH-06 UI gap — the sendResetPassword server hook was already wired (02-03) but had no UI trigger, and the SignInForm "Forgot password?" link pointed to a 404. Both forms are now wired to the Better Auth client with verified method signatures (`requestPasswordReset` / `resetPassword`), with email-enumeration protection and token validation.

## What Was Built

### Task 1: /forgot-password page + form + SignInForm fix + proxy update (commit 352d9f9)

**ForgotPasswordForm** (`src/components/auth/ForgotPasswordForm.tsx`):
- Single email field that calls `authClient.requestPasswordReset({ email, redirectTo: "/reset-password" })` on submit
- **T-02-04 email-enumeration protection:** regardless of success or error, shows the same generic "Check your email. If an account exists for that address, a password reset link is on its way." confirmation — never reveals whether the email exists
- Submit button disabled with "Sending…" label while request is in flight
- No Suspense boundary (does not use `useSearchParams` — no PPR requirement)

**forgot-password/page.tsx:** Thin Server Component delegation with metadata export.

**SignInForm fix:** Changed the "Forgot password?" link `href` from `/reset-password` (404) to `/forgot-password`.

**proxy.ts update:**
- Added `/forgot-password` to `isAuthPage` check (logged-in users bounce to /dashboard per D-20)
- Added `/forgot-password` to the matcher array
- Intentionally did NOT add `/reset-password` — it is reached via email link by a logged-out user carrying a token; the token is the authorization (validated server-side). Documented this design justification in a code comment.

### Task 2: /reset-password page + form (commit a61326f)

**ResetPasswordForm** (`src/components/auth/ResetPasswordForm.tsx`):
- Reads `token` from `useSearchParams().get("token")` — the token arrives via Better Auth's GET `/reset-password/:token` callback which redirects to `/reset-password?token=xxx`
- If no token in URL: shows "Invalid reset link — request a new one." error immediately, does NOT call `resetPassword`
- Password input with show/hide toggle (mirrors SignInForm pattern)
- On submit: calls `authClient.resetPassword({ newPassword, token })`, on success → `router.push("/signin")`, on error → displays the error message and does NOT redirect
- Wrapped in `<Suspense>` (useSearchParams requires it in Next 16)

**reset-password/page.tsx:** Thin Server Component delegation with metadata export.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Test used jest-dom matchers not configured in the project**
- **Found during:** Task 1, GREEN phase
- **Issue:** ForgotPasswordForm.test.tsx initially used `toBeInTheDocument()` and `toBeDisabled()` — these are `@testing-library/jest-dom` matchers. The project's existing tests (SignInForm.test.tsx) only use Vitest's built-in matchers; jest-dom is not set up in the vitest config.
- **Fix:** Replaced `toBeInTheDocument()` with `.toBeTruthy()` (getByText already throws if not found), replaced `toBeDisabled()` with `(button as HTMLButtonElement).disabled` boolean check, and replaced `not.toBeInTheDocument()` with `.toBeNull()`.
- **Files modified:** `src/components/auth/__tests__/ForgotPasswordForm.test.tsx`
- **Commit:** 352d9f9 (same commit — fixed before Task 1 was committed)

**2. [Rule 1 - Bug] TypeScript narrowing did not carry into hoisted function declaration**
- **Found during:** Task 2, build verification
- **Issue:** `token` (type `string | null` from `useSearchParams().get("token")`) is narrowed to `string` after the `if (!token) return` early guard. But `handleSubmit` is a function declaration (hoisted), so TypeScript conservatively widens `token` back to `string | null` inside the closure — failing type check against Better Auth's `resetPassword({ token?: string })` signature.
- **Fix:** Added non-null assertion `token!` at the `authClient.resetPassword` call site, with a comment explaining the early-return guarantees safety. Runtime behavior is unchanged.
- **Files modified:** `src/components/auth/ResetPasswordForm.tsx`
- **Commit:** a61326f (same commit — fixed before Task 2 was committed)

## Tests

- **ForgotPasswordForm.test.tsx:** 4 cases — (1) spy called once with `{ email, redirectTo: "/reset-password" }`, (2) success shows "check your email" message, (3) T-02-04 error response still shows same message (no `role="alert"`), (4) loading state button disabled with "Sending…" label
- **ResetPasswordForm.test.tsx:** 4 cases — (1) spy called once with `{ newPassword, token }` + push to /signin, (2) redirect on success, (3) T-02-10 error shows alert + no redirect, (4) missing-token guard shows error + spy never called
- **Full suite:** 61 tests across 11 files (53 existing + 8 new), all green
- **Build:** Both `/forgot-password` and `/reset-password` compile as static routes

## TDD Gate Compliance

Both tasks followed the RED → GREEN cycle:
- **Task 1 (352d9f9):** RED — test failed on missing import (component didn't exist). GREEN — implemented ForgotPasswordForm + page + fixes, all 4 tests pass.
- **Task 2 (a61326f):** RED — test failed on missing import (component didn't exist). GREEN — implemented ResetPasswordForm + page, all 4 tests pass.

Both `feat(...)` commits exist (GREEN gate satisfied). Test commits were folded into the same task commit since RED and GREEN were executed within a single task (the plan's `<action>` steps combine write-test-then-implement in each task).

## Threat Model Compliance

All threats from the plan's threat register are mitigated:
- **T-02-04 (email enumeration):** ForgotPasswordForm always shows generic "check your email" regardless of result ✓
- **T-02-10 (token tampering):** token validated server-side by Better Auth; form shows error on rejection; missing-token guard ✓
- **T-02-11 (open redirect):** redirectTo hardcoded to "/reset-password" — never user-controlled ✓
- **T-02-SC (npm installs):** no new packages introduced ✓

No new threat surface beyond the plan's model.

## Self-Check: PASSED

All claimed files verified to exist and all commits verified in git log:
- `src/components/auth/ForgotPasswordForm.tsx` — FOUND
- `src/app/(full-width-pages)/(auth)/forgot-password/page.tsx` — FOUND
- `src/components/auth/__tests__/ForgotPasswordForm.test.tsx` — FOUND
- `src/components/auth/ResetPasswordForm.tsx` — FOUND
- `src/app/(full-width-pages)/(auth)/reset-password/page.tsx` — FOUND
- `src/components/auth/__tests__/ResetPasswordForm.test.tsx` — FOUND
- Commit `352d9f9` (Task 1) — FOUND
- Commit `a61326f` (Task 2) — FOUND
