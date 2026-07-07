// src/app/(site)/blog/page.tsx
// [CITED: 06-04-PLAN.md Task 1 — /blog full reverse-chronological paginated feed (SITE-02)]
// [CITED: 06-CONTEXT.md D-03 — three distinct routes; pagination = classic URL-based]
// [CITED: 06-CONTEXT.md D-16 — friendly empty states]
//
// /blog — the full reverse-chronological feed (page 1). SITE-02. Coexists with
// /blog/[slug] (single post, Plan 06-03) — different route segments, no conflict.
// Page N lives at /blog/page/[pageNumber] (D-03 URL-based numbered pagination).
//
// Server-only — NO "use client" directive.

import type { Metadata } from "next";
import { getSeoSettings } from "@/lib/seo/settings";
import { buildArchiveMetadata } from "@/lib/seo/metadata";
import { listPublished, countPublished } from "@/lib/queries/posts";
import PostCard from "@/components/site/PostCard";
import Pagination from "@/components/site/Pagination";

/** Page size for the /blog feed. Exported for the [pageNumber] route. */
export const BLOG_PAGE_SIZE = 9;

export async function generateMetadata(): Promise<Metadata> {
  "use cache";
  const s = await getSeoSettings();
  return buildArchiveMetadata(
    { name: "Blog", kind: "category", path: "/blog" },
    s,
  );
}

export default async function BlogIndexPage() {
  const [rows, total] = await Promise.all([
    listPublished({ page: 1, pageSize: BLOG_PAGE_SIZE }),
    countPublished(),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / BLOG_PAGE_SIZE));
  const cards = rows.map((r) => {
    const row = r as {
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
  });

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white sm:text-4xl">
          Blog
        </h1>
        <p className="mt-2 text-base text-gray-600 dark:text-gray-400">
          All posts, newest first.
        </p>
      </header>

      {cards.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 p-12 text-center dark:border-gray-700">
          <p className="text-base text-gray-600 dark:text-gray-400">
            No posts have been published yet. Check back soon.
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {cards.map((card) => (
              <PostCard key={card.id} {...card} />
            ))}
          </div>

          <Pagination
            currentPage={1}
            totalPages={totalPages}
            basePath="/blog"
          />
        </>
      )}
    </div>
  );
}
