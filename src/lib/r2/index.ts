// src/lib/r2/index.ts
// [VERIFIED: @aws-sdk/client-s3 3.1077.0 + sharp 0.35.2 pipeline test — RESEARCH.md Pattern 4 lines 579-644]
// Minimal server-side R2/sharp upload helper (D-14).
//
// Scope (Phase 1 = minimal helper per D-14): buffer -> sharp variants -> write
// objects to S3-compatible storage. Enough for FOUND-05 and to prove the media
// pipeline end-to-end. The presigned-URL direct-to-storage flow + media-library
// UI are Phase 3 (MEDIA-01).
//
// Server-only — NO "use client" directive. Env-driven config: MinIO locally
// (S3_FORCE_PATH_STYLE=true), R2 in staging/prod via Coolify injection (D-12).
// Real secrets live in gitignored .env.local; .env.example ships MinIO defaults.
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import sharp from "sharp";

// Env-driven config — MinIO locally, R2 in staging/prod (D-12).
// Defaults match .env.example (shipped in Plan 01 Task 1c) for zero-config local dev.
const endpoint = process.env.S3_ENDPOINT || "http://localhost:9000";
const region = process.env.S3_REGION || "us-east-1";
const accessKeyId = process.env.S3_ACCESS_KEY_ID || "minioadmin";
const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY || "minioadmin";
const bucket = process.env.S3_BUCKET || "anydiscussion-media";
// Pitfall 3: MinIO requires path-style addressing (true), R2 uses virtual-hosted (false).
const forcePathStyle = process.env.S3_FORCE_PATH_STYLE === "true";

export const s3Client = new S3Client({
  region,
  endpoint,
  credentials: { accessKeyId, secretAccessKey },
  forcePathStyle,
});

export interface UploadedVariant {
  key: string;
  width: number;
  height: number;
  format: string;
  sizeBytes: number;
}

/**
 * Upload 3 sharp-derived WebP variants of an image buffer to S3-compatible
 * storage. Produces variants at widths 640 (sm), 1024 (md), 1920 (lg), each at
 * quality 80 with `fit: "inside"` and `withoutEnlargement: true`.
 *
 * @param buffer  Source image buffer (any sharp-supported format).
 * @param baseKey Object key prefix, server-generated e.g. "posts/2026/07/my-image".
 *                Produces keys `${baseKey}-sm.webp`, `${baseKey}-md.webp`, `${baseKey}-lg.webp`.
 * @returns Array of UploadedVariant metadata (key, dimensions, format, sizeBytes).
 */
export async function uploadImageVariants(
  buffer: Buffer,
  baseKey: string,
): Promise<UploadedVariant[]> {
  const variants: UploadedVariant[] = [];
  const sizes = [
    { width: 640, suffix: "sm" },
    { width: 1024, suffix: "md" },
    { width: 1920, suffix: "lg" },
  ];

  for (const size of sizes) {
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

  return variants;
}
