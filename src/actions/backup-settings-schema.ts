// src/actions/backup-settings-schema.ts
// [CITED: 08-CONTEXT.md D-01 (multi-select destinations: local/R2/gdrive), D-03 (encrypted creds), D-09 (defaults)]
// [CITED: 08-RESEARCH.md Pitfall 7 (lines 533-537) — empty secret fields = "no change"]
// [CITED: 08-PATTERNS.md row backup-settings-schema.ts — mirror src/actions/storage-settings-schema.ts]
// [CITED: src/actions/storage-settings-schema.ts — the established pure-schema module pattern]
//
// Pure Zod v4 schema module for the Backup Settings form. SHARED between the dashboard form
// (react-hook-form via zodResolver) and the Server Action (backupSettingsSchema.parse) — same
// contract on both sides per CLAUDE.md "Code conventions" (Zod schema reused client+server).
//
// THE D-01 DELTA vs Storage Settings: `destinations` is a MULTI-SELECT of three booleans
// (local / r2 / gdrive) — all toggleable simultaneously — instead of Storage Settings' single
// activeProvider enum. local is default-on; r2 + gdrive default-off.
//
// Per Pitfall 7: the r2 secret field (secretAccessKey) uses z.string() (NOT .min(1)) so an empty
// string is valid — the save action treats an empty secret as "no change" and does NOT re-encrypt
// the blob. Non-secret r2 fields (endpoint/region/accessKeyId/bucket/forcePathStyle) are always
// present and pre-fill from getBackupSettings.
//
// gdrive credentials are handled via the OAuth user-consent flow (D-02) — there are NO gdrive
// cred fields in this schema. The admin clicks "Connect Drive" → Google consent → callback stores
// an encrypted refresh_token under backup.gdrive_creds; "Disconnect Drive" revokes + deletes it.
//
// NO "use server" / "use client" directive — pure schema module imported by both sides.
import { z } from "zod";

/**
 * The r2 backup credential shape (backup.r2_creds — encrypted at rest via lib/crypto).
 * secretAccessKey uses z.string() (empty allowed) so the form can send "no change" — mirroring
 * the storage secret-field convention (Pitfall 7).
 */
export const r2BackupCredsSchema = z.object({
  endpoint: z.string(),
  region: z.string(),
  accessKeyId: z.string(),
  secretAccessKey: z.string(), // empty = "no change" (Pitfall 7)
  bucket: z.string(),
  forcePathStyle: z.boolean(),
});
export type R2BackupCreds = z.infer<typeof r2BackupCredsSchema>;

/**
 * The full Backup Settings form schema (D-01 multi-select + D-09 defaults).
 *
 * `destinations` is the multi-select delta: three independent booleans. `scheduleCron` /
 * `drillCron` are non-empty strings (cron-expression validity is enforced where the schedule is
 * consumed — 08-05 startScheduler; a regex here would reject legitimate expressions like
 * "0 3 * * 1-5"). `retentionDays` is bounded 1-365. `alertEmail` is email-or-empty.
 */
export const backupSettingsSchema = z.object({
  destinations: z.object({
    local: z.boolean(),
    r2: z.boolean(),
    gdrive: z.boolean(),
  }),
  scheduleCron: z.string().trim().min(1),
  retentionDays: z.number().int().min(1).max(365),
  drillEnabled: z.boolean(),
  drillCron: z.string().trim().min(1),
  alertEmail: z.email().or(z.literal("")),
  r2: r2BackupCredsSchema,
});

export type BackupSettingsInput = z.infer<typeof backupSettingsSchema>;

/**
 * The r2 secret-field list. Returns true when the creds carry a non-empty secret (i.e. the admin
 * re-typed secretAccessKey). The save action uses this to decide whether to encrypt + persist the
 * r2 blob — an empty secret means "no change" and the prior encrypted blob is preserved (Pitfall 7).
 *
 * Visible for testing — used by backup-settings.ts saveBackupSettings. Mirrors the storage
 * hasNoSecrets helper (inverted: hasSecrets === !hasNoSecrets).
 */
export function hasSecrets(creds: R2BackupCreds): boolean {
  return Boolean(creds.secretAccessKey && creds.secretAccessKey.trim());
}
