// src/app/(site)/page.tsx
// [CITED: 06-04-PLAN.md Task 1 — Home magazine layout (D-03/D-04)]
// [CITED: 06-CONTEXT.md D-03 — three distinct routes: home = magazine]
// [CITED: 06-CONTEXT.md D-04 — featured flag gives editorial control over the hero]
// [CITED: 06-CONTEXT.md D-16 — friendly empty states]
// [CITED: 06-RESEARCH.md Pattern 2 — cached paginated list query shape]
//
// Home route — magazine layout per D-03/D-04:
//   1. Hero: most-recently-published featured post (listFeatured — D-04 manual
//      flag gives editorial control so home hero ≠ /blog first item). Falls back
//      to the most recent published post when no featured posts exist.
//   2. Latest grid: listPublished page 1 (PostCard instances, hero excluded).
//   3. Category teasers: 1–2 categories with the most published posts, each with
//      a few recent posts as smaller PostCards.
//
// The home route's generateMetadata is settings-driven (the cached snapshot). The
// data reads are cached at the query layer ('use cache' + cacheTag('posts-list')),
// so the page component itself needs NO 'use cache' directive — under
// cacheComponents:true it becomes part of the static shell automatically.
//
// Server-only — NO "use client" directive.

import type { Metadata } from "next";
import React from "react";
import Image from "next/image";
import Link from "next/link";
import { getSeoSettings } from "@/lib/seo/settings";
import { buildSiteMetadata } from "@/lib/seo/metadata";
import {
  listFeatured,
  listPublished,
} from "@/lib/queries/posts";
import { listCategoriesWithCounts } from "@/lib/queries/taxonomy";
import PostCard from "@/components/site/PostCard";

/** Compact date formatter (Intl.DateTimeFormat per CLAUDE.md L10n-safe formatting). */
const dateFormatter = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "short",
  day: "numeric",
});

/** Page sizes for the home sections. */
const HERO_FALLBACK_SIZE = 1;
const GRID_PAGE_SIZE = 6;
const TEASER_CATEGORY_COUNT = 2;
const TEASER_POSTS_PER_CATEGORY = 4;

export async function generateMetadata(): Promise<Metadata> {
  "use cache";
  const s = await getSeoSettings();
  return buildSiteMetadata(s);
}

/** The joined row shape from listFeatured / listPublished (posts + user). */
type JoinedPostRow = {
  posts: {
    id: number;
    title: string;
    slug: string;
    excerpt: string | null;
    featureImage: string | null;
    publishedAt: Date | null;
  };
  user: { name: string | null; username: string | null } | null;
};

/**
 * Map a joined query row ({ posts, user }) to PostCard props. Shared across the
 * hero fallback + latest grid + category teasers.
 */
function toPostCardProps(row: JoinedPostRow) {
  return {
    id: row.posts.id,
    title: row.posts.title,
    slug: row.posts.slug,
    excerpt: row.posts.excerpt,
    featureImage: row.posts.featureImage,
    publishedAt: row.posts.publishedAt,
    authorName: row.user?.name ?? null,
    authorUsername: row.user?.username ?? null,
  };
}

export default async function HomePage() {
  // 1. Hero — featured post (D-04), fallback to most recent published.
  const featured = await listFeatured(1);
  let heroRow: JoinedPostRow | null = null;

  if (featured.length > 0) {
    heroRow = featured[0] as JoinedPostRow;
  } else {
    // Fallback: most recent published post (so a fresh blog still has a hero).
    const latest = await listPublished({ page: 1, pageSize: HERO_FALLBACK_SIZE });
    if (latest.length > 0) {
      heroRow = latest[0] as JoinedPostRow;
    }
  }

  const heroId = heroRow?.posts.id ?? null;

  // 2. Latest grid — exclude the hero post (D-04 editorial intent: hero is distinct).
  const gridRaw = await listPublished({ page: 1, pageSize: GRID_PAGE_SIZE + 1 });
  const gridRows = gridRaw.filter(
    (r) => (r as JoinedPostRow).posts.id !== heroId,
  );
  const gridCards = gridRows
    .slice(0, GRID_PAGE_SIZE)
    .map((r) => toPostCardProps(r as JoinedPostRow));

  // 3. Category teasers — top categories by published post count.
  const categories = await listCategoriesWithCounts();
  const teaserCategories = categories
    .filter((c) => c.postCount > 0)
    .sort((a, b) => b.postCount - a.postCount)
    .slice(0, TEASER_CATEGORY_COUNT);

  const teasers = await Promise.all(
    teaserCategories.map(async (cat) => {
      const posts = await listPublished({
        page: 1,
        pageSize: TEASER_POSTS_PER_CATEGORY,
        categoryId: cat.id,
      });
      return {
        id: cat.id,
        name: cat.name,
        slug: cat.slug,
        description: cat.description,
        posts: posts.map((r) => toPostCardProps(r as JoinedPostRow)),
      };
    }),
  );

  // D-16 — friendly empty state when the blog has zero published posts.
  if (!heroRow && gridCards.length === 0) {
    return (
      <div className="mx-auto flex max-w-2xl flex-col items-center justify-center px-6 py-24 text-center">
        <h1 className="mb-4 text-3xl font-bold text-gray-800 dark:text-white/90 sm:text-4xl">
          No posts yet
        </h1>
        <p className="text-base text-gray-600 dark:text-gray-400">
          Check back soon — new stories are on the way.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      {/* ─── HERO ─── */}
      {heroRow ? <HeroCard row={heroRow} /> : null}

      {/* ─── LATEST GRID ─── */}
      {gridCards.length > 0 ? (
        <section className="mt-12">
          <div className="mb-6 flex items-baseline justify-between">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
              Latest
            </h2>
            <Link
              href="/blog"
              className="text-sm font-medium text-brand-600 hover:underline dark:text-brand-400"
            >
              View all →
            </Link>
          </div>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {gridCards.map((card) => (
              <PostCard key={card.id} {...card} />
            ))}
          </div>
        </section>
      ) : null}

      {/* ─── CATEGORY TEASERS ─── */}
      {teasers.map((cat) =>
        cat.posts.length > 0 ? (
          <section key={cat.id} className="mt-12">
            <div className="mb-6 flex items-baseline justify-between">
              <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                <Link
                  href={`/category/${cat.slug}`}
                  className="hover:underline"
                >
                  {cat.name}
                </Link>
              </h2>
              <Link
                href={`/category/${cat.slug}`}
                className="text-sm font-medium text-brand-600 hover:underline dark:text-brand-400"
              >
                More in {cat.name} →
              </Link>
            </div>
            {cat.description ? (
              <p className="mb-4 text-sm text-gray-600 dark:text-gray-400">
                {cat.description}
              </p>
            ) : null}
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {cat.posts.map((card) => (
                <PostCard key={card.id} {...card} />
              ))}
            </div>
          </section>
        ) : null,
      )}
    </div>
  );
}

/**
 * HeroCard — the large featured post card (D-04). NOT a PostCard reuse; this is
 * a distinct visual treatment (larger image, bigger title, prominent byline).
 * Server component — no client interactivity beyond plain anchor links.
 */
function HeroCard({ row }: { row: JoinedPostRow }) {
  const { posts: post, user: author } = row;
  return (
    <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900">
      {post.featureImage ? (
        <Link
          href={`/blog/${post.slug}`}
          className="relative block aspect-[21/9] w-full overflow-hidden bg-gray-100 dark:bg-gray-800"
          tabIndex={-1}
          aria-hidden="true"
        >
          <Image
            src={post.featureImage}
            alt=""
            fill
            priority
            sizes="(min-width: 1024px) 100vw, 100vw"
            className="object-cover"
          />
        </Link>
      ) : null}
      <div className="p-6 sm:p-8 lg:p-10">
        <h1 className="text-3xl font-bold leading-tight text-gray-900 dark:text-white sm:text-4xl">
          <Link href={`/blog/${post.slug}`} className="hover:underline">
            {post.title}
          </Link>
        </h1>
        {post.excerpt ? (
          <p className="mt-4 max-w-2xl text-base text-gray-600 dark:text-gray-300 sm:text-lg">
            {post.excerpt}
          </p>
        ) : null}
        <div className="mt-5 flex items-center gap-3 text-sm text-gray-500 dark:text-gray-400">
          {author?.name ? (
            author.username ? (
              <Link
                href={`/author/${author.username}`}
                className="font-medium text-gray-700 hover:underline dark:text-gray-300"
              >
                {author.name}
              </Link>
            ) : (
              <span className="font-medium text-gray-700 dark:text-gray-300">
                {author.name}
              </span>
            )
          ) : null}
          {post.publishedAt ? (
            <>
              <span aria-hidden="true">•</span>
              <time dateTime={post.publishedAt.toISOString()}>
                {dateFormatter.format(post.publishedAt)}
              </time>
            </>
          ) : null}
        </div>
      </div>
    </section>
  );
}
