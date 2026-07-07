// src/components/site/Pagination.tsx
// [CITED: 06-04-PLAN.md Task 1 — "Pagination component: a simple numbered nav"]
// [CITED: 06-CONTEXT.md D-03 — classic URL-based page numbers, server-rendered]
//
// Shared numbered pagination for list routes (/blog, /blog/page/N, and the
// ArchiveList component for /archive, /category/[slug], /tag/[slug]). Classic
// URL-based page numbers (D-03) — ISR/SEO-friendly, no client fetching. All
// links are plain <Link> anchors so search engines can crawl every page.
//
// `basePath` examples:
//   - "/blog"                → page N link = /blog/page/${n} (N > 1), /blog (N = 1)
//   - "/archive"             → page N link = /archive?page=${n} (searchParams-based)
//   - "/category/tech"       → page N link = /category/tech?page=${n}
//
// When `searchParams` is provided, the page number is appended as `?page=${n}`
// (preserving the other filter params). When omitted, the /page/${n} URL form
// is used (the /blog convention).
//
// Server-only — NO "use client" directive.

import Link from "next/link";

/** Build the href for a page number under the given base path. */
function buildPageHref(
  n: number,
  basePath: string,
  searchParams?: Record<string, string | string[] | undefined>,
): string {
  if (searchParams) {
    // searchParams-driven routes (archive/category/tag): page is a query param.
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(searchParams)) {
      if (key === "page") continue; // replaced by n
      if (Array.isArray(value)) {
        for (const v of value) if (v) params.append(key, v);
      } else if (value) {
        params.append(key, value);
      }
    }
    params.set("page", String(n));
    const qs = params.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  }
  // URL-segment routes (/blog): /blog/page/${n} for N > 1, basePath for N = 1.
  return n <= 1 ? basePath : `${basePath}/page/${n}`;
}

export interface PaginationProps {
  currentPage: number;
  totalPages: number;
  basePath: string;
  /** When provided, page numbers are encoded as ?page=N (preserving other filters). */
  searchParams?: Record<string, string | string[] | undefined>;
}

/**
 * Pagination — classic numbered nav with prev/next + compact page window.
 * Renders nothing when totalPages <= 1 (single-page lists don't need pagination).
 */
export default function Pagination({
  currentPage,
  totalPages,
  basePath,
  searchParams,
}: PaginationProps) {
  if (totalPages <= 1) return null;

  const pageUrl = (n: number) => buildPageHref(n, basePath, searchParams);

  // Compact page window: show up to 5 pages around the current, with first/last.
  const windowSize = 5;
  const half = Math.floor(windowSize / 2);
  const start = Math.max(1, currentPage - half);
  const end = Math.min(totalPages, start + windowSize - 1);
  const adjustedStart = Math.max(1, end - windowSize + 1);
  const pages: number[] = [];
  for (let i = adjustedStart; i <= end; i++) pages.push(i);
  const showFirst = adjustedStart > 1;
  const showLast = end < totalPages;

  return (
    <nav
      className="mt-10 flex flex-wrap items-center justify-center gap-1 text-sm"
      aria-label="Pagination"
    >
      {/* Prev */}
      {currentPage > 1 ? (
        <Link
          href={pageUrl(currentPage - 1)}
          className="rounded-md border border-gray-300 px-3 py-2 text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
          rel="prev"
        >
          ← Previous
        </Link>
      ) : null}

      {/* First + ellipsis */}
      {showFirst ? (
        <>
          <Link
            href={pageUrl(1)}
            className="rounded-md border border-gray-300 px-3 py-2 text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            1
          </Link>
          {adjustedStart > 2 ? (
            <span className="px-2 text-gray-400" aria-hidden="true">
              …
            </span>
          ) : null}
        </>
      ) : null}

      {/* Page numbers */}
      {pages.map((n) => (
        <Link
          key={n}
          href={pageUrl(n)}
          aria-current={n === currentPage ? "page" : undefined}
          className={
            n === currentPage
              ? "rounded-md border border-brand-500 bg-brand-500 px-3 py-2 font-medium text-white"
              : "rounded-md border border-gray-300 px-3 py-2 text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
          }
        >
          {n}
        </Link>
      ))}

      {/* Last + ellipsis */}
      {showLast ? (
        <>
          {end < totalPages - 1 ? (
            <span className="px-2 text-gray-400" aria-hidden="true">
              …
            </span>
          ) : null}
          <Link
            href={pageUrl(totalPages)}
            className="rounded-md border border-gray-300 px-3 py-2 text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
          >
            {totalPages}
          </Link>
        </>
      ) : null}

      {/* Next */}
      {currentPage < totalPages ? (
        <Link
          href={pageUrl(currentPage + 1)}
          className="rounded-md border border-gray-300 px-3 py-2 text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
          rel="next"
        >
          Next →
        </Link>
      ) : null}
    </nav>
  );
}
