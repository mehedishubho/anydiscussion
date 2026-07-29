# Phase 8: Backup & Disaster Recovery - Pattern Map

**Mapped:** 2026-07-29
**Files analyzed:** 18 (15 new, 3 modified; 1 confirmed-no-change)
**Analogs found:** 15 / 17 actionable files (2 have no in-repo analog → use RESEARCH.md patterns)

This phase is heavily reuse-driven. Every primitive the backup system needs already exists in the codebase — the planner/executor should replicate the exact signatures below, not approximate them. The two genuinely new shapes (Google Drive `googleapis` OAuth + `child_process.execFile` for `pg_dump`) have no in-repo analog and must follow `08-RESEARCH.md` Pattern 3 and Pattern 2 respectively.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| **NEW** `src/lib/backup/types.ts` | types/interface | transform | `src/lib/storage/types.ts` | exact (shape) |
| **NEW** `src/lib/backup/registry.ts` | registry | CRUD | `src/lib/storage/registry.ts` | exact |
| **NEW** `src/lib/backup/destinations/local.ts` | provider/adapter | file-I/O | `src/lib/storage/local.ts` (non-image branch) | role-match |
| **NEW** `src/lib/backup/destinations/r2.ts` | provider/adapter | request-response (S3) | `src/lib/storage/r2.ts` (non-image branch) | role-match |
| **NEW** `src/lib/backup/destinations/google-drive.ts` | provider/adapter | request-response (OAuth + Drive API) | NONE in repo → `08-RESEARCH.md` Pattern 3 | none |
| **NEW** `src/lib/backup/dump.ts` | utility (shell-out) | file-I/O (subprocess) | NONE in repo (no `child_process` use exists) → `08-RESEARCH.md` Pattern 2 | none |
| **NEW** `src/lib/backup/config.ts` | service (settings I/O) | CRUD | `src/actions/storage-settings.ts` (`readSetting`/`upsertSetting`) | exact |
| **NEW** `src/lib/backup/media-sync.ts` | service (R2 bucket copy) | batch (paginated) | `src/actions/storage-settings.ts` (`testStorageConnection` r2 case) | role-match |
| **NEW** `src/lib/backup/job.ts` | service (orchestrator) | batch | `src/lib/schedule/index.ts` (tick body) | role-match |
| **NEW** `src/lib/backup/drill.ts` | service (orchestrator) | batch (CREATE/restore/verify/DROP) | NONE in repo (needs raw `pg.Client`, not Drizzle) → `08-RESEARCH.md` Pattern 4 | none |
| **NEW** `src/lib/backup/restore.ts` | service (manual restore) | file-I/O (subprocess) | sibling of `drill.ts` (same `pg_restore` wrapper) | partial (sibling not yet built) |
| **NEW** `src/actions/backup-settings.ts` | Server Action | request-response | `src/actions/storage-settings.ts` | exact |
| **NEW** `src/actions/backup-settings-schema.ts` | pure Zod schema | transform | `src/actions/storage-settings-schema.ts` | exact |
| **NEW** `src/app/(admin)/dashboard/settings/backup/page.tsx` | Server Component page | request-response | `src/app/(admin)/dashboard/settings/storage/page.tsx` | exact |
| **NEW** `src/app/(admin)/dashboard/settings/backup/BackupSettingsForm.tsx` | client component / form | request-response | `src/app/(admin)/dashboard/settings/storage/StorageSettingsForm.tsx` | exact |
| **NEW** `src/app/(admin)/dashboard/settings/backup/schema-client.ts` | schema bridge | transform | `src/app/(admin)/dashboard/settings/storage/schema-client.ts` | exact |
| **NEW** `src/app/api/auth/google/callback/route.ts` | Route Handler | request-response (OAuth) | `src/app/api/media/[...path]/route.ts` (Next 16 async-params shape) + `src/app/api/auth/[...all]/route.ts` | role-match |
| **MODIFIED** `src/instrumentation.ts` | instrumentation hook | event-driven (boot) | (itself — extend `register()`) | exact |
| **MODIFIED** `src/lib/schedule/index.ts` | scheduler | event-driven (cron) | (itself — add 2 `cron.schedule` entries) | exact |
| **MODIFIED** `Dockerfile` | config (runner stage) | n/a | (itself — Stage 3 runner) | exact |
| **NO CHANGE** `src/db/schema.ts` | model | n/a | `settings` key-value table already sufficient | n/a |

## Pattern Assignments

### `src/lib/backup/types.ts` (interface — NEW)

**Analog:** `src/lib/storage/types.ts` (lines 29-88)

The `BackupDestination` interface is a clean, dump-shaped contract — **richer than `StorageProvider`** (adds `list` + `download` for retention/restore) and **narrower** (no `getPublicUrl`, no sharp variants — backups are private buffers, not CDN-served images). Do NOT overload `StorageProvider` (its `upload` returns `{variants, primary}` and runs sharp for `image/*` mimes — wrong shape for a dump file).

Excerpt the discriminator + interface shape from `src/lib/storage/types.ts:29-37` (replicate the doc convention):

```typescript
// src/lib/storage/types.ts:29-37 — the pattern to mirror
export interface StorageProvider {
  /**
   * Discriminator — also the value written to settings.
   */
  readonly name: "local" | "r2" | "cloudinary" | "push-cdn";
  // ...
}
```

Define `BackupDestination` per `08-RESEARCH.md` Pattern 1 (lines 222-243): `readonly name: "local" | "r2" | "gdrive"` + `upload(buffer, key, mimeType?)` + `list(prefix?)` + `download(key)` + `delete(key)` + `testConnection()`. The `upload` return shape is `{ key, sizeBytes }` (no variants, no width/height).

---

### `src/lib/backup/registry.ts` (registry — NEW)

**Analog:** `src/lib/storage/registry.ts` (full file, 105 lines)

Replicate the **map + `registerStorageProvider` + `getActiveProvider`** trio. The backup variant is `getEnabledDestinations()` (returns an array — multi-select, not single-active like `getActiveProvider`).

Excerpt the registry seed + register hook from `src/lib/storage/registry.ts:32-53`:

```typescript
// src/lib/storage/registry.ts:32-53 — the pattern to mirror
const providers: Record<string, StorageProvider> = {
  local: localProvider,
  r2: r2Provider,
};

export function registerStorageProvider(
  name: string,
  provider: StorageProvider,
): void {
  providers[name] = provider;
}
```

Excerpt the settings-driven resolution + default-safe fallback from `src/lib/storage/registry.ts:69-78`:

```typescript
// src/lib/storage/registry.ts:69-78 — settings read + default-safe fallback
export async function getActiveProvider(): Promise<StorageProvider> {
  const [row] = await db
    .select()
    .from(schema.settings)
    .where(eq(schema.settings.key, "storage.active_provider"))
    .limit(1);

  const name = (row?.value as string | null | undefined) ?? "local";
  return providers[name] ?? providers.local;
}
```

For backup: read `backup.config` (a JSON blob, not a single string), parse `destinations: {local, r2, gdrive}` booleans, return each enabled destination from the map. `local` is always present (default-on per D-01).

---

### `src/lib/backup/destinations/local.ts` (provider — NEW)

**Analog:** `src/lib/storage/local.ts` — but ONLY the **non-image raw-buffer branch** (lines 103-111); ignore the sharp-variant image branch (lines 66-101).

Backups upload a single dump buffer — no sharp, no variants. Excerpt the raw-write path from `src/lib/storage/local.ts:103-111`:

```typescript
// src/lib/storage/local.ts:103-111 — the raw-buffer write to mirror
// D-07: non-image → store the raw buffer as-is at LOCAL_ROOT/${baseKey}.
const dest = path.join(LOCAL_ROOT, baseKey);
await fs.mkdir(path.dirname(dest), { recursive: true });
await fs.writeFile(dest, buffer);
return {
  variants: [],
  primary: { key: baseKey, sizeBytes: buffer.length },
};
```

Also excerpt the idempotent `delete` + `LOCAL_ROOT` env-override (lines 35-36, 119-123):

```typescript
// src/lib/storage/local.ts:35-36 — env-override root (mirror for BACKUP_LOCAL_ROOT)
const LOCAL_ROOT =
  process.env.STORAGE_LOCAL_ROOT ?? path.resolve(process.cwd(), "storage/local");

// src/lib/storage/local.ts:119-123 — idempotent delete
async delete(key) {
  await fs.unlink(path.join(LOCAL_ROOT, key)).catch(() => {});
},
```

Plus the path-traversal defense (lines 50-54) — keep `assertSafeBaseKey` for the backup local destination too. Add `list(prefix)` (`fs.readdir` filtered) + `download(key)` (`fs.readFile`) + `testConnection()` (`fs.access(BACKUP_LOCAL_ROOT)`, mirroring `testStorageConnection`'s local case at `src/actions/storage-settings.ts:208-210`).

---

### `src/lib/backup/destinations/r2.ts` (provider — NEW)

**Analog:** `src/lib/storage/r2.ts` — but ONLY the **non-image `PutObjectCommand` branch** (lines 43-58); ignore the sharp-variant `uploadImageVariants` branch.

**CRITICAL (08-RESEARCH.md Anti-Pattern):** the backup R2 destination MUST use a **dedicated `S3Client` + dedicated backup bucket** — do NOT reuse `getActiveProvider()` or `s3Client` from `lib/r2` (those point at the *media* bucket with media creds). Excerpt the non-image PutObject shape from `src/lib/storage/r2.ts:43-58`:

```typescript
// src/lib/storage/r2.ts:43-58 — the raw PutObject pattern (mirror, but own client+bucket)
const bucket = process.env.S3_BUCKET || "anydiscussion-media";
await s3Client.send(
  new PutObjectCommand({
    Bucket: bucket,
    Key: baseKey,
    Body: buffer,
    ContentType: mimeType,
  }),
);
```

For backup: instantiate a dedicated `S3Client` from decrypted `backup.r2_creds` (see `testStorageConnection`'s r2 case at `src/actions/storage-settings.ts:213-229` for the exact client-construction shape). Add `list` (`ListObjectsV2Command` with pagination — see `media-sync.ts` analog below) + `download` (`GetObjectCommand` → `transformToByteArray`) + `delete` (`DeleteObjectCommand` with `.catch(()=>{})` per `src/lib/storage/r2.ts:67-76`).

---

### `src/lib/backup/destinations/google-drive.ts` (provider — NEW, NO ANALOG)

**No in-repo analog** (no `googleapis` usage, no OAuth flow exists). Follow `08-RESEARCH.md` Pattern 3 (lines 286-324) verbatim for the three pieces: `buildConsentUrl(state)`, `exchangeCode(code)` (called from the callback Route Handler), `uploadToDrive(buffer, key)`.

Required params for `generateAuthUrl` (non-negotiable — `08-RESEARCH.md` Pitfall 4): `access_type: "offline"` + `prompt: "consent"` + `scope: ["https://www.googleapis.com/auth/drive.file"]` + `state` (CSRF token). Store the refresh token via `encrypt(JSON.stringify({ refreshToken }))` → `upsertSetting("backup.gdrive_creds", blob)` (the callback Route Handler does this; see its entry below).

`testConnection()` for Drive: a minimal `drive.files.list({ pageSize: 1 })` to validate the refresh token round-trips.

The `googleapis` package is the **only new runtime dep** this phase: `pnpm add googleapis` (`08-RESEARCH.md` Standard Stack, verified v173.0.0).

---

### `src/lib/backup/dump.ts` (utility — NEW, NO ANALOG)

**No in-repo analog** — `Grep("child_process|execFile|spawn", src/)` returns only `src/lib/redis/index.ts` (a comment about Redis sockets, not subprocess usage). There is **zero existing `child_process` usage** in the source tree.

Follow `08-RESEARCH.md` Pattern 2 (lines 249-279) verbatim. Use `execFile` (NOT `exec` — the connection string carries the DB password; `08-RESEARCH.md` Anti-Pattern + Pitfall 7). Export two functions: `pgDump(): Promise<Buffer>` and `pgRestore(dump: Buffer, targetDbUrl: string): Promise<void>`.

Signatures to replicate (`08-RESEARCH.md:261-279`):

```typescript
import { execFile } from "node:child_process";
import { promisify } from "node:util";
const execFileAsync = promisify(execFile);

export async function pgDump(): Promise<Buffer> {
  const tmp = path.join(os.tmpdir(), `anydiscussion-${ts()}.sqlc`);
  await execFileAsync("pg_dump", ["-Fc", "-d", process.env.DATABASE_URL!, "-f", tmp], {
    env: { ...process.env },
    maxBuffer: 1024 * 1024 * 1024,
  });
  const buf = await fs.readFile(tmp);
  await fs.unlink(tmp).catch(() => {});
  return buf;
}
```

**Pitfall 1 (08-RESEARCH.md):** the runtime image needs `postgresql17-client` (see MODIFIED `Dockerfile` entry) or `pg_dump` is not found / mismatches the PG17 server.

---

### `src/lib/backup/config.ts` (settings I/O — NEW)

**Analog:** `src/actions/storage-settings.ts` (`readSetting` lines 68-75, `upsertSetting` lines 83-96).

Replicate the read/upsert helpers verbatim (or import them — they are module-private in `storage-settings.ts`, so likely re-extract to `src/actions/settings.ts` or duplicate). Excerpt `src/actions/storage-settings.ts:68-96`:

```typescript
// src/actions/storage-settings.ts:68-96 — read + upsert helpers (mirror verbatim)
async function readSetting(key: string): Promise<string> {
  const [row] = await db
    .select()
    .from(schema.settings)
    .where(eq(schema.settings.key, key))
    .limit(1);
  return (row?.value as string | null | undefined) ?? "";
}

async function upsertSetting(key: string, value: string): Promise<void> {
  const updated = await db
    .update(schema.settings)
    .set({ value, updatedAt: new Date() })
    .where(eq(schema.settings.key, key));
  if (!updated || (Array.isArray(updated) && updated.length === 0)) {
    await db
      .insert(schema.settings)
      .values({ key, value })
      .onConflictDoNothing();
  }
}
```

Implement `readBackupConfig()` (reads `backup.config` JSON, parses with the Zod schema) and `writeBackupConfig(...)`. Settings key scheme per `08-RESEARCH.md` Pattern 6 (lines 414-422): `backup.config` (plaintext JSON), `backup.r2_creds` (encrypted), `backup.gdrive_creds` (encrypted), `backup.local_path` (plaintext), `backup.last_run`, `backup.last_drill` (plaintext status).

---

### `src/lib/backup/media-sync.ts` (R2 bucket copy — NEW)

**Analog:** `src/actions/storage-settings.ts` `testStorageConnection` r2 case (lines 213-229) — shows the `S3Client` construction + `ListObjectsV2Command` shape.

The media-sync needs paginated `ListObjectsV2Command` + per-object `GetObjectCommand`/`CopyObjectCommand`. Excerpt the S3 client + list shape from `src/actions/storage-settings.ts:213-229`:

```typescript
// src/actions/storage-settings.ts:213-229 — S3Client + ListObjectsV2 pattern
const client = new S3Client({
  region: String(creds.region ?? "us-east-1"),
  endpoint: String(creds.endpoint ?? ""),
  credentials: {
    accessKeyId: String(creds.accessKeyId ?? ""),
    secretAccessKey: String(creds.secretAccessKey ?? ""),
  },
  forcePathStyle: Boolean(creds.forcePathStyle),
});
await client.send(
  new ListObjectsV2Command({
    Bucket: String(creds.bucket ?? ""),
    MaxKeys: 1,                              // backup media-sync drops MaxKeys + loops ContinuationToken
  }),
);
```

Full copy loop shape per `08-RESEARCH.md` Code Examples (lines 544-575). The source client is the *media* R2 bucket; the destination upload callback fans out to each enabled `BackupDestination.upload`.

---

### `src/lib/backup/job.ts` (orchestrator — NEW)

**Analog:** `src/lib/schedule/index.ts` (the cron tick body, lines 32-43) — same try/catch resilience pattern.

`runBackupJob()` orchestrates: `pgDump()` → `syncMediaBucket(...)` → for each enabled destination `dest.upload(dump, key)` → retention cleanup (`dest.list()` → `dest.delete()` for keys older than `retentionDays`). Wrap the whole thing in try/catch + `log.error` exactly as the schedule tick does. Excerpt `src/lib/schedule/index.ts:32-43`:

```typescript
// src/lib/schedule/index.ts:32-43 — the tick-resilience pattern to mirror
return cron.schedule("* * * * *", async () => {
  try {
    const published = await publishDueScheduledPosts();
    if (published > 0) {
      log.info("schedule-tick", { published });
    }
  } catch (err) {
    // Resilience — don't crash the worker on a transient error.
    log.error("schedule-tick failed", { error: String(err) });
  }
});
```

Use the same `log` from `@/lib/log` for structured logging. Update `backup.last_run` settings key on completion.

---

### `src/lib/backup/drill.ts` (restore-drill — NEW, NO DIRECT ANALOG)

**No direct analog.** The codebase uses Drizzle exclusively (`src/lib/db/index.ts`); the drill needs a **raw `pg.Client`** because `CREATE DATABASE` / `DROP DATABASE` cannot run in a transaction (SQLSTATE 25001 — `08-RESEARCH.md` Pitfall 2), and Drizzle's `db.transaction()` would wrap it. The `pg` package IS installed (Drizzle's driver — `src/lib/db/index.ts:10`), so import `{ Client } from "pg"` directly.

Reference the connection-string source from `src/lib/db/index.ts:13-15` (the drill parses `DATABASE_URL` to swap the dbname):

```typescript
// src/lib/db/index.ts:13-15 — the connection-string source (drill swaps dbname)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});
```

Follow `08-RESEARCH.md` Pattern 4 (lines 336-368) verbatim for the `withMaintenanceClient` helper + the CREATE → `pgRestore` → verify → terminate → DROP sequence. The `pg_terminate_backend` + `DROP DATABASE IF EXISTS` teardown is MANDATORY in a `finally` block (`08-RESEARCH.md` Pitfall 5 — active connections block DROP).

Drill-failure alert: wrap the caller (the cron entry in `startScheduler`) in try/catch → `sendEmail({ to: alertEmail, subject: "Backup restore-drill FAILED", text })` on caught error.

---

### `src/lib/backup/restore.ts` (manual restore — NEW)

Sibling of `drill.ts` — reuses `pgRestore(dump, targetDbUrl)` from `src/lib/backup/dump.ts`. The difference: restore targets the **MAIN db** (overwrite live data), not `backup_verify`. Gated by a two-step confirmation in the UI (`08-RESEARCH.md` Open Question 3). The action wrapper lives in `src/actions/backup-settings.ts` (`restoreBackup`).

---

### `src/actions/backup-settings.ts` (Server Action — NEW)

**Analog:** `src/actions/storage-settings.ts` (full file, 251 lines) — this is a **verbatim-pattern sibling**. Mirror: top `"use server"` directive → imports → `readSetting`/`upsertSetting` helpers → `saveBackupSettings` → `getBackupSettings` → `testBackupConnection` → (add) `triggerBackupNow` + `restoreBackup`.

Excerpt the security-ordering pattern (non-negotiable, `08-RESEARCH.md` V4 / Pitfall 1) from `src/actions/storage-settings.ts:110-118`:

```typescript
// src/actions/storage-settings.ts:110-118 — requireRole('admin') FIRST, before parse/encrypt/DB
export async function saveStorageSettings(
  input: StorageSettingsInput | unknown,
): Promise<{ ok: true }> {
  // 1. Admin re-check FIRST (D-23). Before any encryption or DB write.
  await requireRole("admin");

  // 2. Validate via the shared Zod schema (Pitfall #1 — never trust the client shape).
  const data = storageSettingsSchema.parse(input);
  // ...
```

Excerpt the encrypt-then-upsert cred pattern from `src/actions/storage-settings.ts:122-139`:

```typescript
// src/actions/storage-settings.ts:122-132 — encrypt JSON blob → upsert settings row
if (data.r2 && !hasNoSecrets(data.r2, SECRET_FIELDS.r2)) {
  const blob = encrypt(JSON.stringify(data.r2));
  await upsertSetting(CREDS_KEYS.r2, blob);
}
```

Excerpt the decrypt-then-redact-on-read pattern from `src/actions/storage-settings.ts:170-186`:

```typescript
// src/actions/storage-settings.ts:176-184 — decrypt + redactCredentials on read
...(cloudinaryBlob
  ? { cloudinary: redactCredentials(JSON.parse(decrypt(cloudinaryBlob))) }
  : {}),
```

Excerpt the never-throws `testStorageConnection` shape from `src/actions/storage-settings.ts:200-250` — backup's `testBackupConnection` returns `{ ok, error? }` the same way; the gdrive case validates the OAuth refresh token.

Add `triggerBackupNow` / `restoreBackup` per `08-RESEARCH.md` Code Examples (lines 500-540) — both start with `await requireRole("admin")`, both wrap the job/restore call in try/catch returning `{ ok, error? }`.

---

### `src/actions/backup-settings-schema.ts` (pure Zod schema — NEW)

**Analog:** `src/actions/storage-settings-schema.ts` (full file, 99 lines).

Replicate the pattern: pure Zod v4 module (NO `"use server"` / `"use client"`), shared between the client form (via `zodResolver`) and the Server Action (via `.parse()`). Mirror `08-RESEARCH.md` "Pattern 6" settings scheme. Excerpt the secret-field convention from `src/actions/storage-settings-schema.ts:34-49`:

```typescript
// src/actions/storage-settings-schema.ts:34-49 — secret fields use z.string() (NOT .min(1))
// so empty strings are valid — the save action treats empty-secret as "no change" (Pitfall 7).
export const r2CredsSchema = z.object({
  endpoint: z.string(),
  region: z.string(),
  accessKeyId: z.string(),
  secretAccessKey: z.string(),         // empty = "no change" on save
  bucket: z.string(),
  forcePathStyle: z.boolean(),
});
```

Also excerpt `hasNoSecrets` + `SECRET_FIELDS` (lines 87-99) — backup mirrors this for `backup.r2_creds` + `backup.gdrive_creds`. Add a `zod.refine` or regex on cron expressions for `scheduleCron` / `drillCron` (validate via `node-cron`'s `validate` if exposed, else a regex — `08-RESEARCH.md` BACKUP-03 test map).

---

### `src/app/(admin)/dashboard/settings/backup/page.tsx` (Server Component — NEW)

**Analog:** `src/app/(admin)/dashboard/settings/storage/page.tsx` (full file, 50 lines).

Mirror verbatim: Server Component (NO `"use client"`), `metadata` export, `getBackupSettings()` call in try/catch, hand the (redacted) initial state to `<BackupSettingsForm>`. Excerpt `src/app/(admin)/dashboard/settings/storage/page.tsx:19-49`:

```typescript
// src/app/(admin)/dashboard/settings/storage/page.tsx:19-49 — the page shell to mirror
export default async function StorageSettingsPage() {
  let initial: Awaited<ReturnType<typeof getStorageSettings>> | null = null;
  let loadError: string | null = null;
  try {
    initial = await getStorageSettings();   // → getBackupSettings()
  } catch (e) {
    loadError = e instanceof Error ? e.message : String(e);
  }

  return (
    <div className="mx-auto max-w-4xl p-6">
      <header className="mb-6"> ... </header>
      {loadError ? (
        <div className="rounded-lg border border-error-300 ..."> ... </div>
      ) : (
        <StorageSettingsForm initial={initial ?? { activeProvider: "local" }} />
      )}
    </div>
  );
}
```

---

### `src/app/(admin)/dashboard/settings/backup/BackupSettingsForm.tsx` (client form — NEW)

**Analog:** `src/app/(admin)/dashboard/settings/storage/StorageSettingsForm.tsx` (full file, 351 lines).

This is the largest UI mirror in the phase. Reuse: `"use client"` directive, `useForm` + `zodResolver`, `useMutation` (NOT optimistic — high-stakes), `ProbeStatus` type, `Field`/`ProviderSection` helpers, and the Test-connection button wiring (lines 108-132). Excerpt the form skeleton from `src/app/(admin)/dashboard/settings/storage/StorageSettingsForm.tsx:56-100`:

```typescript
// src/app/(admin)/dashboard/settings/storage/StorageSettingsForm.tsx:56-100 — RHF + useMutation
export default function StorageSettingsForm({ initial }: StorageSettingsFormProps) {
  const [probe, setProbe] = useState<Record<string, ProbeStatus>>({});
  const { register, handleSubmit, watch, getValues } = useForm<StorageSettingsInput>({
    resolver: zodResolver(storageSettingsSchema),
    defaultValues: { /* ...non-secret fields pre-filled, secret fields empty (Pitfall 7) */ },
  });
  // D-27 — NOT optimistic. High-stakes mutation (credentials); server confirms.
  const mutation = useMutation({
    mutationFn: (values: StorageSettingsInput) => saveStorageSettings(values),
  });
  // ...
```

**Difference from Storage Settings:** Backup uses **multi-select destinations** (checkboxes for local/r2/gdrive, all can be enabled simultaneously) — NOT the single active-provider `<select>` at lines 145-161. Each destination section renders its own credential fields + Test-connection button. Add the "Backup now" button (calls `triggerBackupNow()`) and the "Restore" action (lists past backups via `dest.list()`, confirmation dialog gating overwrite). Excerpt the probe-handler shape from `src/app/(admin)/dashboard/settings/storage/StorageSettingsForm.tsx:108-132`:

```typescript
// src/app/(admin)/dashboard/settings/storage/StorageSettingsForm.tsx:108-132 — Test connection wiring
const handleTest = async (provider: string) => {
  setProbe((p) => ({ ...p, [provider]: { state: "probing" } }));
  try {
    const values = getValues();
    let creds: Record<string, unknown> = {};
    if (provider === "r2") creds = values.r2 ?? {};
    const result = await testStorageConnection(provider, creds);  // → testBackupConnection()
    setProbe((p) => ({
      ...p,
      [provider]: result.ok ? { state: "ok" } : { state: "error", message: result.error ?? "Unknown error" },
    }));
  } catch (e) { /* ... */ }
};
```

For Google Drive, the section shows a "Connect Drive" button (redirects to `buildConsentUrl` via a server-fetched URL) instead of credential fields — the OAuth flow fills the token via the callback.

---

### `src/app/(admin)/dashboard/settings/backup/schema-client.ts` (schema bridge — NEW)

**Analog:** `src/app/(admin)/dashboard/settings/storage/schema-client.ts` (full file, 20 lines).

Replicate verbatim — a `"use client"` re-export module that bridges the pure schema to the client form via `zodResolver`. Excerpt `src/app/(admin)/dashboard/settings/storage/schema-client.ts:10-20`:

```typescript
// src/app/(admin)/dashboard/settings/storage/schema-client.ts:10-20 — schema bridge to mirror
import { zodResolver } from "@hookform/resolvers/zod";
export {
  backupSettingsSchema,             // was storageSettingsSchema
  type BackupSettingsInput,
  // ...cred types
} from "@/actions/backup-settings-schema";
export { zodResolver };
```

---

### `src/app/api/auth/google/callback/route.ts` (Route Handler — NEW)

**Analog (Route Handler shape):** `src/app/api/media/[...path]/route.ts` (full file, 103 lines) — shows the **Next.js 16 async-params Route Handler signature**. **Analog (auth handler mount):** `src/app/api/auth/[...all]/route.ts` (full file, 12 lines).

This is the OAuth callback — a GET handler that takes `request` + `searchParams` (Next 16 async), exchanges the `code` for tokens via `googleapis`, verifies the `state` CSRF token, encrypts the refresh token, and upserts `backup.gdrive_creds`. Excerpt the Next.js 16 Route Handler signature from `src/app/api/media/[...path]/route.ts:72-80`:

```typescript
// src/app/api/media/[...path]/route.ts:72-80 — Next.js 16 async-params Route Handler signature
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ path: string[] }> },
): Promise<Response> {
  const { path: segments } = await params;
  // ...
}
```

For the OAuth callback, the second arg is `{ searchParams }: { searchParams: Promise<Record<string, string>> }` (also awaited in Next 16). Excerpt the thin auth-handler mount from `src/app/api/auth/[...all]/route.ts:9-12` (shows the project's only existing `/api/auth/*` route — the callback is a sibling):

```typescript
// src/app/api/auth/[...all]/route.ts:9-12 — existing auth-route mount (sibling pattern)
import { auth } from "@/lib/auth";
import { toNextJsHandler } from "better-auth/next-js";
export const { GET, POST } = toNextJsHandler(auth);
```

The OAuth callback is a standalone `GET` export (NOT mounted via Better Auth — Google redirects here directly). Body per `08-RESEARCH.md` Pattern 3 step 2 (lines 305-312): `oauth2.getToken(code)` → `encrypt(JSON.stringify({ refreshToken: tokens.refresh_token! }))` → `upsertSetting("backup.gdrive_creds", blob)` → redirect to `/dashboard/settings/backup`.

---

### `src/instrumentation.ts` (MODIFIED)

Extend the existing `register()` body. Excerpt the current structure to extend — `src/instrumentation.ts:39-43` (the gate + startScheduler call):

```typescript
// src/instrumentation.ts:39-43 — gate + existing scheduler invocation (extend in place)
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startScheduler } = await import("@/lib/schedule");
    startScheduler();
    // ... existing seeds + provider registration continue below
```

Two changes go inside the `NEXT_RUNTIME === "nodejs"` block:
1. **Register the Google Drive destination at boot** — mirror the existing `registerStorageProvider("cloudinary", cloudinaryProvider)` dynamic-import pattern at `src/instrumentation.ts:69-101`. For backup, this is a separate backup registry (or a no-op since `getEnabledDestinations()` can resolve lazily) — planner decides.
2. **`startScheduler()` now also schedules backup + drill ticks** (see `src/lib/schedule/index.ts` MODIFIED entry below). No new instrumentation import needed if the cron entries live inside `startScheduler`.

Keep the dynamic-import discipline: `pg` / `googleapis` / `child_process` must NOT land in the Edge bundle — they stay behind the `NEXT_RUNTIME === "nodejs"` gate.

---

### `src/lib/schedule/index.ts` (MODIFIED)

Add two `cron.schedule` entries inside the existing `startScheduler()`. The current file has exactly one entry (the publish tick). Excerpt `src/lib/schedule/index.ts:30-44` (the full current body):

```typescript
// src/lib/schedule/index.ts:30-44 — current body (ADD 2 entries alongside the publish tick)
export function startScheduler() {
  // D-11: every 1 minute. v1 single-instance — no SKIP LOCKED needed.
  return cron.schedule("* * * * *", async () => {
    try {
      const published = await publishDueScheduledPosts();
      if (published > 0) { log.info("schedule-tick", { published }); }
    } catch (err) {
      log.error("schedule-tick failed", { error: String(err) });
    }
  });
}
```

Add two more `cron.schedule` calls per `08-RESEARCH.md` Pattern 5 (lines 376-407): the backup tick (reads `backup.config`, calls `runBackupJob()`) and the drill tick (reads `backup.config`, calls `runRestoreDrill()`, emails on failure). Each wrapped in the same try/catch + `log.error` pattern. **v1 single-instance caveat** (line 11 comment, plus `08-RESEARCH.md` Pitfall 3): do NOT add a distributed lock in v1 — document the multi-instance cliff in a comment + ADR.

---

### `Dockerfile` (MODIFIED)

Add `postgresql17-client` to the **Stage 3 runner** (NOT the builder — the builder doesn't run `pg_dump`). Excerpt the current runner stage from `Dockerfile:99-114`:

```dockerfile
# Dockerfile:99-114 — current runner stage (ADD apk add BEFORE the USER drop)
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Non-root user (ASVS V5 default-deny). UID/GID 1001 ...
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
```

Add (per `08-RESEARCH.md` Standard Stack + Pitfall 1, before `USER nextjs` so apk runs as root):

```dockerfile
# Phase 8 — pg_dump/pg_restore client. PG17 to match docker-compose + Coolify managed PG.
# edge/main required because postgresql17-client may lag the stable Alpine branch.
RUN apk add --no-cache --repository https://dl-cdn.alpinelinux.org/alpine/edge/main postgresql17-client
```

**Pitfall 6 (`08-RESEARCH.md`):** no Google/R2 secret goes in `ARG`/`ENV` here — all backup creds are runtime-injected by Coolify (existing D-21 boundary, lines 22-28 of the Dockerfile header comment). The Phase 7 negative-grep acceptance criterion extends to the new backup env vars (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, backup R2 keys).

---

### `src/db/schema.ts` (NO CHANGE)

Confirmed: the `settings` table is a plain key-value table and is **sufficient for all backup config + encrypted creds** — no schema migration is needed this phase. Excerpt `src/db/schema.ts:183-188`:

```typescript
// src/db/schema.ts:183-188 — settings table (NO migration needed; backup adds rows, not columns)
// settings (key-value — hard-delete per D-08; key is the PK, no serial id)
export const settings = pgTable("settings", {
  key: varchar("key", { length: 255 }).primaryKey(),
  value: text("value"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
```

New keys (`backup.config`, `backup.r2_creds`, `backup.gdrive_creds`, `backup.local_path`, `backup.last_run`, `backup.last_drill`) land as new rows via the `upsertSetting` helper. **No `drizzle-kit generate` needed this phase.**

## Shared Patterns

### Admin-only Server Action gating
**Source:** `src/lib/permissions/index.ts:40-47`
**Apply to:** `src/actions/backup-settings.ts` (every exported action: `saveBackupSettings`, `getBackupSettings`, `testBackupConnection`, `triggerBackupNow`, `restoreBackup`)
```typescript
// src/lib/permissions/index.ts:40-47 — requireRole signature + FORBIDDEN throw
export async function requireRole(role: "admin" | "editor" | "author") {
  const session = await getSessionOrThrow();
  if (session.user.role !== role && session.user.role !== "admin") {
    log.error("permission denied", { requiredRole: role, userRole: session.user.role });
    throw new Error("FORBIDDEN");
  }
  return session;
}
```
**Non-negotiable:** `await requireRole("admin")` is the FIRST line of every backup action, before any parse/encrypt/DB call (proven by the existing `MUST_NOT_BE_REACHED` test pattern in `storage-settings.test.ts`).

### Credential encryption (AES-256-GCM)
**Source:** `src/lib/crypto/index.ts` (`encrypt` lines 79-89, `decrypt` lines 98-115, `redactCredentials` lines 129-135)
**Apply to:** `src/actions/backup-settings.ts` (R2 creds + Google refresh token), `src/app/api/auth/google/callback/route.ts` (refresh-token persistence)
```typescript
// src/lib/crypto/index.ts:79-89 — envelope format "<ivB64>:<authTagB64>:<ciphertextB64>"
export function encrypt(plaintext: string): string {
  const key = getKey();                                      // lazy; reads SETTINGS_ENCRYPTION_KEY
  const iv = crypto.randomBytes(12);                         // 96-bit IV fresh per call (GCM)
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv, authTag, ciphertext].map((b) => b.toString("base64")).join(":");
}
```
Reused **unchanged** (Phase 4 D-25). The envelope fits the `settings.value` text column with no schema change. `redactCredentials` zeroes fields matching `/secret|api[-_]?key|token|password/i` — covers `secretAccessKey` and `refreshToken` automatically.

### Settings key-value read/write
**Source:** `src/actions/storage-settings.ts:68-96` + `src/actions/settings.ts:34-41, 68-79`
**Apply to:** `src/lib/backup/config.ts`, `src/app/api/auth/google/callback/route.ts`
```typescript
// src/actions/settings.ts:34-41 — readSetting (the canonical settings read path)
export async function getSetting(key: string): Promise<string | null> {
  const [row] = await db
    .select()
    .from(schema.settings)
    .where(eq(schema.settings.key, key))
    .limit(1);
  return row?.value ?? null;
}
```
The `upsertSetting` helper (update → 0 rows → insert with `onConflictDoNothing`) is duplicated between `storage-settings.ts:83-96` and `settings.ts:68-79` — the planner may choose to consolidate, or replicate again in `lib/backup/config.ts`.

### Error handling: never-throws probe pattern
**Source:** `src/actions/storage-settings.ts:200-250`
**Apply to:** `testBackupConnection` (all 3 destination cases)
```typescript
// src/actions/storage-settings.ts:244-249 — never-throws return shape
} catch (e) {
  return {
    ok: false,
    error: e instanceof Error ? e.message : String(e),
  };
}
```
Every `testBackupConnection` case wraps its probe in try/catch and returns `{ ok, error? }` — never throws (the dashboard surfaces inline ok/error feedback).

### Resilient cron tick (try/catch, never crash the worker)
**Source:** `src/lib/schedule/index.ts:32-43`
**Apply to:** the two new backup/drill cron entries in `startScheduler()`
```typescript
// src/lib/schedule/index.ts:38-42 — tick-resilience (mirror for backup + drill ticks)
} catch (err) {
  // Resilience — don't crash the worker on a transient error. The next minute's
  // tick will retry. Log for observability.
  log.error("schedule-tick failed", { error: String(err) });
}
```

### Fire-and-forget email alert
**Source:** `src/lib/email/index.ts:40-72`
**Apply to:** `src/lib/backup/drill.ts` (drill-failure alert), `src/lib/schedule/index.ts` drill tick (caller-side catch)
```typescript
// src/lib/email/index.ts:40-45 — sendEmail signature (fire-and-forget; never throws)
export async function sendEmail(params: {
  to: string;
  subject: string;
  text: string;
  html?: string;
}) {
  // ... returns silently on send failure (logs, does NOT throw)
}
```
Default `from: process.env.EMAIL_FROM ?? "onboarding@resend.dev"` — drill alerts default the recipient to `EMAIL_FROM` / `backup.alert_email`.

## No Analog Found

Files with no close in-repo match — the planner uses `08-RESEARCH.md` patterns (cited below) instead of a codebase excerpt:

| File | Role | Data Flow | Reason | Use Instead |
|------|------|-----------|--------|-------------|
| `src/lib/backup/destinations/google-drive.ts` | provider | OAuth + Drive API | No `googleapis` usage anywhere in the codebase; no OAuth consent flow exists | `08-RESEARCH.md` Pattern 3 (lines 282-325) |
| `src/lib/backup/dump.ts` | utility (subprocess) | file-I/O | Zero `child_process` / `execFile` / `spawn` usage in `src/` (only a comment-match in `lib/redis`) | `08-RESEARCH.md` Pattern 2 (lines 246-279) |
| `src/lib/backup/drill.ts` | orchestrator | CREATE/restore/verify/DROP | Codebase uses Drizzle exclusively; drill needs a raw autocommit `pg.Client` (CREATE DATABASE cannot run in a transaction) | `08-RESEARCH.md` Pattern 4 (lines 328-368); reference `src/lib/db/index.ts:13-15` only for the `DATABASE_URL` source |

## Metadata

**Analog search scope:**
- `src/lib/storage/` (types, registry, local, r2, cloudinary, push-cdn)
- `src/lib/schedule/` (index, system-publish)
- `src/lib/crypto/`, `src/lib/email/`, `src/lib/db/`, `src/lib/permissions/`
- `src/actions/` (settings, storage-settings, storage-settings-schema, seo-settings)
- `src/app/(admin)/dashboard/settings/storage/` (page, form, schema-client)
- `src/app/api/auth/[...all]/route.ts`, `src/app/api/media/[...path]/route.ts`
- `src/instrumentation.ts`, `src/db/schema.ts`, `Dockerfile`, `docker-compose.yml`

**Files scanned:** 18 source files (read in full) + Grep sweeps for `child_process`/`execFile`/`spawn`, `requireRole`, settings schema.

**Pattern extraction date:** 2026-07-29
