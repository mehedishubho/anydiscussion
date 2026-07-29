// src/lib/backup/restore.ts
// [CITED: 08-CONTEXT.md D-05 (manual restore via pg_restore, confirmation-gated in 08-04)]
// [CITED: 08-01-PLAN.md Task 2 <behavior> + <acceptance_criteria>]
//
// Manual restore PRIMITIVES. restoreKey downloads a dump by key + runs pgRestore against
// DATABASE_URL; restoreLatest picks the newest dump across destinations + restores it.
//
// NOTE (D-05): this is the restore PRIMITIVE — it overwrites live data. The destructive
// confirmation gate (type-the-db-name two-step) is enforced in the 08-04 Server Action
// `restoreBackup`, which calls these functions AFTER the admin confirms. These functions
// themselves do NOT confirm — they restore unconditionally, by design.
//
// Server-only — NO "use client" directive.
import { pgRestore } from "./dump";
import { getEnabledDestinations } from "./registry";
import { log } from "@/lib/log";

/** Backup key pattern for selecting restorable dumps (matches job.ts BACKUP_KEY_RE). */
const BACKUP_KEY_RE = /^anydiscussion-\d{8}-\d{4}\.sqlc$/;

/**
 * restoreKey (D-05) — download a dump by key + restore it into the live DATABASE_URL.
 *
 * Iterates enabled destinations, downloading the key from the FIRST one that has it
 * (local-first by default-on ordering). Throws if no destination has the key.
 *
 * @param key The backup key (e.g. "anydiscussion-20260729-0300.sqlc").
 */
export async function restoreKey(key: string): Promise<void> {
  const dests = await getEnabledDestinations();
  let dump: Buffer | null = null;
  for (const dest of dests) {
    try {
      dump = await dest.download(key);
      break;
    } catch (e) {
      // This destination doesn't have the key — try the next one.
      log.error("restore: download failed, trying next destination", {
        dest: dest.name,
        key,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }
  if (!dump) {
    throw new Error(`Backup key not found in any enabled destination: ${key}`);
  }
  const target = process.env.DATABASE_URL;
  if (!target) {
    throw new Error("DATABASE_URL is not set — cannot restore");
  }
  await pgRestore(dump, target);
}

/**
 * restoreLatest (D-05) — pick the newest backup key across all enabled destinations +
 * restore it into the live DATABASE_URL.
 *
 * Merges each destination's backup-key list, sorts lexicographically (the YYYYMMDD-HHmm
 * prefix makes lexical order === chronological order), and restores the newest. Throws if
 * no destination has any backup.
 */
export async function restoreLatest(): Promise<void> {
  const dests = await getEnabledDestinations();
  let latest: string | null = null;
  for (const dest of dests) {
    const keys = await dest.list().catch(() => [] as string[]);
    const backupKeys = keys.filter((k) => BACKUP_KEY_RE.test(k));
    if (backupKeys.length > 0) {
      // Lexical max === newest (YYYYMMDD-HHmm sorts chronologically).
      const newest = backupKeys.sort()[backupKeys.length - 1];
      if (latest === null || newest > latest) latest = newest;
    }
  }
  if (latest === null) {
    throw new Error("No backup found to restore");
  }
  await restoreKey(latest);
}
