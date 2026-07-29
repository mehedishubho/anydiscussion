// src/lib/schedule/index.ts
// [CITED: 03-CONTEXT.md D-11 — in-process worker, v1 single-instance (no SKIP LOCKED)]
// [CITED: 03-RESEARCH.md Pattern 5 (L640-651) — startScheduler body]
// [CITED: 08-CONTEXT.md D-04 (node-cron in-app backup/drill), D-07 (drill-failure email), D-09 (defaults)]
// [CITED: 08-RESEARCH.md Pattern 5 (L376-407) — hourly-poll + isDue shape; Pitfall 3 (multi-instance cliff)]
// [CITED: node-cron@4.5.0 — cron.schedule(expression, fn) API stable across 2.x→4.x]
//
// The node-cron boot function. Called once from instrumentation.ts register() at
// server init (NO instrumentation change — startScheduler is already invoked at boot;
// the lazy registry from 08-01 needs no provider registration). Schedules:
//   1. publishDueScheduledPosts — every minute (Phase 3 D-11).
//   2. backup tick  — hourly poll; when readBackupConfig().enabled + isDue(scheduleCron),
//      calls runBackupJob (08-01). Re-reads config each tick so an admin's schedule change
//      takes effect without a restart.
//   3. restore-drill tick — hourly poll; when cfg.drillEnabled + isDue(drillCron), calls
//      runRestoreDrill (08-05 Task 1) + records backup.last_drill on BOTH paths. On failure
//      it fires a fire-and-forget email alert via lib/email (D-07).
//
// D-11 / RESEARCH Pitfall 3 (MULTI-INSTANCE CLIFF): node-cron is in-process. v1 is a single
// Coolify instance, so duplicate-fire is impossible. If a SECOND replica is ever added, each
// replica fires its own cron → DOUBLE backups + DOUBLE drills. v2 mitigation = a Redis-based
// distributed lock (SET NX lease) or moving backups to an external scheduler. Do NOT solve in v1.
// Documented in docs/adr/0002-backup-restore-drill.md (mirrors the ISR scaling cliff in ADR 0001).
//
// Resilience: EVERY tick body is wrapped in try/catch so a transient DB / dump / drill error
// never crashes the worker — the next tick retries. Errors are logged via log.error.
//
// Server-only — NO "use client" directive.
import cron from "node-cron";
import { log } from "@/lib/log";
import { publishDueScheduledPosts } from "./system-publish";
import { runBackupJob } from "@/lib/backup/job";
import { runRestoreDrill } from "@/lib/backup/drill";
import {
  readBackupConfig,
  upsertSetting,
  BACKUP_LAST_DRILL_KEY,
  type BackupConfig,
} from "@/lib/backup/config";
import { sendEmail } from "@/lib/email";

/**
 * isDue — does `now` match a standard 5-field cron expression?
 *
 * The hourly-poll shape (RESEARCH Pattern 5): each backup/drill tick fires at the top of the
 * hour ("0 * * * *") and re-reads the admin-configured cadence from settings, then asks isDue
 * whether the CURRENT hour matches that expression. This lets an admin change the schedule from
 * the dashboard and have it take effect on the next hourly tick WITHOUT a process restart.
 *
 * Supports the cron field grammar node-cron accepts: wildcard, single values (`3`), comma
 * lists (`1,3,5`), ranges (`0-5`), and steps (`2-10/2`, or every-Nth across a range).
 * Day-of-week uses 0=Sunday (matches JS Date#getDay); 7 is also accepted as Sunday. A
 * malformed expression returns false (the tick no-ops rather than firing spuriously).
 *
 * Exported so the unit tests exercise the real matcher (schedule.test.ts drives it with
 * "* * * * *", which matches every minute).
 */
export function isDue(cronExpr: string, now: Date = new Date()): boolean {
  const fields = cronExpr.trim().split(/\s+/);
  if (fields.length !== 5) return false;
  const [minF, hourF, domF, monF, dowF] = fields;

  return (
    matchField(minF, now.getMinutes(), 0, 59) &&
    matchField(hourF, now.getHours(), 0, 23) &&
    matchField(domF, now.getDate(), 1, 31) &&
    matchField(monF, now.getMonth() + 1, 1, 12) &&
    matchField(dowF, now.getDay(), 0, 6, 7) // 0 + 7 both = Sunday
  );
}

/**
 * Match one cron field against a value. Supports the node-cron field grammar
 * (*, single, comma-list, range, step). `sundayAlias` lets the dow field accept 7 as Sunday
 * (cron convention) while JS getDay() returns 0 for Sunday.
 */
function matchField(
  field: string,
  value: number,
  min: number,
  max: number,
  sundayAlias?: number,
): boolean {
  for (const part of field.split(",")) {
    const [rangePart, stepPart] = part.split("/");
    const step = stepPart ? Number.parseInt(stepPart, 10) : 1;
    if (!Number.isFinite(step) || step <= 0) continue;

    let lo: number;
    let hi: number;
    if (rangePart === "*" || rangePart === undefined) {
      lo = min;
      hi = max;
    } else if (rangePart.includes("-")) {
      const [a, b] = rangePart.split("-");
      lo = Number.parseInt(a, 10);
      hi = Number.parseInt(b, 10);
    } else {
      lo = Number.parseInt(rangePart, 10);
      // Bare value with a step ("3/2") means "from 3 to max every 2"; bare value alone = single.
      hi = stepPart ? max : lo;
    }
    if (!Number.isFinite(lo) || !Number.isFinite(hi)) continue;

    const inRange = value >= lo && value <= hi && (value - lo) % step === 0;
    // dow only: cron allows 7 = Sunday; JS getDay() returns 0 for Sunday.
    const viaSundayAlias =
      sundayAlias !== undefined &&
      (lo === sundayAlias || hi === sundayAlias) &&
      value === 0;
    if (inRange || viaSundayAlias) return true;
  }
  return false;
}

/**
 * startScheduler — boots the node-cron scheduled worker (publish + backup + restore-drill).
 *
 * Registers THREE cron tasks:
 *   - publish tick: every minute ("* * * * *") — Phase 3 D-11.
 *   - backup tick:  hourly ("0 * * * *") — re-reads backup.config, runs runBackupJob when
 *     enabled + the configured scheduleCron is due.
 *   - drill tick:   hourly ("0 * * * *") — re-reads backup.config, runs runRestoreDrill when
 *     drillEnabled + the configured drillCron is due, and records backup.last_drill on BOTH
 *     the success ({at, ok:true}) and failure ({at, ok:false, error}) paths — mirroring how
 *     08-01 writes backup.last_run so the dashboard status panel always reflects the latest
 *     drill outcome. On failure it fires a fire-and-forget email alert (D-07).
 *
 * Each tick is wrapped in try/catch for resilience — a transient error is logged but does not
 * crash the process (the next tick retries). Returns the publish task (for a future
 * graceful-shutdown hook to call .stop()).
 *
 * MULTI-INSTANCE CLIFF (RESEARCH Pitfall 3): v1 is single-instance. A 2nd Coolify replica
 * double-fires every tick. Do NOT solve in v1 — see docs/adr/0002-backup-restore-drill.md.
 */
export function startScheduler() {
  // --- Publish tick (Phase 3 D-11) — every minute. v1 single-instance — no SKIP LOCKED. ---
  const publishTask = cron.schedule("* * * * *", async () => {
    try {
      const published = await publishDueScheduledPosts();
      if (published > 0) {
        log.info("schedule-tick", { published });
      }
    } catch (err) {
      // Resilience — don't crash the worker on a transient error. The next minute's
      // tick will retry. Log for observability.
      log.error("schedule-tick failed", { error: String(err) });
    }
  });

  // --- Backup tick (D-04 / BACKUP-03) — hourly poll, isDue against cfg.scheduleCron. ---
  // Re-reads config every tick so an admin's cadence change takes effect without a restart.
  cron.schedule("0 * * * *", async () => {
    try {
      const cfg = await readBackupConfig();
      if (!cfg.enabled) return; // backups disabled — no-op
      if (!isDue(cfg.scheduleCron)) return; // not this hour — wait
      await runBackupJob(); // 08-01: dump → upload to every enabled dest → retention → last_run
    } catch (err) {
      // Belt-and-suspenders: runBackupJob itself never throws (08-01 catches internally), but
      // a readBackupConfig failure must still not crash the worker.
      log.error("backup-tick failed", { error: String(err) });
    }
  });

  // --- Restore-drill tick (D-07 / BACKUP-04) — hourly poll, isDue against cfg.drillCron. ---
  // Records backup.last_drill on BOTH paths so the dashboard status panel stays current.
  cron.schedule("0 * * * *", async () => {
    let cfg: BackupConfig | undefined;
    try {
      cfg = await readBackupConfig();
      if (!cfg.drillEnabled) return; // drill disabled — no-op
      if (!isDue(cfg.drillCron)) return; // not this hour — wait
      await runRestoreDrill(); // 08-05 Task 1: CREATE → restore → verify → terminate → DROP
      // Success path: record ok:true (mirrors 08-01's backup.last_run success write).
      await upsertSetting(
        BACKUP_LAST_DRILL_KEY,
        JSON.stringify({ at: new Date().toISOString(), ok: true }),
      );
    } catch (err) {
      // Failure path (D-07): log + record ok:false FIRST (so the dashboard reflects the latest
      // drill outcome), then fire a fire-and-forget email alert. sendEmail never throws.
      log.error("restore-drill failed", { error: String(err) });
      await upsertSetting(
        BACKUP_LAST_DRILL_KEY,
        JSON.stringify({
          at: new Date().toISOString(),
          ok: false,
          error: String(err),
        }),
      ).catch(() => {
        // Never mask the drill failure with a settings-write error.
      });
      void sendEmail({
        to: cfg?.alertEmail || process.env.EMAIL_FROM || "",
        subject: "Backup restore-drill FAILED",
        text: String(err),
      });
    }
  });

  return publishTask;
}
