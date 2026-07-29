// src/lib/backup/destinations/r2.ts
// [CITED: 08-CONTEXT.md D-01 (R2 selectable), D-03 (encrypted creds), D-06 (full DR destination)]
// [CITED: 08-RESEARCH.md Anti-Patterns — "Conflating the backup R2 bucket with the media R2 bucket"]
// [CITED: 08-RESEARCH.md Pattern 1 + Code Examples (lines 544-575) — destination + media-sync shape]
// [CITED: 08-PATTERNS.md row destinations/r2.ts — mirror src/lib/storage/r2.ts NON-IMAGE branch only]
// [CITED: src/actions/storage-settings.ts:213-249 — S3Client construction + testConnection shape]
// [CITED: 08-02-PLAN.md Task 1 <behavior> + <acceptance_criteria>]
//
// THE R2 BACKUP DESTINATION. Implements BackupDestination (name "r2") against a DEDICATED
// Cloudflare R2 backup bucket — NOT the media bucket.
//
// CRITICAL (RESEARCH Anti-Pattern / T-08-02): this module NEVER imports the media `s3Client`
// from @/lib/r2, nor getActiveProvider() from @/lib/storage/registry. Those point at the MEDIA
// bucket with MEDIA credentials. Reusing them would store dumps in the media bucket (wrong
// lifecycle, wrong retention, wrong creds). Instead, each call builds a DEDICATED S3Client from
// the decrypted backup.r2_creds settings blob — a separate endpoint/bucket/credential set written
// by the 08-04 admin UI. The static-source gate test (r2-destination.test.ts) enforces this.
//
// Cred shape (backup.r2_creds, encrypted via lib/crypto, written by 08-04):
//   { endpoint, region, accessKeyId, secretAccessKey, bucket, forcePathStyle }
//
// Server-only — NO "use client" directive.
import {
  S3Client,
  PutObjectCommand,
  ListObjectsV2Command,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { readSetting, BACKUP_R2_CREDS_KEY } from "../config";
import { decrypt } from "@/lib/crypto";
import { log } from "@/lib/log";
import type { BackupDestination } from "../types";

/** The decrypted shape stored (encrypted) under settings key backup.r2_creds. */
interface R2BackupCreds {
  endpoint: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  forcePathStyle: boolean;
}

/**
 * Load + decrypt the backup R2 credentials from settings. Returns null when no creds row is
 * stored yet (admin has not configured R2 via 08-04) so testConnection can degrade gracefully.
 */
async function loadCreds(): Promise<R2BackupCreds | null> {
  const blob = await readSetting(BACKUP_R2_CREDS_KEY);
  if (!blob) return null;
  try {
    return JSON.parse(decrypt(blob)) as R2BackupCreds;
  } catch (e) {
    log.error("backup-r2-creds decrypt failed", {
      error: e instanceof Error ? e.message : String(e),
    });
    return null;
  }
}

/**
 * Build a DEDICATED S3Client from the backup creds (mirrors the S3Client construction shape in
 * src/actions/storage-settings.ts:213-222 — region/endpoint/credentials/forcePathStyle). A fresh
 * client per call keeps the dedicated-client invariant self-evident and avoids module-level
 * state that would couple tests. Returns null when creds are absent.
 */
function buildClient(creds: R2BackupCreds): S3Client {
  return new S3Client({
    region: creds.region || "us-east-1",
    endpoint: creds.endpoint,
    credentials: {
      accessKeyId: creds.accessKeyId,
      secretAccessKey: creds.secretAccessKey,
    },
    forcePathStyle: creds.forcePathStyle,
  });
}

/**
 * Resolve the dedicated client + backup bucket. Throws when unconfigured so a data-path call
 * (upload/list/download/delete) surfaces the misconfiguration loudly — the registry only
 * resolves this destination when r2 is enabled in backup.config, and the admin is expected to
 * configure creds first (the 08-04 "Test connection" button validates before enabling).
 */
async function requireClient(): Promise<{ client: S3Client; bucket: string }> {
  const creds = await loadCreds();
  if (!creds) {
    throw new Error("R2 backup destination not configured (backup.r2_creds missing)");
  }
  return { client: buildClient(creds), bucket: creds.bucket };
}

/**
 * The R2 backup destination (D-01, D-03, D-06). Stores dump/media buffers in a DEDICATED backup
 * bucket whose credentials are entirely separate from the media R2 bucket (RESEARCH Anti-Pattern).
 */
export const r2BackupDestination: BackupDestination = {
  name: "r2",

  async upload(buffer, key, mimeType) {
    const { client, bucket } = await requireClient();
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: buffer,
        ContentType: mimeType ?? "application/octet-stream",
      }),
    );
    return { key, sizeBytes: buffer.length };
  },

  async list(prefix) {
    const { client, bucket } = await requireClient();
    const keys: string[] = [];
    let token: string | undefined;
    do {
      const listed = await client.send(
        new ListObjectsV2Command({
          Bucket: bucket,
          ContinuationToken: token,
          ...(prefix ? { Prefix: prefix } : {}),
        }),
      );
      for (const obj of listed.Contents ?? []) {
        if (obj.Key) keys.push(obj.Key);
      }
      token = listed.IsTruncated ? listed.NextContinuationToken : undefined;
    } while (token);
    return keys;
  },

  async download(key) {
    const { client, bucket } = await requireClient();
    const res = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    // transformToByteArray is the documented SDK v3 streaming → Uint8Array helper.
    const bytes = await res.Body!.transformToByteArray();
    return Buffer.from(bytes);
  },

  async delete(key) {
    const { client, bucket } = await requireClient();
    // Idempotent — a missing object is a no-op from R2; swallow NoSuchKey so retention cleanup
    // never throws on a key that was already deleted (mirrors src/lib/storage/r2.ts:67-76).
    await client
      .send(new DeleteObjectCommand({ Bucket: bucket, Key: key }))
      .catch(() => {
        // Swallow — delete is idempotent per the BackupDestination contract.
      });
  },

  async testConnection() {
    // Never throws — returns {ok, error?} so the dashboard surfaces inline feedback (mirrors
    // testStorageConnection at src/actions/storage-settings.ts:244-249).
    try {
      const creds = await loadCreds();
      if (!creds) {
        return { ok: false, error: "R2 backup destination not configured" };
      }
      const client = buildClient(creds);
      await client.send(
        new ListObjectsV2Command({ Bucket: creds.bucket, MaxKeys: 1 }),
      );
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  },
};
