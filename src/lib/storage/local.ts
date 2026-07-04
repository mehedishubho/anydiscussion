// src/lib/storage/local.ts
// [CITED: 03-CONTEXT.md D-09 — local provider is the default (settings-driven)]
// [CITED: 03-RESEARCH.md Pattern 4 (L584-619) — local provider body]
// [CITED: Pitfall #4 (L762-766) — output:"standalone" does NOT include runtime
//  public/ writes; the local provider writes to storage/local/ (OUTSIDE public/)
//  and is served via the /api/media/[...path] Route Handler]
//
// The DEFAULT storage provider (active when settings.storage.active_provider is
// missing OR = "local"). Mirrors the same sharp→3-variant pipeline as the R2
// provider but writes to the local filesystem (storage/local/) instead of S3.
//
// Pitfall #4 (CRITICAL): files MUST be written OUTSIDE public/. Next.js's
// `output: "standalone"` (next.config.ts L7) copies `public/` at BUILD time only;
// runtime writes to public/ would 404 in the Coolify production build. The local
// provider writes to `storage/local/` (gitignored) and the /api/media Route
// Handler streams files from there with immutable cache headers.
//
// Pitfall #7: sharp runs ONCE at upload time (3 variants stored), never per
// request — the Route Handler streams the pre-computed WebP files directly.
//
// T-03-13 (path-traversal mitigation): baseKey is ALWAYS server-generated in
// actions/media.ts (crypto.randomUUID), never user-supplied. As defense-in-depth,
// this provider ALSO rejects any baseKey containing ".." sequences.
//
// Server-only — NO "use client" directive.
import path from "node:path";
import fs from "node:fs/promises";
import sharp from "sharp";
import type { StorageProvider, UploadedVariant } from "./types";

/**
 * Filesystem root for the local provider. Defaults to <repo>/storage/local/.
 * Override via STORAGE_LOCAL_ROOT env var (documented in .env.example).
 */
const LOCAL_ROOT =
  process.env.STORAGE_LOCAL_ROOT ?? path.resolve(process.cwd(), "storage/local");

const IMAGE_SIZES = [
  { width: 640, suffix: "sm" },
  { width: 1024, suffix: "md" },
  { width: 1920, suffix: "lg" },
] as const;

/**
 * Defense-in-depth path-traversal guard (T-03-13). baseKey is server-generated
 * (crypto.randomUUID in actions/media.ts) so ".." should never appear here —
 * but rejecting it at the provider boundary prevents any upstream bug from
 * escaping the storage root.
 */
function assertSafeBaseKey(baseKey: string): void {
  if (baseKey.includes("..")) {
    throw new Error("INVALID_KEY");
  }
}

/**
 * The local filesystem storage provider. Active by default
 * (settings.storage.active_provider = "local").
 */
export const localProvider: StorageProvider = {
  name: "local",

  async upload(buffer, baseKey, mimeType) {
    assertSafeBaseKey(baseKey);

    if (mimeType.startsWith("image/")) {
      // Mirror r2's 3-size pipeline: 640/1024/1920, webp quality 80,
      // fit:"inside", withoutEnlargement. Pitfall #7 — at upload time only.
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
        const dest = path.join(LOCAL_ROOT, key);
        await fs.mkdir(path.dirname(dest), { recursive: true });
        await fs.writeFile(dest, data);
        variants.push({
          key,
          width: info.width,
          height: info.height,
          format: "webp",
          sizeBytes: info.size,
        });
      }
      const md = variants[1]; // 1024px — primary size, matches r2Provider.
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

    // D-07: non-image → store the raw buffer as-is at LOCAL_ROOT/${baseKey}.
    const dest = path.join(LOCAL_ROOT, baseKey);
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.writeFile(dest, buffer);
    return {
      variants: [],
      primary: { key: baseKey, sizeBytes: buffer.length },
    };
  },

  getPublicUrl(key) {
    // Relative URL — cdnImageLoader treats as app-origin (image-loader.ts L34-36).
    // The /api/media Route Handler streams the file from LOCAL_ROOT.
    return `/api/media/${key}`;
  },

  async delete(key) {
    // Idempotent — ignore ENOENT (file already gone). Matches the StorageProvider
    // contract + the r2 provider's catch-and-swallow.
    await fs.unlink(path.join(LOCAL_ROOT, key)).catch(() => {});
  },
};
