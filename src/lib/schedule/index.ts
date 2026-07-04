// src/lib/schedule/index.ts
// [CITED: 03-CONTEXT.md D-11 — in-process worker, v1 single-instance (no SKIP LOCKED)]
// [CITED: 03-RESEARCH.md Pattern 5 (L640-651) — startScheduler body]
// [CITED: node-cron@4.5.0 — cron.schedule(expression, fn) API stable across 2.x→4.x]
//
// The node-cron boot function. Called once from instrumentation.ts register() at
// server init. Schedules publishDueScheduledPosts to run every minute.
//
// D-11: v1 is single-instance — the Coolify process is a single long-running server,
// so duplicate-fire is not a concern. Multi-instance guarding (SKIP LOCKED / atomic
// UPDATE) is a v2 concern consistent with the documented ISR scaling cliff.
//
// Resilience: the tick is wrapped in try/catch so a transient DB error doesn't crash
// the worker — the next minute's tick retries. Errors are logged via log.error.
//
// Server-only — NO "use client" directive.
import cron from "node-cron";
import { log } from "@/lib/log";
import { publishDueScheduledPosts } from "./system-publish";

/**
 * startScheduler — boots the node-cron scheduled-publishing worker.
 *
 * Registers a cron task that runs every minute ("* * * * *") calling
 * publishDueScheduledPosts. The tick is wrapped in try/catch for resilience —
 * a transient DB error is logged but doesn't crash the process (the next tick retries).
 *
 * @returns the cron task instance (for a future graceful-shutdown hook to call .stop()).
 */
export function startScheduler() {
  // D-11: every 1 minute. v1 single-instance — no SKIP LOCKED needed.
  return cron.schedule("* * * * *", async () => {
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
}
