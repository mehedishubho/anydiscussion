// src/lib/queries/taxonomy.ts
// [CITED: 06-01-PLAN.md Task 2 — public taxonomy reads]
// [CITED: 06-PATTERNS.md — adapt src/actions/categories.ts listCategories by dropping the permission gate]
//
// Public read queries for categories and tags. Published content is public —
// NO permission checks (T-06-02). Cached via 'use cache' + cacheTag("posts-list")
// so publish revalidation refreshes counts.
//
// Server-only — NO "use client" directive.

import { cacheLife, cacheTag } from "next/cache";
import { db, schema } from "@/lib/db";
import { eq, isNull, asc, and, sql, count } from "drizzle-orm";

/**
 * getCategoryBySlug — fetch a single category by slug (SITE-04).
 * Returns null for missing or soft-deleted categories.
 */
export async function getCategoryBySlug(slug: string) {
  "use cache";
  const [row] = await db
    .select()
    .from(schema.categories)
    .where(
      and(
        eq(schema.categories.slug, slug),
        isNull(schema.categories.deletedAt),
      ),
    )
    .limit(1);
  return row ?? null;
}

/**
 * getTagBySlug — fetch a single tag by slug (SITE-05).
 * Returns null for missing or soft-deleted tags.
 */
export async function getTagBySlug(slug: string) {
  "use cache";
  const [row] = await db
    .select()
    .from(schema.tags)
    .where(
      and(eq(schema.tags.slug, slug), isNull(schema.tags.deletedAt)),
    )
    .limit(1);
  return row ?? null;
}

/**
 * listCategoriesWithCounts — all categories with their published post counts.
 *
 * Used by the header Categories dropdown (D-10) and the archive filter bar.
 * Counts only published, non-deleted posts (T-06-02).
 */
export async function listCategoriesWithCounts() {
  "use cache";
  cacheLife("hours");
  cacheTag("posts-list");

  return await db
    .select({
      id: schema.categories.id,
      name: schema.categories.name,
      slug: schema.categories.slug,
      description: schema.categories.description,
      postCount: count(schema.posts.id),
    })
    .from(schema.categories)
    .leftJoin(
      schema.posts,
      and(
        eq(schema.posts.categoryId, schema.categories.id),
        eq(schema.posts.status, "published"),
        isNull(schema.posts.deletedAt),
      ),
    )
    .where(isNull(schema.categories.deletedAt))
    .groupBy(schema.categories.id)
    .orderBy(asc(schema.categories.name));
}
