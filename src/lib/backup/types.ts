// src/lib/backup/types.ts
// [CITED: 08-CONTEXT.md D-01 (multi-select destinations), D-04 (pg_dump in-app), D-05 (restore)]
// [CITED: 08-RESEARCH.md Pattern 1 (lines 222-243) — BackupDestination interface]
// [CITED: 08-PATTERNS.md row types.ts — mirror src/lib/storage/types.ts shape, NARROWER + RICHER]
// [CITED: 08-01-PLAN.md Task 1 <behavior> + <acceptance_criteria>]
//
// THE backup-destination contract. This is intentionally a SEPARATE interface from
// StorageProvider (src/lib/storage/types.ts), NOT an overload:
//   - RICHER than StorageProvider: adds `list(prefix)` (retention cleanup) + `download(key)`
//     (restore + drill) — StorageProvider only has upload/getPublicUrl/delete.
//   - NARROWER than StorageProvider: no `getPublicUrl` (backups are private — there is no
//     CDN URL) and upload returns `{key, sizeBytes}` (no sharp image variants, no
//     {variants, primary} — a dump is a single private buffer, never an image).
//
// Backing up a DB dump is a fundamentally different shape from serving a CDN image, so a
// dedicated contract keeps both abstractions honest. Every destination (local default-on,
// R2, Google Drive) implements this interface so runBackupJob can fan out uniformly.
//
// Server-only — NO "use client" directive. Imported by the backup engine (registry, job,
// restore, drill) and the 08-04 admin Server Actions.

/**
 * The literal destination names. Matches the `destinations` booleans in `backup.config`
 * (read by registry.getEnabledDestinations). "local" is always default-on (D-01).
 */
export type BackupDestinationName = "local" | "r2" | "gdrive";

/**
 * The contract every backup destination implements (D-01, D-04, D-05).
 *
 * A "backup" is a single private buffer (a pg_dump custom-format blob, or an archived
 * media object). Destinations store/list/fetch/delete these buffers; none of them serve a
 * public URL. `upload` returns `{key, sizeBytes}` — never sharp variants.
 */
export interface BackupDestination {
  /** Discriminator — also the key under `backup.config.destinations`. */
  readonly name: BackupDestinationName;

  /**
   * Upload a dump/media buffer under a server-generated key.
   *
   * @param buffer   The raw bytes (e.g. a pg_dump -Fc blob).
   * @param key      Server-generated object key (e.g. "anydiscussion-20260729-0300.sqlc").
   *                 NEVER user-supplied — path-traversal defense at the destination boundary.
   * @param mimeType Optional MIME (defaults to application/octet-stream for dumps).
   * @returns The stored key + byte count. NO variants field (contrast StorageProvider).
   */
  upload(
    buffer: Buffer,
    key: string,
    mimeType?: string,
  ): Promise<{ key: string; sizeBytes: number }>;

  /**
   * List existing backup keys (for retention cleanup + the Restore picker UI).
   *
   * @param prefix Optional key prefix filter.
   * @returns Keys present at this destination (e.g. ["anydiscussion-20260729-0300.sqlc", ...]).
   */
  list(prefix?: string): Promise<string[]>;

  /**
   * Download a backup by key → Buffer (for manual restore + the automated restore-drill).
   */
  download(key: string): Promise<Buffer>;

  /**
   * Delete a backup by key (retention cleanup). Idempotent — a missing key MUST NOT throw
   * (mirrors the StorageProvider.delete contract).
   */
  delete(key: string): Promise<void>;

  /**
   * No-op credential probe for the dashboard "Test connection" button. Never throws —
   * returns `{ok, error?}` so the UI can surface inline ok/error feedback (mirrors
   * testStorageConnection in src/actions/storage-settings.ts).
   */
  testConnection(): Promise<{ ok: boolean; error?: string }>;
}
