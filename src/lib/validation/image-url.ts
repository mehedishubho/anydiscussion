// src/lib/validation/image-url.ts
// [CITED: quick 260826-5l0 Task 1 — shared image-URL contract for picker-fed fields]
// [CITED: Phase 05 UAT R1 re-test — publish rejected media-library feature images with "Invalid url"]
// [CITED: src/components/dashboard/media/MediaPicker.tsx resolvePublicUrl — emits /api/media/<providerKey>]
// [CITED: src/actions/seo-settings-schema.ts — the established pure-schema module pattern]
//
// imageUrlSchema — the ONE shared contract for image-valued fields fed by the
// media picker or an external-URL paste (postSchema featureImage + ogImage,
// seoMetaSchema ogImage, seoSettingsSchema defaultOgImage). Accepts EXACTLY
// three shapes:
//   1. ""            — the form "cleared" state
//   2. absolute http(s) URL — the D-10 external-URL path (only http/https are
//      renderable image sources; javascript:/data:/ftp:// etc. are rejected)
//   3. root-relative path starting with "/" — the MediaPicker convention
//      (/api/media/<providerKey>), kept deliberately: same-origin next/image
//      optimization works (verified live: GET /api/media/...?w=640&q=75 200)
//      and the stored value stays portable across dev/prod hosts. Protocol-
//      relative "//host" strings are rejected — they smuggle an EXTERNAL host
//      behind a leading slash (threat T-Q5-01: accepted /... values must only
//      ever resolve against the app's own origin).
//
// canonical / base-URL fields (posts-schema canonicalUrl, seo validation
// canonicalUrl, pages-schema canonical, seo-settings canonicalBaseUrl,
// storage-settings cdnBaseUrl) deliberately do NOT use this helper —
// canonicals are an SEO contract and must stay absolute full URLs.

import { z } from "zod";

/** Absolute http(s) check via the platform URL parser (same parser Zod .url() uses). */
function isAbsoluteHttpUrl(v: string): boolean {
  try {
    const url = new URL(v);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export const imageUrlSchema = z.string().refine(
  (v) =>
    v === "" ||
    isAbsoluteHttpUrl(v) ||
    (v.startsWith("/") && !v.startsWith("//")),
  {
    error: "Image must be a full http(s) URL or a root-relative path starting with /",
  },
);
