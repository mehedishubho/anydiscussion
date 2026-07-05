// src/actions/storage-settings-schema.ts
// [CITED: 04-CONTEXT.md D-23/D-24/D-25 — Storage Settings admin UI schema]
// [CITED: 04-RESEARCH.md Pitfall 7 (lines 533-537) — empty secret fields = "no change"]
// [CITED: src/actions/posts-schema.ts — the established pure-schema module pattern]
//
// Pure Zod v4 schema module for the Storage Settings form. SHARED between the
// dashboard form (react-hook-form via zodResolver) and the Server Action
// (storageSettingsSchema.parse) — same contract on both sides per CLAUDE.md.
//
// Per Pitfall 7: secret fields default to empty string. The save action treats
// empty-secret-shape as "no change" — does NOT encrypt an empty blob. Non-secret
// fields (bucket, cloud_name, region, endpoint, cdnBaseUrl) are always present.
//
// NO "use server" / "use client" directive — pure schema module imported by both.
import { z } from "zod";

/**
 * The union of provider names. Matches the StorageProvider.name union in
 * src/lib/storage/types.ts (Plan 04-05 widened to include cloudinary + push-cdn).
 */
export const PROVIDER_NAMES = [
  "local",
  "r2",
  "cloudinary",
  "push-cdn",
] as const;
export type ProviderName = (typeof PROVIDER_NAMES)[number];

/**
 * Per-provider credential shapes. Secret fields use z.string() (NOT .min(1)) so
 * empty strings are valid — the save action treats empty-secret as "no change"
 * per Pitfall 7.
 */
export const cloudinaryCredsSchema = z.object({
  cloud_name: z.string(),
  api_key: z.string(),
  api_secret: z.string(),
});
export type CloudinaryCreds = z.infer<typeof cloudinaryCredsSchema>;

export const r2CredsSchema = z.object({
  endpoint: z.string(),
  region: z.string(),
  accessKeyId: z.string(),
  secretAccessKey: z.string(),
  bucket: z.string(),
  forcePathStyle: z.boolean(),
});
export type R2Creds = z.infer<typeof r2CredsSchema>;

export const pushCdnCredsSchema = z.object({
  endpoint: z.string(),
  region: z.string(),
  accessKeyId: z.string(),
  secretAccessKey: z.string(),
  bucket: z.string(),
  cdnBaseUrl: z.string().url(),
  forcePathStyle: z.boolean(),
});
export type PushCdnCreds = z.infer<typeof pushCdnCredsSchema>;

/**
 * The full Storage Settings form schema. The active provider selects which
 * cred section is "live"; the others are preserved as-is in the DB (the save
 * action only encrypts + persists the cred section whose secrets are non-empty).
 *
 * Pitfall 7: secret fields (api_secret, secretAccessKey, api_key) default to ''
 * in the form — the admin re-types to change. Non-secret fields (cloud_name,
 * bucket, region, endpoint, cdnBaseUrl) ARE pre-filled from getStorageSettings.
 */
export const storageSettingsSchema = z.object({
  activeProvider: z.enum(PROVIDER_NAMES),
  cloudinary: cloudinaryCredsSchema.optional(),
  r2: r2CredsSchema.optional(),
  push_cdn: pushCdnCredsSchema.optional(),
});

export type StorageSettingsInput = z.infer<typeof storageSettingsSchema>;

/**
 * Returns true when the cred shape's secret fields are all empty — i.e. the user
 * did NOT re-enter credentials for this provider. The save action uses this to
 * skip encryption + DB write for that provider (Pitfall 7: empty = "no change").
 *
 * Visible for testing — used by storage-settings.ts saveStorageSettings.
 */
export function hasNoSecrets(
  creds: Record<string, unknown>,
  secretFields: string[],
): boolean {
  return secretFields.every((f) => !String(creds[f] ?? "").trim());
}

/** The secret-field list per provider — drives hasNoSecrets + redactCredentials. */
export const SECRET_FIELDS: Record<string, string[]> = {
  cloudinary: ["api_key", "api_secret"],
  r2: ["secretAccessKey"],
  push_cdn: ["secretAccessKey"],
};
