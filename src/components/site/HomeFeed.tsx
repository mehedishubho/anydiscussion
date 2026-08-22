// src/components/site/HomeFeed.tsx
// [CITED: 260823-4yc-PLAN.md Task 2 — shared homepage content (decisions 1 + 2)]
// [CITED: 260823-4yc-PLAN.md locked decision 1 — Featured card + Latest grid, NO teasers/Trending/Newsletter]
// [CITED: 260823-4yc-PLAN.md locked decision 2 — /page/N pagination, hero excluded on every page]
// [CITED: 06-CONTEXT.md D-04 — featured flag gives editorial control over the hero]
// [CITED: 06-CONTEXT.md D-16 — friendly empty states]
//
// The shared homepage content — rendered by "/" (page 1) and /page/[pageNumber]
// (page N > 1). Structure per the approved frontpage design (layout only; colors
// and fonts come from the existing Outfit + brand system):
//   1. Featured — ONE horizontal card (image left ~45%, category tag, large
//      title, avatar+name+date+read-time meta row, excerpt, Read More link).
//      Rendered ONLY on page 1. Hero = most-recently-published featured post
//      (D-04), falling back to the most recent published post (a fresh blog
//      still gets a hero).
//   2. Latest Posts — a uniform 1/2/3-column grid of PostCards, 12 per page.
//   3. Pagination — basePath "/" (page 1 = "/", page N = "/page/N").
// The hero post is excluded from the grid on EVERY page (excludeIds), so the
// featured post never appears twice across homepage pages.
//
// NO 'use cache' on this component — its queries carry the cache directives
// ('use cache' + cacheTag('posts-list')), so the page becomes part of the
// static shell automatically under cacheComponents:true.
//
// Server-only — NO "use client" directive.

import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import PostCard, { type PostCardProps } from "@/components/site/PostCard";
import Pagination from "@/components/site/Pagination";
import {
  listFeatured,
  listPublished,
  countPublished,
} from "@/lib/queries/posts";
import { toPostCardProps, type PostCardJoinedRow } from "@/lib/post-card";

/** Homepage grid page size (locked decision 1 — 12 PostCards per page). */
export const HOME_PAGE_SIZE = 12;

/** Compact date formatter (Intl.DateTimeFormat per CLAUDE.md L10n-safe formatting). */
const dateFormatter = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "short",
  day: "numeric",
});

interface HomeFeedProps {
  /** 1-based page number ("/" renders page 1; /page/N renders page N). */
  page: number;
}

/**
 * HomeFeed — the shared homepage content for page 1 ("/") and page N
 * ("/page/[pageNumber]"). Owns HOME_PAGE_SIZE, the hero-exclusion logic, the
 * beyond-last-page 404, and the D-16 empty state.
 */
export default async function HomeFeed({ page }: HomeFeedProps) {
  // 1. Hero — featured post (D-04), fallback to the most recent published post.
  const featured = await listFeatured(1);
  let heroRow: PostCardJoinedRow | null = null;

  if (featured.length > 0) {
    heroRow = featured[0] as PostCardJoinedRow;
  } else {
    // Fallback: most recent published post (so a fresh blog still has a hero).
    const latest = await listPublished({ page: 1, pageSize: 1 });
    if (latest.length > 0) {
      heroRow = latest[0] as PostCardJoinedRow;
    }
  }

  const heroId = heroRow?.posts.id ?? null;
  // Exclude the hero on EVERY page (not just page 1) so the featured post never
  // appears twice across homepage pages (locked decision 2).
  const excludeIds = heroId != null ? [heroId] : undefined;

  // 2. Latest grid + total count (hero-excluded so totalPages match the feed).
  const [gridRows, total] = await Promise.all([
    listPublished({ page, pageSize: HOME_PAGE_SIZE, excludeIds }),
    countPublished({ excludeIds }),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / HOME_PAGE_SIZE));

  // Beyond the last page → 404 (keep pagination bounded to real pages).
  if (page > 1 && page > totalPages && gridRows.length === 0) {
    notFound();
  }

  const heroProps = heroRow ? toPostCardProps(heroRow) : null;
  const cards = gridRows.map((r) => toPostCardProps(r as PostCardJoinedRow));

  // D-16 — friendly empty state when the blog has zero published posts.
  if (!heroProps && cards.length === 0) {
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

  const showFeatured = page === 1 && heroProps !== null;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      {/* ─── FEATURED (page 1 only — decision 1) ─── */}
      {showFeatured && heroProps ? (
        <section>
          <h2 className="mb-6 text-2xl font-bold text-gray-900 dark:text-white">
            Featured
          </h2>
          <FeaturedCard hero={heroProps} />
        </section>
      ) : null}

      {/* ─── LATEST POSTS (decision 1 — uniform 3-column grid) ─── */}
      {cards.length > 0 ? (
        <section className={showFeatured ? "mt-12" : undefined}>
          <h2 className="mb-6 text-2xl font-bold text-gray-900 dark:text-white">
            Latest Posts
          </h2>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {cards.map((card) => (
              <PostCard key={card.id} {...card} />
            ))}
          </div>

          <Pagination
            currentPage={page}
            totalPages={totalPages}
            basePath="/"
          />
        </section>
      ) : null}
    </div>
  );
}

/**
 * FeaturedCard — the horizontal hero card (decision 1). Image left ~45% from
 * lg up (stacked above on small screens), content right: category tag, large
 * linked title, avatar+name+date+read-time meta row, excerpt, Read More link.
 * Props come from the shared toPostCardProps mapper so category/avatar/readTime
 * derive identically to the grid cards. Server component — plain Links only.
 */
function FeaturedCard({ hero }: { hero: PostCardProps }) {
  const {
    title,
    slug,
    excerpt,
    featureImage,
    publishedAt,
    authorName,
    authorUsername,
    authorAvatar,
    categoryName,
    categorySlug,
    readTime,
  } = hero;

  const showAuthor = Boolean(authorName || authorAvatar);
  const showDate = Boolean(publishedAt);
  const showReadTime = readTime != null;

  return (
    <section className="flex flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900 lg:flex-row">
      {featureImage ? (
        <Link
          href={`/blog/${slug}`}
          className="relative block aspect-[16/10] w-full overflow-hidden bg-gray-100 dark:bg-gray-800 lg:aspect-auto lg:w-[45%] lg:shrink-0"
          tabIndex={-1}
          aria-hidden="true"
        >
          <Image
            src={featureImage}
            alt=""
            fill
            priority
            sizes="(min-width: 1024px) 45vw, 100vw"
            className="object-cover"
            // CI/CD loader (src/lib/image-loader.ts) handles CDN/local resolution.
          />
        </Link>
      ) : null}

      <div className="flex-1 p-6 sm:p-8">
        {/* Category tag — same markup as PostCard (decision 3). */}
        {categoryName && categorySlug ? (
          <Link
            href={`/category/${categorySlug}`}
            className="mb-2 inline-block text-xs font-semibold uppercase tracking-wider text-brand-600 hover:underline dark:text-brand-400"
          >
            {categoryName}
          </Link>
        ) : null}

        <h1 className="text-2xl font-bold leading-tight text-gray-900 dark:text-white sm:text-3xl lg:text-4xl">
          <Link href={`/blog/${slug}`} className="hover:underline">
            {title}
          </Link>
        </h1>

        {/* Meta row — 32px avatar (or initial-letter fallback), byline, date, read time. */}
        <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-gray-500 dark:text-gray-400">
          {showAuthor ? (
            <span className="flex min-w-0 items-center gap-2">
              {authorAvatar ? (
                <Image
                  src={authorAvatar}
                  alt={authorName ? `${authorName}'s avatar` : "Author avatar"}
                  width={32}
                  height={32}
                  className="h-8 w-8 shrink-0 rounded-full object-cover"
                  // CI/CD loader (src/lib/image-loader.ts) resolves CDN/local URLs.
                />
              ) : authorName ? (
                <span
                  aria-hidden="true"
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs font-semibold text-gray-500 dark:bg-gray-800 dark:text-gray-400"
                >
                  {authorName.charAt(0).toUpperCase()}
                </span>
              ) : null}

              {authorName ? (
                authorUsername ? (
                  <Link
                    href={`/author/${authorUsername}`}
                    className="font-medium text-gray-700 hover:underline dark:text-gray-300"
                  >
                    {authorName}
                  </Link>
                ) : (
                  <span className="font-medium text-gray-700 dark:text-gray-300">
                    {authorName}
                  </span>
                )
              ) : null}
            </span>
          ) : null}

          {showDate && showAuthor ? (
            <span aria-hidden="true">•</span>
          ) : null}
          {showDate ? (
            <time dateTime={publishedAt!.toISOString()}>
              {dateFormatter.format(publishedAt!)}
            </time>
          ) : null}

          {showReadTime && (showAuthor || showDate) ? (
            <span aria-hidden="true">•</span>
          ) : null}
          {showReadTime ? <span>{readTime} min read</span> : null}
        </div>

        {excerpt ? (
          <p className="mt-4 line-clamp-3 text-base text-gray-600 dark:text-gray-300">
            {excerpt}
          </p>
        ) : null}

        <Link
          href={`/blog/${slug}`}
          className="mt-6 inline-flex items-center gap-1 text-sm font-semibold text-brand-600 hover:underline dark:text-brand-400"
        >
          Read More
          <span aria-hidden="true">→</span>
        </Link>
      </div>
    </section>
  );
}
