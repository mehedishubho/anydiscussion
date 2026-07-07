// src/lib/queries/users.ts
// [CITED: 06-01-PLAN.md Task 2 — public author reads (D-11)]
// [CITED: 06-PATTERNS.md — adapt src/actions/posts.ts listPosts author scoping]
//
// Public read queries for author pages (/author/[username]). Published content
// is public — NO permission checks (T-06-02). The author is identified by the
// `username` column (D-11 — user.id is a UUID, bad for public URLs).
//
// Server-only — NO "use client" directive.

import { cacheLife, cacheTag } from "next/cache";
import { db, schema } from "@/lib/db";
import { eq, isNull, and, desc, asc, sql } from "drizzle-orm";

/** Default page size for author post lists. */
const AUTHOR_PAGE_SIZE = 10;

/**
 * getUserByUsername — fetch a user by their public username slug (D-11).
 * Returns null for a missing username. Used by /author/[username] (SITE-06).
 */
export async function getUserByUsername(username: string) {
  "use cache";
  const [row] = await db
    .select({
      id: schema.user.id,
      name: schema.user.name,
      username: schema.user.username,
      bio: schema.user.bio,
      avatar: schema.user.avatar,
    })
    .from(schema.user)
    .where(eq(schema.user.username, username))
    .limit(1);
  return row ?? null;
}

/**
 * listAuthorPosts — published posts by a specific username (SITE-06).
 *
 * Paginated. Only published, non-deleted posts (T-06-02). Ordered by
 * publishedAt desc. Cached via 'use cache' + cacheTag("posts-list").
 */
export async function listAuthorPosts(username: string, page: number) {
  "use cache";
  cacheLife("hours");
  cacheTag("posts-list");

  const offset = (Math.max(1, page) - 1) * AUTHOR_PAGE_SIZE;

  return await db
    .select()
    .from(schema.posts)
    .innerJoin(schema.user, eq(schema.user.id, schema.posts.authorId))
    .where(
      and(
        eq(schema.user.username, username),
        eq(schema.posts.status, "published"),
        isNull(schema.posts.deletedAt),
      ),
    )
    .orderBy(desc(schema.posts.publishedAt))
    .offset(offset)
    .limit(AUTHOR_PAGE_SIZE);
}

/**
 * listAuthors — distinct authors (users with a username set) who have at least
 * one published post. Used by the archive filter bar's author dropdown (D-12).
 *
 * Only returns users whose `username` is set (D-11 — username is the public slug;
 * users without one cannot be linked). Cached via 'use cache' + cacheTag("posts-list").
 */
export async function listAuthors() {
  "use cache";
  cacheLife("hours");
  cacheTag("posts-list");

  return await db
    .select({
      id: schema.user.id,
      name: schema.user.name,
      username: schema.user.username,
    })
    .from(schema.user)
    .innerJoin(schema.posts, eq(schema.posts.authorId, schema.user.id))
    .where(
      and(
        eq(schema.posts.status, "published"),
        isNull(schema.posts.deletedAt),
        sql`${schema.user.username} IS NOT NULL`,
      ),
    )
    .groupBy(schema.user.id, schema.user.name, schema.user.username)
    .orderBy(asc(schema.user.name));
}
