// src/actions/categories.ts
// [CITED: src/actions/users.ts — the established Server Action template (PATTERNS.md row)]
// [CITED: 03-CONTEXT.md D-22 (actions + editor pickers now; mgmt UI Phase 4 DASH-02),
//  D-23 (required category), D-08 (soft-delete)]
// [CITED: CLAUDE.md "Roles & permissions" — every mutating action starts with the check]
//
// Categories Server Actions. The standalone Categories management UI (full CRUD
// table) is Phase 4 DASH-02 — these actions are the engine the post-editor
// category picker consumes now, plus enough CRUD for a Wave-0 seed path.
//
// D-20: createCategory/updateCategory call assertUniqueSlug(slug, 'categories').
// D-08: softDeleteCategory sets deletedAt (never hard-deletes).
//
// Plan 07-07 / WR-05: createCategory/updateCategory parse input via Zod
// (categorySchema / categoryUpdateSchema in ./taxonomy-schema) AFTER requireCan
// and BEFORE slug validation — empty/oversize names and >1000-char descriptions
// throw Error("INVALID_INPUT") instead of reaching the DB.
//
// Server-only — top directive mandatory for Server Actions.
"use server";
import { revalidatePath, revalidateTag } from "next/cache";
import { db, schema } from "@/lib/db";
import { asc, eq, isNull } from "drizzle-orm";
import { log } from "@/lib/log";
import { requireCan } from "@/lib/permissions";
import { assertUniqueSlug, validateSlug } from "@/lib/slug";
import { categorySchema, categoryUpdateSchema } from "./taxonomy-schema";

interface CategoryInput {
  name: string;
  slug: string;
  description?: string;
}

export async function createCategory(input: CategoryInput) {
  await requireCan({ taxonomy: ["create"] }); // FIRST (Pitfall #1)
  // WR-05: validate AFTER the permission gate, BEFORE slug validation / DB write.
  const parsed = categorySchema.safeParse(input);
  if (!parsed.success) {
    throw new Error("INVALID_INPUT");
  }
  const data = parsed.data;
  const slugCheck = validateSlug(data.slug);
  if (!slugCheck.valid) {
    throw new Error(`INVALID_SLUG:${slugCheck.reason ?? ""}`);
  }
  await assertUniqueSlug(data.slug, "categories");
  const [row] = await db
    .insert(schema.categories)
    .values({
      name: data.name,
      slug: data.slug,
      description: data.description ?? null,
    })
    .returning({ id: schema.categories.id, slug: schema.categories.slug });

  // D-25 / Pitfall #3 / Pitfall #7 — revalidate AFTER permission gate AND DB write.
  // `/category/[slug]` mixes path-cache (getCategoryBySlug has NO cacheTag — only
  // revalidatePath can refresh it) AND cacheTag("posts-list") + cacheTag(`category-${id}`)
  // (via listArchive({categoryId}) + listCategoriesWithCounts). Both mechanisms must fire.
  // Template: src/actions/posts.ts:325-375 (publishPost). 2-arg revalidateTag, concrete
  // literal paths (never "/category/[slug]" route-pattern strings).
  revalidatePath(`/category/${row?.slug ?? data.slug}`);
  revalidatePath("/blog");
  revalidatePath("/");
  revalidatePath("/archive");
  revalidatePath("/sitemap.xml");
  if (row?.id) revalidateTag(`category-${row.id}`, "max");
  revalidateTag("posts-list", "max");

  return { id: row?.id };
}

export async function listCategories() {
  // Read is open to the dashboard — no permission check (mirrors users.ts pattern
  // for listX where the proxy gate + (admin) route group gate are sufficient).
  // Hard-deleted rows (deletedAt IS NULL) are excluded. Sorted by name (D-22 UX
  // for the category picker).
  return await db
    .select()
    .from(schema.categories)
    .where(isNull(schema.categories.deletedAt))
    .orderBy(asc(schema.categories.name));
}

export async function updateCategory(id: number, input: Partial<CategoryInput>) {
  await requireCan({ taxonomy: ["update"] }); // FIRST (Pitfall #1)
  // WR-05: validate AFTER the permission gate, BEFORE slug validation / DB write.
  // A PRESENT-BUT-EMPTY name now throws INVALID_INPUT — previously the truthiness
  // spread below silently DROPPED it, turning a "rename to nothing" into a no-op.
  const parsed = categoryUpdateSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error("INVALID_INPUT");
  }
  const data = parsed.data;
  if (data.slug) {
    const slugCheck = validateSlug(data.slug);
    if (!slugCheck.valid) {
      throw new Error(`INVALID_SLUG:${slugCheck.reason ?? ""}`);
    }
    await assertUniqueSlug(data.slug, "categories", id);
  }

  // Fetch the current slug BEFORE the write so we can revalidate the OLD public URL
  // when the slug changes (the old /category/${oldSlug} cache must refresh so it
  // serves the new 404, not stale content). Single query; cheap.
  const [existing] = await db
    .select({ slug: schema.categories.slug })
    .from(schema.categories)
    .where(eq(schema.categories.id, id))
    .limit(1);

  await db
    .update(schema.categories)
    .set({
      // `!== undefined` (NOT truthiness) — defense in depth behind the Zod gate:
      // a field's PRESENCE drives the patch, so no value that survived validation
      // can be silently dropped (WR-05).
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.slug !== undefined ? { slug: data.slug } : {}),
      ...(data.description !== undefined ? { description: data.description } : {}),
    })
    .where(eq(schema.categories.id, id));

  // D-25 / Pitfall #3 / #7 — revalidate AFTER permission gate AND DB write.
  // Revalidate BOTH the existing slug's URL AND the new slug's URL (if renamed):
  // the existing URL must refresh (name/description change OR 404-on-rename), and
  // the new URL must be primed for the next request. Template: src/actions/posts.ts:325-375.
  if (existing?.slug) revalidatePath(`/category/${existing.slug}`);
  if (data.slug && data.slug !== existing?.slug) {
    revalidatePath(`/category/${data.slug}`);
  }
  revalidatePath("/blog");
  revalidatePath("/");
  revalidatePath("/archive");
  revalidatePath("/sitemap.xml");
  revalidateTag(`category-${id}`, "max");
  revalidateTag("posts-list", "max");

  return { id };
}

export async function softDeleteCategory(id: number) {
  await requireCan({ taxonomy: ["delete"] }); // FIRST (Pitfall #1)

  // Fetch the slug BEFORE the soft-delete so we can revalidate the concrete public URL.
  // After soft-delete, the /category/${slug} route checks isNull(deletedAt) and 404s;
  // the cached "200 with content" page MUST refresh so readers see the 404, not stale content.
  const [existing] = await db
    .select({ slug: schema.categories.slug })
    .from(schema.categories)
    .where(eq(schema.categories.id, id))
    .limit(1);

  await db
    .update(schema.categories)
    .set({ deletedAt: new Date() }) // D-08 soft-delete
    .where(eq(schema.categories.id, id));

  // D-25 / Pitfall #3 / #7 — revalidate AFTER permission gate AND DB write.
  if (existing?.slug) revalidatePath(`/category/${existing.slug}`);
  revalidatePath("/blog");
  revalidatePath("/");
  revalidatePath("/archive");
  revalidatePath("/sitemap.xml");
  revalidateTag(`category-${id}`, "max");
  revalidateTag("posts-list", "max");

  log.info("category soft-deleted", { id });
  return { id };
}
