---
phase: 8
slug: backup-disaster-recovery
status: approved
nyquist_compliant: true
wave_0_complete: false
created: 2026-07-29
---

# Phase 8 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
>
> **Execution caveat:** Phase 7 production deploy is DEFERRED by the founder.
> Phase 8 code + automated (mocked/unit) tests are buildable now against the dev
> docker-compose Postgres. The *live* verifications (real cron firing, real Google
> OAuth round-trip, real R2 upload, Dockerfile build with `pg_dump`, live
> restore-drill against managed Postgres + CREATEDB grant) are DEFERRED and tracked
> in each plan's `<verification>` deferred-live section + ROADMAP §Phase 8 pitfalls.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest (existing — `vitest.config.ts` from Phase 2) |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `pnpm test -- --run src/lib/backup src/actions/__tests__/backup-settings` |
| **Full suite command** | `pnpm test` |
| **Estimated runtime** | ~25-40 seconds (backup tests are mocked; drill uses mocked `pg.Client`) |

Mocking posture (because live execution is deferred):
- `child_process.execFile` is **mocked** in `dump.test.ts` / `job.test.ts` — tests assert the `pg_dump`/`pg_restore` **argv array shape** (never shell out for real).
- `pg.Client` is **mocked** in `drill.test.ts` — tests assert the CREATE/restore/verify/terminate/DROP sequence + the transaction-autocommit invariant.
- `@aws-sdk/client-s3` `send` is **mocked** in the r2 destination test — asserts `PutObjectCommand`/`ListObjectsV2Command`/`GetObjectCommand` shapes.
- `googleapis` `google.auth.OAuth2` is **mocked** in `google-drive.test.ts` — asserts `generateAuthUrl` options + `getToken` exchange.
- The local destination (`local.ts`) runs a **real fs round-trip** against `os.tmpdir()` (no external service).

---

## Sampling Rate

- **After every task commit:** Run `pnpm test -- --run src/lib/backup` (and `src/actions/__tests__/backup-settings` for Plan 08-04)
- **After every plan wave:** Run `pnpm test` (full suite)
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** ~40 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 08-01-1 | 01 | 1 | BACKUP-01, BACKUP-03 | T-08-01 | `execFile` argv array for pg_dump (no shell); config keys parsed via Zod | unit (mocked execFile) | `pnpm test -- --run src/lib/backup/__tests__/dump.test.ts src/lib/backup/__tests__/config.test.ts` | ❌ W0 | ⬜ pending |
| 08-01-2 | 01 | 1 | BACKUP-01, BACKUP-03 | T-08-01 | Local round-trip upload/list/download/delete; job loops enabled dests + retention deletes old | unit (real fs) | `pnpm test -- --run src/lib/backup/__tests__/destinations.test.ts src/lib/backup/__tests__/job.test.ts` | ❌ W0 | ⬜ pending |
| 08-02-1 | 02 | 2 | BACKUP-01 | T-08-02 | Dedicated backup-bucket S3Client (NOT media client); no secret in returned shape | unit (mocked S3) | `pnpm test -- --run src/lib/backup/__tests__/r2-destination.test.ts` | ❌ W0 | ⬜ pending |
| 08-02-2 | 02 | 2 | BACKUP-01 (D-06) | T-08-02 | Media sync paginates ListObjectsV2; uploads each object to enabled dests | unit (mocked S3) | `pnpm test -- --run src/lib/backup/__tests__/media-sync.test.ts` | ❌ W0 | ⬜ pending |
| 08-03-1 | 03 | 2 | BACKUP-01, BACKUP-02 | T-08-03 | OAuth URL has access_type=offline + prompt=consent + drive.file scope + state | unit (mocked googleapis) | `pnpm test -- --run src/lib/backup/__tests__/google-drive.test.ts` | ❌ W0 | ⬜ pending |
| 08-03-2 | 03 | 2 | BACKUP-02 | T-08-03 | Callback rejects mismatched state (CSRF); encrypts refresh token before upsert | unit (mocked googleapis) | `pnpm test -- --run src/lib/backup/__tests__/google-callback.test.ts` | ❌ W0 | ⬜ pending |
| 08-04-1 | 04 | 3 | BACKUP-05, BACKUP-02 | T-08-04, T-08-04d, T-08-04e | All 8 actions call requireRole('admin') FIRST; getBackupSettings redacts secrets; getGoogleConsentUrl sets signed httpOnly state cookie; disconnectGoogleDrive revokes-before-delete; listBackups merges+sorts | unit | `pnpm test -- --run src/actions/__tests__/backup-settings.test.ts` | ❌ W0 | ⬜ pending |
| 08-04-2 | 04 | 3 | BACKUP-05, BACKUP-01 | T-08-04 | Multi-select destination checkboxes; Restore gated by confirmation | unit (component) | `pnpm test -- --run src/app/(admin)/dashboard/settings/backup/__tests__/BackupSettingsForm.test.tsx` | ❌ W0 | ⬜ pending |
| 08-05-1 | 05 | 2 | BACKUP-04 | T-08-05 | CREATE/DROP DATABASE via autocommit pg.Client (no transaction); terminate-before-DROP in finally | unit (mocked pg.Client) | `pnpm test -- --run src/lib/backup/__tests__/drill.test.ts` | ❌ W0 | ⬜ pending |
| 08-05-2 | 05 | 2 | BACKUP-03, BACKUP-04 | T-08-SC, T-08-05 | Cron ticks wrapped in try/catch; drill failure fires sendEmail; no secret in Dockerfile ARG/ENV | unit + grep gate | `pnpm test -- --run src/lib/backup/__tests__/schedule.test.ts` + `scripts/check-backup-secrets.mjs` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `pnpm add googleapis` — only new runtime package (Plan 08-03 Task 1)
- [ ] `src/lib/backup/__tests__/destinations.test.ts` — covers BACKUP-01 (Local real-fs round-trip)
- [ ] `src/lib/backup/__tests__/dump.test.ts` — covers BACKUP-03 (pg_dump/pg_restore argv shape, mocked execFile)
- [ ] `src/lib/backup/__tests__/config.test.ts` — covers BACKUP-03 (backup.config parse + cron validation + retention)
- [ ] `src/lib/backup/__tests__/job.test.ts` — covers BACKUP-03 (job loops enabled dests + retention cleanup)
- [ ] `src/lib/backup/__tests__/r2-destination.test.ts` — covers BACKUP-01 (R2 dedicated bucket, mocked S3)
- [ ] `src/lib/backup/__tests__/media-sync.test.ts` — covers D-06 full DR (paginated ListObjectsV2 → upload)
- [ ] `src/lib/backup/__tests__/google-drive.test.ts` — covers BACKUP-02 (OAuth URL shape + drive.file scope)
- [ ] `src/lib/backup/__tests__/google-callback.test.ts` — covers BACKUP-02 (CSRF state + encrypted token store)
- [ ] `src/lib/backup/__tests__/drill.test.ts` — covers BACKUP-04 (CREATE/restore/verify/DROP + transaction guard + failure-email)
- [ ] `src/lib/backup/__tests__/schedule.test.ts` — covers BACKUP-03/04 (cron ticks try/catch + drill-failure alert)
- [ ] `src/actions/__tests__/backup-settings.test.ts` — covers BACKUP-05 (admin-gate FIRST + redact-on-read)
- [ ] `src/app/(admin)/dashboard/settings/backup/__tests__/BackupSettingsForm.test.tsx` — multi-select + restore confirmation
- [ ] `scripts/check-backup-secrets.mjs` — grep gate: no backup env secret (GOOGLE_CLIENT_SECRET, backup R2 keys) in Dockerfile ARG/ENV (extends Phase 7 D-21 negative-grep)

*Existing Vitest infrastructure (Phase 2 `vitest.config.ts`) covers the framework need — no framework install required.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Live `pg_dump -Fc` produces a restorable dump on the real managed Postgres | BACKUP-03 | Needs deployed Coolify Postgres + `postgresql17-client` in the runner image (Phase 7 deploy DEFERRED) | After deploy: `docker exec <app> pg_dump --version` (≥17); trigger "Backup now"; download dump; `pg_restore --list dump.sqlc` shows tables |
| Google OAuth consent round-trip stores a refresh token | BACKUP-02 | Needs operator-created Google Cloud OAuth client + redirect URI (user_setup) | Create OAuth client (user_setup); visit Backup Settings → "Connect Drive" → consent → callback redirects back → "Test connection" ok |
| Restore-drill creates + drops `backup_verify` on managed Postgres | BACKUP-04 | Needs CREATEDB grant on the prod role + running cron (Phase 7 deploy DEFERRED) | Grant CREATEDB; wait for weekly drill (or trigger); check `backup.last_drill` settings row = `{ok:true}`; verify `backup_verify` does NOT linger |
| Restore overwrites live data after confirmation | D-05 | High-stakes live-data overwrite — must be operator-witnessed | On staging: "Restore" → type DB name → confirm → verify posts overwritten from the chosen dump |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 40s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-07-29 (live-environment verifications deferred per CONTEXT execution caveat)
