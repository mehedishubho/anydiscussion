---
phase: 08-backup-disaster-recovery
plan: "05"
subsystem: infra
tags: [postgres, pg_restore, restore-drill, node-cron, dockerfile, postgresql17-client, disaster-recovery, adr, secret-gate]

# Dependency graph
requires:
  - phase: 08-backup-disaster-recovery
    provides: "Plan 08-01 — runBackupJob orchestrator + readBackupConfig/upsertSetting/BACKUP_* settings keys + pgRestore(dump,url) + getEnabledDestinations lazy registry"
  - phase: 03-content-engine
    provides: "src/lib/schedule startScheduler node-cron D-11 resilience pattern (the boot hook the new ticks join)"
  - phase: 02-auth-foundation
    provides: "lib/email sendEmail (Resend, fire-and-forget) for the drill-failure alert (D-07)"
provides:
  - "runRestoreDrill() / withMaintenanceClient(fn) / verifyIntegrity(dbUrl) — src/lib/backup/drill.ts (scratch-DB CREATE/restore/verify/terminate/DROP via raw autocommit pg.Client)"
  - "startScheduler() EXTENDED with backup + drill cron ticks + isDue(cronExpr) matcher — src/lib/schedule/index.ts (hourly-poll + isDue shape, admin cadence change without restart)"
  - "settings key backup.last_drill written on BOTH drill paths ({ok:true} / {ok:false,error}) — mirrors 08-01 backup.last_run"
  - "Dockerfile runner stage: postgresql17-client (pg_dump/pg_restore at runtime, client major >= PG17 server)"
  - "scripts/check-backup-secrets.mjs — D-21 backup-secret Dockerfile leak grep gate"
  - "docs/adr/0002-backup-restore-drill.md — scratch-DB + autocommit + CREATEDB + multi-instance cron cliff ADR"
affects:
  - "07-performance-deploy — live drill against managed Postgres + CREATEDB grant (user_setup) waits for deploy"
  - "v2 SCALE-01 — multi-instance cron double-fire cliff (Redis SET NX lease) documented in ADR 0002"

# Tech tracking
tech-stack:
  added: []  # zero new npm packages — postgresql17-client is an Alpine apk (runtime image), not npm; `pg` + `node-cron` already present
  patterns:
    - "Hourly-poll + isDue(cronExpr) cadence: tick fires at the top of each hour and re-reads the admin-configured cron from settings, so a dashboard schedule change takes effect without a process restart (RESEARCH Pattern 5)"
    - "Raw autocommit pg.Client for CREATE/DROP DATABASE — SQLSTATE 25001 guard; Drizzle db.transaction() would wrap in BEGIN/COMMIT and fail (RESEARCH Pitfall 2)"
    - "Terminate-before-DROP no-linger finally: pg_terminate_backend(pid) WHERE datname='backup_verify' THEN DROP DATABASE IF EXISTS, in a finally on BOTH success/failure paths (RESEARCH Pitfall 5)"
    - "D-21 negative-grep secret gate extended to backup vars (scripts/check-backup-secrets.mjs) — no backup credential in any Dockerfile ARG/ENV"

key-files:
  created:
    - src/lib/backup/drill.ts
    - src/lib/backup/__tests__/drill.test.ts
    - src/lib/backup/__tests__/schedule.test.ts
    - scripts/check-backup-secrets.mjs
    - docs/adr/0002-backup-restore-drill.md
  modified:
    - src/lib/schedule/index.ts
    - Dockerfile
    - src/lib/schedule/__tests__/system-publish.test.ts
    - .planning/phases/08-backup-disaster-recovery/deferred-items.md

key-decisions:
  - "Scratch DB backup_verify on the EXISTING Postgres (D-08) — no 2nd service, no docker-socket; CREATE/DROP via raw autocommit pg.Client connected to the postgres maintenance DB (SQLSTATE 25001)"
  - "Teardown is unconditional: terminate + DROP in a finally on BOTH paths so backup_verify NEVER lingers (T-08-05 tampering mitigation)"
  - "Hourly-poll + isDue cadence over direct per-expression cron.schedule — lets an admin change the schedule from the dashboard without a restart (RESEARCH Pattern 5 alternative-note rationale)"
  - "backup.last_drill upserted FIRST in the catch (before sendEmail) so the dashboard status panel always reflects the latest drill outcome — mirrors 08-01 backup.last_run"
  - "postgresql17-client from Alpine edge/main pinned to major 17 to match the PG17 server (generic postgresql-client may lag — RESEARCH Pitfall 1)"
  - "Multi-instance cron double-fire cliff documented, NOT solved in v1 (single Coolify instance) — v2 = Redis SET NX lease (ADR 0002 + code comment)"

patterns-established:
  - "isDue(cronExpr, now) — self-contained 5-field cron matcher (wildcard/list/range/step, 0+7=Sunday) reusable by any future settings-driven schedule"
  - "D-21 negative-grep gate as a standalone Node script (scripts/check-*.mjs) — extend the Phase 7 check-bundle-size.mjs pattern to secret-leak prevention"

requirements-completed: [BACKUP-04, BACKUP-03]

# Coverage metadata (#1602) — per-deliverable traceability
coverage:
  - id: D1
    description: "runRestoreDrill: CREATE scratch DB backup_verify → pg_restore → verifyIntegrity (row counts) → terminate → DROP, via raw autocommit pg.Client (no transaction — SQLSTATE 25001 guard); no-linger on failure"
    requirement: BACKUP-04
    verification:
      - kind: unit
        ref: "src/lib/backup/__tests__/drill.test.ts#CREATE before pgRestore + no BEGIN preceding CREATE + terminate-before-DROP + throws-and-still-DROPs on integrity failure"
        status: pass
    human_judgment: false
  - id: D2
    description: "Two cron entries (backup + drill) join startScheduler; each tick try/catch-wrapped; drill failure fires sendEmail once ('Backup restore-drill FAILED') + writes backup.last_drill on BOTH paths"
    requirement: BACKUP-03
    verification:
      - kind: unit
        ref: "src/lib/backup/__tests__/schedule.test.ts#3 cron entries + drill failure sendEmail once + last_drill {ok:true}/{ok:false} + backup early-return when disabled"
        status: pass
    human_judgment: false
  - id: D3
    description: "Backup-tick calls runBackupJob only when readBackupConfig().enabled + isDue(scheduleCron) (D-04 scheduling)"
    requirement: BACKUP-03
    verification:
      - kind: unit
        ref: "src/lib/backup/__tests__/schedule.test.ts#calls runBackupJob when enabled+isDue; early-return when disabled"
        status: pass
    human_judgment: false
  - id: D4
    description: "Dockerfile runner installs postgresql17-client (client major >= PG17); no backup secret in any ARG/ENV (D-21)"
    requirement: BACKUP-04
    verification:
      - kind: grep-gate
        ref: "scripts/check-backup-secrets.mjs (exit 0) + Dockerfile L113 apk add postgresql17-client before USER nextjs (L127)"
        status: pass
    human_judgment: false
  - id: D5
    description: "Live restore-drill creates + drops backup_verify on managed Postgres (CREATEDB grant); backup.last_drill reads {ok:true}; backup_verify does not linger"
    requirement: BACKUP-04
    verification: []
    human_judgment: true
    rationale: "Phase 7 production deploy is deferred by the founder; a live drill requires the deployed app + managed Postgres + the CREATEDB grant (user_setup) + postgresql17-client in the built runner image. Tracked in 08-05-PLAN <verification> deferred-live + ROADMAP §Phase 8 pitfalls."

# Metrics
duration: "Task 2: ~5 min active (2026-07-30T02:50:18Z → 02:54:06Z +0600); plan spans two executor waves — Task 1 (drill.ts) completed by a prior executor"
completed: 2026-07-30
status: complete
---

# Phase 8 Plan 05: Restore-Drill + Cron Wiring + Dockerfile Slice Summary

**Automated restore-drill (CREATE scratch DB → pg_restore → verify → terminate → DROP via raw autocommit pg.Client) + two node-cron entries (backup + drill, hourly isDue poll, drill-failure email) + postgresql17-client in the Dockerfile runner + a D-21 backup-secret Dockerfile leak gate + ADR 0002 — closes the backup-never-restored gamble (BACKUP-04) and puts every backup job on a schedule (BACKUP-03).**

## Performance

- **Duration (this session, Task 2):** ~5 min active
- **Started (Task 2):** 2026-07-30T02:46Z (resume from Task 1 done)
- **Completed:** 2026-07-30T02:54Z
- **Tasks:** 2 (both TDD: RED → GREEN). Task 1 (drill.ts) was completed by a prior executor and verified green on resume; Task 2 (cron wiring + Dockerfile + gate + ADR) executed here.
- **Files:** 5 created, 4 modified

## Resume Verification

Task 1 was confirmed DONE and green before any Task 2 work:
- `pnpm test -- --run src/lib/backup/__tests__/drill.test.ts` → 463/463 pass (drill tests included).
- Task 1 commits present: `3ee7733` (RED), `26884da` (GREEN); `src/lib/backup/drill.ts` + `drill.test.ts` on disk.
- Task 1 was NOT redone.

## Accomplishments
- **Drill orchestrator (Task 1, prior executor):** `runRestoreDrill()` downloads the latest dump, opens a raw autocommit `pg.Client` to the `postgres` maintenance DB, `CREATE DATABASE backup_verify`, `pg_restore` into it, smoke-queries row counts on posts/users/settings/media, and in a `finally` terminates backends + `DROP DATABASE IF EXISTS` so `backup_verify` never lingers — even when the integrity check throws. The autocommit invariant (no `BEGIN` before `CREATE`) and the no-linger contract are proven by `drill.test.ts`.
- **Cron wiring (Task 2):** `startScheduler()` now registers THREE ticks — the existing every-minute publish tick (Phase 3) plus a backup tick and a drill tick, both polling hourly (`0 * * * *`) and gated by a self-contained `isDue(cronExpr)` matcher that re-reads the admin-configured cadence from `backup.config` every tick (so a dashboard schedule change takes effect without a restart). Each tick is wrapped in try/catch + `log.error` so a transient error never crashes the worker.
- **Drill-failure alert (D-07):** the drill tick upserts `backup.last_drill` on BOTH paths (`{at, ok:true}` on success, `{at, ok:false, error}` as the FIRST statement in the catch), then fires a fire-and-forget `sendEmail({ subject: "Backup restore-drill FAILED" })` — mirroring how 08-01 writes `backup.last_run` so the dashboard status panel always reflects the latest drill outcome.
- **Dockerfile (Task 2):** the runner stage installs `postgresql17-client` from Alpine edge/main before the `USER nextjs` drop, so `pg_dump`/`pg_restore` exist at runtime with a client major matching the PG17 server (RESEARCH Pitfall 1). No backup secret was added to any ARG/ENV.
- **Secret-leak gate (Task 2):** `scripts/check-backup-secrets.mjs` reads the Dockerfile and fails (exit 1) if any backup/runtime-secret var name (Google OAuth trio, `BACKUP_LOCAL_ROOT`, `SETTINGS_ENCRYPTION_KEY`, `RESEND_API_KEY`, `EMAIL_FROM`) appears in an ARG/ENV directive — extending the Phase 7 D-21 negative-grep to the new backup surface. Exits 0 today.
- **ADR 0002 (Task 2):** documents the scratch-DB-on-existing-Postgres decision (D-08), the autocommit-pg.Client SQLSTATE 25001 constraint, the CREATEDB privilege requirement, the multi-instance cron double-fire cliff (RESEARCH Pitfall 3 — single Coolify instance in v1, Redis SET NX lease in v2), and the deliberate Google Drive external-dependency trade-off (D-02).

## Task Commits

Each task committed atomically (TDD: RED test commit → GREEN implementation commit). Task 1 by a prior executor; Task 2 here.

1. **Task 1 RED: drill tests** — `3ee7733` (test) — prior executor
2. **Task 1 GREEN: runRestoreDrill scratch-DB orchestrator** — `26884da` (feat) — prior executor
3. **Task 2 RED: schedule cron-wiring tests** — `0aacfda` (test)
4. **Task 2 GREEN: cron entries + dockerfile pg client + secret gate + ADR** — `e707bc7` (feat)

## Files Created/Modified
- `src/lib/backup/drill.ts` — `runRestoreDrill` + `withMaintenanceClient` + `verifyIntegrity` (raw autocommit pg.Client; CREATE/restore/verify/terminate/DROP; no-linger finally) — Task 1
- `src/lib/backup/__tests__/drill.test.ts` — sequence + autocommit-invariant + no-linger + integrity-failure tests (mocked pg.Client) — Task 1
- `src/lib/schedule/index.ts` — `startScheduler` extended with backup + drill cron ticks + exported `isDue()` 5-field cron matcher; multi-instance cliff comment — Task 2
- `src/lib/backup/__tests__/schedule.test.ts` — 3 cron entries + drill failure sendEmail-once + last_drill both paths + backup early-return-when-disabled + try/catch resilience — Task 2
- `Dockerfile` — runner stage `postgresql17-client` apk add (before USER nextjs) — Task 2
- `scripts/check-backup-secrets.mjs` — D-21 backup-secret Dockerfile leak grep gate (exit 1 on leak) — Task 2
- `docs/adr/0002-backup-restore-drill.md` — scratch-DB + autocommit + CREATEDB + multi-instance cliff ADR — Task 2
- `src/lib/schedule/__tests__/system-publish.test.ts` — `cron.schedule` call-count assertion 1 → 3 (Rule 3 auto-fix) — Task 2
- `.planning/phases/08-backup-disaster-recovery/deferred-items.md` — `.env.example` backup-placeholder deferral (permission-blocked) — Task 2

## Decisions Made
- **Scratch DB on the existing Postgres (D-08) over a 2nd service / ephemeral container:** no new infra, no docker-socket access needed. The trade-off (drill load on prod Postgres once a week) is bounded for a content site and accepted (T-08-05b).
- **Hourly-poll + isDue over direct per-expression cron.schedule:** the tick fires hourly and asks `isDue(cfg.scheduleCron)` whether the current hour matches the admin-configured expression — so an operator can change the cadence from the dashboard and it takes effect on the next hourly tick without restarting the process (RESEARCH Pattern 5 alternative-note rationale).
- **`backup.last_drill` written FIRST in the catch (before sendEmail):** guarantees the dashboard status panel reflects the latest drill outcome even if the email send is slow; mirrors 08-01's `backup.last_run` `{ok:false, error}` failure write.
- **`postgresql17-client` from Alpine edge/main (not generic `postgresql-client`):** the default package may lag the PG17 server and trigger "server version mismatch" (RESEARCH Pitfall 1); pinned major 17.
- **Multi-instance cliff documented, not solved (RESEARCH Pitfall 3):** v1 runs a single Coolify instance (D-11/D-32), so node-cron duplicate-fire is impossible. Solving it (Redis SET NX lease) is a v2 prerequisite for horizontal scaling — captured in ADR 0002 + a code comment, the same way ADR 0001 captures the ISR scaling cliff.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Existing `system-publish.test.ts` asserted `cron.schedule` called once — now three**
- **Found during:** Task 2 GREEN (schedule test run after wiring the two new ticks)
- **Issue:** The Phase 3 test `src/lib/schedule/__tests__/system-publish.test.ts` asserted `cronScheduleMock` was called exactly once. Adding the backup + drill ticks raised the count to 3, failing that assertion (directly caused by this task's change — in scope).
- **Fix:** Updated the assertion to `toHaveBeenCalledTimes(3)` and documented that the publish tick remains `mock.calls[0]` (registered first) and the new ticks are covered by `schedule.test.ts`. The other 3 assertions in that block (which grab `mock.calls[0]`) were already correct.
- **Files modified:** `src/lib/schedule/__tests__/system-publish.test.ts`
- **Verification:** full suite 473/473 green.
- **Committed in:** `e707bc7` (Task 2 GREEN)

**2. [Rule 1 - Bug] JSDoc `*/2` literal prematurely closed the block comment (parse error)**
- **Found during:** Task 2 GREEN (first schedule test run — oxc PARSE_ERROR at `src/lib/schedule/index.ts:51`)
- **Issue:** The `isDue` JSDoc described the step syntax with a literal `` `*/2` `` example. The `*/` sequence terminates the surrounding `/* */` block comment, so the rest of the line was parsed as code → `Expected a semicolon` parse error, failing both `schedule.test.ts` and `system-publish.test.ts` at transform time.
- **Fix:** Reworded the JSDoc to avoid the `*/` literal (now: "steps (`2-10/2`, or every-Nth across a range)").
- **Files modified:** `src/lib/schedule/index.ts`
- **Verification:** both test files transform + run cleanly.
- **Committed in:** `e707bc7` (Task 2 GREEN, fix applied before committing)

### Deferred (not code deviations)

**3. `.env.example` backup-placeholder block — permission-blocked**
- **Found during:** Task 2 (.env.example append per the plan's `files_modified`)
- **Issue:** The harness permission guard DENIES all tool access (Read / Edit / Write) to any `.env*` path (the same secret-leak safeguard that blocked 08-03). Could not read or write `.env.example`.
- **Action:** Logged the exact placeholder block to `deferred-items.md` for an operator / future session with `.env` write access. NOT a code blocker — the backup modules read `process.env.*` at call time and the only new env var this plan introduces is `BACKUP_LOCAL_ROOT` (a path with a module default). Backup R2 + Google Drive credentials are stored encrypted in the `settings` table, not as env vars.
- **Scope-boundary:** Permission guard, not a code defect.

---

**Total deviations:** 2 auto-fixed (1 blocking test-count, 1 parse-error bug) + 1 permission-deferred (.env.example)
**Impact on plan:** Both auto-fixes necessary for the tests to run/pass — no scope creep, no plan changes. RED phase for both tasks failed as expected before implementation (genuine TDD RED).

## Issues Encountered
- **Pre-existing `tsc` errors out of scope:** `pnpm exec tsc --noEmit` reports 4 strict-null errors in `src/actions/__tests__/storage-settings.test.ts` (Phase 4 file, untouched by 08-05). These are pre-existing on `main` (already logged in `deferred-items.md` by 08-01). The `src/lib/schedule/**` + `src/lib/backup/**` verification targets are CLEAN (zero new errors introduced).
- **Dockerfile base-image vulnerability warnings:** the IDE surfaces "2 critical and 23 high vulnerabilities" against the `node:20-alpine` base image (the `FROM` lines). These are pre-existing, inherent to the base image, and unrelated to the `postgresql17-client` addition — out of scope per the deviation boundary.

## User Setup Required (deferred to deploy)
- **`CREATEDB` grant (user_setup):** a Postgres superuser must run `ALTER ROLE <app_role> CREATEDB;` once on the managed Postgres so the drill's `CREATE/DROP DATABASE backup_verify` succeeds. Tracked in the plan frontmatter `user_setup` + ADR 0002. NOT a code blocker.
- **Phase 7 deploy:** live cron firing, the Dockerfile build with `pg_dump`, and the live drill against managed Postgres are all DEFERRED until the production deploy is unblocked. Code + mocked unit tests are complete now.

## Next Phase Readiness
- The restore-drill + cron wiring close BACKUP-04 and complete the scheduling surface (BACKUP-03). Together with 08-01/02/03/04, Phase 8's code surface is complete; only live (deploy-time) verification remains.
- `startScheduler` is already invoked at boot from `instrumentation.ts` (NO instrumentation change was needed — confirmed unchanged across this plan's commits); the two new ticks activate automatically on the next deploy.
- The v2 multi-instance cron cliff is documented (ADR 0002 + code comment) and must be solved (Redis SET NX lease) BEFORE a second Coolify replica is added — tracked alongside SCALE-01.

## Self-Check: PASSED

- All 5 created files exist on disk (drill.ts, drill.test.ts, schedule.test.ts, check-backup-secrets.mjs, ADR 0002).
- All 4 task commits present in git history (`3ee7733`, `26884da`, `0aacfda`, `e707bc7`).
- `pnpm test` full suite: 473/473 green. `src/lib/backup/__tests__` + `src/lib/schedule/__tests__`: all green.
- `node scripts/check-backup-secrets.mjs`: exit 0 (PASS).
- `pnpm exec tsc --noEmit`: zero new errors in `src/lib/schedule/**` + `src/lib/backup/**` (4 pre-existing in an untouched Phase 4 test file).
- Dockerfile `postgresql17-client` (L113) precedes `USER nextjs` (L127); `src/instrumentation.ts` unchanged.

---
*Phase: 08-backup-disaster-recovery*
*Completed: 2026-07-30*
