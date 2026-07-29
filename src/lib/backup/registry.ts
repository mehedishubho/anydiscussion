// src/lib/backup/registry.ts
// [CITED: 08-CONTEXT.md D-01 (multi-select destinations, local default-on)]
// [CITED: 08-PATTERNS.md row registry.ts — mirror src/lib/storage/registry.ts but return an ARRAY]
// [CITED: 08-RESEARCH.md Pattern 1 + Anti-Patterns — lazy dynamic import keeps googleapis out of bundle]
// [CITED: 08-01-PLAN.md Task 1 <acceptance_criteria> — no static import of r2.ts / google-drive.ts]
//
// THE backup-destination selector. runBackupJob/restore call `getEnabledDestinations()` to
// resolve WHICH destinations receive a dump — never imports a destination module directly.
//
// Unlike the storage registry (single active provider via getActiveProvider), backups are
// MULTI-SELECT: any combination of local + R2 + Google Drive may be enabled at once, so
// this returns an ARRAY. local is ALWAYS available (default-on per D-01).
//
// LAZY RESOLUTION: each enabled destination is resolved via a dynamic import() with a
// NON-LITERAL module path. This is deliberate:
//   - It keeps `googleapis` (the Google Drive destination, 08-03) out of the bundle unless
//     Drive is actually enabled — the whole point of the lazy registry.
//   - It lets r2.ts / google-drive.ts land in later plans (08-02/08-03) without this module
//     statically referencing files that don't exist yet.
//   - TypeScript does not statically resolve non-literal dynamic imports (typed Promise<any>),
//     so this compiles cleanly even before r2/gdrive destinations are implemented.
// Destinations that are disabled or fail to resolve are skipped (default-safe) — local is
// always present because it is default-on and its module ships in 08-01.
//
// Server-only — NO "use client" directive.
import type { BackupDestination, BackupDestinationName } from "./types";
import { readBackupConfig } from "./config";
import { log } from "@/lib/log";

/**
 * Per-destination loader descriptor. `path` is NON-LITERAL so the dynamic import below is
 * not statically analyzed (keeps googleapis out of the build; lets later plans add files).
 * `exportName` is the named BackupDestination const each destination module exports.
 */
const DESTINATION_LOADERS: {
  name: BackupDestinationName;
  path: string;
  exportName: string;
}[] = [
  { name: "local", path: "./destinations/local", exportName: "localBackupDestination" },
  { name: "r2", path: "./destinations/r2", exportName: "r2BackupDestination" },
  { name: "gdrive", path: "./destinations/google-drive", exportName: "gdriveBackupDestination" },
];

/**
 * getEnabledDestinations (D-01) — resolve every enabled BackupDestination.
 *
 * Reads backup.config (parsed through the Zod schema with D-09 defaults) and returns each
 * destination whose toggle is on, LAZILY dynamic-importing its module. local is default-on
 * and always resolves (its module ships here); r2/gdrive modules land in 08-02/08-03.
 *
 * Default-safe: a destination that is disabled, missing its export, or fails to import is
 * skipped (logged) — it never breaks the backup job. local is always present.
 *
 * @returns The array of enabled BackupDestination instances (at least local when enabled).
 */
export async function getEnabledDestinations(): Promise<BackupDestination[]> {
  const cfg = await readBackupConfig();
  const out: BackupDestination[] = [];

  for (const { name, path: modulePath, exportName } of DESTINATION_LOADERS) {
    if (!cfg.destinations[name]) continue;
    try {
      // Non-literal dynamic import — NOT statically resolved by tsc/webpack, so googleapis
      // (gdrive) only loads when Drive is enabled. local/r2 are co-located server modules.
      const mod: Record<string, unknown> = await import(/* webpackIgnore: true */ modulePath);
      const dest = mod[exportName] as BackupDestination | undefined;
      if (dest && dest.name === name) {
        out.push(dest);
      } else {
        log.error("backup destination missing/invalid export", {
          dest: name,
          exportName,
        });
      }
    } catch (e) {
      // Default-safe — a not-yet-implemented or misconfigured destination is skipped, never
      // thrown. local (default-on) is always resolvable once its module exists.
      log.error("backup destination failed to resolve", {
        dest: name,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return out;
}
