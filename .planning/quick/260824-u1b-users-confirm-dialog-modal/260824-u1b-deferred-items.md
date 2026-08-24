# Deferred Items — quick task 260824-u1b

Out-of-scope discoveries logged during execution (per executor scope boundary — not fixed here).

## Pre-existing eslint errors in google-drive.test.ts (found 2026-08-24)

- **File:** `src/lib/backup/__tests__/google-drive.test.ts` lines 63, 75
- **Errors:** `prefer-rest-params` — "Use the rest parameters instead of 'arguments'" (2 total)
- **Evidence pre-existing:** the offending `...arguments` spread usage is present verbatim at base commit `ef79626` (`git show HEAD:src/lib/backup/__tests__/google-drive.test.ts` lines 63/75) — this task touched only `ConfirmDialog.tsx` + `UsersTable.tsx`, and a targeted `pnpm exec eslint` on those two files exits 0.
- **Why not fixed:** unrelated backup test file; touching it is outside this task's scope (users confirm-dialog UI swap). Note `pnpm lint` therefore exits 1 repo-wide.
- **Suggested fix for a future quick task:** replace `(...arguments)` with rest params, e.g. `const OAuth2 = vi.fn((...args: unknown[]) => { oauth2CtorMock(...args); return oauth2Instance; })`.

## Pre-existing eslint warnings (same run, all in untouched files)

- `src/actions/backup-settings.ts:149` — `_creds` defined but never used
- `src/app/(admin)/dashboard/settings/backup/BackupSettingsForm.tsx:198` — unused eslint-disable directive
- `src/app/(admin)/dashboard/subscribers/SubscribersTable.tsx:21` — `listSubscribers` defined but never used
- `src/lib/backup/job.ts:34` — `BACKUP_KEY_RE` assigned but never used

## Pre-existing tsc errors (unchanged from 260824-qtu deferred-items)

- `src/actions/__tests__/storage-settings.test.ts` lines 318/319/321/322 — TS18048 possibly-undefined; identical set to the main checkout; this task introduced zero new type errors.
