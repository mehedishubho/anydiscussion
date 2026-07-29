---
phase: 08-backup-disaster-recovery
plan: "01"
subsystem: infra
tags: [postgres, pg_dump, pg_restore, backup, disaster-recovery, execFile, settings-key-value, zod]

# Dependency graph
requires:
  - phase: 04-dashboard-chrome
    provides: lib/crypto AES-256-GCM credential envelope + the settings key-value table + the DASH-09 settings I/O pattern
  - phase: 03-content-engine
    provides: src/lib/schedule node-cron resilience pattern (mirrored by runBackupJob) + src/lib/storage/registry single-active selector (mirrored as multi-select)
provides:
  - "BackupDestination interface (upload/list/download/delete/testConnection) — src/lib/backup/types.ts"
  - "getEnabledDestinations() lazy dynamic-import registry — src/lib/backup/registry.ts"
  - "readBackupConfig()/writeBackupConfig() Zod-validated settings I/O with D-09 defaults — src/lib/backup/config.ts"
  - "pgDump():Promise<Buffer> + pgRestore(dump,targetDbUrl) execFile wrappers — src/lib/backup/dump.ts"
  - "localBackupDestination (name 'local', real-fs round-trip) — src/lib/backup/destinations/local.ts"
  - "runBackupJob() + runRetentionCleanup(dest,retentionDays) orchestrator — src/lib/backup/job.ts"
  - "restoreKey(key) + restoreLatest() primitives wrapping pgRestore — src/lib/backup/restore.ts"
affects: [08-02-r2-destination, 08-03-google-drive, 08-04-backup-settings-ui, 08-05-cron-drill]

# Tech tracking
tech-stack:
  added: []  # zero new npm packages this plan — pure composition over existing assets
  patterns:
    - "BackupDestination contract (richer+narrower than StorageProvider — list/download added, no sharp variants)"
    - "Lazy dynamic-import registry with NON-LITERAL module paths (keeps googleapis out of bundle; lets later plans add destination files)"
    - "pg_dump/pg_restore via child_process.execFile argv array (NEVER exec/shell — connection-string password safety, T-08-01)"
    - "Resilient orchestrator: try/catch + log.error, never throws to the cron caller (mirrors schedule tick)"

key-files:
  created:
    - src/lib/backup/types.ts
    - src/lib/backup/registry.ts
    - src/lib/backup/config.ts
    - src/lib/backup/dump.ts
    - src/lib/backup/destinations/local.ts
    - src/lib/backup/job.ts
    - src/lib/backup/restore.ts
    - src/lib/backup/__tests__/dump.test.ts
    - src/lib/backup/__tests__/config.test.ts
    - src/lib/backup/__tests__/crypto-roundtrip.test.ts
    - src/lib/backup/__tests__/destinations.test.ts
    - src/lib/backup/__tests__/job.test.ts
  modified: []

key-decisions:
  - "Separate BackupDestination interface (NOT a StorageProvider overload): backups are private dump buffers needing list/download (retention/restore), with no CDN URL or sharp variants"
  - "Lazy dynamic-import registry uses NON-LITERAL module paths for ALL destinations (incl. local) so tsc does not statically resolve r2/google-drive modules that land in 08-02/08-03 — avoids missing-module compile errors while keeping googleapis bundle-excluded unless Drive is enabled"
  - "Duplicated readSetting/upsertSetting helpers inside config.ts (rather than importing the 'use server' action) so the pure-logic module stays unit-testable by mocking @/lib/db directly"
  - "runBackupJob never throws (records ok:false status + logs) so the cron worker survives transient failures; the destructive-restore confirmation gate is deferred to the 08-04 Server Action per D-05"

patterns-established:
  - "BackupDestination contract at src/lib/backup/types.ts — every destination (08-02 R2, 08-03 Drive) implements this"
  - "Backup key convention: anydiscussion-YYYYMMDD-HHmm.sqlc (retention + restoreLatest parse this timestamp)"
  - "Settings key scheme: backup.config (plaintext JSON, Zod-parsed) + backup.last_run (status) + backup.r2_creds/backup.gdrive_creds (encrypted, written by 08-04)"

requirements-completed: [BACKUP-01, BACKUP-03]

# Coverage metadata (#1602) — per-deliverable traceability
coverage:
  - id: D1
    description: "BackupDestination interface with upload/list/download/delete/testConnection (richer+narrower than StorageProvider)"
    requirement: BACKUP-01
    verification:
      - kind: unit
        ref: "src/lib/backup/__tests__/destinations.test.ts#readonly name === 'local'"
        status: pass
    human_judgment: false
  - id: D2
    description: "pg_dump custom-format dump via execFile argv array (no shell — T-08-01) + pgRestore(dump,targetDbUrl) primitive"
    requirement: BACKUP-03
    verification:
      - kind: unit
        ref: "src/lib/backup/__tests__/dump.test.ts#calls execFile('pg_dump', <argv array>) — argv contains '-Fc' and '-d'"
        status: pass
    human_judgment: false
  - id: D3
    description: "Settings-driven config I/O: readBackupConfig/writeBackupConfig via backup.config key with Zod + D-09 defaults (daily/30d/weekly drill)"
    requirement: BACKUP-03
    verification:
      - kind: unit
        ref: "src/lib/backup/__tests__/config.test.ts#returns D-09 defaults (enabled, local-on, daily 03:00, 30d retention, weekly drill)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Local destination real-fs round-trip (upload/list/download/delete) + path-traversal guard (T-08-01b)"
    requirement: BACKUP-01
    verification:
      - kind: unit
        ref: "src/lib/backup/__tests__/destinations.test.ts#upload → list → download → deep-equal → delete → list empty"
        status: pass
    human_judgment: false
  - id: D5
    description: "runBackupJob orchestrator: dumps + uploads to every enabled destination + retention cleanup + records backup.last_run; never throws"
    requirement: BACKUP-03
    verification:
      - kind: unit
        ref: "src/lib/backup/__tests__/job.test.ts#calls pgDump once + uploads the dump to EVERY enabled destination"
        status: pass
    human_judgment: false
  - id: D6
    description: "restoreKey/restoreLatest primitives wrap pgRestore against DATABASE_URL (confirmation gate deferred to 08-04 per D-05)"
    requirement: BACKUP-01
    verification:
      - kind: unit
        ref: "src/lib/backup/__tests__/job.test.ts#restoreKey downloads the dump from a destination + calls pgRestore with DATABASE_URL"
        status: pass
    human_judgment: false
  - id: D7
    description: "Live pg_dump -Fc against managed Postgres produces a restorable .sqlc on the VPS (DEFERRED — waits for Phase 7 deploy)"
    requirement: BACKUP-03
    verification: []
    human_judgment: true
    rationale: "Phase 7 production deploy is deferred by the founder; a real pg_dump/pg_restore round-trip requires the deployed app + managed Postgres + postgresql17-client in the runner image. Tracked in 08-01-PLAN deferred-live + ROADMAP §Phase 8 pitfalls."

# Metrics
duration: 13min
completed: 2026-07-29
status: complete
---

# Phase 8 Plan 01: Backup Engine Foundation + Local Destination Summary

**BackupDestination contract + lazy registry + Zod-validated config I/O + execFile-based pg_dump/pg_restore wrappers + a real-fs local destination and a resilient runBackupJob orchestrator — the load-bearing primitives every 08-02/03/04/05 plan composes.**

## Performance

- **Duration:** 13 min
- **Started:** 2026-07-29T15:57:04Z
- **Completed:** 2026-07-29T16:09:44Z
- **Tasks:** 2 (both TDD: RED → GREEN)
- **Files modified:** 12 created (7 source modules + 5 Wave 0 test files), 0 modified

## Accomplishments
- Defined the `BackupDestination` interface — deliberately separate from `StorageProvider` (adds `list`/`download` for retention+restore; drops `getPublicUrl` + sharp variants since backups are private single buffers).
- Built settings-driven config I/O (`backup.config` JSON blob) parsed through Zod with D-09 defaults (daily `0 3 * * *`, 30-day retention, weekly drill `0 4 * * 0`) — no schema migration (uses the existing key-value `settings` table).
- Wrapped `pg_dump -Fc` / `pg_restore -j 2` via `child_process.execFile` with an argv array (never a shell string) so the DATABASE_URL password is never shell-interpolated (T-08-01).
- Implemented the lazy dynamic-import registry (`getEnabledDestinations`) that keeps `googleapis` (08-03) out of the bundle unless Drive is enabled, and lets R2/Drive destination modules land in later plans without breaking compilation.
- Shipped a real-fs local destination (`storage/backups/` root, `BACKUP_LOCAL_ROOT` override) with an `assertSafeKey` path-traversal guard (T-08-01b), plus `runBackupJob` (dump → upload to every enabled destination → retention → `backup.last_run`) that never throws to the cron caller, and `restoreKey`/`restoreLatest` restore primitives.
- All 36 backup Wave 0 tests green; full project suite 419/419 green; zero `tsc` errors in `src/lib/backup/**`.

## Task Commits

Each task was committed atomically (TDD: RED test commit → GREEN implementation commit):

1. **Task 1 RED: dump/config/crypto tests** — `bd604df` (test)
2. **Task 1 GREEN: interface + registry + config I/O + pg_dump wrappers** — `d323fe0` (feat)
3. **Task 2 RED: destinations + job tests** — `5701c7d` (test)
4. **Task 2 GREEN: local destination + job orchestrator + restore** — `acb5f46` (feat)

## Files Created/Modified
- `src/lib/backup/types.ts` — `BackupDestination` interface (upload/list/download/delete/testConnection) + `BackupDestinationName` union
- `src/lib/backup/config.ts` — `readBackupConfig`/`writeBackupConfig` + Zod schema + D-09 defaults + settings-key constants + `upsertSetting` helper
- `src/lib/backup/dump.ts` — `pgDump():Promise<Buffer>` + `pgRestore(dump,targetDbUrl)` via `execFile` (argv array), `formatBackupTimestamp`
- `src/lib/backup/registry.ts` — `getEnabledDestinations()` lazy non-literal dynamic-import registry (no static r2/google-drive imports)
- `src/lib/backup/destinations/local.ts` — `localBackupDestination` (real-fs round-trip, `assertSafeKey`, `testConnection` via `fs.access`)
- `src/lib/backup/job.ts` — `runBackupJob()` (resilient orchestrator) + `runRetentionCleanup(dest, retentionDays)` + `generateBackupKey`
- `src/lib/backup/restore.ts` — `restoreKey(key)` + `restoreLatest()` (wrap `pgRestore` against `DATABASE_URL`)
- `src/lib/backup/__tests__/dump.test.ts` — asserts execFile argv shape (T-08-01 no-shell invariant)
- `src/lib/backup/__tests__/config.test.ts` — D-09 defaults + Zod parse of `backup.config`
- `src/lib/backup/__tests__/crypto-roundtrip.test.ts` — proves `lib/crypto` envelope fits backup-creds blobs (D-03 characterization)
- `src/lib/backup/__tests__/destinations.test.ts` — real-fs round-trip + path-traversal guard + testConnection
- `src/lib/backup/__tests__/job.test.ts` — runBackupJob orchestration + retention + restore primitives

## Decisions Made
- **Separate BackupDestination interface (not a StorageProvider overload):** backups are private dump buffers needing `list`/`download` (retention + restore), with no CDN URL and no sharp image variants. Overloading StorageProvider would force-fit the wrong `{variants, primary}` upload shape.
- **Non-literal dynamic imports for all destinations (including local):** TypeScript does not statically resolve non-literal `import(modulePath)`, so registry.ts compiles cleanly even before `r2.ts`/`google-drive.ts` exist (they land in 08-02/08-03). A literal dynamic import would fail `tsc` for the missing modules. This also keeps `googleapis` bundle-excluded unless Drive is enabled, and needs no `instrumentation.ts` change (08-05 relies on this).
- **Duplicated readSetting/upsertSetting in config.ts:** kept config.ts a pure-logic module that mocks cleanly against `@/lib/db` (mirrors the storage `registry.test.ts` pattern), rather than importing a `"use server"` action and pulling in action machinery.
- **runBackupJob never throws:** mirrors the `src/lib/schedule/index.ts` tick-resilience pattern — transient failures are logged + recorded as `ok:false` in `backup.last_run` so the cron worker survives; the next tick retries.
- **Restore confirmation gate deferred to 08-04:** `restoreKey`/`restoreLatest` restore unconditionally by design (they are primitives); the type-the-db-name destructive-overwrite gate lives in the 08-04 Server Action per D-05.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed `vi.unstubAllEnv()` → `vi.unstubAllEnvs()` in crypto-roundtrip.test.ts**
- **Found during:** Task 1 RED (crypto-roundtrip test run)
- **Issue:** Used the wrong vitest cleanup API name (`unstubAllEnv`, singular). vitest's API is `vi.unstubAllEnvs()` (plural). The typo threw `TypeError: vi.unstubAllEnv is not a function` in `afterEach`, failing all 4 tests.
- **Fix:** Renamed to `vi.unstubAllEnvs()` (matching the existing `crypto.test.ts` convention).
- **Files modified:** `src/lib/backup/__tests__/crypto-roundtrip.test.ts`
- **Verification:** crypto-roundtrip test file passes 4/4 after the fix.
- **Committed in:** `bd604df` (Task 1 RED commit — fix applied before committing)

**2. [Rule 3 - Blocking] Used `vi.importActual` in the dump mock so `formatBackupTimestamp` stays real**
- **Found during:** Task 2 GREEN (designing job.ts to reuse `formatBackupTimestamp` from dump.ts for key generation)
- **Issue:** `job.ts` imports `formatBackupTimestamp` from `./dump`, but the `vi.mock("../dump", …)` factory replaced the entire module, leaving `formatBackupTimestamp` undefined at test time → key generation would throw.
- **Fix:** Changed the dump mock to spread `await vi.importActual("../dump")` and override only `pgDump`/`pgRestore`, keeping `formatBackupTimestamp` genuine (single source of truth for the timestamp format).
- **Files modified:** `src/lib/backup/__tests__/job.test.ts`
- **Verification:** job.test.ts runBackupJob tests pass (19/19).
- **Committed in:** `acb5f46` (Task 2 GREEN commit)

---

**Total deviations:** 2 auto-fixed (1 bug, 1 blocking)
**Impact on plan:** Both auto-fixes necessary for the tests to run/pass — no scope creep, no plan changes. crypto-roundtrip is a characterization test of existing `lib/crypto`, so its passing in the RED phase is intended (not a TDD violation); the genuinely-RED tests (dump, config, destinations, job) failed as expected before implementation.

## Issues Encountered
- **Cross-task module dependency:** `registry.ts` (Task 1) references destination modules that Task 2 (local) and later plans (r2, gdrive) create. Resolved by using non-literal dynamic imports so TypeScript does not statically resolve them — registry.ts compiles in Task 1 and resolves the modules at runtime once they exist.
- **Pre-existing `tsc` errors out of scope:** `pnpm exec tsc --noEmit` reports 4 strict-null errors in `src/actions/__tests__/storage-settings.test.ts` (Phase 4 file, untouched by 08-01). These are out of scope (deviation scope boundary) and logged to `deferred-items.md`. The `src/lib/backup/**` verification target is clean (zero errors).

## User Setup Required
None for this plan — no external services are configured yet. Credentials (R2 keys, Google OAuth refresh token) and the live `pg_dump`/cron runtime are populated/wired by 08-02/03/04/05. See `deferred-items.md` for the deferred live verifications.

## Next Phase Readiness
- The foundation primitives are ready for 08-02 (R2 destination implements `BackupDestination`), 08-03 (Google Drive destination + OAuth), 08-04 (dashboard UI calls `readBackupConfig`/`writeBackupConfig` + `restoreKey`), and 08-05 (cron entries call `runBackupJob`).
- `getEnabledDestinations()` will resolve `r2`/`gdrive` automatically once their modules + exports (`r2BackupDestination` / `gdriveBackupDestination`) land — no registry change needed.
- **Blocker for live operation (not for code):** the runtime image needs `postgresql17-client` (08-05 Dockerfile change) and Phase 7 deploy must be unblocked before real backups run. Tracked in ROADMAP §Phase 8 pitfalls.

## Self-Check: PASSED

- All 12 created files exist on disk (7 source modules + 5 Wave 0 test files).
- All 4 task commits present in git history (`bd604df`, `d323fe0`, `5701c7d`, `acb5f46`).
- Full backup suite: 36/36 tests pass. Full project suite: 419/419 tests pass.
- `pnpm exec tsc --noEmit`: zero errors in `src/lib/backup/**`.

---
*Phase: 08-backup-disaster-recovery*
*Completed: 2026-07-29*
