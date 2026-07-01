// Custom next/image loader — rewrites image URLs to the CDN base (env-driven).
// Local dev: MinIO (http://localhost:9000). Staging/prod: Coolify injects
// NEXT_PUBLIC_CDN_URL=https://cdn.anydiscussion.com (D-12).
// This is the single source of truth for image URL rewriting.

export default function cdnImageLoader({
  src,
  width,
  quality,
}: {
  src: string;
  width: number;
  quality?: number;
}): string {
  const cdnBase = process.env.NEXT_PUBLIC_CDN_URL || "http://localhost:9000";
  return `${cdnBase}${src}?w=${width}&q=${quality || 75}`;
}
