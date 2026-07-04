// src/lib/slug/index.ts
// [CITED: RESEARCH.md L826 — D-20 URL-safe Latin + hyphens regex]
// [CITED: 03-CONTEXT.md D-20 — manual slugs only, no auto-transliteration]
// [CITED: CLAUDE.md "SEO requirements" — Bangla content allowed, but slugs are Latin]
//
// The slug validator for posts, categories, AND tags (all three tables carry
// `slug varchar unique`). D-20 chose manual entry over auto-generation — this
// validator enforces URL-safety on the author's typed slug. Zero transliteration
// research risk (Bangla→Latin transliteration is out of scope for v1).
//
// The regex enforces:
//   - lowercase ASCII letters + digits only
//   - hyphen-separated segments (one or more)
//   - no leading/trailing hyphens
//   - no consecutive hyphens
//
// Server-only — NO "use client" directive. Imported by:
//   - src/actions/posts.ts (savePost)
//   - src/actions/categories.ts (createCategory/updateCategory)
//   - src/actions/tags.ts (createTag/updateTag)
import { db, schema } from "@/lib/db";
import { eq, and, ne } from "drizzle-orm";
import { log } from "@/lib/log";

const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export type SlugTable = "posts" | "categories" | "tags";

/**
 * Validate that a slug is URL-safe Latin + hyphens per D-20.
 *
 * @returns `{ valid: true }` when the slug passes, `{ valid: false, reason }` otherwise.
 *          Rejects empty, non-Latin, uppercase, special chars, and bad hyphen placement.
 */
export function validateSlug(slug: string): { valid: boolean; reason?: string } {
  if (!slug || typeof slug !== "string" || slug.length === 0) {
    return { valid: false, reason: "Slug must not be empty" };
  }
  if (!SLUG_REGEX.test(slug)) {
    return {
      valid: false,
      reason:
        "Slug must be URL-safe Latin (lowercase a-z, 0-9) separated by single hyphens — no uppercase, non-Latin characters, spaces, or special characters",
    };
  }
  return { valid: true };
}

/**
 * Assert that no other row in the given table already uses `slug`. Optionally
 * exclude the row with id=excludeId (so an edit doesn't collide with itself).
 *
 * @throws Error("SLUG_NOT_UNIQUE") when a row exists with the same slug.
 *
 * Mirrors the assertOwnsPost Drizzle select-where-limit pattern from
 * src/lib/permissions/index.ts L84-88.
 */
export async function assertUniqueSlug(
  slug: string,
  table: SlugTable,
  excludeId?: number,
): Promise<void> {
  const columnMap = {
    posts: schema.posts,
    categories: schema.categories,
    tags: schema.tags,
  } as const;
  const t = columnMap[table];

  let query = db.select({ id: t.id }).from(t).where(eq(t.slug, slug));
  if (typeof excludeId === "number") {
    query = db
      .select({ id: t.id })
      .from(t)
      .where(and(eq(t.slug, slug), ne(t.id, excludeId)));
  }
  const rows = await query.limit(1);

  if (rows.length > 0) {
    log.error("slug not unique", { slug, table });
    throw new Error("SLUG_NOT_UNIQUE");
  }
}
