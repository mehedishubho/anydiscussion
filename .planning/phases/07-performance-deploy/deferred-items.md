# Phase 7 — Deferred Items (out-of-scope discoveries)

Executor: 07-06 (2026-08-26). Items found during execution that are OUT OF SCOPE for the
current plan's changes (pre-existing, unrelated files) per the executor SCOPE BOUNDARY.
Do NOT fix inside a task commit; log here for a later plan.

## 1. Pre-existing TypeScript errors in auth-form / TailAdmin components

- **Found during:** 07-06 Task 3 full-suite verification (`tsc` run alongside vitest).
- **Issue:** `tsc` reports "Property 'className' does not exist on type
  'IntrinsicAttributes'" style errors in five files UNRELATED to 07-06's changed files:
  - `src/components/auth/ResetPasswordForm.tsx`
  - `src/components/auth/SignInForm.tsx`
  - `src/components/auth/SignUpForm.tsx`
  - `src/components/form/date-picker.tsx`
  - `src/components/layout/AppSidebar.tsx`
- **Impact:** type-check noise only; `pnpm build` (Turbopack) and the full vitest suite
  (639/639 at 07-06 completion) pass. Zero errors in any file touched by 07-06
  (`src/actions/{contact,newsletter,pages,pages-schema}.ts`,
  `src/lib/{rate-limit,auth}/...`, `scripts/test-auth-ratelimit.mjs`).
- **Not fixed because:** pre-existing before 07-06's changes; fixing them inside a
  07-06 task commit would violate the scope boundary (unrelated files).
- **Suggested owner:** a small cleanup plan (likely a shared props-type fix in the
  TailAdmin form components).
