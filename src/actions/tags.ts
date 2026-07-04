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
import { db, schema } from "@/lib/db";
import { eq, isNull } from "drizzle-orm";
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
    .returning({ id: schema.tags.id });
  return { id: row?.id };
}

export async function listTags() {
  // Read is open to the dashboard.
  return await db.select().from(schema.tags).where(isNull(schema.tags.deletedAt));
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
  await db
    .update(schema.tags)
    .set({
      ...(input.name ? { name: input.name } : {}),
      ...(input.slug ? { slug: input.slug } : {}),
    })
    .where(eq(schema.tags.id, id));
  return { id };
}

export async function softDeleteTag(id: number) {
  await requireCan({ taxonomy: ["delete"] }); // FIRST (Pitfall #1)
  await db
    .update(schema.tags)
    .set({ deletedAt: new Date() }) // D-08 soft-delete
    .where(eq(schema.tags.id, id));
  log.info("tag soft-deleted", { id });
  return { id };
}
