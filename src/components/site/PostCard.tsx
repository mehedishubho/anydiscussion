// src/components/site/PostCard.tsx
// [CITED: 06-03-PLAN.md Task 1 — reusable card for home/blog/archive/category/tag/author/related]
// [CITED: CLAUDE.md — next/image only (NEVER raw <img> for content images)]
// [CITED: 06-PATTERNS.md — pure server component (no "use client"); presentational]
//
// The shared post card. Pure server component — no state, no interactivity beyond
// plain anchor links (next/link). Consumed by:
//   - Home (src/app/(site)/page.tsx — Wave 3 plan 06-04)
//   - /blog feed + /archive (plan 06-04/06-07)
//   - /category/[slug] + /tag/[slug] (plan 06-04 — ArchiveList)
//   - /author/[username] (plan 06-04)
//   - <RelatedPosts /> (this plan, Task 2)
//
// Renders: optional feature image (next/image — CLAUDE.md mandate), title linking
// to /blog/${slug}, excerpt (line-clamped), published date (Intl.DateTimeFormat),
// and author byline linking to /author/${authorUsername} when a username exists
// (D-11 — user.username is the public slug; user.id is a UUID, never linked).
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
}

/** Compact date formatter (Intl.DateTimeFormat per CLAUDE.md L10n-safe formatting). */
const dateFormatter = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "short",
  day: "numeric",
});

/**
 * PostCard — renders a single post summary. All props required except excerpt,
 * featureImage, publishedAt, authorName, authorUsername (nullable). The card is
 * an anchor-wrapped article for SEO crawlability (header is a Link).
 */
export default function PostCard({
  title,
  slug,
  excerpt,
  featureImage,
  publishedAt,
  authorName,
  authorUsername,
}: PostCardProps) {
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
        <h3 className="text-lg font-semibold leading-snug text-gray-900 dark:text-white">
          <Link href={`/blog/${slug}`} className="hover:underline">
            {title}
          </Link>
        </h3>

        {excerpt ? (
          <p className="mt-2 line-clamp-3 text-sm text-gray-600 dark:text-gray-400">
            {excerpt}
          </p>
        ) : null}

        <div className="mt-4 flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
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

          {publishedAt ? (
            <>
              <span aria-hidden="true">•</span>
              <time dateTime={publishedAt.toISOString()}>
                {dateFormatter.format(publishedAt)}
              </time>
            </>
          ) : null}
        </div>
      </div>
    </article>
  );
}
