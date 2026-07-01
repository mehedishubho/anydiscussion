// scripts/r2-smoke.ts
// Transient verify-time R2 smoke test (run by scripts/verify.mjs via
// `node --experimental-strip-types scripts/r2-smoke.ts`).
//
// Imports uploadImageVariants directly from src/lib/r2/index.ts, uploads a 1x1
// test PNG buffer as 3 WebP variants, asserts the variant keys match the
// contract ({baseKey}-sm.md.lg.webp), then optionally cleans up.
//
// This is the end-to-end proof for FOUND-05: file -> sharp variants -> object
// in S3-compatible storage (MinIO locally).
import sharp from "sharp";
import { uploadImageVariants, s3Client } from "../src/lib/r2/index.ts";
import { DeleteObjectsCommand } from "@aws-sdk/client-s3";

const BASE_KEY = "smoke-test/test";
const EXPECTED_KEYS = [
  `${BASE_KEY}-sm.webp`,
  `${BASE_KEY}-md.webp`,
  `${BASE_KEY}-lg.webp`,
];

async function main() {
  console.log("  R2 smoke: uploading 1x1 test PNG as 3 WebP variants...");

  // Create a 1x1 red PNG buffer via sharp.
  const buffer = await sharp({
    create: { width: 1, height: 1, channels: 3, background: { r: 255, g: 0, b: 0 } },
  })
    .png()
    .toBuffer();

  const variants = await uploadImageVariants(buffer, BASE_KEY);

  // Assert exactly 3 variants.
  if (variants.length !== 3) {
    throw new Error(`Expected 3 variants, got ${variants.length}`);
  }

  // Assert keys match the contract.
  const keys = variants.map((v) => v.key).sort();
  const expectedSorted = [...EXPECTED_KEYS].sort();
  for (let i = 0; i < expectedSorted.length; i++) {
    if (keys[i] !== expectedSorted[i]) {
      throw new Error(`Key mismatch: expected ${expectedSorted[i]}, got ${keys[i]}`);
    }
  }

  // Assert all variants are image/webp.
  for (const v of variants) {
    if (v.format !== "webp") {
      throw new Error(`Expected format webp, got ${v.format} for key ${v.key}`);
    }
  }

  console.log(`  ✓ Uploaded 3 WebP variants: ${EXPECTED_KEYS.join(", ")}`);

  // Cleanup: delete the smoke-test objects so the bucket stays clean.
  try {
    const bucket = process.env.S3_BUCKET || "anydiscussion-media";
    await s3Client.send(
      new DeleteObjectsCommand({
        Bucket: bucket,
        Delete: {
          Objects: EXPECTED_KEYS.map((k) => ({ Key: k })),
        },
      }),
    );
    console.log("  ✓ Cleaned up smoke-test objects.");
  } catch (err) {
    // Cleanup is best-effort — don't fail the smoke test over it.
    console.warn("  ⚠ Cleanup failed (non-fatal):", err?.message || err);
  }
}

main().catch((err) => {
  console.error("  ✗ R2 smoke FAILED:", err?.message || err);
  process.exitCode = 1;
});
