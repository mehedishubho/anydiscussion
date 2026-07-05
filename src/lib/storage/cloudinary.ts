// src/lib/storage/cloudinary.ts
// [CITED: 04-CONTEXT.md D-22 — Cloudinary provider; bypasses sharp; URL transforms]
// [CITED: 04-RESEARCH.md Example 1 (lines 542-588) — Cloudinary provider shape]
// [CITED: 04-RESEARCH.md Pitfall 3 (lines 509-513) — upload_stream + Readable.from(buffer)]
// [CITED: 04-PATTERNS.md row — CloudinaryProvider assignment]
// [CITED: 04-05-PLAN.md Task 2 <behavior> + <action>]
//
// The Cloudinary storage provider (D-22). Differs from local/r2 in ONE key respect:
// Cloudinary owns image transforms at delivery URL time, so upload() BYPASSES sharp
// and returns variants:[] — sharp would double-transform (Cloudinary's value prop is
// on-the-fly transforms via URL params: f_auto, q_auto, w_1024).
//
// Upload path: cloudinary.v2.uploader.upload_stream + Readable.from(buffer).pipe(stream)
// per Pitfall 3 — the canonical Node stream pattern. Returns primary.key = public_id.
//
// getPublicUrl: cloudinary.v2.url(key, { transformation: [{ fetch_format, quality,
// raw_transformation: "w_<N>" }] }) → https://res.cloudinary.com/<cloud>/image/upload/...
//
// delete: cloudinary.v2.uploader.destroy(key).catch(() => {}) — idempotent (returns 200
// for missing resources by design; the .catch defends against transient SDK errors).
//
// Config: configureCloudinary({ cloud_name, api_key, api_secret }) is called at boot
// (instrumentation.ts) AND after a successful Storage Settings save (storage-settings.ts).
// The provider starts unconfigured — getActiveProvider falls back to local until the
// admin enters Cloudinary creds.
//
// Server-only — NO "use client" directive. The cloudinary SDK is server-only.
import { v2 as cloudinary } from "cloudinary";
import { Readable } from "node:stream";
import type { StorageProvider } from "./types";

/**
 * The result shape from cloudinary.v2.uploader.upload_stream per RESEARCH.md A2
 * (verified against cloudinary@2.10.0 SDK — public_id + secure_url + dimensions + bytes).
 */
interface CloudinaryUploadResult {
  public_id: string;
  secure_url: string;
  width?: number;
  height?: number;
  bytes?: number;
}

/**
 * Configure the Cloudinary SDK with credentials (D-22). Called at boot from
 * instrumentation.ts AND after a successful Storage Settings save. Reads encrypted
 * creds from settings, decrypts server-side, and calls cloudinary.v2.config(...).
 *
 * Safe to call multiple times — overwrites the prior config.
 */
export function configureCloudinary(creds: {
  cloud_name: string;
  api_key: string;
  api_secret: string;
}): void {
  cloudinary.config({
    cloud_name: creds.cloud_name,
    api_key: creds.api_key,
    api_secret: creds.api_secret,
    secure: true,
  });
}

/**
 * The Cloudinary storage provider (D-22). Active when
 * settings.storage.active_provider = "cloudinary". Registered at boot via
 * instrumentation.ts → registerStorageProvider("cloudinary", cloudinaryProvider).
 *
 * The provider MUST be configured via configureCloudinary(...) before upload/delete
 * will succeed — an unconfigured provider will throw on the first SDK call (Cloudinary
 * SDK surfaces clear "cloud_name missing" errors; acceptable for the "admin hasn't
 * entered creds yet" path; the default-safe getActiveProvider fallback keeps the local
 * provider working without Cloudinary creds configured).
 */
export const cloudinaryProvider: StorageProvider = {
  name: "cloudinary",

  async upload(buffer, baseKey, _mimeType) {
    // D-22: Cloudinary owns transforms at delivery URL time. sharp is BYPASSED —
    // returning variants:[] (the local/r2 pipeline runs 3 sharp variants; Cloudinary
    // produces them on-demand at the CDN edge instead). Pitfall 3 — upload_stream
    // takes a Node stream; convert the Buffer via Readable.from(buffer).pipe(stream).
    const result = await new Promise<CloudinaryUploadResult>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          resource_type: "auto",
          folder: "media",
          // public_id is the storage key Cloudinary uses — keep it server-generated
          // (the baseKey is media/YYYY/MM/<uuid>, never user-supplied — T-03-13).
          public_id: baseKey,
        },
        (err, res) => {
          if (err) return reject(err);
          if (!res) return reject(new Error("Cloudinary upload returned no result"));
          resolve(res as CloudinaryUploadResult);
        },
      );
      // Pitfall 3: pipe the buffer through the upload_stream. The SDK consumes the
      // stream asynchronously and emits the callback above when the upload completes.
      Readable.from(buffer).pipe(stream);
    });

    return {
      variants: [], // Cloudinary transforms at delivery URL time — no stored variants.
      primary: {
        key: result.public_id,
        width: result.width,
        height: result.height,
        sizeBytes: result.bytes,
      },
    };
  },

  getPublicUrl(key, variant) {
    // On-the-fly transform via URL params (Cloudinary's value proposition).
    // f_auto → format negotiation (webp/avif where supported)
    // q_auto → visual-quality auto
    // w_<N>  → width constraint (preserves aspect ratio by default)
    const widthTransform =
      variant === "sm" ? "w_640" : variant === "lg" ? "w_1920" : "w_1024";
    return cloudinary.url(key, {
      transformation: [
        {
          fetch_format: "auto",
          quality: "auto",
          raw_transformation: widthTransform,
        },
      ],
    });
  },

  async delete(key) {
    // Idempotent — destroy returns { result: "ok" | "not found" }; either way we
    // swallow. The .catch also defends against transient SDK errors (network blips,
    // rate limits). Per the StorageProvider contract, delete MUST NOT throw on a
    // missing resource (matches local.ts + r2.ts catch-and-swallow pattern).
    await cloudinary.uploader.destroy(key).catch(() => {});
  },
};
