// src/lib/storage/push-cdn.ts
// [CITED: 04-CONTEXT.md D-21 — Generic S3-compatible push-CDN origin + cdnBaseUrl overlay]
// [CITED: 04-RESEARCH.md Example 2 (lines 591-637) — push-CDN provider shape]
// [CITED: 04-PATTERNS.md row — PushCdnProvider assignment]
// [CITED: src/lib/r2/index.ts L13-31 — proven S3Client-with-custom-endpoint pattern]
// [CITED: src/lib/storage/local.ts L66-101 — the sharp 3-variant pipeline reused here]
//
// Generic S3-compatible push-CDN provider (D-21). The origin is any S3-compatible
// storage (Bunny CDN's S3 backend, KeyCDN origin, Wasabi, DigitalOcean Spaces, etc.)
// that pushes objects to a CDN for delivery. Uploads run the SAME sharp 3-variant
// pipeline as local/r2 (sm 640 / md 1024 / lg 1920, webp quality 80); getPublicUrl
// overlays ${cdnBaseUrl}/${key} so the public URL points at the CDN edge (NOT the origin).
//
// Why this provider exists separately from r2: R2 is itself a CDN (Cloudflare's edge).
// A push-CDN is a separate service that PULLS from an origin (this provider's S3 backend)
// and serves cached content at CDN edge URLs. The credentials + the cdnBaseUrl overlay
// are the configuration surface.
//
// Upload path: S3Client (reused @aws-sdk/client-s3) + the local/r2 sharp pipeline +
// PutObjectCommand. delete: DeleteObjectCommand.catch(() => {}) (idempotent).
//
// Config: configurePushCdn({ endpoint, region, accessKeyId, secretAccessKey, bucket,
// cdnBaseUrl, forcePathStyle? }) — called at boot from instrumentation.ts AND after
// a successful Storage Settings save (storage-settings.ts). The provider starts
// unconfigured — getActiveProvider falls back to local until the admin enters creds.
//
// Server-only — NO "use client" directive. @aws-sdk/client-s3 + sharp are server-only.
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import sharp from "sharp";
import type { StorageProvider, UploadedVariant } from "./types";

/**
 * The S3Client singleton for the push-CDN origin. Populated by configurePushCdn().
 * Null until the admin enters credentials — the provider's upload/delete throw
 * "PUSH_CDN_NOT_CONFIGURED" if called before configuration (acceptable: the
 * default-safe getActiveProvider fallback keeps the local provider working).
 */
let s3Client: S3Client | null = null;

let cdnBaseUrl = "";
let bucket = "";

const IMAGE_SIZES = [
  { width: 640, suffix: "sm" },
  { width: 1024, suffix: "md" },
  { width: 1920, suffix: "lg" },
] as const;

/**
 * Configure the push-CDN provider with credentials + CDN overlay (D-21). Called at
 * boot from instrumentation.ts AND after a successful Storage Settings save. The
 * cdnBaseUrl trailing slash is stripped at configure time so getPublicUrl can do a
 * clean `${cdnBaseUrl}/${key}` concatenation without double-slash.
 *
 * Safe to call multiple times — overwrites the prior client + overlay.
 */
export function configurePushCdn(creds: {
  endpoint: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  cdnBaseUrl: string;
  forcePathStyle?: boolean;
}): void {
  s3Client = new S3Client({
    region: creds.region,
    endpoint: creds.endpoint,
    credentials: {
      accessKeyId: creds.accessKeyId,
      secretAccessKey: creds.secretAccessKey,
    },
    forcePathStyle: creds.forcePathStyle ?? false,
  });
  // Strip trailing slash(es) so `${cdnBaseUrl}/${key}` produces a single slash.
  cdnBaseUrl = creds.cdnBaseUrl.replace(/\/+$/, "");
  bucket = creds.bucket;
}

/**
 * The push-CDN storage provider (D-21). Active when
 * settings.storage.active_provider = "push-cdn". Registered at boot via
 * instrumentation.ts → registerStorageProvider("push-cdn", pushCdnProvider).
 */
export const pushCdnProvider: StorageProvider = {
  name: "push-cdn",

  async upload(buffer, baseKey, mimeType) {
    if (!s3Client) {
      throw new Error("PUSH_CDN_NOT_CONFIGURED");
    }

    if (mimeType.startsWith("image/")) {
      // Same 3-variant sharp pipeline as local.ts + r2.ts (sm 640 / md 1024 / lg 1920,
      // webp quality 80, fit:"inside", withoutEnlargement). Pitfall #7 — at upload
      // time only; the CDN serves the pre-computed WebP files directly.
      const variants: UploadedVariant[] = [];
      for (const size of IMAGE_SIZES) {
        const { data, info } = await sharp(buffer)
          .resize(size.width, undefined, {
            fit: "inside",
            withoutEnlargement: true,
          })
          .webp({ quality: 80 })
          .toBuffer({ resolveWithObject: true });

        const key = `${baseKey}-${size.suffix}.webp`;
        await s3Client.send(
          new PutObjectCommand({
            Bucket: bucket,
            Key: key,
            Body: data,
            ContentType: "image/webp",
          }),
        );
        variants.push({
          key,
          width: info.width,
          height: info.height,
          format: "webp",
          sizeBytes: info.size,
        });
      }
      const md = variants[1]; // 1024px — primary size used in post bodies / feature slots.
      return {
        variants,
        primary: {
          key: md.key,
          width: md.width,
          height: md.height,
          sizeBytes: md.sizeBytes,
        },
      };
    }

    // D-07: non-image → store as-is (no sharp variants).
    await s3Client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: baseKey,
        Body: buffer,
        ContentType: mimeType,
      }),
    );
    return {
      variants: [],
      primary: { key: baseKey, sizeBytes: buffer.length },
    };
  },

  getPublicUrl(key) {
    // CDN overlay — overlays the configured cdnBaseUrl on the stored key. The CDN is
    // configured (operator-side) to pull from the S3 origin on cache miss.
    return `${cdnBaseUrl}/${key}`;
  },

  async delete(key) {
    // Idempotent — DeleteObjectCommand returns 204 for missing keys (S3 semantics);
    // the .catch also defends against transient SDK errors. Mirrors r2.ts L67-76.
    if (!s3Client) return; // unconfigured → no-op (nothing to delete from origin)
    await s3Client
      .send(new DeleteObjectCommand({ Bucket: bucket, Key: key }))
      .catch(() => {
        // Swallow — delete is idempotent per the StorageProvider contract.
      });
  },
};
