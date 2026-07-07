// src/app/(site)/blog/page/[pageNumber]/page.tsx
// [CITED: 06-04-PLAN.md Task 1 — /blog paginated feed page N (SITE-02 / D-03)]
// [CITED: CLAUDE.md — Next 16 async params (await params.pageNumber)]
//
// /blog/page/N — the paginated feed for page N > 1 (page 1 lives at /blog). D-03
// classic URL-based numbered pagination (ISR/SEO-friendly, no client fetching).
// If N < 1 → redirect to /blog. If N is beyond the last page → notFound().
//
// Server-only — NO "use client" directive.

import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getSeoSettings } from "@/lib/seo/settings";
import { buildArchiveMetadata } from "@/lib/seo/metadata";
import { listPublished, countPublished } from "@/lib/queries/posts";
import PostCard from "@/components/site/PostCard";
import Pagination from "@/components/site/Pagination";
import { BLOG_PAGE_SIZE } from "@/app/(site)/blog/page";

interface PageProps {
  params: Promise<{ pageNumber: string }>;
}

/**
 * Parse the pageNumber segment → integer. Rejects non-numeric strings.
 * /blog/page/0 and negatives redirect to /blog; pages beyond the last → notFound().
 */
function parsePageNumber(raw: string): number {
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : NaN;
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  "use cache";
  const { pageNumber } = await params;
  const s = await getSeoSettings();
  return buildArchiveMetadata(
    {
      name: `Blog — Page ${pageNumber}`,
      kind: "category",
      path: `/blog/page/${pageNumber}`,
    },
    s,
  );
}

export default async function BlogPaginatedPage({ params }: PageProps) {
  const { pageNumber } = await params;
  const page = parsePageNumber(pageNumber);

  // Non-numeric or < 1 → redirect to /blog (canonical page 1).
  if (!Number.isFinite(page) || page < 1) {
    redirect("/blog");
  }

  const [rows, total] = await Promise.all([
    listPublished({ page, pageSize: BLOG_PAGE_SIZE }),
    countPublished(),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / BLOG_PAGE_SIZE));

  // Beyond the last page → 404 (D-03 — keep pagination bounded to real pages).
  if (page > totalPages && rows.length === 0) {
    notFound();
  }

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
          All posts, newest first — page {page} of {totalPages}.
        </p>
      </header>

      {cards.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 p-12 text-center dark:border-gray-700">
          <p className="text-base text-gray-600 dark:text-gray-400">
            No posts on this page.
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
            currentPage={page}
            totalPages={totalPages}
            basePath="/blog"
          />
        </>
      )}
    </div>
  );
}
