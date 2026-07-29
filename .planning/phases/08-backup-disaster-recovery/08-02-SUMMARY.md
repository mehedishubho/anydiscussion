---
phase: 08-backup-disaster-recovery
plan: "02"
subsystem: infra
tags: [cloudflare-r2, backup, disaster-recovery, s3, media-sync, full-DR, aws-sdk]

# Dependency graph
requires:
  - phase: 08-backup-disaster-recovery
    provides: BackupDestination interface + getEnabledDestinations lazy registry + runBackupJob orchestrator + readBackupConfig/readSetting settings I/O (08-01)
  - phase: 03-content-engine
    provides: the media R2 s3Client (@/lib/r2) used as the read-only SYNC SOURCE + S3_BUCKET env convention
provides:
  - "r2BackupDestination (BackupDestination, name 'r2', dedicated S3Client + dedicated backup bucket) — src/lib/backup/destinations/r2.ts"
  - "syncMediaBucket(opts) — paginated full-copy of the media R2 bucket to backup destinations — src/lib/backup/media-sync.ts"
  - "runBackupJob() EXTENDED to perform full DR (DB dump + R2 media sync), degrading to DB-only when media is not on R2 or sync errors — src/lib/backup/job.ts"
affects: [08-04-backup-settings-ui, 08-05-cron-drill]

# Tech tracking
tech-stack:
  added: []  # zero new npm packages — @aws-sdk/client-s3 already a project dependency (verified in 08-RESEARCH)
  patterns:
    - "Dedicated-backup-client separation (T-08-02): the backup R2 destination builds its OWN S3Client from decrypted backup.r2_creds against a DEDICATED backup bucket — NEVER reuses the media s3Client/getActiveProvider (RESEARCH Anti-Pattern)"
    - "Read-only source / write-by-injection media sync: syncMediaBucket takes the media client + an uploadObject callback, issues only List+Get to the source (T-08-02b), and writes via each destination's own upload/creds"
    - "Degrade-don't-fail orchestrator: media-sync runs in an inner try/catch so a copy error leaves the DB dump + ok:true intact (D-06 degrades to DB-only; next tick retries)"

key-files:
  created:
    - src/lib/backup/destinations/r2.ts
    - src/lib/backup/media-sync.ts
    - src/lib/backup/__tests__/r2-destination.test.ts
    - src/lib/backup/__tests__/media-sync.test.ts
  modified:
    - src/lib/backup/job.ts
    - src/lib/backup/__tests__/job.test.ts

key-decisions:
  - "Dedicated backup bucket + dedicated S3Client (RESEARCH Anti-Pattern / T-08-02): r2.ts reads backup.r2_creds (encrypted via lib/crypto) and constructs a fresh S3Client per call pointed at a dedicated backup bucket. Reusing the media s3Client/getActiveProvider would target the media bucket with media creds — wrong lifecycle, wrong retention, wrong credentials."
  - "Media-source detection via settings.storage.active_provider (not getActiveProvider): job.ts reads the active_provider row directly through the existing readSetting helper rather than importing @/lib/storage/registry, keeping the backup engine decoupled from the storage registry. Media sync runs only when media is on R2; otherwise it degrades to DB-only."
  - "syncMediaBucket takes its source client as a parameter (no @aws-sdk import of its own beyond the Command classes), making it a pure copy primitive that is unit-testable with a stub client and zero network — the pagination/copy loop is fully isolated from where backups land."
  - "Media sync is v1 full-copy (RESEARCH A5) — simplest correct for bounded v1 media volume. Incremental/dedup + media-prefix retention cleanup are explicitly deferred (revisit if media catalogue exceeds ~10k objects)."

patterns-established:
  - "Backup-bucket/media-bucket credential separation enforced structurally: r2-destination.test.ts strips comments from r2.ts source and asserts no import of @/lib/r2 / @/lib/storage/registry / getActiveProvider / s3Client (grep gate)."
  - "Full-DR backup = DB dump + media objects (D-06): a restored site has its images. runBackupJob groups media under a dated media-YYYYMMDD/ prefix per backup run."

requirements-completed: [BACKUP-01]

# Coverage metadata (#1602) — per-deliverable traceability
coverage:
  - id: D1
    description: "R2 backup destination implementing BackupDestination (name 'r2') against a DEDICATED backup bucket/client built from decrypted backup.r2_creds — upload/list/download/delete/testConnection round-trip"
    requirement: BACKUP-01
    verification:
      - kind: unit
        ref: "src/lib/backup/__tests__/r2-destination.test.ts#upload builds a DEDICATED S3Client + sends PutObjectCommand against the BACKUP bucket"
      - kind: unit
        ref: "src/lib/backup/__tests__/r2-destination.test.ts#r2.ts does NOT import the media s3Client / getActiveProvider / lib/r2 / storage registry (dedicated-client separation gate)"
        status: pass
    human_judgment: false
  - id: D2
    description: "syncMediaBucket paginates ListObjectsV2 via ContinuationToken across pages and uploads every media object (GetObject → Buffer) with a destKeyPrefix; read-only against the source"
    requirement: BACKUP-01
    verification:
      - kind: unit
        ref: "src/lib/backup/__tests__/media-sync.test.ts#paginates across multiple ListObjectsV2 pages and uploads every object with the destKeyPrefix"
        status: pass
    human_judgment: false
  - id: D3
    description: "runBackupJob performs full DR (DB dump + R2 media sync), invoking syncMediaBucket with the MEDIA source after the dump upload; degrades to DB-only when media is not on R2 or when sync throws (ok stays true)"
    requirement: BACKUP-01
    verification:
      - kind: unit
        ref: "src/lib/backup/__tests__/job.test.ts#calls syncMediaBucket with the MEDIA R2 source + a dated prefix when active_provider is r2"
        status: pass
      - kind: unit
        ref: "src/lib/backup/__tests__/job.test.ts#still completes the DB dump (ok:true) when media sync throws — degraded, not failed"
        status: pass
    human_judgment: false
  - id: D4
    description: "Live backup to the dedicated R2 backup bucket + real media-object sync against the production media bucket (round-trip a dump + verify media objects land under media-YYYYMMDD/)"
    requirement: BACKUP-01
    verification: []
    human_judgment: true
    rationale: "Phase 7 production deploy is deferred by the founder; a real R2 round-trip requires the deployed app + the dedicated backup bucket (BACKUP_R2_* env in user_setup) + the production media bucket populated. Tracked in 08-02-PLAN deferred-live + ROADMAP §Phase 8 pitfalls."

# Metrics
duration: 7min
completed: 2026-07-29
status: complete
---

# Phase 8 Plan 02: R2 Backup Destination + Media Sync (Full DR) Summary

**Cloudflare R2 backup destination with a DEDICATED backup-bucket S3Client (never the media client) + a paginated media-object sync wired into runBackupJob so a backup covers the Postgres dump AND the media image files — full disaster recovery (D-06).**

## Performance

- **Duration:** 7 min
- **Started:** 2026-07-29T16:34:12Z
- **Completed:** 2026-07-29T16:41:36Z
- **Tasks:** 2 (Task 1 pre-committed this wave; Task 2 TDD: RED → GREEN)
- **Files modified:** 6 (2 source modules created, 1 source module modified, 3 test files)

## Accomplishments
- Added the Cloudflare R2 backup destination (`r2BackupDestination`, name `"r2"`) that builds a DEDICATED `S3Client` from decrypted `backup.r2_creds` against a DEDICATED backup bucket — upload/list/download/delete/testConnection. It NEVER imports the media `s3Client`/`getActiveProvider` (RESEARCH Anti-Pattern / T-08-02); a source-stripping test enforces this structurally.
- Built `syncMediaBucket(opts)` — a paginated full-copy of the MEDIA R2 bucket (read-only List + Get against the source, T-08-02b) that uploads every object through an injectable `uploadObject` callback under a dated `media-YYYYMMDD/` prefix. Pure copy primitive — no network in tests (stub client injected).
- Extended `runBackupJob` to perform full DR: after the dump upload, it resolves the media source (`storage.active_provider === "r2"`), calls `syncMediaBucket` with a fan-out callback to every enabled destination, and records `mediaObjects` in `backup.last_run`. Media sync is wrapped in an inner try/catch so a copy error degrades the run to DB-only (`ok` stays true) rather than failing the job.
- All 51 backup Wave 0 tests green; full project suite 434/434 green; zero `tsc` errors in `src/lib/backup/**`.

## Task Commits

Each task was committed atomically (TDD: RED test commit → GREEN implementation commit):

1. **Task 1 RED: R2 destination tests** — `1cf9ffa` (test) — pre-committed earlier in this wave
2. **Task 1 GREEN: R2 backup destination (dedicated S3Client + backup bucket)** — `0586aea` (feat) — pre-committed earlier in this wave
3. **Task 2 RED: media-sync + job media-sync-wiring tests** — `3e239ad` (test)
4. **Task 2 GREEN: media-sync + full-DR wiring into runBackupJob** — `0ebb961` (feat)

## Files Created/Modified
- `src/lib/backup/destinations/r2.ts` — `r2BackupDestination` (BackupDestination, name "r2"); dedicated `S3Client` built from decrypted `backup.r2_creds`; PutObject/ListObjectsV2(paginated)/GetObject/Idempotent-Delete; `testConnection` MaxKeys:1 never-throws
- `src/lib/backup/media-sync.ts` — `syncMediaBucket({source, destKeyPrefix, uploadObject})`; ContinuationToken pagination loop; GetObject → Buffer per object; read-only source (no Put/Copy/Delete); returns count copied
- `src/lib/backup/job.ts` — `resolveMediaSource()` (settings-driven media-on-R2 detection) + media-sync block wired after the dump upload; inner try/catch degrade-to-DB-only; status JSON + return now include `mediaObjects`
- `src/lib/backup/__tests__/r2-destination.test.ts` — mocked-`@aws-sdk/client-s3` round-trip + dedicated-client static-source separation gate
- `src/lib/backup/__tests__/media-sync.test.ts` — stub-client pagination (2 pages), prefix/count/buffer assertions, empty-bucket + keyless-entry cases
- `src/lib/backup/__tests__/job.test.ts` — extended with mocks for `./media-sync`, `@/lib/r2`, `readSetting`; new D-06 describe (sync invoked when r2 / skipped when local / degrades on sync error)

## Decisions Made
- **Dedicated backup bucket + dedicated S3Client (T-08-02):** the destination reads `backup.r2_creds` (encrypted via `lib/crypto`, written by 08-04) and builds its own `S3Client` per call against a dedicated backup bucket. Reusing the media `s3Client`/`getActiveProvider()` would point at the media bucket with media credentials — wrong lifecycle, wrong retention, wrong trust boundary. Mirrors `src/actions/storage-settings.ts:213-229` S3Client construction shape.
- **Media-source detection via `readSetting("storage.active_provider")` (not `getActiveProvider`):** job.ts consults the same settings row the storage registry reads, but through the existing `readSetting` helper — keeping the backup engine decoupled from `@/lib/storage/registry` and avoiding a storage-registry import in the cron path. Media sync runs only when media is on R2; otherwise the job correctly degrades to DB-only (nothing to copy from R2).
- **`syncMediaBucket` source is injected (pure copy primitive):** the media client + bucket arrive via `opts.source`, so the module imports only the `S3Client` type + List/Get Command classes and is fully unit-testable with a stub client. Writes flow through the `uploadObject` callback (each destination's own upload/creds) — the source is never written to (T-08-02b).
- **Media sync is v1 full-copy (RESEARCH A5):** simplest correct for a bounded v1 media catalogue. Incremental/differential sync + media-prefix retention cleanup are explicitly deferred to a later plan (revisit if the catalogue exceeds ~10k objects). See "Known Limitations".

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Made media-source resolution resilient so existing job tests stay green without per-test mock setup**
- **Found during:** Task 2 RED (designing the job.ts ↔ media-sync wiring without breaking the 08-01 job tests)
- **Issue:** Adding the media-sync path to `runBackupJob` risked changing existing assertions (e.g. `dest.uploaded.toHaveLength(1)`) if a stray media sync ran during the legacy tests. The plan specifies the wiring but not how to keep the existing dump-only tests isolated from the new media path.
- **Fix:** (a) `resolveMediaSource()` returns `null` unless `readSetting("storage.active_provider") === "r2"`, so the existing tests (where `readSetting` is unset → `undefined !== "r2"`) skip media sync with no extra setup; (b) added explicit `readSettingMock.mockResolvedValue("local")` + `syncMediaBucketMock.mockResolvedValue(0)` to the two existing `runBackupJob` beforeEach blocks for belt-and-suspenders clarity; (c) media sync runs in an inner try/catch so even a sync error cannot flip `ok` to false.
- **Files modified:** `src/lib/backup/job.ts`, `src/lib/backup/__tests__/job.test.ts`
- **Verification:** all 13 pre-existing job tests still pass unchanged; the 3 new D-06 tests pass; full backup suite 51/51.
- **Committed in:** `0ebb961` (Task 2 GREEN commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Additive only — no scope creep, no plan changes. The isolation mechanism is the natural shape of the `readSetting`-guarded media source.

## Issues Encountered
- **RESEARCH example vs. plan behavior on media-sync Command choice:** the RESEARCH Code Example (lines 544-575) imports `CopyObjectCommand` but the loop body actually issues `GetObjectCommand`. The plan `<behavior>` explicitly specifies `GetObjectCommand → transformToByteArray → Buffer`. Implemented the plan's `GetObject` shape (it also keeps the source strictly read-only and works uniformly for R2→local and R2→R2 destinations, whereas `CopyObject` only works same-client same-provider). No code change needed beyond following the plan.

## Known Limitations
- **Media-prefix retention cleanup is deferred (v1 full-copy):** `runRetentionCleanup` only deletes keys matching the `anydiscussion-YYYYMMDD-HHmm.sqlc` dump pattern, so `media-YYYYMMDD/` prefixes accumulate across daily backups. This is the accepted RESEARCH A5 tradeoff (simplest correct for bounded v1 media volume). A future plan should add dated-media-prefix pruning or switch to incremental/dedup sync if the media catalogue exceeds ~10k objects. Not a stub — the sync works fully; this is an operational-fast-follow.
- **Live R2 round-trip deferred:** real backup to the dedicated backup bucket + a real media-object sync against the production media bucket wait for Phase 7 deploy + `BACKUP_R2_*` provisioning (see D4 coverage entry + `user_setup`).

## User Setup Required

**External services require manual configuration (deferred — not needed for this plan's mocked tests).** The dedicated R2 backup bucket must be provisioned before live backups run. Env vars (written into `backup.r2_creds` by the 08-04 admin UI, NOT read directly by the app):
- `BACKUP_R2_ACCESS_KEY_ID`, `BACKUP_R2_SECRET_ACCESS_KEY`, `BACKUP_R2_ENDPOINT`, `BACKUP_R2_BUCKET` — the dedicated backup bucket credentials (distinct from the media `S3_*` set). See `08-02-PLAN.md` `user_setup`.

No USER-SETUP.md file generated — credentials land via the 08-04 dashboard "Test connection" flow.

## Next Phase Readiness
- The R2 destination is auto-resolved by `getEnabledDestinations()` (08-01 registry) once `backup.config.destinations.r2 === true` — no registry change was needed (non-literal dynamic import resolves `./destinations/r2` at runtime, per the 08-01 SUMMARY note).
- Ready for 08-04 (dashboard Backup Settings UI writes `backup.r2_creds` + flips the r2 toggle + surfaces `testConnection`) and 08-05 (cron tick calls the now-full-DR `runBackupJob`).
- **Blocker for live operation (not for code):** Phase 7 deploy + dedicated backup bucket provisioning + `postgresql17-client` in the runner image (08-05 Dockerfile) before real backups run.

## Self-Check: PASSED

- All 6 created/modified files exist on disk (2 source created, 1 source modified, 3 test files).
- All 4 task commits present in git history (`1cf9ffa`, `0586aea`, `3e239ad`, `0ebb961`).
- Full backup suite: 51/51 tests pass. Full project suite: 434/434 tests pass.
- `pnpm exec tsc --noEmit`: zero errors in `src/lib/backup/destinations/r2.ts`, `src/lib/backup/media-sync.ts`, `src/lib/backup/job.ts`.
- Dedicated-client grep gates pass (r2.ts has no media-client imports; media-sync issues no write/delete commands to the source).

---
*Phase: 08-backup-disaster-recovery*
*Completed: 2026-07-29*
