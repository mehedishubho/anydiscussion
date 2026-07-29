# Phase 8: Backup & Disaster Recovery - Research

**Researched:** 2026-07-29
**Domain:** Postgres backup/restore (pg_dump/pg_restore) + multi-destination upload + Google Drive OAuth + in-app cron scheduling + scratch-DB restore-drill
**Confidence:** HIGH

## Summary

Phase 8 is **heavily reuse-driven**. Every primitive the backup system needs already exists in the codebase: the `lib/storage` provider contract, `lib/crypto` AES-256-GCM, the `node-cron` scheduler in `instrumentation.ts`, the `settings` key-value table, the DASH-09 Storage Settings page pattern (admin-only Server Action + RHF/Zod + encrypted creds + "Test connection"), and the Resend email helper. The phase adds **one new external package** (`googleapis`, for Drive OAuth) and **one new system dependency** (`postgresql17-client` in the Dockerfile runner image, so the Next.js process can shell out to `pg_dump`/`pg_restore`). Everything else is new composition over proven assets.

The eight research flags from CONTEXT.md all resolve cleanly: (1) `pg_dump` runs in-process via `child_process.execFile` against the `DATABASE_URL`, using the custom format `-Fc` (compression + selective/parallel restore confirmed); (2) Google Drive uses the `googleapis` OAuth2 user-consent flow with `drive.file` scope and an encrypted refresh token; (3) R2 media sync is a full `ListObjectsV2` + per-object copy (simplest correct v1 approach); (4) the scratch-DB drill needs the `CREATEDB` role attribute and connects to the `postgres` maintenance DB (CREATE/DROP DATABASE cannot run in a transaction); (5) two new `node-cron` entries join the existing `startScheduler()`; (6) credentials reuse `lib/crypto` + the `settings` table exactly as DASH-09 does; (7) drill-failure alerts reuse `lib/email`; (8) the Backup Settings UI mirrors `dashboard/settings/storage/`.

**Primary recommendation:** Add a slim `BackupDestination` interface (upload/list/download/delete/testConnection) in `lib/backup/` — richer than `StorageProvider` (which lacks `list`/`download`) — and implement Local, R2, and GoogleDrive destinations against it. Do NOT conflate the backup R2 bucket/creds with the media R2 bucket/creds. Shell out to `pg_dump -Fc` via `execFile`, and add `postgresql17-client` to the Dockerfile runner stage.

**Runtime caveat (from CONTEXT):** Phase 7 production deploy is deferred by the founder. Phase 8 *planning* proceeds now; *execution* (and the Dockerfile change) ships against a live Postgres + deployed app later. This research **designs the approach** — it does not run against prod now.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Multi-select destinations — local (default-on), Cloudflare R2, Google Drive — each individually toggleable; any combination. `lib/storage` already ships local + r2; Google Drive is new.
- **D-02:** Google Drive via **OAuth user-consent flow** (NOT a service account). Admin clicks "Connect Drive" → Google consent → app stores encrypted refresh token → app handles refresh + revocation.
- **D-03:** Credentials encrypted at rest via `lib/crypto` (AES-256-GCM, `SETTINGS_ENCRYPTION_KEY`), stored in `settings` — reuses the exact DASH-09 Storage Settings credential pattern.
- **D-04:** Full in-app execution — `node-cron` in `instrumentation.ts` shells out to `pg_dump`, uploads via `lib/storage` to every enabled destination. App process owns execution. (Research flag: pg client availability in runtime image.)
- **D-05:** Manual triggers — "Backup now" + "Restore" (lists past backups, restores selected, confirmation dialog gating overwrite of live data). Restore via `pg_restore`.
- **D-06:** Backup scope = Postgres DB (`pg_dump`) **AND R2 media objects** (actual image files) — full disaster recovery; a restored site has its images. (Research flag: list + copy granularity.)
- **D-07:** Automated restore-drill on cadence — restore latest to throwaway DB, integrity check, teardown, email via Resend (`lib/email`) on failure.
- **D-08:** Scratch DB (`backup_verify`) on the **existing Postgres** — CREATE DATABASE backup_verify → pg_restore → integrity check → DROP DATABASE backup_verify. (Research flag: CREATEDB privilege.)
- **D-09:** Defaults — daily backups, retain 30 days, restore-drill weekly. All three admin-configurable.

### Claude's Discretion
- Backup format: `pg_dump` custom format (`-Fc`) recommended (selective restore + compression + parallel restore) — planner confirms.
- File naming: convention like `anydiscussion-YYYYMMDD-HHmm.sqlc` — planner decides.
- Alert recipient: default to site admin email / `EMAIL_FROM` — planner wires.
- Backup Settings page layout: mirror Storage Settings page (DASH-09) — admin-only, RHF + Zod, per-destination credential forms, "Test connection".
- R2 media sync granularity: full bucket copy vs incremental/versioned — planner picks simpler correct approach for v1.

### Deferred Ideas (OUT OF SCOPE)
- Dedicated 2nd Postgres service for restore-drills (scratch DB on existing Postgres instead).
- Ephemeral docker-container-per-drill (Next.js container has no docker-socket access on Coolify).
- Service-account auth for Google Drive (founder chose OAuth consent flow).
- Coolify built-in Postgres backups (would descope BACKUP-01/05).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| BACKUP-01 | Backup storage via `lib/storage`; destinations local (default), Google Drive, Cloudflare R2 (multi-select, dashboard-configurable) | `BackupDestination` interface in `lib/backup/`; Local + R2 + GoogleDrive implementations; `settings` key `backup.config` stores enabled destinations. R2 uses `@aws-sdk/client-s3` (already a dep). |
| BACKUP-02 | Google Drive destination via Google OAuth / Drive API | `googleapis@173.0.0` (verified OK); OAuth2 consent flow with `drive.file` scope + `access_type:offline` + `prompt:consent`; encrypted refresh token in `backup.gdrive_creds`; callback Route Handler `/api/auth/google/callback`. |
| BACKUP-03 | Configurable schedule (frequency/RPO) + retention (keep N) | Two new `node-cron` entries in `startScheduler()` reading `backup.schedule_cron` / `backup.drill_cron` from `settings`; retention via post-backup cleanup that deletes dumps older than `backup.retention_days`. |
| BACKUP-04 | Automated restore-drill on cadence (restore to throwaway DB, verify, alert on failure) | `CREATEDB` role on app DB user; connect to `postgres` maintenance DB to CREATE/DROP `backup_verify` (autocommit, outside transaction); `pg_restore -j` into it; integrity-check row counts; `lib/email` alert on failure. |
| BACKUP-05 | Backup Settings dashboard page (admin-only) — destinations, schedule, retention, drill cadence; server-side admin permission check | Mirror `dashboard/settings/storage/` pattern: Server Component `page.tsx` + client `BackupSettingsForm.tsx` (RHF + Zod + `useMutation` + "Test connection" probes + "Backup now"/"Restore" buttons); every action calls `requireRole('admin')` FIRST. |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Backup schedule trigger | API / Backend (node-cron in `instrumentation.ts`) | — | In-process scheduler; v1 single-instance (documented ISR scaling cliff). NOT a client/browser concern. |
| `pg_dump` / `pg_restore` execution | API / Backend (Next.js Node runtime) | Database / Storage | The Next.js process shells out to the `pg_dump` binary (installed in the runner image) against the Postgres server. |
| DB dump storage to destinations | API / Backend (`lib/backup/destinations/*`) | CDN / Static (R2) / external (Drive) | Upload runs server-side; credentials never reach the client. |
| R2 media object sync | API / Backend (`@aws-sdk/client-s3`) | CDN / Static (R2) | `ListObjectsV2` + `CopyObject`/`Get` server-side; bounded by media volume. |
| Google Drive OAuth consent | Browser / Client (redirect) + API / Backend (callback Route Handler) | — | Admin clicks in the dashboard (browser redirect to Google); the token exchange + refresh-token storage happens in a server Route Handler. |
| Credential encryption | API / Backend (`lib/crypto`) | Database / Storage (`settings` table) | AES-256-GCM server-side; ciphertext persists in `settings.value`; plaintext never crosses to client. |
| Restore-drill scratch DB | Database / Storage (Postgres) | API / Backend (orchestration) | CREATE/DROP DATABASE on the existing Postgres server; orchestrated by the in-app cron job. |
| Backup Settings UI | Browser / Client (admin dashboard) | API / Backend (Server Actions) | RHF + Zod client form; mutations via admin-gated Server Actions. |
| Drill-failure alert | API / Backend (`lib/email` / Resend) | — | Fire-and-forget server-side email; recipient from `EMAIL_FROM` / `backup.alert_email`. |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `pg_dump` / `pg_restore` (postgresql17-client) | 17.x | DB dump + restore | Postgres's canonical backup tooling. Custom format `-Fc` gives compression + selective (`-t`/`--use-list`) + parallel (`-j`) restore. [CITED: postgresql.org/docs/current/app-pgdump.html] |
| `node-cron` | 4.5.0 (installed) / 4.6.0 (latest) | In-process backup + drill scheduler | ALREADY a project dependency (Phase 3 D-11). `cron.schedule(expr, fn)` API stable. [VERIFIED: npm registry] |
| `googleapis` | **173.0.0** | Google Drive OAuth2 + Drive API (new) | Official Google package; 9.8M weekly downloads; 13 years on registry; no postinstall script. `google.auth.OAuth2` + `google.drive('v3')`. [VERIFIED: npm registry] |
| `@aws-sdk/client-s3` | ^3.1077.0 (installed) | R2 backup-destination uploads + R2 media sync (ListObjectsV2/CopyObject/Get) | ALREADY a project dependency. Used for both the backup-R2 destination and the media-bucket listing/sync. [VERIFIED: codebase] |
| `pg` (node-postgres) | ^8.22.0 (installed) | Scratch-DB CREATE/DROP + integrity-check queries | ALREADY a project dependency (`lib/db/index.ts`). A separate autocommit `Client` to the `postgres` maintenance DB runs CREATE/DROP DATABASE. [VERIFIED: codebase] |
| `child_process.execFile` | Node built-in | Shell out to `pg_dump` / `pg_restore` | No new dependency. Prefer `execFile` over `exec` (no shell, safer arg passing). [VERIFIED: codebase — Node stdlib] |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `lib/crypto` | (existing) | AES-256-GCM encrypt/decrypt for backup creds | Encrypt every backup-destination credential blob before writing to `settings`. [VERIFIED: codebase — src/lib/crypto/index.ts] |
| `lib/email` (Resend) | (existing) | Drill-failure email alert | `sendEmail({to, subject, text})` — fire-and-forget. [VERIFIED: codebase — src/lib/email/index.ts] |
| `lib/permissions` (`requireRole`) | (existing) | Admin-only gate on every backup action | `requireRole('admin')` as the FIRST line of each backup Server Action. [VERIFIED: codebase] |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `pg_dump` (D-04 locked) | WAL-G / pgBackRest / Barman | Rejected by D-04 (dashboard-driven in-app execution). WAL/pgBackRest are infra-level streaming-PITR tools that don't fit the dashboard-configurable multi-destination model. |
| `googleapis` (D-02 locked) | `google-drive-upload` / raw `fetch` | `googleapis` is official, maintained, ships the OAuth2 client + auto-refresh. Raw fetch means hand-rolling token refresh + revocation. |
| Coolify built-in Postgres backups (rejected) | Coolify scheduled backup | Would descope BACKUP-01/05 (dashboard-driven, multi-destination, restore-drill). |
| `node-cron` in-process (D-04 locked) | External scheduler (systemd timer, Coolify cron) | D-04 locks in-app execution; external scheduler reintroduces the hybrid-split D-04 rejected. |

**Installation:**
```bash
# Only ONE new runtime package this phase (Google Drive OAuth + Drive API):
pnpm add googleapis

# System dependency — added to the Dockerfile runner stage (NOT an npm package):
#   apk add --no-cache --repository https://dl-cdn.alpinelinux.org/alpine/edge/main postgresql17-client
```

**Version verification (npm registry, 2026-07-29):**
```bash
npm view googleapis version        # 173.0.0  (created 2012-09-18, latest dist-tag)
npm view node-cron version         # 4.6.0    (project pins 4.5.0 — both fine)
npm view googleapis scripts.postinstall   # (empty — no postinstall script)
```

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| `googleapis` | npm | 13 yrs (created 2012-09-18) | ~9.8M/wk | github.com/googleapis/google-api-nodejs-client | **OK** | Approved — install with `pnpm add googleapis` |
| `node-cron` | npm | mature; latest 4.6.0 published 2026-07-05 | ~6.6M/wk | github.com/node-cron/node-cron | **OK** (SUS flag is a false positive — see note) | Already installed (4.5.0); no action needed |
| `@aws-sdk/client-s3` | npm | mature | high | github.com/aws/aws-sdk-js-v3 | **OK** | Already installed — reused for R2 backup + media sync |
| `pg` | npm | mature | high | github.com/brianc/node-postgres | **OK** | Already installed — reused for scratch-DB CREATE/DROP |

**Packages removed due to [SLOP] verdict:** none.
**Packages flagged as suspicious [SUS]:**
- `node-cron@4.6.0` — the seam flagged it "too-new" (latest published 2026-07-05). This is a **false positive**: `node-cron` is already a project dependency (Phase 3 `src/lib/schedule/index.ts` imports it), is a long-established package (6.6M weekly downloads, active repo), and the SUS flag is purely a freshness heuristic on the most recent patch. No `checkpoint:human-verify` needed — the planner proceeds normally.

*Packages discovered via WebSearch or training data that have not been verified against an authoritative source are tagged `[ASSUMED]` and the planner must gate each install behind a `checkpoint:human-verify` task. The only new install this phase (`googleapis`) is `[VERIFIED: npm registry]` + official Google repo, so no checkpoint is required.*

## Architecture Patterns

### System Architecture Diagram

```
                        ┌─────────────────────────────────────────────┐
                        │            Admin (browser, dashboard)        │
                        │  /dashboard/settings/backup                 │
                        │  BackupSettingsForm (RHF+Zod, multi-select  │
                        │  destinations, Test connection, Backup now, │
                        │  Restore buttons)                           │
                        └───────────────┬─────────────────────────────┘
                                        │ Server Actions (requireRole('admin') FIRST)
                                        ▼
   ┌──────────────────────────────────────────────────────────────────────┐
   │                   Next.js Node runtime (single instance)              │
   │                                                                       │
   │  instrumentation.ts register()  ──gated on NEXT_RUNTIME==='nodejs'──  │
   │        │                                                              │
   │        ├─► startScheduler()  (node-cron, existing)                    │
   │        │      ├─ "* * * * *"  → publishDueScheduledPosts (Phase 3)    │
   │        │      ├─ backup.schedule_cron  → runBackupJob()   (NEW)       │
   │        │      └─ backup.drill_cron     → runRestoreDrill() (NEW)      │
   │        │                                                              │
   │        └─► registerStorageProvider("gdrive", gdriveProvider)  (NEW)   │
   │                                                                       │
   │  runBackupJob():                                                      │
   │    1. execFile('pg_dump', ['-Fc','-d',DATABASE_URL,'-f',tmp]) ───────┼─► pg_dump binary
   │    2. read dump → Buffer                                              │   (postgresql17-client
   │    3. sync R2 media objects (ListObjectsV2 → Copy/Get per object)     │    in runner image)
   │    4. for each ENABLED destination:                                   │
   │         BackupDestination.upload(dumpBuf, key) ──────┐                │
   │    5. retention cleanup (delete dumps > retention_days)              │
   │                                                       │                │
   │  runRestoreDrill():                                   │                │
   │    1. download latest dump from a destination ────────┘                │
   │    2. connect to `postgres` maintenance DB (autocommit)               │
   │    3. CREATE DATABASE backup_verify                                   │
   │    4. execFile('pg_restore', ['-j','-d',backupVerifyUrl, dump]) ──────┼─► pg_restore binary
   │    5. integrity check (counts on posts/users/settings/media)         │
   │    6. connect to `postgres` → terminate conns → DROP DATABASE         │
   │    7. on ANY failure → lib/email.sendEmail(alert) ───► Resend ──► admin│
   └──────────────────────────────────────────────────────────────────────┘
          │                  │                     │
          ▼                  ▼                     ▼
   ┌─────────────┐   ┌──────────────┐     ┌──────────────────┐
   │  Local FS   │   │ Cloudflare R2│     │  Google Drive    │
   │ storage/    │   │ (backup      │     │ (OAuth refresh   │
   │ backups/    │   │  bucket)     │     │  token, encrypted│
   │             │   │              │     │  in settings)    │
   └─────────────┘   └──────────────┘     └──────────────────┘
```

Trace the primary use case: admin saves config → cron fires `runBackupJob` → `pg_dump -Fc` produces a dump → uploaded to each enabled destination → (weekly) `runRestoreDrill` downloads + restores to `backup_verify` + verifies + drops + alerts on failure.

### Recommended Project Structure
```
src/
├── lib/
│   ├── backup/                       # NEW — backup engine (server-only)
│   │   ├── types.ts                  # BackupDestination interface (upload/list/download/delete/testConnection)
│   │   ├── config.ts                 # readBackupConfig() / writeBackupConfig() — settings keys
│   │   ├── dump.ts                   # execFile('pg_dump',...) + execFile('pg_restore',...) wrappers
│   │   ├── destinations/
│   │   │   ├── local.ts              # LocalBackupDestination (fs to BACKUP_LOCAL_ROOT)
│   │   │   ├── r2.ts                 # R2BackupDestination (dedicated S3Client, backup bucket)
│   │   │   └── google-drive.ts       # GoogleDriveBackupDestination (googleapis drive.files)
│   │   ├── registry.ts               # getEnabledDestinations() — resolves from backup.config
│   │   ├── media-sync.ts             # ListObjectsV2 + per-object copy of the media R2 bucket
│   │   ├── job.ts                    # runBackupJob() — orchestrates dump + sync + upload + retention
│   │   └── drill.ts                  # runRestoreDrill() — scratch-DB CREATE/restore/verify/DROP + alert
│   ├── storage/
│   │   └── google-drive.ts           # (OPTIONAL) StorageProvider impl for gdrive — only if piggybacking registry
│   └── ... (existing: crypto, email, db, schedule, storage, permissions)
├── app/
│   ├── (admin)/dashboard/settings/backup/   # NEW — mirrors storage/ pattern
│   │   ├── page.tsx                 # Server Component — getBackupSettings() in try/catch
│   │   ├── BackupSettingsForm.tsx   # Client — RHF + Zod + useMutation + Test connection + Backup now/Restore
│   │   └── schema-client.ts         # Zod schema + zodResolver bridge
│   └── api/auth/google/
│       └── callback/route.ts        # NEW — OAuth callback Route Handler (getToken → encrypt → store)
├── actions/
│   └── backup-settings.ts           # NEW — saveBackupSettings / getBackupSettings / testBackupConnection
│                                    #        / triggerBackupNow / restoreBackup (all requireRole('admin') FIRST)
└── instrumentation.ts               # MODIFIED — register gdrive provider + best-effort configure at boot
```

### Pattern 1: BackupDestination interface (richer than StorageProvider)
**What:** The backup engine needs `list` (retention cleanup) + `download` (restore) which `StorageProvider` lacks (StorageProvider only has upload/getPublicUrl/delete). Define a backup-specific contract rather than overloading the media provider abstraction.
**When to use:** Every backup destination implements this.
**Why not reuse StorageProvider directly:** StorageProvider.upload is image-variant-aware (sharp for `image/*` mimes) and returns `{variants, primary}` — wrong shape for a dump file. And it has no list/download. Backups need a clean, dump-shaped contract. [VERIFIED: codebase — src/lib/storage/types.ts has no list/download methods]
**Example:**
```typescript
// src/lib/backup/types.ts — the backup-destination contract
// [CITED: D-04/D-06 — dump upload + R2 media restore needs list + download]

export interface BackupDestination {
  readonly name: "local" | "r2" | "gdrive";

  /** Upload a dump/media archive buffer under a server-generated key. */
  upload(buffer: Buffer, key: string, mimeType?: string): Promise<{ key: string; sizeBytes: number }>;

  /** List existing backup keys (for retention cleanup + the Restore picker UI). */
  list(prefix?: string): Promise<string[]>;

  /** Download a backup by key → Buffer (for restore + drill). */
  download(key: string): Promise<Buffer>;

  /** Delete a backup by key (retention cleanup). Idempotent. */
  delete(key: string): Promise<void>;

  /** No-op credential probe for the "Test connection" button. Returns {ok, error?}. */
  testConnection(): Promise<{ ok: boolean; error?: string }>;
}
```

### Pattern 2: pg_dump / pg_restore via execFile (no shell)
**What:** Shell out to the `pg_dump` binary using `child_process.execFile` (NOT `exec` — no shell interpolation). Pass the connection string via `-d` and capture output to a temp file.
**When to use:** The backup job (dump) and the manual Restore / restore-drill (restore).
**Example:**
```typescript
// src/lib/backup/dump.ts — signatures (not full impl)
import { execFile } from "node:child_process";
import { promisify } from "node:util";
const execFileAsync = promisify(execFile);

/**
 * Dump the DATABASE_URL database to a custom-format (.sqlc) Buffer.
 * -Fc = custom format (compression + selective + parallel restore).
 * PGPASSWORD is injected via env (avoids the password appearing in the process list).
 * [CITED: postgresql.org/docs/current/app-pgdump.html — -Fc custom format]
 */
export async function pgDump(): Promise<Buffer> {
  const tmp = path.join(os.tmpdir(), `anydiscussion-${ts()}.sqlc`);
  // Parse DATABASE_URL or pass directly; -d accepts a full URI.
  await execFileAsync("pg_dump", ["-Fc", "-d", process.env.DATABASE_URL!, "-f", tmp], {
    env: { ...process.env }, // PGPASSWORD/DB creds inherited from DATABASE_URL
    maxBuffer: 1024 * 1024 * 1024, // dumps can be large
  });
  const buf = await fs.readFile(tmp);
  await fs.unlink(tmp).catch(() => {}); // cleanup temp
  return buf;
}

/**
 * Restore a custom-format dump into a target database URL.
 * -j N = parallel jobs (custom format only). --no-owner --clean optional.
 * [CITED: postgresql.org/docs/current/app-pgrestore.html]
 */
export async function pgRestore(dumpBuffer: Buffer, targetDbUrl: string): Promise<void> { /* ... */ }
```

### Pattern 3: Google Drive OAuth user-consent flow
**What:** Admin clicks "Connect Drive" → server generates an OAuth URL (`access_type:offline`, `prompt:consent`, `scope:drive.file`, `state`) → admin authorizes → Google redirects to `/api/auth/google/callback` → server exchanges `code` for tokens → encrypts the `refresh_token` → stores in `settings`. Subsequent Drive calls auto-refresh via the `googleapis` client.
**When to use:** BACKUP-02 (Google Drive destination).
**Critical:** `access_type: 'offline'` + `prompt: 'consent'` are REQUIRED to receive a `refresh_token` (without them, only the first-ever authorization returns one). [CITED: developers.google.com/identity/protocols/oauth2/web-server]
**Example:**
```typescript
// src/lib/backup/destinations/google-drive.ts — OAuth + upload shapes
import { google } from "googleapis";

// 1. Build the consent URL (admin clicks "Connect Drive")
function buildConsentUrl(state: string): string {
  const oauth2 = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID!,
    process.env.GOOGLE_CLIENT_SECRET!,
    process.env.GOOGLE_REDIRECT_URI!, // e.g. https://anydiscussion.com/api/auth/google/callback
  );
  return oauth2.generateAuthUrl({
    access_type: "offline",   // REQUIRED for refresh_token
    prompt: "consent",        // REQUIRED — forces a fresh refresh_token
    scope: ["https://www.googleapis.com/auth/drive.file"], // app-created files only (least privilege)
    state,                    // CSRF token — verify on callback
  });
}

// 2. Callback Route Handler exchanges code → tokens (store encrypted refresh_token)
async function exchangeCode(code: string) {
  const oauth2 = new google.auth.OAuth2(/* ...same creds + redirect... */);
  const { tokens } = await oauth2.getToken(code); // { access_token, refresh_token, expiry_date }
  // tokens.refresh_token is present because access_type=offline + prompt=consent
  const blob = encrypt(JSON.stringify({ refreshToken: tokens.refresh_token! }));
  await upsertSetting("backup.gdrive_creds", blob);
}

// 3. Upload a dump (refreshes the access token automatically)
async function uploadToDrive(dumpBuffer: Buffer, key: string) {
  const oauth2 = new google.auth.OAuth2(/* ...creds... */);
  oauth2.setCredentials({ refresh_token: decrypt(await readSetting("backup.gdrive_creds")).refreshToken });
  const drive = google.drive({ version: "v3", auth: oauth2 });
  await drive.files.create({
    requestBody: { name: key },                       // e.g. "anydiscussion-20260729-0300.sqlc"
    media: { mimeType: "application/octet-stream", body: Readable.from(dumpBuffer) },
  });
}
```
[VERIFIED: npm registry — googleapis@173.0.0] [CITED: developers.google.com/identity/protocols/oauth2/web-server — access_type=offline, prompt=consent, drive.file scope, getToken, refresh, revoke endpoints]

### Pattern 4: Scratch-DB restore-drill (CREATE/restore/verify/DROP)
**What:** Connect to the `postgres` maintenance DB (autocommit) → CREATE DATABASE backup_verify → pg_restore the latest dump into it → smoke-query row counts → terminate connections → DROP DATABASE backup_verify → email on failure.
**When to use:** BACKUP-04 (automated restore-drill).
**Critical constraints (all verified):**
- `CREATE DATABASE` / `DROP DATABASE` **cannot run inside a transaction block** (SQLSTATE 25001). node-postgres `Client` is autocommit by default — do NOT wrap in `BEGIN`/`COMMIT`. [CITED: postgresql.org/docs/current/sql-createdatabase.html]
- The connecting role needs the **`CREATEDB`** role attribute. [CITED: postgresql.org/docs/current/sql-createdatabase.html — "You must be a superuser or have the CREATEDB privilege"]
- You cannot CREATE/DROP a database while connected TO it — connect to the `postgres` maintenance DB (swap the dbname in DATABASE_URL to `postgres`).
- Before DROP, terminate active connections to `backup_verify` (`pg_terminate_backend`), else DROP fails with "database is being accessed by other users".
**Example:**
```typescript
// src/lib/backup/drill.ts — orchestration shape
import { Client } from "pg";

async function withMaintenanceClient<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  // Swap dbname in DATABASE_URL to "postgres" (the maintenance DB).
  const maintUrl = process.env.DATABASE_URL!.replace(/\/[^/?]*$/, "/postgres");
  const client = new Client({ connectionString: maintUrl }); // autocommit by default
  await client.connect();
  try { return await fn(client); } finally { await client.end(); }
}

export async function runRestoreDrill(): Promise<void> {
  // 1. Download latest dump from a destination (local/r2/gdrive).
  const dump = await downloadLatestDump();
  // 2. CREATE the scratch DB (autocommit, on the maintenance connection).
  await withMaintenanceClient((c) => c.query("CREATE DATABASE backup_verify"));
  try {
    // 3. Restore into it (pg_restore connects to backup_verify, not postgres).
    const backupVerifyUrl = process.env.DATABASE_URL!.replace(/\/[^/?]*$/, "/backup_verify");
    await pgRestore(dump, backupVerifyUrl);
    // 4. Integrity check — row counts on key tables (smoke query).
    await verifyIntegrity(backupVerifyUrl); // SELECT count(*) FROM posts; users; settings; media
  } finally {
    // 5. Teardown — terminate connections then DROP (always, even on failure).
    await withMaintenanceClient(async (c) => {
      await c.query("SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1", ["backup_verify"]);
      await c.query("DROP DATABASE IF EXISTS backup_verify");
    });
  }
  // 6. On any thrown error above, the caller (cron tick) catches → lib/email alert.
}
```

### Pattern 5: node-cron entries join the existing startScheduler()
**What:** Add two configurable cron entries to `src/lib/schedule/index.ts` (the Phase 3 D-11 pattern), reading cadences from the `settings` table.
**When to use:** BACKUP-03 (schedule) + BACKUP-04 (drill cadence).
**Multi-instance note:** node-cron is in-process. v1 is single-instance (documented ISR scaling cliff — see Pitfall 3). If a second Coolify replica is ever added, each replica fires its own cron → duplicate backups. v2 mitigation = a Redis-based distributed lock or external scheduler. Do NOT solve this in v1. [VERIFIED: codebase — src/lib/schedule/index.ts D-11 single-instance note]
**Example:**
```typescript
// src/lib/schedule/index.ts — extended (existing startScheduler + 2 new entries)
import cron from "node-cron";
import { publishDueScheduledPosts } from "./system-publish";
import { runBackupJob, runRestoreDrill } from "@/lib/backup/job";
import { readBackupConfig } from "@/lib/backup/config";

export function startScheduler() {
  // Existing — every minute (Phase 3).
  cron.schedule("* * * * *", async () => { /* publishDueScheduledPosts ... */ });

  // NEW — backup job. Cadence from settings.backup.schedule_cron (default daily "0 3 * * *").
  // The tick re-reads config so an admin's schedule change takes effect next tick (no restart).
  cron.schedule("0 * * * *", async () => {           // hourly check
    const cfg = await readBackupConfig();
    if (!cfg.enabled) return;
    if (!isDue(cfg.scheduleCron)) return;             // compare against configured cron expr
    try { await runBackupJob(); } catch (e) { log.error("backup-job failed", { error: String(e) }); }
  });

  // NEW — restore-drill. Cadence from settings.backup.drill_cron (default weekly "0 4 * * 0").
  cron.schedule("0 * * * *", async () => {
    const cfg = await readBackupConfig();
    if (!cfg.drillEnabled) return;
    if (!isDue(cfg.drillCron)) return;
    try { await runRestoreDrill(); }
    catch (e) {
      log.error("restore-drill failed", { error: String(e) });
      void sendEmail({ to: process.env.EMAIL_FROM ?? "", subject: "Backup restore-drill FAILED", text: String(e) });
    }
  });
}
```
*(Alternative simpler shape: register one cron per configured expression directly. The hourly-check + isDue shape above avoids restarting the process when the admin changes the cadence. Planner chooses.)*

### Pattern 6: Settings key scheme (reuses DASH-09 upsertSetting + lib/crypto)
**What:** Backup config + per-destination encrypted credentials persist in the existing `settings` key-value table, using the exact `upsertSetting` helper + `encrypt`/`decrypt`/`redactCredentials` pattern from `src/actions/storage-settings.ts`.
**When to use:** BACKUP-05 (save/get backup settings).
**Key scheme:**
| Settings key | Encrypted? | Shape |
|--------------|-----------|-------|
| `backup.config` | no (non-secret) | `{ enabled, destinations:{local,r2,gdrive}, scheduleCron, retentionDays, drillEnabled, drillCron, alertEmail }` |
| `backup.r2_creds` | YES (encrypt) | `{ endpoint, region, accessKeyId, secretAccessKey, bucket, forcePathStyle }` (backup bucket — distinct from media) |
| `backup.gdrive_creds` | YES (encrypt) | `{ refreshToken }` (clientId/ClientSecret are server env vars, not stored per-row) |
| `backup.local_path` | no | filesystem path for local backups (default `storage/backups/`) |
| `backup.last_run` | no | `{ at, ok, bytes, destinations:[] }` (UI status) |
| `backup.last_drill` | no | `{ at, ok, error? }` (UI status) |
[VERIFIED: codebase — settings table is key/value text PK; storage-settings.ts upsertSetting + encrypt/decrypt/redactCredentials pattern]

### Anti-Patterns to Avoid
- **Hand-rolling token refresh for Google Drive:** the `googleapis` client auto-refreshes when `setCredentials({ refresh_token })` is called. Don't write manual `POST oauth2.googleapis.com/token` logic — use the library.
- **Wrapping CREATE/DROP DATABASE in a transaction:** throws SQLSTATE 25001. node-postgres is autocommit by default — don't add `BEGIN`.
- **Using `exec` (shell) for pg_dump:** the connection string contains the DB password. Use `execFile` (no shell) to avoid shell-injection and process-list exposure.
- **Conflating the backup R2 bucket with the media R2 bucket:** they have different credentials, different buckets, different lifecycle. Use a dedicated `R2BackupDestination` with its own `S3Client`, NOT `getActiveProvider()` (which returns the *media* provider).
- **Relying on `getPublicUrl` for backups:** backups are private; there is no public URL. The `BackupDestination` interface has `download(key)` instead.
- **Pre-filling secret fields in the Backup Settings form:** mirror DASH-09 Pitfall 7 — `redactCredentials` on read; the form shows empty secret fields with "enter to change" placeholders.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| DB dump / restore | Custom SQL serialization | `pg_dump -Fc` / `pg_restore` (shelled out) | Handles every PG type, FK ordering, sequences, permissions, compression, parallel restore. Hand-rolled SQL export misses edge cases (generated columns, enums, large objects). |
| Google OAuth + token refresh + revocation | Manual HTTP to Google endpoints | `googleapis` (`google.auth.OAuth2` + `google.drive`) | Library handles refresh, retries, revocation endpoint, scope checking. |
| Credential encryption | Custom cipher | `lib/crypto` (`encrypt`/`decrypt` AES-256-GCM) | Already proven (Phase 4 D-25); auth-tag integrity; envelope format fits `settings.value`. |
| Scheduled execution | `setInterval` / external cron daemon | `node-cron` in `instrumentation.ts` | Already proven (Phase 3 D-11); cron-expression parsing; in-process; gated on `NEXT_RUNTIME==='nodejs'`. |
| R2 listing / copy | Custom S3 REST calls | `@aws-sdk/client-s3` (`ListObjectsV2Command`, `CopyObjectCommand`, `GetObjectCommand`) | Already a dependency; pagination, error handling, retry. |
| Admin-only gating | Manual session/role checks inline | `requireRole('admin')` FIRST | Established RBAC pattern (Phase 2/4); proven by MUST_NOT_BE_REACHED tests. |
| Email alert | Custom SMTP client | `lib/email.sendEmail` (Resend) | Already proven (Phase 2 D-03); fire-and-forget; `EMAIL_FROM` default. |

**Key insight:** Phase 8 introduces exactly two new things — the `googleapis` package and `postgresql17-client` in the Docker image. Every other capability is composition of existing, proven code. The highest-risk item is the Dockerfile change (it ships with Phase 8's execution, after Phase 7 deploy is unblocked).

## Common Pitfalls

### Pitfall 1: pg_dump client/server major-version mismatch
**What goes wrong:** `pg_dump: error: aborting because of server version mismatch` — the runtime image's `pg_dump` is older than the Postgres server.
**Why it happens:** `pg_dump` requires the client major version to be **>= the server major version**. The default `postgresql-client` Alpine package may lag. Server is Postgres 17 (docker-compose + Coolify managed).
**How to avoid:** Explicitly install `postgresql17-client` (not the generic `postgresql-client`) in the Dockerfile runner stage from the Alpine edge/main repo. Verify with `pg_dump --version` in the image. [CITED: pkgs.alpinelinux.org/package/edge/main/x86/postgresql17-client — 17.10-r0]
**Warning signs:** First backup job logs "server version mismatch".

### Pitfall 2: CREATE DATABASE inside a transaction (SQLSTATE 25001)
**What goes wrong:** `CREATE DATABASE cannot run inside a transaction block`.
**Why it happens:** Some ORMs/drivers auto-wrap queries in transactions. node-postgres `Client` does NOT (only explicit `BEGIN` does) — but a Drizzle transaction or `db.transaction()` WOULD.
**How to avoid:** Use a raw `pg.Client` connected to the `postgres` maintenance DB (not the Drizzle `db` wrapper) for CREATE/DROP DATABASE. Never wrap in `BEGIN`/`COMMIT`. [CITED: postgresql.org/docs/current/sql-createdatabase.html]
**Warning signs:** Restore-drill fails with SQLSTATE 25001.

### Pitfall 3: Duplicate cron firing across replicas
**What goes wrong:** If a second Coolify replica is added, each instance runs its own `node-cron` → double backups / double drills.
**Why it happens:** node-cron is in-process with no distributed coordination.
**How to avoid:** v1 is single-instance (documented ISR scaling cliff, D-11). **Do not solve in v1.** Document that adding a replica requires a distributed lock (Redis `SET NX` lease) or moving backups to an external scheduler. Add a code comment + a docs/adr note.
**Warning signs:** Backup counts double after a scale-out event (v2+ concern).

### Pitfall 4: Google refresh_token lost on re-auth
**What goes wrong:** The admin re-authorizes Drive and no `refresh_token` comes back — backups can no longer authenticate.
**Why it happens:** Google only returns a `refresh_token` on the FIRST authorization, unless `prompt: 'consent'` is set.
**How to avoid:** ALWAYS pass `access_type: 'offline'` + `prompt: 'consent'` in `generateAuthUrl`. Store the refresh token encrypted immediately. [CITED: developers.google.com/identity/protocols/oauth2/web-server]
**Warning signs:** Drive destination "Test connection" succeeds once then fails with invalid_grant.

### Pitfall 5: DROP DATABASE blocked by active connections
**What goes wrong:** `DROP DATABASE backup_verify` fails: "database is being accessed by other users".
**Why it happens:** The restore-drill's `pg_restore` connection (or a pooled connection) is still open.
**How to avoid:** Before DROP, run `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='backup_verify'` on the maintenance connection, THEN DROP. Close all clients to `backup_verify` first.
**Warning signs:** Drill fails at teardown, leaving `backup_verify` behind.

### Pitfall 6: Backup secrets leak into the standalone build output
**What goes wrong:** Google client secret / R2 keys baked into the Docker image layers.
**Why it happens:** Putting secrets in `ARG`/`ENV` in the builder/runner stages.
**How to avoid:** Follow the Phase 7 D-21 boundary — backup creds are RUNTIME secrets injected by Coolify at container start, NEVER build-time ARG/ENV. The `googleapis` client secret (`GOOGLE_CLIENT_SECRET`) and backup R2 keys are env vars injected at `docker run`. The negative-grep acceptance criterion (Phase 7) must extend to cover the new backup env vars. [VERIFIED: codebase — Dockerfile D-21 boundary]

### Pitfall 7: pg_dump password exposure in process list
**What goes wrong:** The DB password appears in `ps`/process args when passing the full connection URI to `pg_dump -d`.
**Why it happens:** `-d "postgresql://user:pass@host/db"` exposes the password to anyone who can list processes.
**How to avoid:** Inside the single-tenant Coolify container this is low-risk (one operator), but the safer pattern is: pass `-h host -p port -U user -d dbname` as separate args and set `PGPASSWORD` in the `execFile` `env` option. Recommend this for defense-in-depth. The planner decides the exact arg shape.

## Code Examples

### Backup Settings Server Action (mirrors storage-settings.ts)
```typescript
// src/actions/backup-settings.ts — admin-only, requireRole('admin') FIRST
"use server";
import { requireRole } from "@/lib/permissions";
import { encrypt, decrypt, redactCredentials } from "@/lib/crypto";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { backupSettingsSchema } from "./backup-settings-schema";

export async function saveBackupSettings(input: unknown): Promise<{ ok: true }> {
  await requireRole("admin");                          // FIRST — Pitfall #1
  const data = backupSettingsSchema.parse(input);

  await upsertSetting("backup.config", JSON.stringify({
    enabled: data.enabled,
    destinations: data.destinations,                   // {local,r2,gdrive} booleans
    scheduleCron: data.scheduleCron,
    retentionDays: data.retentionDays,
    drillEnabled: data.drillEnabled,
    drillCron: data.drillCron,
    alertEmail: data.alertEmail,
  }));

  if (data.r2 && hasSecret(data.r2)) {
    await upsertSetting("backup.r2_creds", encrypt(JSON.stringify(data.r2)));
  }
  if (data.gdrive?.refreshToken) {
    await upsertSetting("backup.gdrive_creds", encrypt(JSON.stringify({ refreshToken: data.gdrive.refreshToken })));
  }
  return { ok: true };
}

export async function getBackupSettings() {
  await requireRole("admin");
  const config = JSON.parse((await readSetting("backup.config")) ?? "{}");
  const r2Blob = await readSetting("backup.r2_creds");
  const gdriveBlob = await readSetting("backup.gdrive_creds");
  return {
    ...config,
    r2: r2Blob ? redactCredentials(JSON.parse(decrypt(r2Blob))) : undefined,
    gdrive: gdriveBlob ? redactCredentials(JSON.parse(decrypt(gdriveBlob))) : undefined,
  };
}

export async function triggerBackupNow(): Promise<{ ok: boolean; error?: string }> {
  await requireRole("admin");
  try { await runBackupJob(); return { ok: true }; }
  catch (e) { return { ok: false, error: String(e) }; }
}
```
[VERIFIED: codebase — src/actions/storage-settings.ts is the verbatim pattern (requireRole FIRST → Zod → encrypt → upsertSetting → redactCredentials on read)]

### R2 media sync (full bucket copy)
```typescript
// src/lib/backup/media-sync.ts — ListObjectsV2 + per-object copy
import { S3Client, ListObjectsV2Command, CopyObjectCommand } from "@aws-sdk/client-s3";

/**
 * Full copy of the media R2 bucket to a backup destination.
 * v1 approach: full bucket copy each backup (simplest correct — full DR is the requirement).
 * R2→R2 same-provider uses CopyObject (server-side, no bandwidth, no local buffer).
 * R2→local/Drive uses GetObject → buffer → destination.upload.
 */
export async function syncMediaBucket(opts: {
  source: { client: S3Client; bucket: string };
  destKeyPrefix: string;                        // e.g. "media-20260729/"
  uploadObject: (key: string, buf: Buffer) => Promise<void>;
}): Promise<number> {
  let token: string | undefined;
  let copied = 0;
  do {
    const listed = await opts.source.client.send(new ListObjectsV2Command({
      Bucket: opts.source.bucket, ContinuationToken: token,
    }));
    for (const obj of listed.Contents ?? []) {
      const get = await opts.source.client.send(new GetObjectCommand({ Bucket, Key: obj.Key }));
      const buf = Buffer.from(await get.Body!.transformToByteArray());
      await opts.uploadObject(`${opts.destKeyPrefix}${obj.Key}`, buf);
      copied++;
    }
    token = listed.IsTruncated ? listed.NextContinuationToken : undefined;
  } while (token);
  return copied;
}
```
[VERIFIED: codebase — @aws-sdk/client-s3 already a dep; ListObjectsV2Command used in storage-settings.ts testStorageConnection]

### CREATEDB privilege grant (one-time, by a superuser)
```sql
-- Run ONCE by a Postgres superuser (or during Coolify Postgres provisioning).
-- Grants the app role the CREATEDB attribute so the restore-drill can CREATE/DROP backup_verify.
ALTER ROLE "anydiscussion" CREATEDB;

-- Verify:
SELECT rolcreatedb FROM pg_roles WHERE rolname = 'anydiscussion';  -- expect 't'
```
[ASSUMED — exact role name "anydiscussion" from docker-compose.yml POSTGRES_USER; the prod Coolify role name must be confirmed at deploy time]

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Coolify built-in Postgres backup | Dashboard-driven in-app backup (D-04) | Phase 8 decision | Multi-destination + restore-drill + dashboard config — Coolify built-in would descope BACKUP-01/05 |
| `pg_dump` plain text (`-Fp`) | `pg_dump` custom format (`-Fc`) | Long-standing PG best practice | Compression + selective (`-t`/`--use-list`) + parallel restore (`-j`). `-Fc` is the right choice (D-discretion confirmed). |
| Google service-account for Drive | OAuth user-consent (D-02) | Phase 8 decision | Standard consent UX; refresh-token model; admin-owned (not server-to-server). |
| Generic `postgresql-client` (Alpine) | Explicit `postgresql17-client` from edge repo | PG 17 era | Avoids client/server version mismatch (Pitfall 1). |

**Deprecated/outdated:**
- `pg_dump -Fp` (plain text) for automated backups — no compression, no parallel restore, no selective restore. Use `-Fc`.
- `drive` scope (full Drive access) — over-privileged. Use `drive.file` (app-created files only — least privilege sufficient for backups the app writes).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The Postgres role name in Coolify prod is `anydiscussion` (matching docker-compose `POSTGRES_USER`). | Pattern 4 / Code Examples | The `ALTER ROLE ... CREATEDB` SQL must use the actual prod role name. Confirm at deploy — low risk (operator runs the grant). |
| A2 | `postgresql17-client` from Alpine edge/main is installable on `node:20-alpine` (Alpine 3.21+). | Pitfall 1 / Standard Stack | If the base Alpine version is older, may need `--repository edge/main` (documented) or a base-image bump. Low risk — verify with `pg_dump --version` in the image. |
| A3 | The Coolify managed Postgres allows the app role to CREATE DATABASE (i.e., it is not locked down to superuser-only). | Pattern 4 / Pitfall 2 | If Coolify restricts CREATEDB, the drill needs a separate privileged role. Medium risk — confirm against the actual Coolify Postgres service config at execution time. |
| A4 | Google `drive.file` scope is sufficient for uploading backup files the app creates (and listing/deleting them for retention). | Pattern 3 | `drive.file` restricts to app-created files — listing ALL files needs `drive.metadata.readonly`. If retention cleanup needs to list app-created files, `drive.file` allows it for files the app created. Low risk — `drive.file` is the documented least-privilege scope for app file management. |
| A5 | Full bucket copy (not incremental) is acceptable for v1 media volume. | Pattern / Code Examples | If media volume is very large, a daily full copy is slow/costly. v1 content-site volume is bounded; revisit if >10k objects. Low risk for v1. |

**Note:** Most external technical claims (OAuth flow, pg_dump flags, CREATE DATABASE constraints, Alpine package) are `[CITED]` from official documentation, not `[ASSUMED]`. The assumptions above are deploy-environment-specific facts that can only be confirmed against the live Coolify target at execution time (which is deferred per CONTEXT).

## Open Questions (RESOLVED)

1. **Should the backup local destination use a `StorageProvider` or direct fs?**
   - What we know: the media local provider writes to `storage/local/`; backups should write to `storage/backups/` (separate root).
   - RESOLVED: direct `fs.writeFile` in a `LocalBackupDestination` (configurable `BACKUP_LOCAL_ROOT`) — simpler than parameterizing the media provider's root, and backups need `list`/`download` which `StorageProvider` lacks. (Captured in Pattern 1.)

2. **Does the backup R2 destination share the media R2 bucket or use a separate bucket?**
   - What we know: D-06 says backups cover "R2 media objects" (the media IS backed up). But the dump itself is also stored TO R2 as a destination.
   - RESOLVED: separate backup bucket for dump files (different lifecycle/retention than media). The media *content* is synced from the media bucket during backup. The planner clarifies the two R2 roles: (a) media bucket = source-of-truth images; (b) backup bucket = where dumps land. Use distinct creds/buckets.

3. **Restore overwrites live data — what's the confirmation gate UX?**
   - What we know: D-05 requires a confirmation dialog. Restore via `pg_restore` against the MAIN db.
   - RESOLVED: two-step confirm (type-the-db-name to proceed), and restore to the scratch DB first as a pre-flight (proves the dump restores), THEN the admin confirms the live overwrite. Planner designs the exact UX.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `pg_dump` / `pg_restore` binary | Backup dump + restore + drill | **Requires Dockerfile change** (not in node:20-alpine by default) | postgresql17-client 17.x | None — backup cannot run without it |
| Postgres server (CREATEDB role) | Restore-drill scratch DB | **Dev: yes** (docker-compose pg superuser); **Prod: needs grant** | 17 (Coolify managed) | Skip drill (D-07 degraded) — not recommended |
| `googleapis` | Google Drive destination | **Requires `pnpm add googleapis`** | 173.0.0 | Skip Drive destination (local + R2 still work) |
| Google OAuth credentials (`GOOGLE_CLIENT_ID/SECRET/REDIRECT_URI`) | Drive consent flow | **Operator must create a Google Cloud OAuth client** | — | Drive destination disabled until configured |
| `@aws-sdk/client-s3` | R2 destination + media sync | Yes (already installed) | ^3.1077.0 | — |
| `pg` (node-postgres) | Scratch-DB CREATE/DROP | Yes (already installed) | ^8.22.0 | — |
| `SETTINGS_ENCRYPTION_KEY` | Credential encryption | Yes (Phase 4) | — | — |
| `EMAIL_FROM` / Resend | Drill-failure alert | Yes (Phase 2) | — | Log-only if Resend unconfigured |

**Missing dependencies with no fallback:**
- `postgresql17-client` in the Docker image — the planner MUST include the Dockerfile `apk add` task. Without it, `pg_dump` is not found and no backup runs. (Ships at Phase 8 execution, after Phase 7 deploy is unblocked.)

**Missing dependencies with fallback:**
- Google OAuth credentials — until the operator creates a Google Cloud OAuth client + configures the redirect URI, the Drive destination is simply not enabled (local + R2 work). The "Connect Drive" button surfaces a clear "configure GOOGLE_CLIENT_ID" message.
- CREATEDB privilege — if the prod role lacks it, the restore-drill degrades to "disabled" with a settings warning (backups still run; only the drill is gated). Not recommended long-term.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (already configured — Phase 2 `vitest.config.ts`) |
| Config file | `vitest.config.ts` |
| Quick run command | `pnpm test -- --run` |
| Full suite command | `pnpm test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| BACKUP-01 | BackupDestination upload/list/download/delete round-trip (local + R2 via MinIO) | integration | `pnpm test -- --run src/lib/backup/__tests__/destinations.test.ts` | ❌ Wave 0 |
| BACKUP-02 | Google OAuth consent URL contains `access_type=offline` + `prompt=consent` + `drive.file` scope; refresh-token exchange mocked | unit | `pnpm test -- --run src/lib/backup/__tests__/google-drive.test.ts` | ❌ Wave 0 |
| BACKUP-02 | OAuth callback rejects mismatched `state` (CSRF) | unit | (same file) | ❌ Wave 0 |
| BACKUP-03 | `readBackupConfig` parses `backup.config` JSON; cron expression validation via Zod | unit | `pnpm test -- --run src/lib/backup/__tests__/config.test.ts` | ❌ Wave 0 |
| BACKUP-03 | Retention cleanup deletes dumps older than N days | unit | (same file) | ❌ Wave 0 |
| BACKUP-04 | runRestoreDrill: CREATE → restore → verify → DROP; CREATE DATABASE not wrapped in transaction | integration (pg) | `pnpm test -- --run src/lib/backup/__tests__/drill.test.ts` | ❌ Wave 0 |
| BACKUP-04 | Drill-failure path calls `sendEmail` (mocked) exactly once | unit | (same file) | ❌ Wave 0 |
| BACKUP-05 | saveBackupSettings calls `requireRole('admin')` FIRST (MUST_NOT_BE_REACHED for non-admin) | unit | `pnpm test -- --run src/actions/__tests__/backup-settings.test.ts` | ❌ Wave 0 |
| BACKUP-05 | getBackupSettings redacts secret fields (redactCredentials) | unit | (same file) | ❌ Wave 0 |
| D-03 | Encryption round-trip: encrypt(creds) → decrypt → deep-equal (reuse crypto.test.ts pattern) | unit | `pnpm test -- --run src/lib/backup/__tests__/crypto-roundtrip.test.ts` | ❌ Wave 0 |
| Pitfall 2 | CREATE DATABASE inside a transaction throws 25001 (regression guard) | unit | (drill.test.ts) | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `pnpm test -- --run` (affected files)
- **Per wave merge:** `pnpm test` (full suite)
- **Phase gate:** Full suite green before `/gsd-verify-work`; manual restore-drill run against a live Postgres (deferred to execution post-Phase-7-deploy)

### Wave 0 Gaps
- [ ] `src/lib/backup/__tests__/destinations.test.ts` — covers BACKUP-01 (Local + R2 round-trip against MinIO)
- [ ] `src/lib/backup/__tests__/google-drive.test.ts` — covers BACKUP-02 (OAuth URL shape + CSRF + mocked token exchange)
- [ ] `src/lib/backup/__tests__/config.test.ts` — covers BACKUP-03 (config parse + cron validation + retention)
- [ ] `src/lib/backup/__tests__/drill.test.ts` — covers BACKUP-04 (CREATE/restore/verify/DROP + failure-email + transaction guard)
- [ ] `src/actions/__tests__/backup-settings.test.ts` — covers BACKUP-05 (admin-gate MUST_NOT_BE_REACHED + redact-on-read)
- [ ] `googleapis` install: `pnpm add googleapis` (Wave 0 / first plan)
- [ ] Manual checkpoint: Google Cloud OAuth client creation + redirect URI (operator task, documented in runbook)

## Security Domain

> `security_enforcement: true` (config.json). ASVS Level 1.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes (admin-gated backup actions) | `requireRole('admin')` FIRST — reuses Phase 2 RBAC. Non-admin → FORBIDDEN before any DB/encryption call. |
| V3 Session Management | yes (OAuth state CSRF) | OAuth `state` token generated server-side, stored in admin session/cookie, verified on callback. Mismatched `state` rejected. |
| V4 Access Control | yes | Every backup Server Action starts with `requireRole('admin')` (NOT UI hiding). Restore action additionally requires explicit confirmation. |
| V5 Input Validation | yes | Zod schema (`backupSettingsSchema`) shared client+server; cron expressions validated; bucket names/path validated. |
| V6 Cryptography | yes | AES-256-GCM via `lib/crypto` for all backup credentials (`backup.r2_creds`, `backup.gdrive_creds`). Never hand-roll. |
| V8 Data Protection | yes | `redactCredentials` on read (secrets never sent to client); build-vs-runtime secret separation (Pitfall 6 — no secret in build layers). |
| V9 Communications | yes | OAuth callback over HTTPS; Drive API over HTTPS; R2 over HTTPS. |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| OAuth callback CSRF (forged callback) | Spoofing / Tampering | `state` token (random, session-bound, verified on callback). [CITED: developers.google.com — state param] |
| Credential exfiltration via client bundle | Information Disclosure | `redactCredentials` on read; server-only `"use server"` actions; no secret in NEXT_PUBLIC. |
| Backup secret leak into Docker image | Information Disclosure | Runtime-only env vars (D-21 boundary); negative-grep gate extended to backup env vars. |
| Over-privileged Drive scope | Elevation of Privilege | `drive.file` (app-created files only), NOT `drive` (full access). |
| Restore overwrites live data (accidental) | Tampering / Repudiation | Two-step confirmation (type db name); admin-only; audit log (`log.info`). |
| pg_dump password in process list | Information Disclosure | `execFile` (no shell); prefer `PGPASSWORD` env over CLI URI. |
| CREATEDB privilege escalation | Elevation of Privilege | CREATEDB grants DB-creation only (NOT superuser); scratch DB is dropped immediately after drill. |
| Refresh-token theft | Spoofing | Encrypted at rest (`lib/crypto`); revocation endpoint wired ("Disconnect Drive" → POST revoke). |

**Ethos tension note:** Google Drive is an external Google dependency — mild tension with the self-hosted/no-paid-API ethos. The founder **deliberately accepted** this trade-off (CONTEXT §specifics) for the off-site option. Drive is NOT a paid API (free tier sufficient for backup volume). Implement it fully per D-02; do not block, but flag in the ADR.

## Sources

### Primary (HIGH confidence)
- **Codebase (Read tool, this session):** `src/lib/storage/types.ts`, `registry.ts`, `local.ts`, `r2.ts` — StorageProvider interface + registry (upload/getPublicUrl/delete; NO list/download). `src/lib/crypto/index.ts` — AES-256-GCM encrypt/decrypt/redactCredentials. `src/lib/schedule/index.ts` + `system-publish.ts` — node-cron pattern (D-11 single-instance). `src/instrumentation.ts` — register() + NEXT_RUNTIME gate + registerStorageProvider pattern. `src/actions/storage-settings.ts` — admin-only + encrypt + upsertSetting + redactCredentials + testStorageConnection pattern. `src/app/(admin)/dashboard/settings/storage/*` — Server page + client form (RHF+Zod+useMutation+Test connection). `src/lib/email/index.ts` — Resend sendEmail (fire-and-forget). `src/db/schema.ts` — settings key-value table. `src/lib/db/index.ts` — pg Pool + DATABASE_URL. `docker-compose.yml` — Postgres 17. `Dockerfile` — node:20-alpine runner, standalone, D-21 secret boundary, non-root nextjs user.
- **npm registry (`npm view`, this session):** googleapis@173.0.0 (latest, created 2012-09-18, 9.8M/wk, no postinstall); node-cron@4.6.0 (latest; project pins 4.5.0); both verified legitimate via package-legitimacy gate.

### Secondary (MEDIUM confidence)
- [developers.google.com/identity/protocols/oauth2/web-server](https://developers.google.com/identity/protocols/oauth2/web-server) — OAuth2 web-server flow: `access_type=offline`, `prompt=consent` (required for refresh_token), `state` CSRF, `drive.file` scope, `getToken` exchange, refresh + revoke endpoints.
- [postgresql.org/docs/current/sql-createdatabase.html](https://www.postgresql.org/docs/current/sql-createdatabase.html) — CREATE DATABASE cannot run in a transaction block (SQLSTATE 25001); CREATEDB privilege required; connect to the `postgres` maintenance DB.
- [pkgs.alpinelinux.org/package/edge/main/x86/postgresql17-client](https://pkgs.alpinelinux.org/package/edge/main/x86/postgresql17-client) — postgresql17-client 17.10-r0 (Alpine edge/main) for the runner image.

### Tertiary (LOW confidence)
- Stack Overflow / community results corroborating pg_dump `-Fc` custom format + `-j` parallel restore + client/server version-matching rule (consistent with official docs).

## Metadata

**Confidence breakdown:**
- Standard stack: **HIGH** — `googleapis` verified on npm + official Google repo; `pg_dump`/`pg_restore`/`@aws-sdk`/`pg`/`node-cron` all verified (npm + codebase). Only one new package.
- Architecture: **HIGH** — every pattern is a composition of existing, proven codebase assets (storage-settings, crypto, schedule, email, registry). The new `BackupDestination` interface is a small, well-justified extension.
- Pitfalls: **HIGH** — pg_dump version-match, CREATE-DATABASE-in-transaction, refresh-token-loss, secret-leak, and process-list exposure are all documented with official-source mitigations.
- Deploy-environment specifics (Coolify role name, CREATEDB availability, Alpine base version): **MEDIUM** — confirmed against docker-compose for dev; prod specifics deferred to execution (A1–A3).

**Research date:** 2026-07-29
**Valid until:** 2026-08-28 (30 days — stable domain; `googleapis` and PG tooling change slowly)
