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
// Server-only — top directive mandatory for Server Actions.
"use server";
import { db, schema } from "@/lib/db";
import { eq, isNull } from "drizzle-orm";
import { log } from "@/lib/log";
import { requireCan } from "@/lib/permissions";
import { assertUniqueSlug, validateSlug } from "@/lib/slug";

interface CategoryInput {
  name: string;
  slug: string;
  description?: string;
}

export async function createCategory(input: CategoryInput) {
  await requireCan({ taxonomy: ["create"] }); // FIRST (Pitfall #1)
  const slugCheck = validateSlug(input.slug);
  if (!slugCheck.valid) {
    throw new Error(`INVALID_SLUG:${slugCheck.reason ?? ""}`);
  }
  await assertUniqueSlug(input.slug, "categories");
  const [row] = await db
    .insert(schema.categories)
    .values({
      name: input.name,
      slug: input.slug,
      description: input.description ?? null,
    })
    .returning({ id: schema.categories.id });
  return { id: row?.id };
}

export async function listCategories() {
  // Read is open to the dashboard — no permission check (mirrors users.ts pattern
  // for listX where the proxy gate + (admin) route group gate are sufficient).
  // Hard-deleted rows (deletedAt IS NULL) are excluded.
  return await db
    .select()
    .from(schema.categories)
    .where(isNull(schema.categories.deletedAt));
}

export async function updateCategory(id: number, input: Partial<CategoryInput>) {
  await requireCan({ taxonomy: ["update"] }); // FIRST (Pitfall #1)
  if (input.slug) {
    const slugCheck = validateSlug(input.slug);
    if (!slugCheck.valid) {
      throw new Error(`INVALID_SLUG:${slugCheck.reason ?? ""}`);
    }
    await assertUniqueSlug(input.slug, "categories", id);
  }
  await db
    .update(schema.categories)
    .set({
      ...(input.name ? { name: input.name } : {}),
      ...(input.slug ? { slug: input.slug } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
    })
    .where(eq(schema.categories.id, id));
  return { id };
}

export async function softDeleteCategory(id: number) {
  await requireCan({ taxonomy: ["delete"] }); // FIRST (Pitfall #1)
  await db
    .update(schema.categories)
    .set({ deletedAt: new Date() }) // D-08 soft-delete
    .where(eq(schema.categories.id, id));
  log.info("category soft-deleted", { id });
  return { id };
}
