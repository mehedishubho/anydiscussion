# Phase 8: Backup & Disaster Recovery - Context

**Gathered:** 2026-07-29
**Status:** Ready for planning

<domain>
## Phase Boundary

An admin can configure (from the dashboard) where database backups are stored, how often they run, how long they're kept — and an automated restore-drill proves backups are restorable. Backups cover the full disaster-recovery surface (Postgres DB **+ R2 media objects**), run via an in-app scheduler, and write to a dashboard-configured multi-select set of destinations (local default, Cloudflare R2, Google Drive). An automated restore-drill restores the latest backup to a scratch DB on a cadence and alerts on failure — closing the "backup-never-restored" gamble.

Concretely this phase delivers:
- **Backup Settings dashboard page (BACKUP-05)** — admin-only (server-side permission check). Multi-select destinations (local / R2 / Google Drive), each individually toggleable; schedule (frequency/RPO) + retention (keep N); restore-drill cadence; manual "Backup now" + "Restore" buttons.
- **Backup destinations (BACKUP-01/02)** — local (default, on-VPS) + Cloudflare R2 + Google Drive, any combination, each enable/disable. Provider credentials encrypted at rest via `lib/crypto` (AES-256-GCM, `SETTINGS_ENCRYPTION_KEY`). Google Drive uses OAuth user-consent flow.
- **Backup execution (BACKUP-03)** — full in-app: `node-cron` (in `instrumentation.ts`) shells out to `pg_dump`, uploads the dump via `lib/storage` to every enabled destination. App process owns execution.
- **Backup scope** — `pg_dump` of the Postgres DB **+ R2 media objects** synced to the backup destination(s) — full disaster recovery (restored site has its images).
- **Automated restore-drill (BACKUP-04)** — on a cadence, restores the latest dump to a scratch DB on the existing Postgres (`backup_verify`), runs an integrity check, drops it, and emails via Resend (`lib/email`) on failure.

**Out of scope:** Coolify's built-in Postgres scheduled-backup feature (rejected — the dashboard-driven, `lib/storage`-based system is in scope per BACKUP-01/05); a 2nd dedicated Postgres service for drills (rejected — scratch DB on the existing Postgres instead); ephemeral docker-container-per-drill (rejected — the Next.js container has no docker-socket access on Coolify); menu builder / redirects UI (v2); multi-instance ISR scaling (v2).

**Boundary notes for the planner:**
- This phase **depends on the deployed/runtime environment** (Phase 7). Phase 7's production deploy is currently deferred by the founder (manual deploy, reviewed later post-app-completion). Phase 8 *planning* can proceed now; **execution** waits for a live Postgres + deployed app.
- The founder reaffirmed the **self-hosted / no-paid-API ethos** (Phase 7 D-01 logic) yet **deliberately chose to keep Google Drive** as a selectable destination (BACKUP-02 literal) — the off-site option is worth the Google OAuth external dependency to them. Do NOT silently drop Drive; implement it via OAuth consent per D-02 below.
- pg_dump is the dump mechanism; the runtime path to run `pg_dump` against Coolify's managed Postgres is a **research flag** (see Research Flags) — the planner/researcher must resolve how the Next.js process executes pg_dump (pg client in the runtime image vs. a connection-string-based call).
- The Backup Settings page should **mirror the existing Storage Settings page pattern** (DASH-09: admin-only, RHF + Zod, "Test connection" probes, encrypted credentials). Reuse, don't reinvent.

</domain>

<decisions>
## Implementation Decisions

### Backup destinations (BACKUP-01 / BACKUP-02)
- **D-01 (Multi-select destinations, each toggleable):** The Backup Settings page exposes three destinations — **local (on-VPS, default-on)**, **Cloudflare R2**, and **Google Drive** — as a multi-select. The admin can enable any combination (e.g., local + R2 + Drive all at once, or just local + R2). Each destination has its own enable/disable toggle. Chosen over an "exactly 2 slots" model — the founder wants full flexibility (BACKUP-01 literal). `lib/storage` already ships `local` + `r2` providers; the Google Drive destination is new (see D-02).
- **D-02 (Google Drive via OAuth user-consent flow):** Google Drive authenticates via an **OAuth user-consent flow** (NOT a service account). The admin clicks "Connect Drive" → Google consent screen → the app stores the encrypted refresh token (via `lib/crypto`, `SETTINGS_ENCRYPTION_KEY`); the app handles token refresh + revocation. Chosen over a service account (server-to-server) — the founder wants the standard consent UX. Research flag: `googleapis` npm package + Next.js Route Handler for the OAuth callback.
- **D-03 (Credentials encrypted at rest — reuse lib/crypto):** Per-destination credentials (R2 keys, Google OAuth refresh token, local path) are encrypted via the existing `lib/crypto` AES-256-GCM helper (Phase 4 D-25), keyed by `SETTINGS_ENCRYPTION_KEY`, stored in the `settings` table — never exposed in client-visible state or the build bundle. Reuses the exact DASH-09 Storage Settings credential pattern.

### Backup execution mechanism (BACKUP-03)
- **D-04 (Full in-app execution — node-cron + pg_dump + lib/storage):** Backups run **in-app**: the `node-cron` scheduler in `instrumentation.ts` (the Phase 3 D-11 pattern, reused) triggers a backup job that shells out to `pg_dump`, then uploads the dump file via `lib/storage` to every enabled destination. The app process owns backup execution. Chosen over Coolify's built-in Postgres scheduled-backup (would descope BACKUP-01/05 dashboard-driven requirement) and over a hybrid (awkward split between Coolify-controlled dump + app config). **Research flag:** the Next.js runtime needs a path to run `pg_dump` against Coolify's managed Postgres — confirm the pg client is available / the connection approach.
- **D-05 (Manual triggers — "Backup now" + "Restore"):** The Backup Settings dashboard has a **"Backup now"** button (triggers an immediate backup to all enabled destinations, outside the schedule) AND a **"Restore"** action (lists past backups, restores the selected one). Restore is gated behind a confirmation dialog — it overwrites live data. Chosen over schedule-only — the founder wants full dashboard control. Restore executes via `pg_restore` against the scratch DB / main DB with a confirmation gate.

### Backup scope (disaster-recovery completeness)
- **D-06 (DB + R2 media objects — full DR):** Backups cover the **Postgres DB** (`pg_dump` — posts, settings, users, media records, taxonomy) **AND the R2 media objects** (the actual image files, synced to the backup destination). A restored site has its images intact. Chosen over DB-only (media is user-uploaded content, not safely regeneratable — broken images on restore is unacceptable). Research flag: R2 list + copy approach (full bucket copy vs incremental/versioned — planner decides; full DR is the requirement).

### Restore-drill (BACKUP-04)
- **D-07 (Full automated restore-drill + email alert):** On a configurable cadence, a cron job restores the latest backup to a throwaway DB, runs an integrity check (row counts on key tables / a smoke query), tears down the throwaway DB, and **emails via Resend (`lib/email`)** on failure. Fully closes the "backup-never-restored" gamble. Chosen over a lighter `pg_restore --list` validity check (doesn't prove a real restore) and over a manual runbook (relies on operator discipline — the exact gamble BACKUP-04 eliminates).
- **D-08 (Scratch DB on the existing Postgres):** The throwaway DB is a scratch database (`backup_verify`) on the **existing Postgres server** — `CREATE DATABASE backup_verify`, restore the latest dump into it, run the integrity check, `DROP DATABASE backup_verify`. No new service, no docker-socket access needed. Chosen over a dedicated 2nd Coolify Postgres service (extra infra) and ephemeral docker-per-drill (Next.js container has no docker access on Coolify). **Research flag:** the app's DB role needs `CREATEDB` permission (or use an existing privileged role) to create/drop the scratch DB.

### Schedule / retention defaults (BACKUP-03/04)
- **D-09 (Daily / keep 30 days / drill weekly):** v1 ships with backups running **daily**, retaining **30 days** (~30 dumps per destination), and the restore-drill running **weekly**. All three are admin-configurable in the dashboard (frequency, retention, drill cadence). Chosen over leaner retention (7d — too short for a content site) and lower-frequency (weekly backups — RPO too loose for an active editorial team). The weekly drill catches a silent backup failure within 7 days.

### Claude's Discretion
- **Backup format:** `pg_dump` custom format (`-Fc`) is recommended (supports selective restore + compression + parallel restore) — planner confirms.
- **File naming/timestamping:** convention like `anydiscussion-YYYYMMDD-HHmm.sqlc` — planner decides.
- **Alert recipient:** default to the site admin email / the Resend `EMAIL_FROM` recipient — planner wires it.
- **Backup Settings page layout:** mirror the existing Storage Settings page (DASH-09) — admin-only, RHF + Zod, per-destination credential forms, "Test connection" probes.
- **R2 media sync granularity:** full bucket copy vs incremental/versioned sync — planner picks the simpler correct approach for v1 (full DR is the requirement).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project / requirements
- `.planning/ROADMAP.md` §Phase 8 — goal, success criteria, pitfalls owned (backup-never-restored gamble, Google Drive OAuth external-dependency caveat, build-vs-runtime secret separation), MEDIUM research flag (backup tooling selection + Google Drive OAuth).
- `.planning/REQUIREMENTS.md` §Backup & Disaster Recovery — BACKUP-01..05 exact text (BACKUP-01 multi-select destinations via lib/storage; BACKUP-02 Google Drive OAuth; BACKUP-03 schedule + retention; BACKUP-04 automated restore-drill; BACKUP-05 Backup Settings dashboard page).
- `CLAUDE.md` + `.claude/CLAUDE.md` — self-hosted/no-paid-API ethos (note: founder chose to keep Google Drive despite this — see D-02), pnpm only, Drizzle migrations (drizzle-kit generate), Next 16 cacheComponents.

### Prior-phase decisions to carry forward
- `.planning/phases/07-performance-deploy/07-CONTEXT.md` — D-01 (self-hosted ethos: chose ioredis over Upstash-cloud to avoid a cloud dep — the logic the founder nonetheless overrode for Google Drive here); D-25 / lib/crypto AES-256-GCM credential encryption; D-11 node-cron instrumentation.ts scheduler pattern; D-32 (no staging, git-push = prod); Coolify managed Postgres 17.
- `.planning/phases/04-dashboard-chrome/04-CONTEXT.md` (DASH-09 Storage Settings) — the admin-only settings page + encrypted-credentials + "Test connection" probe pattern the Backup Settings page mirrors.

### Codebase (reusable assets)
- `src/lib/storage/types.ts` + `src/lib/storage/registry.ts` — the `StorageProvider` interface + registry (local + r2 providers already ship; backup destinations reuse this shape — a DB dump is a file/buffer the provider can `upload`).
- `src/lib/crypto/index.ts` — `encrypt` / `decrypt` AES-256-GCM helpers (backup credential storage).
- `src/instrumentation.ts` — `node-cron` `register()` pattern (the in-process scheduler backups ride on; gated on `NEXT_RUNTIME === 'nodejs'`).
- `src/actions/storage-settings.ts` + `src/app/(admin)/dashboard/settings/storage/` — the Storage Settings action + UI pattern (admin-only, RHF + Zod, encrypted creds, "Test connection") — the Backup Settings page mirrors this.
- `db/schema.ts` — the `settings` key-value table (where backup config + encrypted credentials persist).
- `docker-compose.yml` — the Postgres 17 service (the DB to back up; the runtime target for `pg_dump`).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`lib/storage/` (StorageProvider + registry + local/r2/cloudinary/push-cdn providers):** The backup destinations reuse this abstraction — a `pg_dump` file is uploaded via the provider's `upload(buffer, key)` to local / R2. A new Google Drive provider joins the registry. (Note: the media providers have sharp-variant logic specific to images; backup uploads a single dump file — the provider `upload` path is reusable, the image-variant logic is not invoked.)
- **`lib/crypto` (AES-256-GCM encrypt/decrypt):** Reused as-is for R2 keys, Google OAuth refresh token, and local-path secrets.
- **`node-cron` in `instrumentation.ts`:** The Phase 3 scheduled-publishing cron — a backup cron entry joins the same register() body (gated on `NEXT_RUNTIME === 'nodejs'`).
- **Storage Settings page (DASH-09):** The visual + form pattern (admin-only, per-destination credential forms, "Test connection" probes) — the Backup Settings page is a sibling under `/dashboard/settings/backup`.

### Established Patterns
- **Settings key-value table:** all site config (storage creds, SEO, analytics) lives as settings rows with encrypted secret values — backup config (`backup.config` + per-destination creds) follows this.
- **Admin-only Server Actions:** every mutating action starts with `requireRole('admin')` — backup save/restore/trigger actions follow the Phase 2/4 RBAC convention.
- **RHF + Zod shared schema:** dashboard forms reuse the form/validation pattern.

### Integration Points
- **`instrumentation.ts` register()** — add the backup cron + restore-drill cron entries.
- **`settings` table** — new keys for backup config (destinations, schedule, retention, drill cadence) + encrypted credentials.
- **`lib/storage/registry`** — register a new Google Drive provider.
- **`/dashboard/settings/backup/`** — new admin route (sibling of `/dashboard/settings/storage/`).
- **`lib/email` (Resend)** — restore-drill failure alerts.

</code_context>

<specifics>
## Specific Ideas

- The founder explicitly framed the destination model as "host 2" initially, then broadened to full multi-select (local + R2 + Drive, any combination, each toggleable) — flexibility matters to them; do not artificially limit to 2 slots.
- "Both can be enable or disable system" — each destination must have its own toggle; the dashboard clearly shows which are active.
- The founder chose to keep Google Drive **despite** reaffirming the self-hosted/no-paid-API ethos moments earlier — the off-site option is a deliberate, conscious trade-off. Implement Drive fully (OAuth consent), don't treat it as optional/deferred.

</specifics>

<deferred>
## Deferred Ideas

- **Dedicated 2nd Postgres service for restore-drills** (considered, deferred) — a separate always-on "backup-verify" Postgres was an option for cleanest isolation; rejected in favor of a scratch DB on the existing Postgres (lighter infra). Revisit if drill load on prod Postgres becomes a concern.
- **Ephemeral docker-container-per-drill** (considered, deferred) — most isolated, but the Next.js container has no docker-socket access on Coolify. Revisit only if a sidecar/agent pattern is added later.
- **Service-account auth for Google Drive** (considered, rejected) — simpler server-to-server, but the founder chose the OAuth user-consent flow.
- **Coolify built-in Postgres backups** (considered, rejected) — would descope BACKUP-01/05; the dashboard-driven in-app system is the requirement.

None of these are lost — they're documented for future reconsideration.

</deferred>

---

*Phase: 8-Backup & Disaster Recovery*
*Context gathered: 2026-07-29*
