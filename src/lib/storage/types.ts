// src/lib/storage/types.ts
// [CITED: 03-CONTEXT.md D-09 — provider abstraction shape]
// [CITED: 03-RESEARCH.md Pattern 3 (L496-519) — StorageProvider interface]
// [CITED: MEDIA-04 — Storage provider abstraction (lib/storage/)]
//
// THE provider contract. Both shipping providers (local default, r2) AND any
// Phase-4 DASH-09 extensions (Cloudinary, push-CDN) implement this interface so
// `actions/media.ts` can call `getActiveProvider().upload(...)` without knowing
// which backend is selected. The active provider is read from
// settings.storage.active_provider by registry.ts.
//
// D-09 — the r2 provider wraps the existing Phase-1 `uploadImageVariants`
// unchanged; UploadedVariant is RE-EXPORTED from @/lib/r2 (no duplication).
//
// Server-only — NO "use client" directive. Imported by Server Actions + the
// /api/media Route Handler (server-side).
export type { UploadedVariant } from "@/lib/r2";

import type { UploadedVariant } from "@/lib/r2";

/**
 * The contract every storage backend implements.
 *
 * `name` is the literal stored on the `media.provider` column — it MUST match
 * the value the registry selects so delete operations can route back to the
 * correct provider (a row stored with provider="r2" is deleted via r2Provider
 * even if the active setting has since switched to "local").
 */
export interface StorageProvider {
  /** Discriminator — also the value written to media.provider (MEDIA-02). */
  readonly name: "local" | "r2"; // Phase-4 DASH-09 adds "cloudinary" | "push-cdn"

  /**
   * Upload a buffer → provider. Images (mime starts with "image/") run through
   * sharp and produce 3 WebP variants (sm 640 / md 1024 / lg 1920) at quality
   * 80, fit:"inside", withoutEnlargement. Non-image mimes are stored as-is
   * (D-07). Pitfall #7: sharp runs ONCE at upload time, never per-request.
   *
   * @param buffer   Source bytes (image, PDF, etc.).
   * @param baseKey  Server-generated object key prefix (e.g. "media/2026/07/<uuid>");
   *                 NEVER user-supplied — path-traversal mitigation (T-03-13).
   * @param mimeType The original MIME type (e.g. "image/png", "application/pdf").
   * @returns Variants array (empty for non-images) + the "primary" metadata.
   *          Primary is the md variant (1024px) for images — the size used in
   *          post bodies and feature image slots.
   */
  upload(
    buffer: Buffer,
    baseKey: string,
    mimeType: string,
  ): Promise<{
    variants: UploadedVariant[]; // empty for non-images
    primary: {
      key: string;
      width?: number;
      height?: number;
      sizeBytes?: number;
    };
  }>;

  /**
   * Resolve a stored key → public URL for next/image `src`.
   *
   * - Local provider returns `/api/media/<key>` (relative → cdnImageLoader
   *   treats as app-origin per image-loader.ts L34-36).
   * - R2 provider returns `${NEXT_PUBLIC_CDN_URL}/<key>` (absolute → cdnImageLoader
   *   passes through verbatim per image-loader.ts L28-30 — D-03 mechanically supported).
   *
   * @param key     The stored object key (or a variant key).
   * @param variant Optional size selector — providers that produce variants may
   *                resolve the suffix here. Unused by current callers but kept
   *                for the Phase-4 responsive-srcset extension.
   */
  getPublicUrl(key: string, variant?: "sm" | "md" | "lg"): string;

  /**
   * Delete a stored object. Idempotent — a missing object MUST NOT throw
   * (providers catch ENOENT / 404 and return void). Used by `deleteMedia`.
   *
   * @param key The stored object key (providerKey column on media).
   */
  delete(key: string): Promise<void>;
}
