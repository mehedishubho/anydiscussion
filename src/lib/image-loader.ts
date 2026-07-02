// Custom next/image loader — the single source of truth for image URL resolution.
//
// Resolution rules:
//  - Absolute URLs (http/https): uploaded media served from the CDN, or any
//    external image. Passed through verbatim with sizing params appended.
//  - Local static assets (anything else — logos, icons, brand/error images that
//    live in /public): served from the app origin. A leading "./" is stripped so
//    legacy paths like "./images/logo/auth-logo.svg" resolve to "/images/...".
//    These assets are NOT in R2/MinIO — rewriting them to the CDN would 404.
//
// NEXT_PUBLIC_CDN_URL (MinIO in dev, https://cdn.anydiscussion.com in prod) is
// consumed by the media upload helpers (Phase 3) to BUILD the absolute CDN URLs
// that get passed to <Image>; the loader only needs to recognize them here.

export default function cdnImageLoader({
  src,
  width,
  quality,
}: {
  src: string;
  width: number;
  quality?: number;
}): string {
  const q = quality || 75;
  const sep = src.includes("?") ? "&" : "?";

  // Absolute URL (CDN-hosted media or external image) — pass through with sizing.
  if (/^https?:\/\//.test(src)) {
    return `${src}${sep}w=${width}&q=${q}`;
  }

  // Local static asset — normalize to an absolute path and serve from the app
  // origin. Stripping "./" prevents the malformed URL ("host./images/...") that
  // previously threw "Failed to construct 'URL'" inside next/image.
  const localPath = src.startsWith("/") ? src : `/${src.replace(/^\.\//, "")}`;
  return `${localPath}${sep}w=${width}&q=${q}`;
}
