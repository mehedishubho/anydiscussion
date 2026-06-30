---
created: 2026-06-30T20:50:35.748Z
title: Configurable multi-destination backup system
area: database
files:
  - .planning/REQUIREMENTS.md:103 (PERF-05 — Postgres backups scheduled)
  - .planning/ROADMAP.md:147 (Phase 7 — Performance & Deploy)
---

## Problem

v1 requirement **PERF-05** currently reads "Postgres backups scheduled" — a simple single-destination scheduled backup. During Phase 1 discussion, the founder decided (**option B — expand v1**) that v1/Phase 7 should instead ship a full **configurable, dashboard-driven backup system**, not a hardcoded single-destination cron. This is a deliberate v1 scope expansion over PERF-05's current wording.

The backup/restore system is **Phase 7 (Performance & Deploy)** work. Phase 1 only *references* backups as the rollback fallback for the forward-only migration decision (no hand-written down-scripts → recovery via backup restore). This todo is captured during Phase 1's `/gsd-discuss-phase` so Phase 7's discussion surfaces it via `cross_reference_todos`.

## Solution

Build a configurable backup system for Phase 7. All knobs below are **settings-driven (configurable)**, not hardcoded:

- **What gets backed up:** Postgres database. R2 media-object backup is an open question — **leave to Phase 7 research** (R2 is already durable/multi-copy; decide whether a separate media backup adds value).
- **Destinations (multi-select, configurable):** Cloudflare R2 · Google Drive · local filesystem. User picks one or many.
  - ⚠ **Google Drive caveat:** adds a Google OAuth / Drive API integration — a third-party dependency with mild tension against the project's self-hosted / no-paid-API ethos (Drive API is free-tier but externally maintained). Phase 7 research must weigh this before committing to the Drive destination.
- **Frequency / RPO:** configurable (e.g. daily dump vs continuous/WAL).
- **Retention:** configurable (keep N days/weeks/months).
- **Off-site / redundancy:** configurable, multi-select (backups copied to multiple locations).
- **Restore drills:** include a **configurable scheduled restore-test with alerting** (automated: restore to a throwaway DB, verify integrity, alert on failure). A backup never restored from is a gamble.
- **Tooling:** **leave to Phase 7 research** (Coolify built-in Postgres backup, `pg_dump` cron, `pg_backrest`, WAL-G, etc. — pick based on the configurable-destination requirement above).

**Scope action required (roadmap change):** PERF-05 and Phase 7's goal/success criteria in ROADMAP.md must be expanded to reflect the configurable multi-destination system (not just "backups scheduled"). This is a requirements + roadmap mutation — apply through proper GSD handlers (not a manual edit) before/as part of Phase 7 planning.

**Origin:** Phase 1 discuss session, 2026-06-30. Decision = option B (expand v1). Defaults applied (founder did not object): restore-drill cadence folded in as configurable; Google Drive kept on the destination list pending the Phase 7 research caveat.
