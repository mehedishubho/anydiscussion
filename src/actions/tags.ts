// src/actions/tags.ts
// [CITED: src/actions/users.ts — the established Server Action template (PATTERNS.md row)]
// [CITED: 03-CONTEXT.md D-22 (actions + editor pickers now; mgmt UI Phase 4 DASH-02),
//  D-23 (tags capped ~8 in savePost, NOT here), D-08 (soft-delete)]
// [CITED: CLAUDE.md "Roles & permissions" — every mutating action starts with the check]
//
// Tags Server Actions. The D-23 tag cap (~8) is enforced in `savePost` (via the
// Zod schema's `.max(8, 'TOO_MANY_TAGS')` on `tagIds`) — createTag itself is
// uncapped (any one tag is reusable across many posts).
//
// D-20: createTag/updateTag call assertUniqueSlug(slug, 'tags').
// D-08: softDeleteTag sets deletedAt (never hard-deletes).
//
// Server-only — top directive mandatory for Server Actions.
"use server";
import { revalidatePath, revalidateTag } from "next/cache";
import { db, schema } from "@/lib/db";
import { asc, eq, isNull } from "drizzle-orm";
import { log } from "@/lib/log";
import { requireCan } from "@/lib/permissions";
import { assertUniqueSlug, validateSlug } from "@/lib/slug";

interface TagInput {
  name: string;
  slug: string;
}

export async function createTag(input: TagInput) {
  await requireCan({ taxonomy: ["create"] }); // FIRST (Pitfall #1)
  const slugCheck = validateSlug(input.slug);
  if (!slugCheck.valid) {
    throw new Error(`INVALID_SLUG:${slugCheck.reason ?? ""}`);
  }
  await assertUniqueSlug(input.slug, "tags");
  const [row] = await db
    .insert(schema.tags)
    .values({ name: input.name, slug: input.slug })
    .returning({ id: schema.tags.id, slug: schema.tags.slug });

  // D-25 / Pitfall #3 / #7 — revalidate AFTER permission gate AND DB write.
  // `/tag/[slug]` mixes path-cache (getTagBySlug has NO cacheTag) AND cacheTag("posts-list")
  // (via listArchive({tagId}) + listTags + listCategoriesWithCounts). Note: listArchive has
  // NO per-tag cacheTag (only categoryId/authorId branches add per-entity tags), so
  // revalidateTag("posts-list", "max") is the only tag-axis invalidation needed.
  // Template: src/actions/posts.ts:325-375.
  revalidatePath(`/tag/${row?.slug ?? input.slug}`);
  revalidatePath("/blog");
  revalidatePath("/");
  revalidatePath("/archive");
  revalidatePath("/sitemap.xml");
  revalidateTag("posts-list", "max");

  return { id: row?.id };
}

export async function listTags() {
  // Read is open to the dashboard. Sorted by name (D-22 UX for the tag picker).
  return await db
    .select()
    .from(schema.tags)
    .where(isNull(schema.tags.deletedAt))
    .orderBy(asc(schema.tags.name));
}

/**
 * getPostTagIds — returns the tag IDs associated with a post (post_tags join).
 * Used by the post edit page to pre-select existing tags in TagPicker.
 * Read-only — no permission check (the caller, getPost, already gates with assertOwnsPost).
 */
export async function getPostTagIds(postId: number): Promise<number[]> {
  const rows = await db
    .select({ tagId: schema.postTags.tagId })
    .from(schema.postTags)
    .where(eq(schema.postTags.postId, postId));
  return rows.map((r) => r.tagId);
}

export async function updateTag(id: number, input: Partial<TagInput>) {
  await requireCan({ taxonomy: ["update"] }); // FIRST (Pitfall #1)
  if (input.slug) {
    const slugCheck = validateSlug(input.slug);
    if (!slugCheck.valid) {
      throw new Error(`INVALID_SLUG:${slugCheck.reason ?? ""}`);
    }
    await assertUniqueSlug(input.slug, "tags", id);
  }

  // Fetch the current slug BEFORE the write so we can revalidate the OLD public URL
  // when the slug changes (matches the updateCategory pattern).
  const [existing] = await db
    .select({ slug: schema.tags.slug })
    .from(schema.tags)
    .where(eq(schema.tags.id, id))
    .limit(1);

  await db
    .update(schema.tags)
    .set({
      ...(input.name ? { name: input.name } : {}),
      ...(input.slug ? { slug: input.slug } : {}),
    })
    .where(eq(schema.tags.id, id));

  // D-25 / Pitfall #3 / #7 — revalidate AFTER permission gate AND DB write.
  if (existing?.slug) revalidatePath(`/tag/${existing.slug}`);
  if (input.slug && input.slug !== existing?.slug) {
    revalidatePath(`/tag/${input.slug}`);
  }
  revalidatePath("/blog");
  revalidatePath("/");
  revalidatePath("/archive");
  revalidatePath("/sitemap.xml");
  revalidateTag("posts-list", "max");

  return { id };
}

export async function softDeleteTag(id: number) {
  await requireCan({ taxonomy: ["delete"] }); // FIRST (Pitfall #1)

  // Fetch slug BEFORE soft-delete so we can revalidate the concrete URL.
  const [existing] = await db
    .select({ slug: schema.tags.slug })
    .from(schema.tags)
    .where(eq(schema.tags.id, id))
    .limit(1);

  await db
    .update(schema.tags)
    .set({ deletedAt: new Date() }) // D-08 soft-delete
    .where(eq(schema.tags.id, id));

  // D-25 / Pitfall #3 / #7 — revalidate AFTER permission gate AND DB write.
  if (existing?.slug) revalidatePath(`/tag/${existing.slug}`);
  revalidatePath("/blog");
  revalidatePath("/");
  revalidatePath("/archive");
  revalidatePath("/sitemap.xml");
  revalidateTag("posts-list", "max");

  log.info("tag soft-deleted", { id });
  return { id };
}
