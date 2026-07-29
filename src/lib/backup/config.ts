// src/lib/backup/config.ts
// [CITED: 08-CONTEXT.md D-03 (creds encrypted via lib/crypto + settings table), D-09 (defaults)]
// [CITED: 08-RESEARCH.md Pattern 6 (lines 414-422) — settings key scheme]
// [CITED: 08-PATTERNS.md row config.ts — mirror src/actions/storage-settings.ts readSetting/upsertSetting]
// [CITED: src/actions/storage-settings.ts:68-96 — read/upsert helpers (replicated to avoid "use server" drift)]
// [CITED: 08-01-PLAN.md Task 1 <behavior> + <acceptance_criteria>]
//
// Settings-driven backup config I/O. Backup configuration (enabled flag, destination
// toggles, schedule cron, retention, drill cadence, alert email) persists as a plaintext
// JSON blob under settings key `backup.config` and is parsed through a Zod schema with
// D-09 defaults (daily "0 3 * * *", 30-day retention, weekly drill "0 4 * * 0").
//
// Settings key scheme (rows in the existing key/value `settings` table — NO migration):
//   backup.config       plaintext JSON — this module reads/writes it
//   backup.local_path   plaintext — local destination root (default storage/backups/)
//   backup.last_run     plaintext status JSON — written by runBackupJob ({at,ok,bytes,destinations})
//   backup.r2_creds     ENCRYPTED blob (lib/crypto) — written by 08-04, read by 08-02 destination
//   backup.gdrive_creds ENCRYPTED blob (lib/crypto) — written by 08-04/OAuth callback, read by 08-03
//
// The readSetting/upsertSetting helpers are REPLICATED here (rather than imported from the
// "use server" actions) so this pure-logic module stays decoupled + unit-testable by mocking
// @/lib/db directly (mirrors the storage __tests__/registry.test.ts mock shape).
//
// Server-only — NO "use client" directive.
import { z } from "zod";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";

/**
 * Settings keys used by the backup engine. Exported so callers (job.ts, the 08-04 actions)
 * reference the canonical strings instead of re-literalizing them.
 */
export const BACKUP_CONFIG_KEY = "backup.config";
export const BACKUP_LOCAL_PATH_KEY = "backup.local_path";
export const BACKUP_LAST_RUN_KEY = "backup.last_run";
export const BACKUP_LAST_DRILL_KEY = "backup.last_drill";
export const BACKUP_R2_CREDS_KEY = "backup.r2_creds";
export const BACKUP_GDRIVE_CREDS_KEY = "backup.gdrive_creds";

/**
 * Default local backup root when backup.local_path is unset (D-01 local default-on).
 * Distinct from the media STORAGE_LOCAL_ROOT — backups live under storage/backups/.
 */
export const DEFAULT_BACKUP_LOCAL_ROOT = "storage/backups/";

/**
 * The backup config Zod schema. Every field carries a D-09 default so a missing or partial
 * stored blob still yields a complete, valid config (readBackupConfig merges over defaults).
 *
 * scheduleCron/drillCron are validated as non-empty strings (the cron-expression validity is
 * enforced where the schedule is actually consumed — 08-05 startScheduler; a regex here would
 * reject legitimate node-cron expressions like "0 3 * * 1-5" on a too-strict pattern).
 */
const backupConfigSchema = z.object({
  enabled: z.boolean().default(true),
  destinations: z
    .object({
      local: z.boolean().default(true), // D-01: local is default-on
      r2: z.boolean().default(false),
      gdrive: z.boolean().default(false),
    })
    .default({ local: true, r2: false, gdrive: false }),
  scheduleCron: z.string().default("0 3 * * *"), // D-09: daily at 03:00 UTC
  retentionDays: z.number().int().positive().default(30), // D-09: keep 30 days
  drillEnabled: z.boolean().default(true),
  drillCron: z.string().default("0 4 * * 0"), // D-09: weekly, Sunday 04:00 UTC
  alertEmail: z.string().default(""), // defaults to EMAIL_FROM at read time
});

export type BackupConfig = z.infer<typeof backupConfigSchema>;

/**
 * Build the D-09 default config, deriving alertEmail from EMAIL_FROM when unset.
 * Used both for the "settings row absent" path and as the merge base for partial configs.
 */
function defaultConfig(): BackupConfig {
  return backupConfigSchema.parse({
    alertEmail: process.env.EMAIL_FROM ?? "",
  });
}

/**
 * Read a single settings row by key. Returns the value (string) or "" when missing.
 * Replicated from src/actions/storage-settings.ts:68-75 (kept private + db-direct so this
 * module mocks cleanly without pulling in a "use server" action).
 */
async function readSetting(key: string): Promise<string> {
  const [row] = await db
    .select()
    .from(schema.settings)
    .where(eq(schema.settings.key, key))
    .limit(1);
  return (row?.value as string | null | undefined) ?? "";
}

/**
 * Upsert a single settings row by key. update().set().where() then insert-fallback with
 * onConflictDoNothing (settings.key is the PK). Replicated from
 * src/actions/storage-settings.ts:83-96. Exported so job.ts can record backup.last_run.
 */
export async function upsertSetting(key: string, value: string): Promise<void> {
  const updated = await db
    .update(schema.settings)
    .set({ value, updatedAt: new Date() })
    .where(eq(schema.settings.key, key));
  // Drizzle node-postgres returns rowcount on update; 0 = no row matched → insert.
  if (!updated || (Array.isArray(updated) && updated.length === 0)) {
    await db
      .insert(schema.settings)
      .values({ key, value })
      .onConflictDoNothing();
  }
}

/**
 * readBackupConfig (D-03/D-09) — read + parse the `backup.config` settings row.
 *
 * Resolution order:
 *   1. Row absent or empty → D-09 defaults (alertEmail derived from EMAIL_FROM).
 *   2. Row present (partial) → merge over D-09 defaults so missing fields are filled.
 *   3. Row present (full) → parsed verbatim.
 *
 * Never throws on a well-formed JSON row — Zod applies defaults for any missing field.
 *
 * @returns A complete, validated BackupConfig.
 */
export async function readBackupConfig(): Promise<BackupConfig> {
  const raw = await readSetting(BACKUP_CONFIG_KEY);
  if (!raw) {
    return defaultConfig();
  }
  // Merge the stored blob over the env-derived defaults so a partial config still gets
  // every D-09 default. Stored non-empty values win; missing ones fall to schema defaults.
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  return backupConfigSchema.parse({
    alertEmail: process.env.EMAIL_FROM ?? "",
    ...parsed,
  });
}

/**
 * writeBackupConfig (D-03) — validate + persist the backup config as a JSON blob under
 * settings key `backup.config`. Parses through the Zod schema first so defaults are
 * applied and the stored shape is always complete + valid.
 */
export async function writeBackupConfig(input: unknown): Promise<void> {
  const config = backupConfigSchema.parse(input);
  await upsertSetting(BACKUP_CONFIG_KEY, JSON.stringify(config));
}
