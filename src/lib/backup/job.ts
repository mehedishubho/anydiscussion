// src/lib/backup/job.ts
// [CITED: 08-CONTEXT.md D-04 (in-app backup job), D-09 (retention defaults)]
// [CITED: 08-RESEARCH.md Pattern 5 (lines 376-407) + Code Examples (lines 500-540) — job shape]
// [CITED: 08-PATTERNS.md row job.ts — mirror src/lib/schedule/index.ts:32-43 try/catch resilience]
// [CITED: 08-01-PLAN.md Task 2 <behavior> + <acceptance_criteria>]
//
// The backup job orchestrator. runBackupJob() is the single entry the cron tick (08-05)
// and the dashboard "Backup now" action (08-04) call. It: dumps the DB (pgDump) → generates
// a key → resolves every enabled destination → uploads the dump to each → runs retention
// cleanup → records the run status to settings key `backup.last_run`.
//
// RESILIENCE: the whole body is wrapped in try/catch + log.error — a transient error
// (pg_dump not installed, a destination down) is logged + recorded, NEVER thrown to the
// caller. This mirrors the schedule tick pattern (src/lib/schedule/index.ts:38-42): the
// cron worker must not crash; the next tick retries. The 08-05 cron entry wraps the call
// again as belt-and-suspenders.
//
// Server-only — NO "use client" directive.
import { pgDump, formatBackupTimestamp } from "./dump";
import { getEnabledDestinations } from "./registry";
import {
  readBackupConfig,
  upsertSetting,
  readSetting,
  BACKUP_LAST_RUN_KEY,
} from "./config";
import { syncMediaBucket } from "./media-sync";
import { s3Client } from "@/lib/r2";
import { log } from "@/lib/log";
import type { BackupDestination } from "./types";
import type { S3Client } from "@aws-sdk/client-s3";

/** Matches a backup key: anydiscussion-YYYYMMDD-HHmm.sqlc (used for retention + restore). */
const BACKUP_KEY_RE = /^anydiscussion-\d{8}-\d{4}\.sqlc$/;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Generate a backup key for "now" (or a given date): anydiscussion-YYYYMMDD-HHmm.sqlc.
 * Reuses dump.ts's formatBackupTimestamp so the key + temp-file naming stay in sync.
 */
export function generateBackupKey(date: Date = new Date()): string {
  return `anydiscussion-${formatBackupTimestamp(date)}.sqlc`;
}

/**
 * Parse the YYYYMMDD-HHmm timestamp out of a backup key → UTC Date (or null if the key
 * does not match the backup-key pattern). Used by retention to age-sort dumps and by
 * restoreLatest to pick the newest.
 */
function parseBackupKeyDate(key: string): Date | null {
  const m = key.match(/(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})/);
  if (!m) return null;
  const [, y, mo, d, h, mi] = m;
  const date = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi)));
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * runRetentionCleanup (D-09) — delete backups older than retentionDays from a destination.
 *
 * Lists the destination's keys, parses each backup-key timestamp, and deletes keys whose
 * age exceeds retentionDays. Keys that don't match the backup-key pattern (e.g. unrelated
 * files) are LEFT ALONE — retention only ever touches keys it produced. Returns the count
 * deleted (for observability/logging).
 *
 * @param dest          The destination to clean.
 * @param retentionDays Delete keys older than this many days.
 */
export async function runRetentionCleanup(
  dest: BackupDestination,
  retentionDays: number,
): Promise<number> {
  const keys = await dest.list();
  const now = Date.now();
  let deleted = 0;
  for (const key of keys) {
    const date = parseBackupKeyDate(key);
    if (date === null) continue; // not a backup key — leave untouched
    const ageDays = (now - date.getTime()) / MS_PER_DAY;
    if (ageDays > retentionDays) {
      await dest.delete(key); // idempotent at the destination
      deleted++;
    }
  }
  return deleted;
}

/**
 * Resolve the media R2 source IF media storage is on R2, else null. Used by runBackupJob to
 * decide whether to run the media sync (D-06 full DR). Reads settings.storage.active_provider
 * directly (the same row getActiveProvider consults) so job.ts does not couple to the storage
 * registry.
 *
 * Returns null when media is on local disk (active_provider !== "r2") — the backup then degrades
 * to DB-only, which is correct: there are no R2 media objects to copy. The source client is the
 * MEDIA R2 client (@/lib/r2 s3Client — the existing media-bucket client), NEVER the backup-bucket
 * client (T-08-02 separation: the backup-bucket client lives inside r2.ts and is built from
 * backup creds; the media client here is read-only List/Get against the media bucket).
 */
async function resolveMediaSource(): Promise<{ client: S3Client; bucket: string } | null> {
  const active = await readSetting("storage.active_provider");
  if (active !== "r2") return null;
  const bucket = process.env.S3_BUCKET || "anydiscussion-media";
  return { client: s3Client, bucket };
}

/**
 * runBackupJob (D-04) — dump the DB + upload to every enabled destination + run retention.
 *
 * Flow: readBackupConfig → pgDump → generate key → getEnabledDestinations → upload the dump
 * to each → sync R2 media objects to each (D-06 full DR; skipped if media is not on R2) →
 * runRetentionCleanup for each (using cfg.retentionDays, D-09) → record backup.last_run.
 *
 * Never throws: on any error, records a failure status to backup.last_run + logs, and
 * returns `{ ok: false }`. The destructive-overwrite restore confirmation gate lives in
 * the 08-04 Server Action — this job only writes NEW dumps.
 *
 * Media sync is isolated in its own inner try/catch: a media-copy failure degrades the run
 * to DB-only (ok stays true) rather than failing the whole job — the DB dump already
 * succeeded and the next tick retries the media copy (mirrors schedule tick resilience).
 *
 * @returns `{ ok, bytes?, destinations, mediaObjects? }` — destinations is the list of
 *          destination names that received the dump (empty on failure); mediaObjects is the
 *          count copied when media sync ran.
 */
export async function runBackupJob(): Promise<{
  ok: boolean;
  bytes?: number;
  destinations: string[];
  mediaObjects?: number;
}> {
  try {
    const cfg = await readBackupConfig();
    const dumpBuf = await pgDump();
    const key = generateBackupKey();
    const dests = await getEnabledDestinations();

    const destNames: string[] = [];
    for (const dest of dests) {
      await dest.upload(dumpBuf, key);
      destNames.push(dest.name);
    }

    // --- Media sync (D-06 full DR): copy media R2 objects to every enabled destination so a
    // restored site has its images. Skipped when media storage is not R2 (local disk → nothing
    // to copy from R2). The source is the MEDIA R2 client (read-only List/Get, T-08-02b); each
    // destination's upload uses its OWN credentials/bucket via the fan-out callback. ---
    let mediaObjects: number | undefined;
    try {
      const source = await resolveMediaSource();
      if (source) {
        // Dated prefix (YYYYMMDD of the run) so each backup's media set is grouped + identifiable.
        const mediaPrefix = `media-${formatBackupTimestamp(new Date()).slice(0, 8)}/`;
        mediaObjects = await syncMediaBucket({
          source,
          destKeyPrefix: mediaPrefix,
          uploadObject: async (objKey, buf) => {
            // Fan out to EVERY enabled destination. Each dest.upload writes via its own
            // client/creds (local: fs; r2: dedicated backup bucket) — never via the media source.
            for (const dest of dests) {
              await dest.upload(buf, objKey);
            }
          },
        });
        log.info("backup-job media sync ok", { mediaObjects });
      } else {
        log.info("backup-job media sync skipped (media not on R2)");
      }
    } catch (e) {
      // D-06 degradation: media-sync failure does NOT fail the job — the DB dump already
      // landed. The next tick retries. The fresh dump is already uploaded + will be retained.
      log.error("backup-job media sync failed (degraded to DB-only)", {
        error: e instanceof Error ? e.message : String(e),
      });
    }

    // Retention cleanup per destination (D-09). Safe to run after upload — the fresh dump
    // is always newer than retentionDays so it is never self-deleted.
    for (const dest of dests) {
      await runRetentionCleanup(dest, cfg.retentionDays);
    }

    await upsertSetting(
      BACKUP_LAST_RUN_KEY,
      JSON.stringify({
        at: new Date().toISOString(),
        ok: true,
        bytes: dumpBuf.length,
        destinations: destNames,
        ...(mediaObjects !== undefined ? { mediaObjects } : {}),
      }),
    );

    log.info("backup-job ok", {
      bytes: dumpBuf.length,
      destinations: destNames,
      mediaObjects,
    });
    return {
      ok: true,
      bytes: dumpBuf.length,
      destinations: destNames,
      ...(mediaObjects !== undefined ? { mediaObjects } : {}),
    };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    // Record the failure (best-effort — never mask the original error by throwing here).
    await upsertSetting(
      BACKUP_LAST_RUN_KEY,
      JSON.stringify({ at: new Date().toISOString(), ok: false, error }),
    ).catch(() => {});
    log.error("backup-job failed", { error });
    return { ok: false, destinations: [] };
  }
}
