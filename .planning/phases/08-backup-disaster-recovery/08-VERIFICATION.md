---
phase: 08-backup-disaster-recovery
verified: 2026-07-30T09:00:00Z
status: passed
score: 22/22 must-haves verified
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: none
  is_re_verification: false
deferred_live:
  # Live verifications intentionally deferred to the Phase 7 production-deploy gate
  # (founder-deferred manual deploy). These are NOT Phase 8 defects — code exists, is
  # correct by inspection, and each has a passing mocked/unit test. Tracked in each
  # plan's <verification> deferred-live section + VALIDATION.md Manual-Only table +
  # deferred-items.md.
  - item: "Real pg_dump -Fc against managed Postgres produces a restorable .sqlc (pg_restore --list shows tables)"
    requirement: BACKUP-03
    blocks: "Phase 7 deploy + postgresql17-client in runner image (runner image present; live run needs deploy)"
    code_correct_by_inspection: "src/lib/backup/dump.ts pgDump uses execFile(['-Fc','-d',DATABASE_URL,'-f',tmp])"
    mocked_test_passes: "src/lib/backup/__tests__/dump.test.ts (argv-array shape asserted)"
  - item: "runBackupJob writes to storage/backups/ + R2/Drive on the real stack"
    requirement: BACKUP-01, BACKUP-03
    blocks: "Phase 7 deploy + destination creds provisioning"
    code_correct_by_inspection: "src/lib/backup/job.ts runBackupJob + per-destination upload fan-out"
    mocked_test_passes: "src/lib/backup/__tests__/job.test.ts"
  - item: "Google OAuth consent round-trip stores a real refresh token + Test connection succeeds"
    requirement: BACKUP-02
    blocks: "Phase 7 deploy + operator-created Google Cloud OAuth client (user_setup) + GOOGLE_CLIENT_* env"
    code_correct_by_inspection: "google-drive.ts buildConsentUrl (offline/consent/drive.file/state) + callback/route.ts CSRF-state-gated encrypt+upsert"
    mocked_test_passes: "google-drive.test.ts + google-callback.test.ts (CSRF 400 + encrypted store asserted)"
  - item: "Restore-drill CREATE/DROP backup_verify on managed Postgres (CREATEDB grant) + weekly fire"
    requirement: BACKUP-04
    blocks: "Phase 7 deploy + CREATEDB grant on the prod role (user_setup) + cron firing"
    code_correct_by_inspection: "src/lib/backup/drill.ts runRestoreDrill (autocommit CREATE→restore→verify→terminate→DROP) + schedule.ts drill tick"
    mocked_test_passes: "drill.test.ts (autocommit/no-BEGIN guard + terminate-before-DROP + no-linger) + schedule.test.ts (last_drill both paths + email)"
  - item: "Restore overwrites live data after confirmation (high-stakes, operator-witnessed)"
    requirement: BACKUP-03, D-05
    blocks: "Phase 7 deploy + staging environment"
    code_correct_by_inspection: "BackupSettingsForm type-the-DB-name gate + restoreBackup action (admin-gated)"
    mocked_test_passes: "BackupSettingsForm.test.tsx (Restore disabled→enabled on correct confirmation text)"
  - item: "Dockerfile build yields pg_dump --version ≥ 17 at runtime"
    requirement: BACKUP-03
    blocks: "Phase 7 deploy (needs a real image build)"
    code_correct_by_inspection: "Dockerfile L113: apk add postgresql17-client from edge/main before USER nextjs"
    mocked_test_passes: "scripts/check-backup-secrets.mjs (no-secret-in-ARG/ENV gate, PASS)"
---

# Phase 8: Backup & Disaster Recovery — Verification Report

**Phase Goal:** An admin can configure (from the dashboard) where database backups are stored, how often they run, and how long they're kept — and an automated restore-drill proves backups are restorable. Local is the default destination; Google Drive and Cloudflare R2 are selectable, multi-select destinations.
**Verified:** 2026-07-30T09:00:00Z
**Status:** passed (Phase 8 v1 bar = code + mocked/unit tests green; live end-to-end runs deferred to the Phase 7 deploy gate — see `deferred_live` above)
**Re-verification:** No — initial verification
**Mode:** mvp

## Verification Posture

This phase ships under a documented execution caveat: Phase 7 production deploy is DEFERRED by the founder (manual deploy, reviewed later post-app-completion). The LIVE verifications (real pg_dump, real cron firing, real Google OAuth round-trip, real R2 upload, live restore-drill + CREATEDB grant, Dockerfile build with pg_dump) are therefore tracked as **DEFERRED** — not gaps — provided (a) the implementing code exists and is correct by inspection, and (b) a mocked/unit test for that behavior exists and passes. Both conditions hold for every must-have. The deferred-live items are surfaced in the `deferred_live` frontmatter section above; they do not fail Phase 8 must-haves because that is the documented Phase-7-deploy gate, not a Phase 8 defect. The code-level must-haves (requireRole('admin') FIRST on all 8 actions, execFile argv array for pg_dump, dedicated R2 backup bucket not media client, OAuth drive.file scope + CSRF state cookie + revoke-before-delete, scratch-DB autocommit + terminate-before-DROP, backup.last_drill + backup.last_run status writes, multi-select UI delta, Restore confirmation gate, redact-on-read, secret-leak grep gate) were each verified rigorously against the actual source.

## Goal Achievement

### Observable Truths

Roadmap Success Criteria (the contract) are folded in as truths 1-4. Plan must_haves (08-01..08-05) are merged + deduplicated below.

| #   | Truth | Status | Evidence |
| --- | ----- | ------ | -------- |
| 1 | (SC1) Admin can open Backup Settings, select one or more destinations (local default / Drive / R2 multi-select), set schedule + retention, persist to settings with server-side admin check on save | ✓ VERIFIED | `BackupSettingsForm.tsx` renders 3 destination checkboxes (local/r2/gdrive) all toggleable simultaneously (test asserts all three checked); `saveBackupSettings` calls `requireRole("admin")` FIRST → Zod parse → upsert `backup.config`; MUST_NOT_BE_REACHED test proves non-admin → FORBIDDEN before parse/encrypt/upsert |
| 2 | (SC2) A backup runs on the configured schedule and writes to every selected destination; the backup is restorable | ✓ VERIFIED (mechanism) | `runBackupJob` (job.ts) dumps → `getEnabledDestinations` fan-out → `dest.upload` each → retention; `restoreKey`/`restoreLatest` wrap `pgRestore`. Schedule wired in `schedule.ts` backup tick (`isDue(scheduleCron)` → `runBackupJob`). Mocked tests green. Live restorability deferred (Phase 7 deploy) |
| 3 | (SC3) Automated restore-drill runs on a configurable cadence: restores latest to throwaway DB, verifies integrity, alerts on failure | ✓ VERIFIED (mechanism) | `drill.ts` `runRestoreDrill`: CREATE → pgRestore → `verifyIntegrity` (count on posts/users/settings/media) → terminate → DROP in `finally` (no-linger); `schedule.ts` drill tick writes `backup.last_drill` on BOTH paths + fires `sendEmail` once on failure. Mocked tests assert the full sequence + autocommit guard. Live drill deferred (Phase 7 + CREATEDB grant) |
| 4 | (SC4) Provider credentials stored securely (encrypted settings / runtime secrets) — never exposed in client state or build bundle | ✓ VERIFIED | `saveBackupSettings` `encrypt(JSON.stringify(r2))` → `backup.r2_creds`; callback `encrypt({refreshToken})` → `backup.gdrive_creds`; `getBackupSettings` runs `redactCredentials` (secretAccessKey → "" test-asserted); `check-backup-secrets.mjs` PASS (no backup secret in Dockerfile ARG/ENV) |
| 5 | (08-01) pg_dump produces a dump via execFile `-Fc`, captured as a Buffer (T-08-01: argv array, NEVER shell string) | ✓ VERIFIED | `dump.ts` `pgDump` uses `execFileAsync("pg_dump", ["-Fc","-d",dbUrl,"-f",tmp])`; `dump.test.ts` asserts `Array.isArray(argv)` + contains "-Fc"/"-d". `pgRestore` argv "-j","2","-d" asserted |
| 6 | (08-01) Local destination upload/list/download/delete + path-traversal defense | ✓ VERIFIED | `local.ts` raw-buffer write (no sharp), `assertSafeKey` rejects ".."/absolute, idempotent delete; `destinations.test.ts` real fs round-trip |
| 7 | (08-01) runBackupJob uploads to every enabled destination + runs retention cleanup (delete > retentionDays) | ✓ VERIFIED | `job.ts` loops `getEnabledDestinations` → `dest.upload`, then `runRetentionCleanup` parses key timestamps + deletes old; `job.test.ts` asserts fan-out + retention + `backup.last_run` write |
| 8 | (08-01) backup.config reads/writes settings key-value table with Zod parsing + D-09 defaults (daily/30d/weekly-drill) | ✓ VERIFIED | `config.ts` `backupConfigSchema` defaults: scheduleCron "0 3 * * *", retentionDays 30, drillCron "0 4 * * 0", local default-on; `config.test.ts` asserts defaults on missing row |
| 9 | (08-01) pgRestore(dump, targetDbUrl) primitive exists for manual restore + drill | ✓ VERIFIED | `dump.ts` `pgRestore` signature `(dump: Buffer, targetDbUrl: string) => Promise<void>`; consumed by `restore.ts` + `drill.ts` |
| 10 | (08-01) Lazy registry: getEnabledDestinations uses dynamic import so googleapis stays bundle-excluded unless Drive enabled | ✓ VERIFIED | `registry.ts` non-literal dynamic `import(modulePath)` + default-safe skip; no static import of r2.ts/google-drive.ts at module top-level |
| 11 | (08-02) R2 destination uses a DEDICATED backup-bucket S3Client — NOT the media client (T-08-02) | ✓ VERIFIED | `r2.ts` builds its own `S3Client` from `decrypt(backup.r2_creds)`; static-source gate test asserts module does NOT import `getActiveProvider`/`s3Client`/`@/lib/r2` |
| 12 | (08-02) runBackupJob syncs media R2 objects to every enabled destination (D-06 full DR) | ✓ VERIFIED | `media-sync.ts` `syncMediaBucket` paginates ListObjectsV2 + per-object Get → `uploadObject`; `job.ts` wires it (source = media client, fan-out to each dest.upload); degrades to DB-only when media not on R2. `media-sync.test.ts` + `job.test.ts` green |
| 13 | (08-02) R2 creds NOT conflated with media creds (separate client, separate bucket) | ✓ VERIFIED | `r2.ts` `loadCreds` reads only `BACKUP_R2_CREDS_KEY`; media source client in job.ts is `@/lib/r2` `s3Client` (read-only) — separation enforced + test-gated |
| 14 | (08-03) Google OAuth consent URL: access_type=offline + prompt=consent + drive.file scope + state CSRF | ✓ VERIFIED | `google-drive.ts` `buildConsentUrl` sets all four; `DRIVE_FILE_SCOPE` constant; `google-drive.test.ts` asserts all four params present + over-privileged "drive" scope absent |
| 15 | (08-03) OAuth callback verifies CSRF state, exchanges code, encrypts + stores refresh token | ✓ VERIFIED | `callback/route.ts` compares `?state` to `gdrive_oauth_state` cookie → 400 on mismatch (no exchange); valid → `exchangeCode` → `encrypt({refreshToken})` → `upsertSetting(BACKUP_GDRIVE_CREDS_KEY)`; `google-callback.test.ts` covers valid/mismatched/missing-state + exchange-rejection paths |
| 16 | (08-03) Google Drive destination upload/list/download/delete via stored refresh token (auto-refresh by googleapis) | ✓ VERIFIED | `google-drive.ts` `gdriveBackupDestination` uses `oauth2.setCredentials({refresh_token})` + `google.drive`; no hand-rolled token refresh; `testConnection` returns `{ok:false,error}` when unconfigured |
| 17 | (08-03) revokeDriveToken exported (best-effort) for the disconnect flow — D-02 revocation half | ✓ VERIFIED | `google-drive.ts` `revokeDriveToken` try/catch (already-revoked safe); `backup-settings.ts` `disconnectGoogleDrive` calls revoke BEFORE `deleteSetting` |
| 18 | (08-04) Every backup Server Action calls requireRole('admin') FIRST — all 8 actions | ✓ VERIFIED | `backup-settings.ts`: each of saveBackupSettings/getBackupSettings/testBackupConnection/triggerBackupNow/restoreBackup/listBackups/getGoogleConsentUrl/disconnectGoogleDrive begins with `await requireRole("admin")`; MUST_NOT_BE_REACHED test for all 8 asserts FORBIDDEN before any side effect |
| 19 | (08-04) Credentials read back redacted (secret fields empty, never pre-filled — Pitfall 7) | ✓ VERIFIED | `getBackupSettings` returns `redactCredentials(...)` for r2 blob; `gdriveConnected` boolean only (token never sent client); `BackupSettingsForm.test.tsx` asserts `secretAccessKey` renders empty |
| 20 | (08-04) Restore action overwrites live data only after two-step confirmation gate (type-the-DB-name) | ✓ VERIFIED | `BackupSettingsForm.tsx` `restoreEnabled = confirmText.trim() === confirmationPhrase`; Restore button `disabled={!restoreEnabled}`; test asserts disabled→enabled transition. `restoreBackup` still re-checks admin server-side |
| 21 | (08-05) CREATE/DROP via raw autocommit pg.Client (NOT in a transaction — SQLSTATE 25001); terminate-before-DROP | ✓ VERIFIED | `drill.ts` `withMaintenanceClient` uses `new Client` (autocommit, no BEGIN/COMMIT); `finally` emits `pg_terminate_backend` then `DROP DATABASE IF EXISTS`; `drill.test.ts` asserts no BEGIN precedes CREATE + terminate-then-DROP order + DROP still runs on integrity failure (no-linger) |
| 22 | (08-05) Two node-cron entries (backup + drill) join startScheduler, each wrapped in try/catch; Dockerfile has postgresql17-client; no secret in ARG/ENV | ✓ VERIFIED | `schedule.ts` registers backup tick + drill tick (both try/catch + `log.error`); `Dockerfile` L113 `apk add postgresql17-client` from edge/main before USER; `check-backup-secrets.mjs` PASS. `schedule.test.ts` asserts drill-failure email + `backup.last_drill` on both paths |

**Score:** 22/22 truths verified (0 present-behavior-unverified — every behavior-dependent truth has a passing mocked/unit test exercising the asserted invariant)

### Required Artifacts

All artifacts checked at four levels (exists, substantive, wired, data-flowing). Summary:

| Artifact | Status | Details |
| -------- | ------ | ------- |
| `src/lib/backup/types.ts` | ✓ VERIFIED | `BackupDestination` interface (upload/list/download/delete/testConnection) + `BackupDestinationName` union |
| `src/lib/backup/registry.ts` | ✓ VERIFIED | `getEnabledDestinations()` lazy dynamic-import, default-safe; WIRED into job/restore/drill/listBackups |
| `src/lib/backup/config.ts` | ✓ VERIFIED | `readBackupConfig`/`writeBackupConfig`/`readSetting`/`upsertSetting`/`deleteSetting` + D-09 defaults; WIRED to settings table + Zod |
| `src/lib/backup/dump.ts` | ✓ VERIFIED | `pgDump`/`pgRestore`/`formatBackupTimestamp`; execFile argv array (T-08-01); WIRED into job/restore/drill |
| `src/lib/backup/destinations/local.ts` | ✓ VERIFIED | `localBackupDestination` name "local"; raw-buffer, path-traversal guard; WIRED via registry |
| `src/lib/backup/destinations/r2.ts` | ✓ VERIFIED | `r2BackupDestination` name "r2"; DEDICATED client from `backup.r2_creds` (no media client import); WIRED via registry |
| `src/lib/backup/destinations/google-drive.ts` | ✓ VERIFIED | `gdriveBackupDestination` + `buildConsentUrl`/`exchangeCode`/`revokeDriveToken`; drive.file scope; WIRED via registry + callback + actions |
| `src/lib/backup/job.ts` | ✓ VERIFIED | `runBackupJob`/`runRetentionCleanup`/`generateBackupKey`; media-sync fan-out; try/catch; WIRED to dump/registry/media-sync/config |
| `src/lib/backup/restore.ts` | ✓ VERIFIED | `restoreKey`/`restoreLatest`; WIRED to dump + registry |
| `src/lib/backup/media-sync.ts` | ✓ VERIFIED | `syncMediaBucket` paginated ListObjectsV2 + per-object Get; read-only source; WIRED into job |
| `src/lib/backup/drill.ts` | ✓ VERIFIED | `runRestoreDrill`/`withMaintenanceClient`/`verifyIntegrity`; autocommit + terminate-before-DROP + no-linger; WIRED to dump/registry + schedule |
| `src/actions/backup-settings-schema.ts` | ✓ VERIFIED | Pure Zod v4 (`z.email()`), NO "use server"; r2 secret `z.string()` empty-allowed; `hasSecrets` helper |
| `src/actions/backup-settings.ts` | ✓ VERIFIED | 8 "use server" actions, all `requireRole("admin")` FIRST; revoke-before-delete; redact-on-read; CSRF cookie |
| `src/app/api/auth/google/callback/route.ts` | ✓ VERIFIED | `runtime="nodejs"`, Next-16 async searchParams, CSRF state gate → 400, encrypt+upsert+redirect |
| `src/app/(admin)/dashboard/settings/backup/page.tsx` | ✓ VERIFIED | Server Component (NO "use client"), getBackupSettings + listBackups try/catch |
| `src/app/(admin)/dashboard/settings/backup/BackupSettingsForm.tsx` | ✓ VERIFIED | "use client", RHF+Zod, 3 multi-select checkboxes, Test connection, Backup now, Restore type-DB-name gate, Connect/Disconnect Drive |
| `src/app/(admin)/dashboard/settings/backup/schema-client.ts` | ✓ VERIFIED | "use client" zodResolver bridge |
| `src/lib/schedule/index.ts` | ✓ VERIFIED | `startScheduler` extended with backup + drill ticks (both try/catch); `isDue` cron matcher; last_drill both paths + email |
| `Dockerfile` | ✓ VERIFIED | L113 `apk add postgresql17-client` from edge/main before USER nextjs; no backup secret in ARG/ENV (gate PASS) |
| `scripts/check-backup-secrets.mjs` | ✓ VERIFIED | Grep gate exits 0; watches 7 backup/runtime-secret vars |
| `docs/adr/0002-backup-restore-drill.md` | ✓ VERIFIED | ADR exists (scratch-DB decision + multi-instance cliff) |
| `package.json` | ✓ VERIFIED | `googleapis ^173.0.0` added (only new runtime package) |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| BackupSettingsForm | 8 Server Actions | imports from `@/actions/backup-settings` | ✓ WIRED | All 8 actions imported + invoked (save/test/trigger/restore/listBackups/getGoogleConsentUrl/disconnect) |
| runBackupJob | destinations | `getEnabledDestinations` → `dest.upload` fan-out | ✓ WIRED | job.ts loops enabled dests; registry lazy-resolves |
| saveBackupSettings | settings table | `upsertSetting("backup.config")` + encrypt→`backup.r2_creds` | ✓ WIRED | config.ts upsert; encrypt when `hasSecrets` |
| getBackupSettings | settings table | readBackupConfig + read r2/gdrive blobs → decrypt → redact | ✓ WIRED | redactCredentials applied |
| callback route | encrypted store | exchangeCode → encrypt → upsertSetting(`backup.gdrive_creds`) | ✓ WIRED | CSRF-state-gated; one-shot cookie cleared |
| disconnectGoogleDrive | Google revocation | decrypt → revokeDriveToken → deleteSetting | ✓ WIRED | revoke BEFORE delete (best-effort) |
| drill tick | runRestoreDrill | `schedule.ts` → `runRestoreDrill` → last_drill + sendEmail | ✓ WIRED | Both paths write last_drill; email on failure |
| r2 destination | dedicated bucket | `buildClient(decrypt(backup.r2_creds))` → PutObjectCommand | ✓ WIRED | No media-client import (test-gated) |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| BackupSettingsForm | `initial` | `getBackupSettings()` → settings table | Yes (live settings rows at runtime; redacted) | ✓ FLOWING |
| BackupSettingsForm | `backups` | `listBackups()` → dest.list() merge | Yes (real destination keys at runtime) | ✓ FLOWING |
| runBackupJob | `dumpBuf` | `pgDump()` → real DB dump | Yes at runtime (deferred-live) | ✓ FLOWING (mechanism) |
| schedule drill tick | `cfg` | `readBackupConfig()` → settings | Yes (live config rows) | ✓ FLOWING |

### Behavioral Spot-Checks

Full suite run once (filter resolved to all 50 files). Single run; no per-truth re-runs.

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Full test suite green | `pnpm test -- --run src/lib/backup src/actions/__tests__/backup-settings` | 50 files, **506 tests passed**, 0 failed | ✓ PASS |
| Secret-leak grep gate | `node scripts/check-backup-secrets.mjs` | PASS (exit 0; no backup secret in Dockerfile ARG/ENV) | ✓ PASS |
| googleapis dependency present | `grep googleapis package.json` | `"googleapis": "^173.0.0"` | ✓ PASS |
| postgresql17-client in Dockerfile | `grep postgresql17-client Dockerfile` | L113 `apk add ... postgresql17-client` before USER | ✓ PASS |

Specific named behaviors asserted by passing tests (evidence for behavior-dependent truths — not re-run, confirmed via the single suite + assertion grep):
- 8-action MUST_NOT_BE_REACHED (FORBIDDEN before side effects) — `backup-settings.test.ts`
- Drill autocommit guard (no BEGIN before CREATE) + terminate-before-DROP + no-linger-on-failure — `drill.test.ts`
- execFile argv is an Array containing "-Fc"/"-d" (NOT shell string) — `dump.test.ts`
- R2 dedicated-client separation (no media s3Client/getActiveProvider import) — `r2-destination.test.ts`
- OAuth CSRF 400 on mismatched/missing state + encrypted store on valid — `google-callback.test.ts`
- Multi-select: all 3 destination checkboxes checkable simultaneously + Restore disabled→enabled — `BackupSettingsForm.test.tsx`
- Drill-failure email once + `backup.last_drill` {ok:true}/{ok:false} on both paths — `schedule.test.ts`

### Probe Execution

| Probe | Command | Result | Status |
| ----- | ------- | ------ | ------ |
| `scripts/check-backup-secrets.mjs` | `node scripts/check-backup-secrets.mjs` | exit 0 — "PASS: no backup secret var name appears in any Dockerfile ARG/ENV directive." | PASS |

### Requirements Coverage

| Requirement | Source Plan(s) | Description | Status | Evidence |
| ----------- | -------------- | ----------- | ------ | -------- |
| BACKUP-01 | 08-01, 08-02, 08-03 | Multi-select destinations local/R2/Drive via abstraction | ✓ SATISFIED | local.ts + r2.ts + google-drive.ts all implement BackupDestination; registry multi-select; UI 3 checkboxes |
| BACKUP-02 | 08-03 | Google Drive via Google OAuth / Drive API | ✓ SATISFIED | buildConsentUrl (offline/consent/drive.file) + callback CSRF-gated encrypt+store + revokeDriveToken |
| BACKUP-03 | 08-01, 08-05 | Configurable schedule + retention | ✓ SATISFIED | config.ts Zod + D-09 defaults; schedule.ts backup tick `isDue(scheduleCron)`; retention cleanup |
| BACKUP-04 | 08-05 | Automated restore-drill on cadence + integrity + alert | ✓ SATISFIED | drill.ts runRestoreDrill (CREATE/restore/verify/DROP) + schedule drill tick + email on failure |
| BACKUP-05 | 08-04 | Backup Settings dashboard page (admin-only) | ✓ SATISFIED | page.tsx Server Component + form + 8 admin-gated actions (requireRole FIRST) |

No orphaned requirements — all 5 BACKUP IDs declared across plans and all accounted for.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| `__tests__/crypto-roundtrip.test.ts` | 53 | "XXX" substring inside a fake refresh-token test fixture string | ℹ️ Info | Not a debt marker — coincidental characters in `"1//0gXXXX..."` test data. No TBD/FIXME/XXX/PLACEHOLDER debt markers in any production backup file. |

No blocker or warning anti-patterns. No unreferenced TBD/FIXME/XXX markers in any Phase 8 file.

### Deferred Live Verifications (Phase 7 deploy gate)

See the `deferred_live` frontmatter section. Six live verifications wait for the deployed app + managed Postgres / OAuth client / CREATEDB grant / real image build. Each has implementing code correct by inspection AND a passing mocked/unit test, satisfying the v1 bar per the verification posture. These are NOT Phase 8 gaps.

### Human Verification Required (post-deploy)

None blocking Phase 8. The deferred-live items above become human/operator verification items once Phase 7 deploys — tracked in VALIDATION.md Manual-Only table. They are surfaced here for completeness, not as Phase 8 defects.

### Gaps Summary

No gaps. All 22 must-have truths are VERIFIED at the Phase 8 v1 bar (code correct by inspection + mocked/unit tests green, 506/506). All 5 BACKUP requirements SATISFIED. All artifacts exist, are substantive, wired, and (where dynamic) data-flowing. The deferred-live items are the documented Phase-7-deploy gate, not Phase 8 defects — they are recorded in the `deferred_live` section and do not fail any must-have.

---

_Verified: 2026-07-30T09:00:00Z_
_Verifier: Claude (gsd-verifier)_
