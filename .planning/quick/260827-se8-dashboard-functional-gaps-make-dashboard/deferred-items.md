# Deferred Items — 260827-se8 (dashboard functional gaps)

Logged during execution. Out-of-scope pre-existing issues — do NOT fix inside this task's scope.

## Pre-existing TypeScript errors (baseline: 8)

`pnpm exec tsc --noEmit` reports 8 errors, ALL in TailAdmin scaffold components,
ALL predating 260827-se8 (verified identical before and after the task):

| File | Line | Error |
|------|------|-------|
| src/components/auth/ResetPasswordForm.tsx | 138, 140 | TS2322 className on IntrinsicAttributes |
| src/components/auth/SignInForm.tsx | 115, 117 | TS2322 className on IntrinsicAttributes |
| src/components/auth/SignUpForm.tsx | 132, 134 | TS2322 className on IntrinsicAttributes |
| src/components/form/date-picker.tsx | 55 | TS2322 className on IntrinsicAttributes |
| src/layout/AppSidebar.tsx | 222 | TS2322 className on IntrinsicAttributes |

Pattern: a shared UI element (likely `Input`/`Select` in `components/form/` or
`components/ui/`) does not accept/forward `className`, while the TailAdmin demo
consumers pass one. A one-line prop-forwarding fix in the shared element would
clear all 8 — left for a dedicated scaffold-cleanup pass.

## Observations (no action)

- The posts LIST page does NOT author-scope for the `author` role (existing
  dashboard behavior, documented as an intentional asymmetry in
  src/actions/search.ts — globalSearch is the stricter direction).
- Tailwind canonical-class lint suggestions (px-[7px] → px-1.75 etc.) appear in
  header components where TailAdmin markup was intentionally copied verbatim.
