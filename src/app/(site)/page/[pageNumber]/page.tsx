// src/app/(site)/page/[pageNumber]/page.tsx
// [CITED: 260823-4yc-PLAN.md Task 2 — homepage pagination route (locked decision 2)]
// [CITED: src/app/(site)/blog/page/[pageNumber]/page.tsx — the mirrored route pattern]
// [CITED: CLAUDE.md — Next 16 async params (await params.pageNumber)]
//
// /page/N — homepage page N > 1 (page 1 lives at "/"). Mirrors the /blog/page/N
// route pattern: non-numeric, < 1, or exactly 1 → redirect("/") (canonical page
// 1); a page beyond the last 404s (the guard lives inside <HomeFeed />, which
// owns HOME_PAGE_SIZE and the hero-excluded total). The Featured hero renders
// on page 1 only — /page/N shows the Latest grid alone, without duplicating
// the hero post.
//
// Server-only — NO "use client" directive.

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { getSeoSettings } from "@/lib/seo/settings";
import { buildArchiveMetadata } from "@/lib/seo/metadata";
import HomeFeed from "@/components/site/HomeFeed";
import { PostCardGridSkeleton } from "@/components/site/skeletons";

interface PageProps {
  params: Promise<{ pageNumber: string }>;
}

/**
 * Parse the pageNumber segment → integer. Rejects non-numeric strings.
 * /page/0 and negatives redirect to "/"; pages beyond the last → notFound().
 */
function parsePageNumber(raw: string): number {
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : NaN;
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { pageNumber } = await params;
  const s = await getSeoSettings();
  return buildArchiveMetadata(
    {
      name: `Home — Page ${pageNumber}`,
      kind: "category",
      path: `/page/${pageNumber}`,
    },
    s,
  );
}

export default function HomePaginatedPage(props: PageProps) {
  // PPR (cacheComponents): wrap the async, params-reading content in <Suspense>.
  return (
    <Suspense fallback={<PostCardGridSkeleton />}>
      <HomePaginatedPageContent {...props} />
    </Suspense>
  );
}

async function HomePaginatedPageContent({ params }: PageProps) {
  const { pageNumber } = await params;
  const page = parsePageNumber(pageNumber);

  // Non-numeric, < 1, or exactly 1 → redirect to "/" (canonical page 1).
  if (!Number.isFinite(page) || page < 1 || page === 1) {
    redirect("/");
  }

  // HomeFeed owns HOME_PAGE_SIZE + the beyond-last-page notFound() guard.
  return <HomeFeed page={page} />;
}
