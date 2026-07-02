---
created: 2026-06-30T20:50:35.748Z
title: Configurable multi-destination backup system
area: database
files:
  - .planning/REQUIREMENTS.md (PERF-05 SUPERSEDED → BACKUP-01..05, new Backup & Disaster Recovery group)
  - .planning/ROADMAP.md (new Phase 8 — Backup & Disaster Recovery; backups removed from Phase 7)
---

## Problem

v1 requirement **PERF-05** currently reads "Postgres backups scheduled" — a simple single-destination scheduled backup. During Phase 1 discussion, the founder decided (**option B — expand v1**) that v1 should instead ship a full **configurable, dashboard-driven backup system** (originally scoped into Phase 7; **2026-07-02 revision moved this into a dedicated new Phase 8 — Backup & Disaster Recovery**), not a hardcoded single-destination cron. This is a deliberate v1 scope expansion over PERF-05's current wording.

The backup/restore system was originally **Phase 7 (Performance & Deploy)** work; the **2026-07-02 roadmap revision moved it into a dedicated new Phase 8 — Backup & Disaster Recovery** (depends on Phase 7's runtime environment + the `lib/storage` abstraction from Phase 3/4). Phase 1 only *references* backups as the rollback fallback for the forward-only migration decision (no hand-written down-scripts → recovery via backup restore). This todo is captured during Phase 1's `/gsd-discuss-phase` so Phase 8's discussion surfaces it via `cross_reference_todos`.

## Solution

> **STATUS (2026-07-02): ROADMAP MUTATION APPLIED.** This todo is now reflected in `.planning/ROADMAP.md` (new Phase 8) and `.planning/REQUIREMENTS.md` (BACKUP-01..05; PERF-05 superseded). Phase 8 depends on Phase 7 (runtime environment + `lib/storage` abstraction). Backup tooling selection + Google Drive OAuth caveat remain open for Phase 8 research.

Build a configurable backup system for Phase 8. All knobs below are **settings-driven (configurable)**, not hardcoded:

- **What gets backed up:** Postgres database. R2 media-object backup is an open question — **leave to Phase 8 research** (R2 is already durable/multi-copy; decide whether a separate media backup adds value).
- **Destinations (multi-select, configurable):** local filesystem (**default**) · Google Drive · Cloudflare R2. User picks one or many. (Cloudinary was considered and deliberately DROPPED — it is image-only, unsuitable for DB dumps.)
  - ⚠ **Google Drive caveat:** adds a Google OAuth / Drive API integration — a third-party dependency with mild tension against the project's self-hosted / no-paid-API ethos (Drive API is free-tier but externally maintained). Phase 8 research must weigh this before committing to the Drive destination.
- **Frequency / RPO:** configurable (e.g. daily dump vs continuous/WAL).
- **Retention:** configurable (keep N days/weeks/months).
- **Off-site / redundancy:** configurable, multi-select (backups copied to multiple locations).
- **Restore drills:** include a **configurable scheduled restore-test with alerting** (automated: restore to a throwaway DB, verify integrity, alert on failure). A backup never restored from is a gamble.
- **Tooling:** **leave to Phase 8 research** (Coolify built-in Postgres backup, `pg_dump` cron, `pg_backrest`, WAL-G, etc. — pick based on the configurable-destination requirement above).

**Scope action required (roadmap change):** PERF-05 and Phase 8's goal/success criteria in ROADMAP.md must be expanded to reflect the configurable multi-destination system (not just "backups scheduled"). This is a requirements + roadmap mutation — apply through proper GSD handlers (not a manual edit) before/as part of Phase 8 planning.

**Origin:** Phase 1 discuss session, 2026-06-30. Decision = option B (expand v1). Defaults applied (founder did not object): restore-drill cadence folded in as configurable; Google Drive kept on the destination list pending the Phase 8 research caveat.
