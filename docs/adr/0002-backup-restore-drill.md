# ADR 0002: Automated Restore-Drill on a Scratch DB

## Status

Accepted (v1). Revisit if a second Coolify replica is added OR if the weekly
drill load on the production Postgres becomes a concern.

## Context

Phase 8 (`BACKUP-04`) closes the "backup-never-restored" gamble: a backup that
has never been restored is a hope, not a guarantee. The decision (D-07) is a
**fully automated** restore-drill that runs on a cadence, proves the latest
dump restores, and emails on failure via `lib/email` (Resend). A lighter
`pg_restore --list` validity check was rejected (it does not prove a real
restore), and a manual runbook was rejected (it relies on operator discipline
-- the exact gamble `BACKUP-04` exists to eliminate).

The scratch-database decision (D-08) is where this plan diverges from the
"obvious" approaches. Three options were considered for *where* the drill
restores the dump:

1. **Dedicated 2nd Coolify Postgres service** -- cleanest isolation, but extra
   infrastructure to operate, monitor, and pay for. Rejected for v1.
2. **Ephemeral docker-container-per-drill** -- most isolated, but the Next.js
   container has no docker-socket access on Coolify. Rejected (infeasible).
3. **Scratch DB on the existing production Postgres** -- no new service. The
   drill `CREATE DATABASE backup_verify`, restores into it, verifies, and
   `DROP DATABASE backup_verify`. **Chosen (D-08).**

This ADR records the non-obvious constraints that flow from option 3, and the
deliberate trade-off around the Google Drive external dependency (D-02).

## Decision

Run the automated restore-drill against a scratch database **`backup_verify`**
on the **existing managed Postgres** (`src/lib/backup/drill.ts`), on a weekly
cadence by default (`0 4 * * 0`, D-09), wired into the existing
`node-cron` `startScheduler` (`src/lib/schedule/index.ts`).

### Constraints this decision imposes

- **CREATE/DROP DATABASE cannot run inside a transaction block (SQLSTATE
  25001).** The drill therefore uses a **raw autocommit `pg.Client`** connected
  to the `postgres` maintenance DB -- never Drizzle's `db.transaction()`, which
  would wrap the call in `BEGIN`/`COMMIT` and trigger the error (RESEARCH
  Pitfall 2). `node-postgres` `Client` is autocommit by default.
- **The connecting role needs the `CREATEDB` privilege.** A Postgres superuser
  grants this once on the app DB role (`ALTER ROLE <app_role> CREATEDB;`). It
  is the least privilege that permits CREATE/DROP of the scratch DB; it is NOT
  superuser (RESEARCH Pitfall 2 / Pattern 4). This is a one-time `user_setup`.
- **`DROP DATABASE` is blocked by active connections.** Before DROP, the drill
  terminates every backend connected to `backup_verify`
  (`pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname =
  'backup_verify'`), THEN drops it (RESEARCH Pitfall 5).
- **The teardown is unconditional.** The terminate + DROP runs in a `finally`
  block on BOTH the success and failure paths, so `backup_verify` **never
  lingers** (T-08-05 tampering mitigation). The drill test asserts the
  no-linger contract even when the integrity check throws.

### The multi-instance cron cliff (RESEARCH Pitfall 3)

`node-cron` is an **in-process** scheduler. v1 runs a **single Coolify
instance** (D-11 / D-32 -- consistent with the ISR scaling cliff in ADR 0001),
so duplicate-fire is impossible. **If a second replica is ever added, each
replica fires its own backup + drill cron, doubling every job.** This is NOT
solved in v1. The v2 mitigation is a Redis-based distributed lock
(`SET NX` lease with a short TTL) or moving backups to an external scheduler.
This must be solved **before** scaling horizontally -- it is tracked as a v2
concern alongside SCALE-01 (the shared `cacheHandler` from ADR 0001).

### Google Drive external-dependency trade-off (D-02)

The founder reaffirmed the self-hosted / no-paid-API ethos (Phase 7 D-01) yet
**deliberately chose to keep Google Drive** as a selectable backup destination
(`BACKUP-02`). The off-site option is worth the Google OAuth external
dependency. This ADR records that as a conscious trade-off: `googleapis` is the
one new runtime dependency Phase 8 introduces, and Drive authenticates via an
OAuth user-consent flow (refresh token stored encrypted via `lib/crypto`,
`SETTINGS_ENCRYPTION_KEY`). Drive is never silently dropped.

## Consequences

**Positive**

- Backups are *proven* restorable on a weekly cadence with zero operator
  intervention -- the gamble is closed.
- No new infrastructure: the drill reuses the existing Postgres + the existing
  `node-cron` scheduler + the existing Resend email helper.
- The scratch DB is always torn down, so production is not polluted with a
  lingering `backup_verify` database.

**Negative**

- The app DB role needs `CREATEDB` (a one-time superuser grant). This is a
  `user_setup` item, not a code blocker.
- The drill runs `pg_restore` against the production Postgres once a week
  (bounded load for a content site -- accepted, T-08-05b).
- A second Coolify replica would double-fire cron. Documented; not solved in v1.

## v2 path (before adding a second Coolify replica)

Before scaling horizontally, introduce a distributed-lock lease (Redis `SET NX`
with a TTL longer than the longest job) that each cron tick must acquire before
running. Only the lease-holder runs the backup / drill; the other replicas
no-op. This closes the duplicate-fire cliff the same way a shared `cacheHandler`
(ADR 0001 / SCALE-01) closes the stale-ISR cliff.

## References

- `.planning/phases/08-backup-disaster-recovery/08-CONTEXT.md` -- D-02 (Google
  Drive kept despite ethos), D-04 (in-app node-cron), D-07 (automated drill +
  email), D-08 (scratch DB on existing Postgres), D-09 (weekly drill default).
- `.planning/phases/08-backup-disaster-recovery/08-RESEARCH.md` -- Pattern 4
  (scratch-DB sequence), Pitfalls 2 (SQLSTATE 25001), 3 (multi-instance cron),
  5 (terminate-before-DROP), 6 (no secret in build layers).
- `src/lib/backup/drill.ts` -- `runRestoreDrill` / `withMaintenanceClient` /
  `verifyIntegrity`.
- `src/lib/schedule/index.ts` -- the backup + drill cron ticks (the
  multi-instance cliff comment lives here too).
- `docs/adr/0001-isr-single-instance-scaling.md` -- the single-instance scaling
  decision this drill's cron cliff mirrors.
