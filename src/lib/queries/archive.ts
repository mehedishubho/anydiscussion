// src/lib/queries/archive.ts
// [CITED: 06-01-PLAN.md Task 2 — filterable archive list (D-12)]
// [CITED: 06-PATTERNS.md — where-clause accumulation from src/actions/media.ts listMedia]
//
// Public filterable archive list. Where-clause accumulation pattern: build an
// array of conditions from the optional filters, then pass to `.where(and(...))`.
// Published-only (T-06-02). Paginated with numbered pagination (D-03/D-12).
//
// Server-only — NO "use client" directive.

import { cacheLife, cacheTag } from "next/cache";
import { db, schema } from "@/lib/db";
import { eq, isNull, and, desc, sql, type SQL } from "drizzle-orm";

/** Filters for the archive list (SITE-03 / D-12). */
export interface ArchiveFilters {
  categoryId?: number;
  tagId?: number;
  authorId?: string;
  dateFrom?: Date;
  dateTo?: Date;
}

/** Export the page size so consuming routes can compute total pages. */
export const ARCHIVE_PAGE_SIZE = 20;

/**
 * listArchive — dense filterable list of published posts (SITE-03 / D-12).
 *
 * Where-clause accumulation: optional filters are pushed onto a conditions array
 * and combined via `and(...)`. Only published, non-deleted posts (T-06-02).
 * Numbered pagination (ISR/SEO-friendly per D-03). Left-joins `user` so the
 * consuming PostCard instances render author bylines (D-11).
 *
 * Cached via 'use cache' + cacheLife("hours") + cacheTag("posts-list").
 */
export async function listArchive(filters: ArchiveFilters, page: number) {
  "use cache";
  cacheLife("hours");
  cacheTag("posts-list");
  if (filters.categoryId) cacheTag(`category-${filters.categoryId}`);
  if (filters.authorId) cacheTag(`author-${filters.authorId}`);

  const offset = (Math.max(1, page) - 1) * ARCHIVE_PAGE_SIZE;

  const conditions: SQL[] = [
    eq(schema.posts.status, "published"),
    isNull(schema.posts.deletedAt),
  ];
  if (filters.categoryId) {
    conditions.push(eq(schema.posts.categoryId, filters.categoryId));
  }
  if (filters.authorId) {
    conditions.push(eq(schema.posts.authorId, filters.authorId));
  }
  if (filters.dateFrom) {
    conditions.push(sql`${schema.posts.publishedAt} >= ${filters.dateFrom}`);
  }
  if (filters.dateTo) {
    conditions.push(sql`${schema.posts.publishedAt} <= ${filters.dateTo}`);
  }

  if (filters.tagId) {
    // Tag filter requires a join — use innerJoin to exclude non-tagged posts.
    return await db
      .select()
      .from(schema.posts)
      .innerJoin(
        schema.postTags,
        eq(schema.postTags.postId, schema.posts.id),
      )
      .leftJoin(schema.user, eq(schema.user.id, schema.posts.authorId))
      .where(and(...conditions, eq(schema.postTags.tagId, filters.tagId)))
      .orderBy(desc(schema.posts.publishedAt))
      .offset(offset)
      .limit(ARCHIVE_PAGE_SIZE);
  }

  return await db
    .select()
    .from(schema.posts)
    .leftJoin(schema.user, eq(schema.user.id, schema.posts.authorId))
    .where(and(...conditions))
    .orderBy(desc(schema.posts.publishedAt))
    .offset(offset)
    .limit(ARCHIVE_PAGE_SIZE);
}

/**
 * countArchive — total count of published posts matching the archive filters.
 *
 * Powers numbered pagination on /archive, /category/[slug], /tag/[slug] (D-12).
 * Uses count(distinct posts.id) when the tag innerJoin is present so a post with
 * the tag is not double-counted. Cached identically to listArchive.
 */
export async function countArchive(filters: ArchiveFilters): Promise<number> {
  "use cache";
  cacheLife("hours");
  cacheTag("posts-list");
  if (filters.categoryId) cacheTag(`category-${filters.categoryId}`);
  if (filters.authorId) cacheTag(`author-${filters.authorId}`);

  const conditions: SQL[] = [
    eq(schema.posts.status, "published"),
    isNull(schema.posts.deletedAt),
  ];
  if (filters.categoryId) {
    conditions.push(eq(schema.posts.categoryId, filters.categoryId));
  }
  if (filters.authorId) {
    conditions.push(eq(schema.posts.authorId, filters.authorId));
  }
  if (filters.dateFrom) {
    conditions.push(sql`${schema.posts.publishedAt} >= ${filters.dateFrom}`);
  }
  if (filters.dateTo) {
    conditions.push(sql`${schema.posts.publishedAt} <= ${filters.dateTo}`);
  }

  if (filters.tagId) {
    const [row] = await db
      .select({ value: sql<number>`count(distinct ${schema.posts.id})` })
      .from(schema.posts)
      .innerJoin(
        schema.postTags,
        eq(schema.postTags.postId, schema.posts.id),
      )
      .where(and(...conditions, eq(schema.postTags.tagId, filters.tagId)));
    return Number(row?.value ?? 0);
  }

  const [row] = await db
    .select({ value: sql<number>`count(*)` })
    .from(schema.posts)
    .where(and(...conditions));
  return Number(row?.value ?? 0);
}
