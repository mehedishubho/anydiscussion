# Deferred Items — Phase 02

## 02-06: Pre-existing tsc --noEmit errors (out of scope)

Found during Task 1 GREEN verification. Confirmed pre-existing: 20 error lines
at base commit f93e44b with the plan's files reverted, identical 20 with the
plan's changes applied. None touch this plan's four files.

- `src/components/auth/SignInForm.tsx:117` — TS2322 className not assignable to IntrinsicAttributes (icon component)
- `src/components/auth/SignUpForm.tsx:132,134` — TS2322 same class
- `src/components/form/date-picker.tsx:55` — TS2322 same class
- `src/layout/AppSidebar.tsx:217` — TS2322 same class
- `src/actions/__tests__/storage-settings.test.ts:318,319,321,322` — TS18048 possibly-undefined access
- (remaining lines of the 20 are additional instances of the same two classes)

Likely cause of the TS2322 class: TailAdmin icon components typed without
accepting `className`. Not caused by or related to plan 02-06; left untouched
per the scope boundary rule.
