# Deferred Items — Phase 05

Out-of-scope discoveries logged during plan execution (not fixed, per the
executor scope boundary — only issues directly caused by the current task's
changes are auto-fixed).

## 2026-08-25 — Plan 05-05 (editor surface rebuild)

### Pre-existing `tsc --noEmit` errors (12) unrelated to the editor work

Found while running the Task 2 verify command (`pnpm exec tsc --noEmit`).
All 12 errors are in files untouched by plan 05-05 (verified:
`git diff f496b59 --stat` touches only package.json, pnpm-lock.yaml, and
src/components/editor/** files; none of the erroring files import editor code):

| File | Errors | Kind |
|------|--------|------|
| src/actions/__tests__/storage-settings.test.ts (L318-322) | 4 | TS18048 possibly-undefined |
| src/components/auth/ResetPasswordForm.tsx (L138,140) | 2 | TS2322 className not assignable to IntrinsicAttributes |
| src/components/auth/SignInForm.tsx (L115,117) | 2 | TS2322 same |
| src/components/auth/SignUpForm.tsx (L132,134) | 2 | TS2322 same |
| src/components/form/date-picker.tsx (L55) | 1 | TS2322 same |
| src/layout/AppSidebar.tsx (L217) | 1 | TS2322 same |

The `className`/IntrinsicAttributes errors look like a Tailwind v4 / @types
interaction on inherited TailAdmin components. `pnpm build` (Next 16) has
historically exited 0 with these present (all prior phases built), so they do
not gate the build — but they pollute `tsc --noEmit`. Suggest a `/gsd-quick`
or `/gsd-debug` pass to either fix the prop types or add a targeted tsconfig
exclusion for the demo-era TailAdmin files.
