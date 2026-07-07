// src/lib/queries/posts.ts
// [CITED: 06-01-PLAN.md Task 2 <action> — published-only reads + atomic view-count write]
// [CITED: 06-RESEARCH.md Pattern 1 (L495-538) — getPostForPublic + incrementViewCount]
// [CITED: 06-RESEARCH.md Pattern 3 (L566-596) — searchPosts FTS shape]
// [CITED: 06-PATTERNS.md — 'use cache' + cacheTag profile from lib/seo/settings.ts]
// [CITED: src/actions/posts.ts L363-368 — the EXACT revalidateTag tags these cacheTags match]
//
// The public read-query module for published posts. These functions are READ-ONLY
// for published content with NO permission checks (published content is public per
// D-01/T-06-02). The ONE write is incrementViewCount (unauthenticated by design).
//
// cacheTag strings MUST match publishPost's existing 2-arg revalidateTag calls:
//   revalidateTag(`post-${id}`, "max")          → cacheTag(`post-${id}`)
//   revalidateTag(`author-${aid}`, "max")       → cacheTag(`author-${aid}`)
//   revalidateTag(`category-${cid}`, "max")     → cacheTag(`category-${cid}`)
//   revalidateTag("posts-list", "max")          → cacheTag("posts-list")
//
// Server-only — NO "use client" directive.

import { cacheLife, cacheTag } from "next/cache";
import { db, schema } from "@/lib/db";
import { and, eq, isNull, desc, sql, ne, inArray, not } from "drizzle-orm";

/**
 * getPostForPublic — cached published+slug fetch for the single-post page.
 *
 * Left-joins posts + postSeo + user so the route gets all data in one query.
 * Returns null for non-existent, draft, or soft-deleted posts (T-06-02).
 *
 * cacheTag(`post-${id}`) + cacheTag(`author-${aid}`) match publishPost's existing
 * revalidateTag calls so published edits appear without a container restart.
 */
export async function getPostForPublic(slug: string) {
  "use cache";
  const [row] = await db
    .select()
    .from(schema.posts)
    .leftJoin(schema.postSeo, eq(schema.postSeo.postId, schema.posts.id))
    .leftJoin(schema.user, eq(schema.user.id, schema.posts.authorId))
    .where(
      and(
        eq(schema.posts.slug, slug),
        eq(schema.posts.status, "published"),
        isNull(schema.posts.deletedAt),
      ),
    )
    .limit(1);
  if (!row) return null;
  cacheTag(`post-${row.posts.id}`);
  if (row.posts.authorId) cacheTag(`author-${row.posts.authorId}`);
  return row;
}

/**
 * incrementViewCount — atomic UPDATE views = views + 1 (D-01).
 *
 * The ONE public write. Unauthenticated by design (published content is public).
 * NO 'use cache' — this is a per-request write, not a cached read (Pitfall 1/7).
 * Runs inside a <Suspense> boundary via connection() on the consuming route.
 */
export async function incrementViewCount(postId: number): Promise<number> {
  const [row] = await db
    .update(schema.posts)
    .set({ views: sql`${schema.posts.views} + 1` })
    .where(eq(schema.posts.id, postId))
    .returning({ views: schema.posts.views });
  return row?.views ?? 0;
}

/**
 * listPublished — cached, paginated feed of published posts (D-03).
 *
 * Used by /blog, /archive, home grid. Ordered by publishedAt desc.
 * cacheLife("hours") + cacheTag("posts-list") keep the feed ISR-friendly;
 * publishPost's revalidateTag("posts-list", "max") refreshes on publish.
 *
 * Left-joins `user` so consuming PostCard instances can render the author
 * byline (D-11 — byline links to /author/[username]).
 */
export async function listPublished(opts: {
  page: number;
  pageSize?: number;
  categoryId?: number;
  tagId?: number;
  authorId?: string;
}) {
  "use cache";
  cacheLife("hours");
  cacheTag("posts-list");
  if (opts.categoryId) cacheTag(`category-${opts.categoryId}`);
  if (opts.authorId) cacheTag(`author-${opts.authorId}`);

  const pageSize = opts.pageSize ?? 10;
  const offset = (Math.max(1, opts.page) - 1) * pageSize;

  const conditions = [
    eq(schema.posts.status, "published"),
    isNull(schema.posts.deletedAt),
  ];
  if (opts.categoryId) conditions.push(eq(schema.posts.categoryId, opts.categoryId));
  if (opts.authorId) conditions.push(eq(schema.posts.authorId, opts.authorId));

  const baseQuery = opts.tagId
    ? db
        .select()
        .from(schema.posts)
        .innerJoin(
          schema.postTags,
          eq(schema.postTags.postId, schema.posts.id),
        )
        .leftJoin(schema.user, eq(schema.user.id, schema.posts.authorId))
        .where(
          and(...conditions, eq(schema.postTags.tagId, opts.tagId)),
        )
    : db
        .select()
        .from(schema.posts)
        .leftJoin(schema.user, eq(schema.user.id, schema.posts.authorId))
        .where(and(...conditions));

  return await baseQuery
    .orderBy(desc(schema.posts.publishedAt))
    .offset(offset)
    .limit(pageSize);
}

/**
 * countPublished — total count of published posts matching the given filters.
 *
 * Powers numbered pagination on /blog and the home grid (D-03 classic URL-based
 * page numbers). Cached identically to listPublished so the count refreshes on
 * publish. Uses count(distinct posts.id) for the tag-filter case to avoid the
 * innerJoin to postTags double-counting.
 */
export async function countPublished(opts: {
  categoryId?: number;
  tagId?: number;
  authorId?: string;
} = {}): Promise<number> {
  "use cache";
  cacheLife("hours");
  cacheTag("posts-list");
  if (opts.categoryId) cacheTag(`category-${opts.categoryId}`);
  if (opts.authorId) cacheTag(`author-${opts.authorId}`);

  const conditions = [
    eq(schema.posts.status, "published"),
    isNull(schema.posts.deletedAt),
  ];
  if (opts.categoryId) conditions.push(eq(schema.posts.categoryId, opts.categoryId));
  if (opts.authorId) conditions.push(eq(schema.posts.authorId, opts.authorId));

  const baseQuery = opts.tagId
    ? db
        .select({ value: sql<number>`count(distinct ${schema.posts.id})` })
        .from(schema.posts)
        .innerJoin(
          schema.postTags,
          eq(schema.postTags.postId, schema.posts.id),
        )
        .where(
          and(...conditions, eq(schema.postTags.tagId, opts.tagId)),
        )
    : db
        .select({ value: sql<number>`count(*)` })
        .from(schema.posts)
        .where(and(...conditions));

  const [row] = await baseQuery;
  return Number(row?.value ?? 0);
}

/**
 * listFeatured — cached list of featured published posts (D-04).
 *
 * Home hero = most-recently-published featured post. Editors tick "Feature this"
 * in the post editor (the `featured` boolean flag). Left-joins `user` so the hero
 * can render the author byline (D-11).
 */
export async function listFeatured(limit = 5) {
  "use cache";
  cacheLife("hours");
  cacheTag("posts-list");

  return await db
    .select()
    .from(schema.posts)
    .leftJoin(schema.user, eq(schema.user.id, schema.posts.authorId))
    .where(
      and(
        eq(schema.posts.featured, true),
        eq(schema.posts.status, "published"),
        isNull(schema.posts.deletedAt),
      ),
    )
    .orderBy(desc(schema.posts.publishedAt))
    .limit(limit);
}

/**
 * listRelated — cached same-category posts with tag fallback (D-06).
 *
 * Primary: posts in the same category (latest-published first), excluding current.
 * If fewer than `limit`, fills with posts sharing tags via postTags join.
 * Cap 3–4 (default 3). Excludes the current post by id.
 */
export async function listRelated(
  postId: number,
  categoryId: number | null,
  limit = 3,
) {
  "use cache";
  cacheLife("hours");
  cacheTag("posts-list");
  if (categoryId) cacheTag(`category-${categoryId}`);

  // Step 1: same-category posts (excluding current).
  const categoryConditions = [
    eq(schema.posts.status, "published"),
    isNull(schema.posts.deletedAt),
    ne(schema.posts.id, postId),
  ];
  if (categoryId) {
    categoryConditions.push(eq(schema.posts.categoryId, categoryId));
  }

  const sameCategory = await db
    .select()
    .from(schema.posts)
    .where(and(...categoryConditions))
    .orderBy(desc(schema.posts.publishedAt))
    .limit(limit);

  if (sameCategory.length >= limit) return sameCategory;

  // Step 2: fill with tag-sharing posts.
  const excludeIds = [postId, ...sameCategory.map((p) => p.id)];
  const needed = limit - sameCategory.length;

  const tagMatches = await db
    .select()
    .from(schema.posts)
    .innerJoin(
      schema.postTags,
      eq(schema.postTags.postId, schema.posts.id),
    )
    .where(
      and(
        eq(schema.posts.status, "published"),
        isNull(schema.posts.deletedAt),
        not(inArray(schema.posts.id, excludeIds)),
      ),
    )
    .orderBy(desc(schema.posts.publishedAt))
    .limit(needed);

  // Deduplicate tag matches (a post may share multiple tags) and return combined.
  const seen = new Set(sameCategory.map((p) => p.id));
  const uniqueTagMatches = tagMatches.filter((r) => {
    if ("posts" in r) {
      if (seen.has((r as { posts: { id: number } }).posts.id)) return false;
      seen.add((r as { posts: { id: number } }).posts.id);
      return true;
    }
    if (seen.has((r as { id: number }).id)) return false;
    seen.add((r as { id: number }).id);
    return true;
  });

  return [...sameCategory, ...uniqueTagMatches];
}

/** Optional filters for searchPosts (SITE-08 / D-09). */
export interface SearchFilters {
  categoryId?: number;
  tagId?: number;
  authorId?: string;
  dateFrom?: Date;
  dateTo?: Date;
}

/**
 * searchPosts — Postgres full-text search (D-09).
 *
 * Uses websearch_to_tsquery('simple', query) — 'simple' config has no stemming
 * (no PG Bengali stemmer exists; SEARCH-02 v2 caveat). Bangla queries match.
 * Ranked by ts_rank desc. Published-only filter (T-06-02). Limit 20.
 *
 * NO 'use cache' — searchParams make the route dynamic; results stream in <Suspense>.
 * The Drizzle sql template parameterizes the query value (T-06-01 mitigation —
 * no string concat, bound parameters only).
 */
export async function searchPosts(query: string, filters: SearchFilters) {
  const tsquery = sql`websearch_to_tsquery('simple', ${query})`;

  const conditions = [
    sql`${schema.posts.searchVector} @@ ${tsquery}`,
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
    conditions.push(
      sql`${schema.posts.publishedAt} >= ${filters.dateFrom}`,
    );
  }
  if (filters.dateTo) {
    conditions.push(
      sql`${schema.posts.publishedAt} <= ${filters.dateTo}`,
    );
  }

  return await db
    .select({
      id: schema.posts.id,
      title: schema.posts.title,
      slug: schema.posts.slug,
      excerpt: schema.posts.excerpt,
      featureImage: schema.posts.featureImage,
      publishedAt: schema.posts.publishedAt,
      rank: sql<number>`ts_rank(${schema.posts.searchVector}, ${tsquery})`,
    })
    .from(schema.posts)
    .where(and(...conditions))
    .orderBy(desc(sql`ts_rank(${schema.posts.searchVector}, ${tsquery})`))
    .limit(20);
}
