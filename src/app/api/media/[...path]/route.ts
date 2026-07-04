// src/app/api/media/[...path]/route.ts
// [CITED: 03-RESEARCH.md Pattern 4 (L576-619) — Route Handler spec]
// [CITED: Pitfall #4 (L762-766) — output:"standalone" does NOT include runtime
//  public/ writes; the local provider writes to storage/local/ (OUTSIDE public/)
//  and this Route Handler streams files from there]
// [CITED: T-03-13 / T-03-15 — path-traversal mitigation (absolute.startsWith(LOCAL_ROOT))
//  + 404 (not 403) for missing files (does not leak file existence)]
//
// The local provider's SERVE MODEL. When storage.active_provider = "local",
// localProvider.getPublicUrl(key) returns "/api/media/<key>" — this Route Handler
// fulfills those requests by streaming the file from storage/local/<key>.
//
// When the R2 provider is active, getPublicUrl returns absolute CDN URLs and the
// browser fetches directly from the CDN — this handler simply never gets hit.
// No setting check inside the handler (the local provider's getPublicUrl is the
// ONLY consumer); if someone navigates here while R2 is active they get a 404,
// which is the correct behavior (no local files exist in that configuration).
//
// CRITICAL security properties:
//   - Path-traversal mitigation (T-03-13): absolute.startsWith(LOCAL_ROOT) check
//     rejects any attempt to escape the storage root via ../ sequences. This is
//     defense-in-depth — local.ts ALSO rejects baseKey containing "..".
//   - 404 (not 403) for missing files (T-03-15): does not leak file existence.
//   - Streaming (fs.createReadStream + Response): no buffering into memory —
//     supports large files without memory pressure.
//   - Immutable cache (1-year): content is addressed by baseKey (UUID); the same
//     key never changes content, so browsers + CDNs can cache indefinitely.
//
// Next.js 16 async params: `params: Promise<{ path: string[] }>` — awaited inside.
// Route Handlers are server-only by default (no "use client" directive).
import fs from "node:fs";
import path from "node:path";

const LOCAL_ROOT =
  process.env.STORAGE_LOCAL_ROOT ?? path.resolve(process.cwd(), "storage/local");

/**
 * Content-Type lookup for the file extensions the media pipeline produces.
 * Covers the sharp output format (.webp) + the common non-image types the D-07
 * "any mime" decision allows (PDF, video, audio). Unknown extensions fall back
 * to application/octet-stream (a safe binary download).
 */
const MIME_BY_EXTENSION: Record<string, string> = {
  ".webp": "image/webp",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".pdf": "application/pdf",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".txt": "text/plain",
  ".json": "application/json",
  ".html": "text/html; charset=utf-8",
};

function resolveMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  return MIME_BY_EXTENSION[ext] ?? "application/octet-stream";
}

/**
 * GET /api/media/[...path] — stream a locally-stored media file.
 *
 * Flow: join path → validate prefix (traversal guard) → existence check →
 * Content-Type from extension → stream via fs.createReadStream + new Response.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ path: string[] }> },
): Promise<Response> {
  const { path: segments } = await params;
  const relativePath = segments.join("/");

  // Resolve against LOCAL_ROOT and validate the result stays inside the root.
  // path.resolve normalizes "../" sequences — if the result does NOT start with
  // LOCAL_ROOT, the request attempted to escape (T-03-13 path-traversal).
  const absolute = path.resolve(LOCAL_ROOT, relativePath);
  if (!absolute.startsWith(LOCAL_ROOT)) {
    return new Response("Not Found", { status: 404 });
  }

  // Existence check — 404 (not 403) to avoid leaking file existence (T-03-15).
  if (!fs.existsSync(absolute)) {
    return new Response("Not Found", { status: 404 });
  }

  const mimeType = resolveMimeType(absolute);
  // Streaming — no buffering into memory. fs.createReadStream pipes the file
  // directly to the Response body. 1-year immutable cache: content is addressed
  // by baseKey (UUID); the same key never changes content.
  const stream = fs.createReadStream(absolute);
  return new Response(stream as unknown as ReadableStream, {
    headers: {
      "Content-Type": mimeType,
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
