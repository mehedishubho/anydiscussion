# Deferred Items — quick task 260824-ptx

Out-of-scope discoveries logged during execution (scope-boundary rule). Not fixed here.

## Pre-existing `tsc --noEmit` errors (12 errors, all on base commit 4fb4825)

Found during Task 2 verification. The branch touches only the four planned files
(`git diff --name-only 4fb4825..HEAD` confirms), so these all pre-date this task:

| File | Error |
|------|-------|
| src/actions/__tests__/storage-settings.test.ts:318,319,321,322 | TS18048 `result.cloudinary` / `result.r2` possibly undefined (4×) |
| src/components/auth/ResetPasswordForm.tsx:138,140 | TS2322 `className` not assignable to IntrinsicAttributes (2×) |
| src/components/auth/SignInForm.tsx:115,117 | TS2322 `className` not assignable to IntrinsicAttributes (2×) |
| src/components/auth/SignUpForm.tsx:132,134 | TS2322 `className` not assignable to IntrinsicAttributes (2×) |
| src/components/form/date-picker.tsx:55 | TS2322 `className` not assignable to IntrinsicAttributes |
| src/layout/AppSidebar.tsx:217 | TS2322 `className` not assignable to IntrinsicAttributes |

The TS2322 cluster looks like a shared icon/input component whose props type lost
`className` (TailAdmin kit). The TS18048 cluster is missing non-null assertions in a
test file. Both worth a dedicated cleanup pass — NOT mixed into this task.

## Pre-existing `pnpm lint` failures (2 errors, 4 warnings)

| File | Severity | Rule |
|------|----------|------|
| src/lib/backup/__tests__/google-drive.test.ts:63,75 | error | prefer-rest-params (2×) |
| src/actions/backup-settings.ts:149 | warning | no-unused-vars `_creds` |
| src/app/(admin)/dashboard/settings/backup/BackupSettingsForm.tsx:198 | warning | unused eslint-disable directive |
| src/app/(admin)/dashboard/subscribers/SubscribersTable.tsx:21 | warning | no-unused-vars `listSubscribers` |
| src/lib/backup/job.ts:34 | warning | no-unused-vars `BACKUP_KEY_RE` |

All in Phase 8 backup / newsletter subscriber files — untouched by this task.

## Verification status of THIS task's files

- `pnpm exec tsc --noEmit` — zero errors in the four touched files (grep-filtered)
- `pnpm lint` — zero problems in the four touched files
- `pnpm test` — 567/567 green (full suite)
