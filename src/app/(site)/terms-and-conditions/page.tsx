// src/app/(site)/terms-and-conditions/page.tsx
// [CITED: 06-06-PLAN.md Task 2 — T&C renders the dashboard-managed "terms-and-conditions" pages row (SITE-11)]
// [CITED: 06-CONTEXT.md — Phase 4 D-17 seeded this pages row; legal content is CMS-managed]
// [CITED: 06-RESEARCH.md Pitfall 8 (L709-712) — renderPostBody is the XSS gate before dangerouslySetInnerHTML]
// [CITED: src/app/(site)/preview/[token]/page.tsx L96-134 — the renderPostBody + prose + dangerouslySetInnerHTML analog]
// [CITED: src/lib/queries/pages.ts — getPublishedPage(slug) returns published-only row or null]
//
// Terms and Conditions. Renders the "terms-and-conditions" pages row that dashboard
// editors manage (seeded in Phase 4 D-17). The body content is stored ProseMirror JSON,
// so it MUST flow through renderPostBody (generateHTML → sanitizeBeforeRender) before
// any dangerouslySetInnerHTML — Pitfall 8 / T-06-15, the same security gate as post
// bodies. NEVER raw dangerouslySetInnerHTML.
//
// If the page row is missing or still a draft, notFound() renders the styled 404
// (defense-in-depth — do NOT render an unpublished legal page, and do NOT leak its
// existence with a 403).
//
// Server Component (NO "use client"). generateMetadata uses 'use cache' (fixed route →
// otherwise-prerenderable → Pitfall 1 requires explicit caching under cacheComponents).

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPublishedPage } from "@/lib/queries/pages";
import { getSeoSettings } from "@/lib/seo/settings";
import { buildPageMetadata } from "@/lib/seo/metadata";
import { renderPostBody } from "@/lib/post-render";

const PAGE_SLUG = "terms-and-conditions";

/**
 * generateMetadata — 'use cache' + the published page row + SEO settings.
 * Falls back to a static title/description if the page is missing/unpublished
 * (so the route still has metadata even when notFound() will render the 404).
 */
export async function generateMetadata(): Promise<Metadata> {
  "use cache";
  const [page, s] = await Promise.all([
    getPublishedPage(PAGE_SLUG),
    getSeoSettings(),
  ]);

  if (!page) {
    return {
      title: "Terms and Conditions",
      description: s.siteDescription,
      alternates: { canonical: `/${PAGE_SLUG}` },
    };
  }

  return buildPageMetadata(page, s);
}

export default async function TermsAndConditionsPage() {
  const page = await getPublishedPage(PAGE_SLUG);

  // Defense-in-depth: a missing or unpublished legal page renders 404, never a draft.
  if (!page) {
    notFound();
  }

  // Pitfall 8 gate — renderPostBody runs generateHTML THEN sanitizeBeforeRender.
  // The output is safe for dangerouslySetInnerHTML (DOMPurify defense-in-depth).
  const renderedHtml = renderPostBody(page.body);

  const lastUpdated = new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date(page.updatedAt));

  return (
    <article className="mx-auto max-w-3xl px-4 py-12 sm:py-16">
      <header className="mb-10">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white sm:text-4xl">
          {page.title}
        </h1>
        <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">
          Last updated: {lastUpdated}
        </p>
      </header>

      {/* Pitfall 8 — renderPostBody gate before dangerouslySetInnerHTML.
          NEVER raw dangerouslySetInnerHTML on a stored pages-row body. */}
      <div
        className="prose prose-lg max-w-none dark:prose-invert"
        dangerouslySetInnerHTML={{ __html: renderedHtml }}
      />
    </article>
  );
}
