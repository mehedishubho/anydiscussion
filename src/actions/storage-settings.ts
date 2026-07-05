// src/actions/storage-settings.ts
// [CITED: 04-CONTEXT.md D-23 (admin-only), D-24 (Test connection), D-25 (encrypted + redact-on-read)]
// [CITED: 04-RESEARCH.md Example 3 (lines 643-659) — Test connection probe shape]
// [CITED: 04-RESEARCH.md Pitfall 7 (lines 533-537) — credentials never pre-filled]
// [CITED: 04-05-PLAN.md Task 3 <behavior> + <action>]
// [CITED: src/actions/settings.ts — the existing single-key getSetting sibling]
// [CITED: src/lib/permissions/index.ts L40-47 — requireRole('admin') signature]
//
// Storage Settings Server Actions (D-23/D-24/D-25). Three actions, all admin-gated
// via requireRole('admin') FIRST (Pitfall #1 — UI hiding via sidebar is supplementary;
// every action re-checks admin role server-side before any DB or encryption call).
//
//   saveStorageSettings(input) — admin → parse → encrypt(non-empty creds) →
//     db.update settings.<provider>_creds + settings.storage.active_provider →
//     reconfigure the active provider so it picks up new creds without app restart.
//
//   getStorageSettings() — admin → read all 4 provider-cred keys + active_provider →
//     decrypt each non-empty blob → redactCredentials(...) → return to client
//     (Pitfall 7: secret fields come back as empty strings — the form NEVER pre-fills).
//
//   testStorageConnection(provider, creds) — admin → switch on provider → no-op probe
//     (fs.access local / ListObjectsV2Command MaxKeys:1 r2+push-cdn / cloudinary.v2.api.ping).
//     Returns { ok, error? } — never throws.
//
// Security ordering (Pitfall #1 — non-negotiable): every action calls
// requireRole('admin') as its FIRST line. Proven structurally by the storage-settings
// Wave 0 test (MUST_NOT_BE_REACHED pattern).
//
// Server-only — top directive mandatory for Server Actions.
"use server";
import fs from "node:fs/promises";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { requireRole } from "@/lib/permissions";
import { encrypt, decrypt, redactCredentials } from "@/lib/crypto";
import { log } from "@/lib/log";
import { S3Client, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { v2 as cloudinary } from "cloudinary";
import { configureCloudinary } from "@/lib/storage/cloudinary";
import { configurePushCdn } from "@/lib/storage/push-cdn";
import {
  storageSettingsSchema,
  hasNoSecrets,
  SECRET_FIELDS,
  type CloudinaryCreds,
  type R2Creds,
  type PushCdnCreds,
  type StorageSettingsInput,
} from "./storage-settings-schema";

/**
 * Setting keys for each provider's encrypted credentials. The settings table is
 * key-value (text); values are either encrypted blobs (the envelope format) or
 * empty strings (no creds yet — the unconfigured state).
 */
const CREDS_KEYS = {
  cloudinary: "storage.cloudinary_creds",
  r2: "storage.r2_creds",
  push_cdn: "storage.push_cdn_creds",
} as const;

const ACTIVE_PROVIDER_KEY = "storage.active_provider";

/**
 * Read a single settings row by key. Returns the value (string) or "" when missing.
 * Helper used by both saveStorageSettings (read prior creds for diff) and
 * getStorageSettings (read each provider's creds).
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
 * Upsert a single settings row by key. Uses update().set().where() with eq(key)
 * — Drizzle returns 0 rows when the key doesn't exist (settings.key is the PK);
 * the action then falls back to insert().values().onConflictDoNothing() so a
 * re-run is safe (matches the seed.ts idempotent pattern).
 */
async function upsertSetting(key: string, value: string): Promise<void> {
  const updated = await db
    .update(schema.settings)
    .set({ value, updatedAt: new Date() })
    .where(eq(schema.settings.key, key));
  // Drizzle node-postgres returns the rowcount on update; 0 = no row matched → insert.
  // The runtime value shape is driver-dependent — treat any falsy/0 result as "insert needed".
  if (!updated || (Array.isArray(updated) && updated.length === 0)) {
    await db
      .insert(schema.settings)
      .values({ key, value })
      .onConflictDoNothing();
  }
}

/**
 * saveStorageSettings (D-23/D-25) — admin-only. Validates input, encrypts any
 * non-empty credential blob, persists to settings, and reconfigures the active
 * provider so it picks up new creds without an app restart.
 *
 * Per Pitfall 7: a cred section whose secret fields are ALL empty is treated as
 * "no change" — the prior encrypted blob is preserved as-is, no encryption runs.
 * This is critical because the form sends empty strings for unchanged secrets
 * (they're never pre-filled — see getStorageSettings).
 *
 * @throws Error("FORBIDDEN") when the caller is not admin (requireRole FIRST).
 */
export async function saveStorageSettings(
  input: StorageSettingsInput | unknown,
): Promise<{ ok: true }> {
  // 1. Admin re-check FIRST (D-23 — explicit admin, NOT requireCan). Before any
  //    encryption or DB write. Proven by storage-settings.test.ts MUST_NOT_BE_REACHED.
  await requireRole("admin");

  // 2. Validate via the shared Zod schema (Pitfall #1 — never trust the client shape).
  const data = storageSettingsSchema.parse(input);

  // 3. For each provider: if creds are present AND any secret field is non-empty,
  //    encrypt the JSON-stringified blob + upsert the settings row.
  if (data.cloudinary && !hasNoSecrets(data.cloudinary, SECRET_FIELDS.cloudinary)) {
    const blob = encrypt(JSON.stringify(data.cloudinary));
    await upsertSetting(CREDS_KEYS.cloudinary, blob);
    // Reconfigure the provider so it picks up new creds without app restart.
    configureCloudinary(data.cloudinary as CloudinaryCreds);
  }

  if (data.r2 && !hasNoSecrets(data.r2, SECRET_FIELDS.r2)) {
    const blob = encrypt(JSON.stringify(data.r2));
    await upsertSetting(CREDS_KEYS.r2, blob);
  }

  if (data.push_cdn && !hasNoSecrets(data.push_cdn, SECRET_FIELDS.push_cdn)) {
    const blob = encrypt(JSON.stringify(data.push_cdn));
    await upsertSetting(CREDS_KEYS.push_cdn, blob);
    // Reconfigure the push-CDN provider (S3Client + cdnBaseUrl overlay).
    configurePushCdn(data.push_cdn as PushCdnCreds);
  }

  // 4. Update the active provider. The plaintext value is read by getActiveProvider.
  await upsertSetting(ACTIVE_PROVIDER_KEY, data.activeProvider);

  log.info("storage settings saved", { activeProvider: data.activeProvider });
  return { ok: true };
}

/**
 * getStorageSettings (D-23/D-25) — admin-only. Reads all 4 provider-cred keys +
 * the active_provider. Decrypts each non-empty blob + runs redactCredentials so
 * the network response contains empty strings for secret fields (Pitfall 7).
 *
 * @returns { activeProvider, cloudinary?, r2?, push_cdn? } — each cred section is
 *          undefined when unconfigured (empty blob in DB), or redacted when present.
 * @throws Error("FORBIDDEN") when the caller is not admin.
 */
export async function getStorageSettings(): Promise<{
  activeProvider: string;
  cloudinary?: Record<string, unknown>;
  r2?: Record<string, unknown>;
  push_cdn?: Record<string, unknown>;
}> {
  await requireRole("admin");

  const activeProvider = await readSetting(ACTIVE_PROVIDER_KEY);

  // For each provider: read the encrypted blob, decrypt if non-empty, redact-on-read.
  // An empty blob means "unconfigured" → return undefined for that section (the form
  // shows empty fields + the user enters fresh creds on first save).
  const cloudinaryBlob = await readSetting(CREDS_KEYS.cloudinary);
  const r2Blob = await readSetting(CREDS_KEYS.r2);
  const pushCdnBlob = await readSetting(CREDS_KEYS.push_cdn);

  return {
    activeProvider: activeProvider || "local",
    ...(cloudinaryBlob
      ? { cloudinary: redactCredentials(JSON.parse(decrypt(cloudinaryBlob))) }
      : {}),
    ...(r2Blob
      ? { r2: redactCredentials(JSON.parse(decrypt(r2Blob))) }
      : {}),
    ...(pushCdnBlob
      ? { push_cdn: redactCredentials(JSON.parse(decrypt(pushCdnBlob))) }
      : {}),
  };
}

/**
 * testStorageConnection (D-24) — admin-only. Per-provider no-op probe to verify
 * credentials BEFORE the admin clicks Save. Returns { ok, error? } — never throws
 * (the dashboard surfaces inline ok/error feedback per the StorageSettingsForm UI).
 *
 * Probes:
 *   - local → fs.access(STORAGE_LOCAL_ROOT) → ok on resolve, error on reject.
 *   - r2 / push-cdn → S3Client with creds.send(ListObjectsV2Command MaxKeys:1).
 *     The cheapest S3 no-op (RESEARCH.md A4) — proves creds + bucket access.
 *   - cloudinary → cloudinary.v2.config(creds) + cloudinary.v2.api.ping().
 *     Verifies api_key/api_secret + cloud_name (RESEARCH.md A5).
 */
export async function testStorageConnection(
  provider: string,
  creds: Record<string, unknown>,
): Promise<{ ok: boolean; error?: string }> {
  await requireRole("admin");

  try {
    switch (provider) {
      case "local": {
        await fs.access(process.env.STORAGE_LOCAL_ROOT ?? "storage/local");
        return { ok: true };
      }
      case "r2":
      case "push-cdn": {
        const client = new S3Client({
          region: String(creds.region ?? "us-east-1"),
          endpoint: String(creds.endpoint ?? ""),
          credentials: {
            accessKeyId: String(creds.accessKeyId ?? ""),
            secretAccessKey: String(creds.secretAccessKey ?? ""),
          },
          forcePathStyle: Boolean(creds.forcePathStyle),
        });
        await client.send(
          new ListObjectsV2Command({
            Bucket: String(creds.bucket ?? ""),
            MaxKeys: 1,
          }),
        );
        return { ok: true };
      }
      case "cloudinary": {
        cloudinary.config({
          cloud_name: String(creds.cloud_name ?? ""),
          api_key: String(creds.api_key ?? ""),
          api_secret: String(creds.api_secret ?? ""),
          secure: true,
        });
        await cloudinary.api.ping();
        return { ok: true };
      }
      default:
        return { ok: false, error: `Unknown provider: ${provider}` };
    }
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
