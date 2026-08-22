// src/components/site/PostCard.tsx
// [CITED: 06-03-PLAN.md Task 1 — reusable card for home/blog/archive/category/tag/author/related]
// [CITED: CLAUDE.md — next/image only (NEVER raw <img> for content images)]
// [CITED: 06-PATTERNS.md — pure server component (no "use client"); presentational]
// [CITED: 260823-4yc-PLAN.md locked decision 3 — optional category tag / avatar / read time]
//
// The shared post card. Pure server component — no state, no interactivity beyond
// plain anchor links (next/link). Consumed by:
//   - Home (src/components/site/HomeFeed.tsx — 260823-4yc)
//   - /blog feed + /archive (plan 06-04/06-07)
//   - /category/[slug] + /tag/[slug] (plan 06-04 — ArchiveList)
//   - /author/[username] (plan 06-04)
//   - <RelatedPosts /> (plan 06-03, fully wired in 260823-4yc Task 3)
//
// Renders: optional feature image (next/image — CLAUDE.md mandate), category tag
// (small uppercase brand label → /category/[slug]), title linking to
// /blog/${slug}, meta row (author avatar with initial-letter fallback, byline
// linking to /author/${authorUsername} when set — D-11, published date, "N min
// read"), then the excerpt (line-clamped) BELOW the meta row per the frontpage
// design (260823-4yc decision 1/3).
//
// The decision-3 props (categoryName, categorySlug, authorAvatar, readTime) are
// OPTIONAL so consumers that cannot supply them (notably /search, whose rows
// have no user/category/body join) compile and render exactly as before.
//
// Server-only — NO "use client" directive.

import Image from "next/image";
import Link from "next/link";

/** Props for PostCard — the minimal shape every list/related query returns. */
export interface PostCardProps {
  id: number;
  title: string;
  slug: string;
  excerpt: string | null;
  featureImage: string | null;
  publishedAt: Date | null;
  authorName: string | null;
  /** Author's public username (D-11). Null when unset — byline renders plain text. */
  authorUsername: string | null;
  /** Author avatar URL (user.avatar). Null when unset — initial-letter circle renders. */
  authorAvatar?: string | null;
  /** Category display name. Renders the category tag only when BOTH name + slug are set. */
  categoryName?: string | null;
  /** Category slug — the tag links to /category/${categorySlug}. */
  categorySlug?: string | null;
  /** Reading time in minutes (deriveReadingTime, min 1). Renders "N min read". */
  readTime?: number | null;
}

/** Compact date formatter (Intl.DateTimeFormat per CLAUDE.md L10n-safe formatting). */
const dateFormatter = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "short",
  day: "numeric",
});

/**
 * PostCard — renders a single post summary. Base props required; the decision-3
 * props (authorAvatar, categoryName/categorySlug, readTime) are optional and
 * nullable. The card is an anchor-wrapped article for SEO crawlability (header
 * is a Link).
 */
export default function PostCard({
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
}: PostCardProps) {
  // Meta-row piece visibility — each piece renders nothing when its value is
  // absent; bullet separators render only between two rendered pieces.
  const showAuthor = Boolean(authorName || authorAvatar);
  const showDate = Boolean(publishedAt);
  const showReadTime = readTime != null;

  return (
    <article className="group flex flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm transition hover:shadow-md dark:border-gray-800 dark:bg-gray-900">
      {featureImage ? (
        <Link
          href={`/blog/${slug}`}
          className="relative block aspect-[16/9] overflow-hidden bg-gray-100 dark:bg-gray-800"
          tabIndex={-1}
          aria-hidden="true"
        >
          <Image
            src={featureImage}
            alt=""
            fill
            sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
            className="object-cover transition duration-300 group-hover:scale-[1.02]"
            // CI/CD loader (src/lib/image-loader.ts) handles CDN/local resolution.
          />
        </Link>
      ) : null}

      <div className="flex flex-1 flex-col p-5">
        {/* Category tag (decision 3) — small uppercase brand label above the title. */}
        {categoryName && categorySlug ? (
          <Link
            href={`/category/${categorySlug}`}
            className="mb-2 inline-block text-xs font-semibold uppercase tracking-wider text-brand-600 hover:underline dark:text-brand-400"
          >
            {categoryName}
          </Link>
        ) : null}

        <h3 className="text-lg font-semibold leading-snug text-gray-900 dark:text-white">
          <Link href={`/blog/${slug}`} className="hover:underline">
            {title}
          </Link>
        </h3>

        {/* Meta row (decision 3) — avatar first, then byline, date, read time. */}
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-gray-500 dark:text-gray-400">
          {showAuthor ? (
            <span className="flex min-w-0 items-center gap-2">
              {authorAvatar ? (
                <Image
                  src={authorAvatar}
                  alt={authorName ? `${authorName}'s avatar` : "Author avatar"}
                  width={24}
                  height={24}
                  className="h-6 w-6 shrink-0 rounded-full object-cover"
                  // CI/CD loader (src/lib/image-loader.ts) resolves CDN/local URLs.
                />
              ) : authorName ? (
                // Initial-letter fallback — mirrors the author page avatar fallback
                // (src/app/(site)/author/[username]/page.tsx) at card scale.
                <span
                  aria-hidden="true"
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gray-100 text-[10px] font-semibold text-gray-500 dark:bg-gray-800 dark:text-gray-400"
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
          {showReadTime ? (
            <span>{readTime} min read</span>
          ) : null}
        </div>

        {excerpt ? (
          <p className="mt-2 line-clamp-3 text-sm text-gray-600 dark:text-gray-400">
            {excerpt}
          </p>
        ) : null}
      </div>
    </article>
  );
}
