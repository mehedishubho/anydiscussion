// src/app/(site)/author/[username]/page.tsx
// [CITED: 06-07-PLAN.md Task 2 — author bio page + Person JSON-LD (SITE-06 / D-11)]
// [CITED: 06-CONTEXT.md D-11 — full bio page + username slug + Person JSON-LD]
// [CITED: src/app/(site)/preview/[token]/page.tsx — the single-record generateMetadata analog]
// [CITED: src/lib/queries/users.ts — getUserByUsername + listAuthorPosts (Plan 06-01)]
// [CITED: src/lib/seo/jsonld.ts personJsonLd — closes Phase 5 D-03 deferral]
// [CITED: CLAUDE.md — next/image only (NEVER raw <img> for content images)]
//
// The public author profile page (SITE-06). Renders:
//   1. A bio header (name + avatar via next/image + bio from AUTH-08).
//   2. The author's published posts (PostCard grid, paginated Prev/Next).
//   3. A Person JSON-LD <script> (closes the Phase 5 D-03 deferral per D-11).
//
// The author is identified by the `username` column (D-11 — user.id is a UUID,
// bad for public URLs). notFound() fires when the username doesn't exist (no
// existence leak — T-06-18 mitigation: the 404 is the same response for any
// missing username).
//
// Server-only — NO "use client" directive.

import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getSeoSettings } from "@/lib/seo/settings";
import { buildArchiveMetadata } from "@/lib/seo/metadata";
import { personJsonLd } from "@/lib/seo/jsonld";
import { getUserByUsername, listAuthorPosts } from "@/lib/queries/users";
import PostCard from "@/components/site/PostCard";

/** AUTHOR_PAGE_SIZE mirrors listAuthorPosts (src/lib/queries/users.ts). */
const AUTHOR_PAGE_SIZE = 10;

interface AuthorPageProps {
  params: Promise<{ username: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/** Read the first value of a URL searchParam (string | string[] | undefined). */
function firstValue(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) return v[0];
  return v;
}

/** Parse the page number from searchParams (≥1, bounded to prevent offset abuse). */
function parsePage(raw: Record<string, string | string[] | undefined>): number {
  const v = firstValue(raw.page);
  const n = Number.parseInt((v ?? "1").trim(), 10);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(n, 1000);
}

/**
 * generateMetadata — settings-driven (D-02 / Pitfall 1). Looks up the author by
 * username; returns "Not Found" metadata (no existence leak) when missing. When
 * found, buildArchiveMetadata produces the title/description/canonical.
 *
 * The username makes this route dynamic-by-params; getSeoSettings carries the
 * 'use cache' + cacheTag('seo-settings') directive (D-02).
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ username: string }>;
}): Promise<Metadata> {
  "use cache";
  const { username } = await params;
  const user = await getUserByUsername(username);
  if (!user) {
    return { title: "Not Found" };
  }
  const s = await getSeoSettings();
  return buildArchiveMetadata(
    {
      name: user.name,
      kind: "author",
      path: `/author/${username}`,
      description: user.bio ?? undefined,
    },
    s,
  );
}

/**
 * AuthorPage — the /author/[username] route.
 *
 * 1. Await params.username (Next 16 async params) + searchParams for pagination.
 * 2. getUserByUsername — notFound() if missing (T-06-18: no existence leak).
 * 3. Render bio header + Person JSON-LD + the author's published posts.
 * 4. Prev/Next pagination preserving the /author/${username} base path.
 */
export default async function AuthorPage({ params, searchParams }: AuthorPageProps) {
  const { username } = await params;
  const user = await getUserByUsername(username);

  // T-06-18: notFound() returns 404 — the same response for any missing username,
  // so a reader cannot probe which usernames exist vs. which are unset.
  if (!user) {
    notFound();
  }

  // listAuthorPosts is 'use cache'd internally; the pagination page is part of the
  // cache key via the username + page args. searchParams.page drives the offset.
  const sp = await searchParams;
  const page = parsePage(sp);
  const posts = await listAuthorPosts(username, page);

  // Person JSON-LD (closes Phase 5 D-03). The URL is relative; metadataBase
  // (from buildSiteMetadata on the layout) resolves it to absolute in <head>.
  const authorJsonLd = personJsonLd({
    name: user.name,
    url: `/author/${username}`,
    ...(user.bio ? { description: user.bio } : {}),
  });

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      {/* Person JSON-LD — Pitfall 2: real <script type="application/ld+json">. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(authorJsonLd) }}
      />

      {/* BIO HEADER (SITE-06 / D-11) — name, avatar, bio from AUTH-08. */}
      <header className="flex flex-col items-start gap-6 sm:flex-row sm:items-center">
        {user.avatar ? (
          <Image
            src={user.avatar}
            alt={`${user.name}'s avatar`}
            width={96}
            height={96}
            className="h-24 w-24 shrink-0 rounded-full border border-gray-200 object-cover dark:border-gray-800"
            // CI/CD loader (src/lib/image-loader.ts) resolves CDN/local URLs.
          />
        ) : (
          <div
            className="flex h-24 w-24 shrink-0 items-center justify-center rounded-full border border-gray-200 bg-gray-100 text-2xl font-semibold text-gray-500 dark:border-gray-800 dark:bg-gray-800 dark:text-gray-400"
            aria-hidden="true"
          >
            {user.name.charAt(0).toUpperCase()}
          </div>
        )}

        <div className="min-w-0">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            {user.name}
          </h1>
          {user.bio ? (
            <p className="mt-3 max-w-2xl text-base leading-relaxed text-gray-600 dark:text-gray-400">
              {user.bio}
            </p>
          ) : null}
        </div>
      </header>

      {/* POSTS (SITE-06) — PostCard grid + Prev/Next pagination. */}
      <section aria-labelledby="author-posts-heading" className="mt-12">
        <h2
          id="author-posts-heading"
          className="mb-6 text-xl font-semibold text-gray-900 dark:text-white"
        >
          Posts by {user.name}
        </h2>

        {posts.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 px-6 py-12 text-center dark:border-gray-700 dark:bg-gray-900/50">
            <p className="text-base font-medium text-gray-700 dark:text-gray-300">
              {user.name} hasn&rsquo;t published any posts yet
            </p>
          </div>
        ) : (
          <>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {posts.map((row) => (
                <PostCard
                  key={row.posts.id}
                  id={row.posts.id}
                  title={row.posts.title}
                  slug={row.posts.slug}
                  excerpt={row.posts.excerpt}
                  featureImage={row.posts.featureImage}
                  publishedAt={row.posts.publishedAt}
                  // listAuthorPosts joins user — the byline links to this same page.
                  authorName={row.user.name}
                  authorUsername={row.user.username ?? null}
                />
              ))}
            </div>

            <AuthorPagination
              username={username}
              page={page}
              hasNext={posts.length >= AUTHOR_PAGE_SIZE}
            />
          </>
        )}
      </section>
    </div>
  );
}

/**
 * AuthorPagination — Prev/Next links preserving the /author/${username} base path.
 *
 * v1 uses Prev/Next (not numbered) to avoid a separate count query —
 * listAuthorPosts returns at most AUTHOR_PAGE_SIZE rows, so "hasNext" is inferred
 * from a full page. Numbered pagination (D-03) is the canonical pattern; the
 * Prev/Next shape is a deliberate v1 scope-lean choice consistent with ISR.
 */
function AuthorPagination({
  username,
  page,
  hasNext,
}: {
  username: string;
  page: number;
  hasNext: boolean;
}) {
  const hasPrev = page > 1;
  if (!hasPrev && !hasNext) return null;

  return (
    <nav
      className="mt-10 flex items-center justify-between border-t border-gray-200 pt-6 dark:border-gray-800"
      aria-label="Pagination"
    >
      {hasPrev ? (
        <Link
          href={`/author/${username}?page=${page - 1}`}
          className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
        >
          ← Previous
        </Link>
      ) : (
        <span aria-hidden="true" />
      )}

      <span className="text-sm text-gray-500 dark:text-gray-400">Page {page}</span>

      {hasNext ? (
        <Link
          href={`/author/${username}?page=${page + 1}`}
          className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
        >
          Next →
        </Link>
      ) : (
        <span aria-hidden="true" />
      )}
    </nav>
  );
}
