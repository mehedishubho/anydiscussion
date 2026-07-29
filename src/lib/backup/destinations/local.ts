// src/lib/backup/destinations/local.ts
// [CITED: 08-CONTEXT.md D-01 (local default-on)]
// [CITED: 08-RESEARCH.md Pattern 1 + 08-PATTERNS.md row local.ts — mirror NON-IMAGE raw-buffer branch]
// [CITED: src/lib/storage/local.ts:103-111 — raw-buffer write path (NOT the sharp-variant image branch)]
// [CITED: src/lib/storage/local.ts:50-54 — assertSafeBaseKey path-traversal defense]
// [CITED: src/actions/storage-settings.ts:208-210 — testConnection fs.access probe shape]
// [CITED: T-08-01b — path-traversal mitigation: reject '..' / absolute keys]
//
// The local on-VPS backup destination (default-on per D-01). Mirrors ONLY the non-image
// raw-buffer write branch of the media local provider — backups are single dump buffers,
// never images, so there is NO sharp pipeline and NO {variants, primary} return. upload
// returns {key, sizeBytes} per the BackupDestination contract.
//
// Uses a SEPARATE root env var (BACKUP_LOCAL_ROOT, default storage/backups/) — distinct
// from the media STORAGE_LOCAL_ROOT — so dumps never collide with media files. The
// assertSafeKey guard rejects '..' and absolute keys before any fs write/download/delete
// (T-08-01b): a crafted key cannot escape BACKUP_LOCAL_ROOT.
//
// Server-only — NO "use client" directive.
import path from "node:path";
import fs from "node:fs/promises";
import type { BackupDestination } from "../types";

/**
 * Filesystem root for local backups. Defaults to <repo>/storage/backups/. Override via
 * BACKUP_LOCAL_ROOT env var (distinct from the media STORAGE_LOCAL_ROOT).
 */
const BACKUP_LOCAL_ROOT =
  process.env.BACKUP_LOCAL_ROOT ??
  path.resolve(process.cwd(), "storage/backups");

/**
 * Defense-in-depth path-traversal guard (T-08-01b). Keys are server-generated in job.ts
 * ("anydiscussion-YYYYMMDD-HHmm.sqlc") so ".." / absolute paths should never appear — but
 * rejecting them at the destination boundary prevents any upstream bug from escaping the
 * backup root. Applied to upload, download, AND delete.
 */
function assertSafeKey(key: string): void {
  if (key.includes("..") || path.isAbsolute(key)) {
    throw new Error("INVALID_BACKUP_KEY");
  }
}

/**
 * The local filesystem backup destination (D-01 default-on). Implements the
 * BackupDestination contract: raw-buffer upload (no sharp), list, download, idempotent
 * delete, and an fs.access testConnection probe.
 */
export const localBackupDestination: BackupDestination = {
  name: "local",

  async upload(buffer, key) {
    assertSafeKey(key);
    const dest = path.join(BACKUP_LOCAL_ROOT, key);
    await fs.mkdir(path.dirname(dest), { recursive: true });
    // Raw write — NO sharp, NO variants (contrast media localProvider image branch).
    await fs.writeFile(dest, buffer);
    return { key, sizeBytes: buffer.length };
  },

  async list(prefix) {
    // Default-safe: a missing/unreadable root yields an empty list (retention + restore
    // degrade gracefully rather than throwing).
    const entries = await fs.readdir(BACKUP_LOCAL_ROOT).catch(() => [] as string[]);
    return prefix ? entries.filter((e) => e.startsWith(prefix)) : entries;
  },

  async download(key) {
    assertSafeKey(key);
    return fs.readFile(path.join(BACKUP_LOCAL_ROOT, key));
  },

  async delete(key) {
    assertSafeKey(key);
    // Idempotent — a missing key MUST NOT throw (matches the BackupDestination contract
    // + the media provider's catch-and-swallow). Retention cleanup relies on this.
    await fs.unlink(path.join(BACKUP_LOCAL_ROOT, key)).catch(() => {});
  },

  async testConnection() {
    try {
      await fs.access(BACKUP_LOCAL_ROOT);
      return { ok: true };
    } catch (e) {
      return {
        ok: false,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  },
};
