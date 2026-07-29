# Phase 8: Backup & Disaster Recovery - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-29
**Phase:** 8-Backup & Disaster Recovery
**Areas discussed:** Destinations, Google Drive auth, Backup mechanism, Backup scope, Restore-drill, Drill DB provisioning, Manual triggers, Schedule/retention defaults

---

## Destinations (round 1)

| Option | Description | Selected |
|--------|-------------|----------|
| Local + R2 only — drop Google Drive | R2 is already off-site; zero external OAuth. Drops BACKUP-02 (roadmap note). Matches self-hosted ethos. | |
| Swap Google Drive → generic S3-compatible off-site | 2nd off-site via any S3 vendor (Wasabi/B2/2nd R2). Reuses S3 code, no Google lock-in. | |
| Keep Google Drive as scoped | BACKUP-02 literal — Google OAuth + Drive API. External dep + token-refresh. | |

**User's choice (free-text refinement):** "backup will be host 2, 1 is local as by default and another can be setup from dashboard from r2 or drive. both can be enable or disable system" — local (default) + a dashboard-selectable off-site (R2 or Drive), each toggleable. Clarified further in the destinations-model follow-up.

---

## Destinations model (follow-up)

| Option | Description | Selected |
|--------|-------------|----------|
| Exactly 2: local + one selectable off-site | Slot 1 = local; slot 2 = dashboard-picks ONE of {R2, Drive}. | |
| Multi-select: local + R2 + Drive, any combination | Each destination individually toggleable; enable all three at once. BACKUP-01 literal. | ✓ |
| Local fixed-base + toggleable off-site add-ons | Local always-on; R2/Drive additive toggleable. | |

**User's choice:** Multi-select — local + R2 + Drive, any combination, each toggleable. (D-01 in CONTEXT.md)

---

## Google Drive auth (follow-up)

| Option | Description | Selected |
|--------|-------------|----------|
| Service account (server-to-server) | Google Cloud service account + JSON key, shared Drive folder. No consent UI, no token refresh. Key stored encrypted. | |
| OAuth user-consent flow | Admin "Connect Drive" → consent → store refresh token (encrypted). Handle refresh + revocation. | ✓ |
| Defer — research in Phase 8 | Flag as MEDIUM research per ROADMAP. | |

**User's choice:** OAuth user-consent flow. (D-02) Note: founder chose to keep Google Drive despite reaffirming the self-hosted/no-paid-API ethos moments earlier — a deliberate trade-off for the off-site option.

---

## Backup mechanism (BACKUP-03)

| Option | Description | Selected |
|--------|-------------|----------|
| Full in-app system (node-cron + pg_dump) | App shells to pg_dump via node-cron, uploads via lib/storage. Fully dashboard-driven. | ✓ |
| Hybrid — Coolify dumps, app owns config + alerts | Coolify's managed-Postgres backup does the dump; app provides dashboard + drill + alerts. | |
| Coolify built-in only | Zero app code; descopes BACKUP-01/05. | |

**User's choice:** Full in-app system. (D-04)

---

## Backup scope

| Option | Description | Selected |
|--------|-------------|----------|
| DB + R2 media objects — full DR | pg_dump + sync R2 media to backup destination. Restored site has images. | ✓ |
| DB only | Media acceptable-loss. Restored site has broken images. | |

**User's choice:** DB + R2 media objects — full DR. (D-06)

---

## Restore-drill automation (BACKUP-04)

| Option | Description | Selected |
|--------|-------------|----------|
| Full automated restore + alert | Throwaway DB + restore latest + integrity check + Resend email on failure. | ✓ |
| Lighter integrity-check | pg_restore --list / SQL-validity check; no full restore. | |
| Manual runbook | Documented procedure; operator runs periodically. | |

**User's choice:** Full automated restore + alert. (D-07)

---

## Drill DB provisioning (round 2)

| Option | Description | Selected |
|--------|-------------|----------|
| Scratch DB on the existing Postgres | CREATE DATABASE backup_verify, restore, check, DROP. No new service. | ✓ |
| Dedicated 2nd Postgres service (Coolify) | Separate always-on service for drills. Cleanest isolation, more infra. | |
| Ephemeral docker container per drill | docker run per drill. Most isolated, but Next.js container has no docker-socket access. | |

**User's choice:** Scratch DB on the existing Postgres. (D-08)

---

## Manual triggers (BACKUP-05 UX, round 2)

| Option | Description | Selected |
|--------|-------------|----------|
| Yes — 'Backup now' + 'Restore' buttons | Manual backup trigger + restore from a listed backup (confirmation-gated). | ✓ |
| 'Backup now' only | Manual backup; restore is a CLI runbook. | |
| Schedule-only | No manual buttons. | |

**User's choice:** 'Backup now' + 'Restore' buttons. (D-05)

---

## Schedule / retention defaults (BACKUP-03/04, round 2)

| Option | Description | Selected |
|--------|-------------|----------|
| Daily / keep 30d / drill weekly | ~30 dumps retained; weekly drill catches failures within 7 days. | ✓ |
| Daily / keep 7d / drill weekly | Leaner storage. | |
| Weekly / keep 90d / drill monthly | Lower frequency, longer retention. | |

**User's choice:** Daily / keep 30 days / drill weekly. (D-09) All admin-configurable later.

---

## Claude's Discretion

- Backup format (`pg_dump -Fc` recommended), file naming/timestamping, alert recipient (admin email / EMAIL_FROM), Backup Settings page layout (mirror DASH-09 Storage Settings), R2-media-sync granularity (planner picks simpler correct approach).

## Deferred Ideas

- Dedicated 2nd Postgres service for drills (rejected — scratch DB instead; revisit if prod load).
- Ephemeral docker-per-drill (rejected — no docker-socket access; revisit if sidecar added).
- Service-account Google Drive auth (rejected — OAuth consent chosen).
- Coolify built-in Postgres backups (rejected — descopes BACKUP-01/05).
