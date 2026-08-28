// src/lib/post-card.ts
// [CITED: 260823-4yc-PLAN.md Task 1 — the ONE shared row-to-PostCardProps mapper]
// [CITED: 260823-4yc-PLAN.md locked decision 3 — category tag / avatar / read time]
// [CITED: src/lib/reading-time/index.ts — deriveReadingTime (Bangla-aware, 200 WPM, min 1)]
//
// The single mapper from a joined query row ({ posts, user, categories }) to
// PostCardProps. Replaces the inline mapping previously duplicated across the
// list consumers (home, /blog, /blog/page/N, /category, /tag, /archive,
// /author, RelatedPosts).
//
// Pure module — no db, no react. The type-only import of PostCardProps is
// erased at compile time, so this module is safely unit-testable in node env.
//
// Server-side helper (consumed by Server Components) — NO "use client".

import type { PostCardProps } from "@/components/site/PostCard";
import { deriveReadingTime } from "@/lib/reading-time";

/**
 * The joined-row fields toPostCardProps reads. Every list/feed query
 * (listPublished, listFeatured, listRelated, listArchive, listAuthorPosts)
 * left-joins (or inner-joins) these tables after 260823-4yc Task 1.
 * Consumers cast their Drizzle rows with `as PostCardJoinedRow` following the
 * existing cast convention (full table rows are structurally compatible).
 */
export interface PostCardJoinedRow {
  posts: {
    id: number;
    title: string;
    slug: string;
    excerpt: string | null;
    featureImage: string | null;
    publishedAt: Date | null;
    /** Tiptap JSON body (jsonb) — the read-time source. Unknown shape here. */
    body: unknown;
  };
  user: {
    name: string | null;
    username: string | null;
    avatar: string | null;
  } | null;
  categories: { name: string; slug: string } | null;
}

/**
 * Map a joined query row to PostCardProps — base fields plus the upgraded
 * optional props: authorAvatar (user.avatar), categoryName/categorySlug
 * (null-safe), and readTime derived from posts.body via deriveReadingTime
 * (200 WPM Bangla-aware, minimum 1 — never null).
 */
export function toPostCardProps(row: PostCardJoinedRow): PostCardProps {
  return {
    id: row.posts.id,
    title: row.posts.title,
    slug: row.posts.slug,
    excerpt: row.posts.excerpt,
    featureImage: row.posts.featureImage,
    publishedAt: row.posts.publishedAt,
    authorName: row.user?.name ?? null,
    authorUsername: row.user?.username ?? null,
    authorAvatar: row.user?.avatar ?? null,
    categoryName: row.categories?.name ?? null,
    categorySlug: row.categories?.slug ?? null,
    readTime: deriveReadingTime(row.posts.body),
  };
}

/**
 * URL shape for a single post: /blog/{category-slug}/{post-slug}.
 *
 * 260828-blog-url: when a post has no category (categoryId IS NULL), the
 * category segment falls back to the literal "uncategorized". The single-post
 * route at /blog/[category]/[slug] accepts the same fallback and matches
 * posts where categoryId IS NULL. There is intentionally NO categories row
 * seeded with slug 'uncategorized' — /category/uncategorized is expected to
 * 404 (it isn't a user-facing archive).
 *
 * Centralized here so every link consumer (PostCard, HomeFeed, ShareButtons,
 * not-found.tsx SuggestedPosts) produces the same URL string.
 */
export const UNCATEGORIZED_SLUG = "uncategorized";

/** Build the canonical single-post URL from a category slug + post slug. */
export function postUrl(input: {
  categorySlug?: string | null;
  slug: string;
}): string {
  const cat = input.categorySlug || UNCATEGORIZED_SLUG;
  return `/blog/${cat}/${input.slug}`;
}
