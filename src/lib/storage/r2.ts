// src/lib/storage/r2.ts
// [CITED: 03-CONTEXT.md D-09 — R2 provider wraps the existing Phase-1 lib/r2]
// [CITED: 03-RESEARCH.md Pattern 3 (L548-570) — r2 provider body]
// [CITED: src/lib/r2/index.ts — uploadImageVariants produces 3 sharp WebP variants]
//
// THIN ADAPTER (D-09): implements StorageProvider over the existing Phase-1
// `uploadImageVariants` + `s3Client`. NO behavior change — the proven 3-variant
// sharp→WebP→S3 pipeline (640/1024/1920, quality 80, fit:"inside",
// withoutEnlargement) is wrapped unchanged. The only addition is non-image
// passthrough (D-07): PDFs/docs skip sharp and land as raw PutObjectCommands.
//
// Public URL resolution: ${NEXT_PUBLIC_CDN_URL}/<key> (absolute — cdnImageLoader
// passes through verbatim per image-loader.ts L28-30; D-03 mechanically supported).
//
// Server-only — NO "use client" directive.
import { uploadImageVariants, s3Client } from "@/lib/r2";
import { PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import type { StorageProvider } from "./types";

/**
 * The R2 storage provider. Active when settings.storage.active_provider = "r2".
 * Wraps the existing Phase-1 lib/r2 helpers unchanged (D-09).
 */
export const r2Provider: StorageProvider = {
  name: "r2",

  async upload(buffer, baseKey, mimeType) {
    if (mimeType.startsWith("image/")) {
      // D-09 — delegate to the proven Phase-1 pipeline UNCHANGED.
      const variants = await uploadImageVariants(buffer, baseKey);
      const md = variants[1]; // 1024px — the primary size used in post bodies.
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

    // D-07: non-image → store as-is (no sharp). Bucket/env config inherited
    // from lib/r2/index.ts (S3_BUCKET + S3_* env vars — D-12).
    const bucket = process.env.S3_BUCKET || "anydiscussion-media";
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
    // Absolute URL — cdnImageLoader passes through verbatim (image-loader.ts L28-30).
    // Default to the MinIO local-dev endpoint (matches .env.example + lib/r2 defaults).
    const cdn = process.env.NEXT_PUBLIC_CDN_URL ?? "http://localhost:9000";
    return `${cdn}/${key}`;
  },

  async delete(key) {
    const bucket = process.env.S3_BUCKET || "anydiscussion-media";
    // Idempotent — a missing object returns a 204/no-op from R2; we don't surface
    // NoSuchKey as an error (the local provider mirrors with fs.unlink .catch).
    await s3Client
      .send(new DeleteObjectCommand({ Bucket: bucket, Key: key }))
      .catch(() => {
        // Swallow — delete is idempotent per the StorageProvider contract.
      });
  },
};
