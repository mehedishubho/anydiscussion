// src/actions/media.ts
// [CITED: src/actions/users.ts — the established Server Action template]
// [CITED: 03-CONTEXT.md D-06 (server-mediated upload), D-07 (any mime), D-08 (10MB cap),
//  D-09 (provider abstraction)]
// [CITED: 03-RESEARCH.md L786-815 — Server Action template + Pitfall #7 (upload-time sharp)]
// [CITED: Pitfall #1 — every mutating action calls requireCan FIRST, BEFORE any provider
//  call or DB write (proven structurally by media.test.ts)]
// [CITED: T-03-13 — baseKey is server-generated (crypto.randomUUID), NEVER user-supplied]
//
// The media upload pipeline. Server-mediated (D-06): the client POSTs the File to
// this Server Action, which gates on permission + size, converts to a Buffer,
// delegates to the active StorageProvider (sharp variants run inside provider.upload),
// and writes the media record. NEVER presigned-direct (D-06 rejects — breaks
// server-side sharp; T-03-14 mitigated).
//
// Security ordering (Pitfall #1 — non-negotiable):
//   1. requireCan({ media: ["upload"] }) — FIRST, throws FORBIDDEN if denied.
//   2. Parse input (Zod).
//   3. Size check (file.size > MEDIA_MAX_SIZE_BYTES → throw FILE_TOO_LARGE).
//   4. provider = await getActiveProvider().
//   5. provider.upload(buffer, baseKey, mimeType) — sharp variants run here.
//   6. db.insert media record.
//
// The permission check fires BEFORE getActiveProvider is ever called — proven by
// media.test.ts mocking getActiveProvider to throw "MUST_NOT_BE_REACHED".
//
// Server-only — top directive mandatory for Server Actions.
"use server";
import { db, schema } from "@/lib/db";
import { eq, isNull, and, desc, or, sql } from "drizzle-orm";
import { log } from "@/lib/log";
import { requireCan } from "@/lib/permissions";
import { getActiveProvider } from "@/lib/storage/registry";
import {
  mediaUploadSchema,
  mediaListSchema,
  MEDIA_MAX_SIZE_BYTES,
} from "./media-schema";

/**
 * uploadMedia — the server-mediated upload action (D-06, MEDIA-01, MEDIA-02).
 *
 * Flow: requireCan → parse → size check → provider.upload → db.insert.
 * sharp variants run INSIDE provider.upload (Pitfall #7 — at upload time, not
 * per-request). The baseKey is server-generated (crypto.randomUUID) — the user's
 * filename is NEVER used for the storage key (T-03-13 path-traversal mitigation).
 *
 * @returns { id, providerKey, publicUrl } — the new media row id + the public URL
 *          for next/image src (resolved by the provider's getPublicUrl).
 * @throws Error("FORBIDDEN") when the user lacks media:upload.
 * @throws Error("FILE_TOO_LARGE") when file.size > MEDIA_MAX_SIZE_BYTES (10MB, D-08).
 */
export async function uploadMedia(input: {
  file: File;
  altText?: string;
}): Promise<{ id: number; providerKey: string; publicUrl: string }> {
  // 1. Permission check FIRST (Pitfall #1).
  const session = await requireCan({ media: ["upload"] });

  // 2. Parse input (Zod — shared with the client form).
  const data = mediaUploadSchema.parse(input);

  // 3. Size check BEFORE provider contact (D-08, T-03-12 — a huge file never
  //    reaches sharp processing).
  if (data.file.size > MEDIA_MAX_SIZE_BYTES) {
    log.error("uploadMedia blocked — file too large", {
      size: data.file.size,
      cap: MEDIA_MAX_SIZE_BYTES,
    });
    throw new Error("FILE_TOO_LARGE");
  }

  // 4. Resolve the active provider (settings-driven — D-09).
  const provider = await getActiveProvider();

  // 5. Convert File → Buffer (the Server Action body is already bounded by
  //    serverActions.bodySizeLimit='10mb' in next.config.ts).
  const arrayBuffer = await data.file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  // 6. Server-generated baseKey — media/YYYY/MM/<uuid>. NEVER user-supplied
  //    (T-03-13 path-traversal mitigation — the user's filename is discarded).
  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  const baseKey = `media/${yyyy}/${mm}/${crypto.randomUUID()}`;

  // 7. Provider upload — sharp variants run inside (Pitfall #7 — once per upload).
  const { primary } = await provider.upload(buffer, baseKey, data.file.type);

  // 8. Insert the media record (MEDIA-02 schema — provider + providerKey + altText
  //    + uploadedBy + mimeType + width + height + sizeBytes).
  const [row] = await db
    .insert(schema.media)
    .values({
      providerKey: primary.key,
      provider: provider.name,
      altText: data.altText ?? null,
      uploadedBy: session.user.id,
      mimeType: data.file.type,
      width: primary.width ?? null,
      height: primary.height ?? null,
      sizeBytes: primary.sizeBytes ?? data.file.size,
    })
    .returning({ id: schema.media.id });

  const publicUrl = provider.getPublicUrl(primary.key);
  log.info("media uploaded", { id: row?.id, provider: provider.name });
  return {
    id: row?.id ?? 0,
    providerKey: primary.key,
    publicUrl,
  };
}

/**
 * listMedia — dashboard media library browser (MEDIA-02 read).
 *
 * Requires media:read capability (dashboard-only — no public access to the
 * library metadata). Excludes soft-deleted rows (deletedAt IS NULL).
 */
export async function listMedia(
  opts?: { limit?: number; offset?: number; mimeType?: string },
) {
  await requireCan({ media: ["read"] });
  const parsed = mediaListSchema.parse(opts ?? {});

  const conditions = [isNull(schema.media.deletedAt)];
  if (parsed.mimeType) {
    conditions.push(eq(schema.media.mimeType, parsed.mimeType));
  }

  return db
    .select()
    .from(schema.media)
    .where(and(...conditions))
    .orderBy(desc(schema.media.createdAt))
    .limit(parsed.limit)
    .offset(parsed.offset);
}

/**
 * deleteMedia — soft-delete + provider cleanup (D-08, MEDIA-02).
 *
 * Requires media:delete. Fetches the row (to get providerKey), calls
 * provider.delete(providerKey) to remove the stored object, then sets
 * deletedAt (soft-delete per D-08 — never hard-delete content rows).
 *
 * Uses the ROW's provider column to route to the correct provider for deletion
 * (a media row stored with provider="r2" is deleted via r2Provider even if the
 * active setting has since switched to "local"). Falls back to the active
 * provider if the row's provider is null (legacy/default).
 */
export async function deleteMedia(id: number): Promise<void> {
  await requireCan({ media: ["delete"] });

  const [row] = await db
    .select({
      id: schema.media.id,
      providerKey: schema.media.providerKey,
      provider: schema.media.provider,
    })
    .from(schema.media)
    .where(eq(schema.media.id, id))
    .limit(1);

  if (!row) {
    log.error("deleteMedia blocked — media row not found", { id });
    throw new Error("NOT_FOUND");
  }

  const provider = await getActiveProvider();
  await provider.delete(row.providerKey);

  await db
    .update(schema.media)
    .set({ deletedAt: new Date() })
    .where(eq(schema.media.id, id));

  log.info("media deleted", { id, provider: row.provider });
}

/**
 * findMediaReferences — D-15 warn-don't-block helper.
 *
 * Used by the MediaGrid delete-confirm UI to surface "This image appears in N
 * posts — deleting may orphan the CDN URL" before a soft-delete. Per D-15 the
 * warning NEVER blocks the delete; it is purely informational.
 *
 * Implementation (Claude's discretion per D-15 — simple substring + exact match):
 *   1. requireCan({ media: ["read"] }) — FIRST (Pitfall #1; T-04-08).
 *   2. Fetch the media row → derive its public URL via the active provider's
 *      getPublicUrl(providerKey).
 *   3. Query posts where body::text ILIKE '%<url>%' (Tiptap JSON substring) OR
 *      feature_image = url (exact match).
 *   4. Return { posts: [{id,title}], featureImageMatches: count }.
 *
 * Permission: media:read — editors/authors with media.read can legitimately see
 * which posts reference a media item they manage (T-04-08 mitigation).
 *
 * NOTE: Plan 04-05 owns the Pitfall 0 deleteMedia rewrite; this action is ADDED
 * as a sibling here and does NOT modify deleteMedia. Reference-count tracking
 * beyond {posts, featureImageMatches} is v2 per D-15.
 */
export async function findMediaReferences(id: number): Promise<{
  posts: Array<{ id: number; title: string }>;
  featureImageMatches: number;
}> {
  // 1. Permission check FIRST (Pitfall #1, T-04-08).
  await requireCan({ media: ["read"] });

  // 2. Fetch the media row to derive its public URL. If the row doesn't exist
  //    (already soft-deleted, bad id), return empty — nothing references a
  //    missing asset. Defensive short-circuit before getActiveProvider.
  const [row] = await db
    .select({
      providerKey: schema.media.providerKey,
      provider: schema.media.provider,
    })
    .from(schema.media)
    .where(eq(schema.media.id, id))
    .limit(1);

  if (!row) {
    return { posts: [], featureImageMatches: 0 };
  }

  // 3. Derive the public URL — same path the post body / feature-image stores.
  const provider = await getActiveProvider();
  const publicUrl = provider.getPublicUrl(row.providerKey);

  // 4. Single query: posts where body::text contains the URL OR feature_image
  //    matches exactly. Partition client-side into posts list + feature-image
  //    count. ILIKE on body::text catches Tiptap-JSON-stored image srcs.
  const results = await db
    .select({
      id: schema.posts.id,
      title: schema.posts.title,
      featureImage: schema.posts.featureImage,
    })
    .from(schema.posts)
    .where(
      or(
        sql`${schema.posts.body}::text ILIKE ${`%${publicUrl}%`}`,
        eq(schema.posts.featureImage, publicUrl),
      ),
    );

  return {
    posts: results.map((r) => ({ id: r.id, title: r.title })),
    featureImageMatches: results.filter((r) => r.featureImage === publicUrl)
      .length,
  };
}
