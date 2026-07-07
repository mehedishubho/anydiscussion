// src/app/(site)/contact/page.tsx
// [CITED: 06-05-PLAN.md Task 2 — Contact page (dashboard-managed content + ContactForm)]
// [CITED: src/lib/queries/pages.ts — getPublishedPage("contact") from Plan 06-01]
// [CITED: src/lib/post-render.ts — renderPostBody (Pitfall #2 site #2 security gate)]
// [CITED: src/lib/seo/metadata.ts — buildPageMetadata for pages (Phase 5 D-06)]
// [CITED: src/lib/seo/settings.ts — getSeoSettings (cached snapshot)]
// [CITED: 04-CONTEXT.md D-17 — the "contact" pages row was seeded in Phase 4]
// [CITED: 06-CONTEXT.md D-08 — Contact = content + form; RHF + Zod + useTransition]
//
// The public Contact page (SITE-10). Server component. Renders the dashboard-
// managed "contact" pages row (seeded in Phase 4 D-17) — if it exists and has a
// body — followed by the ContactForm client component. The form works regardless
// of whether the content row exists: a missing row falls back to a static
// "Contact Us" heading + the form (D-08 — the form is the load-bearing piece).
//
// generateMetadata uses buildPageMetadata with the pages row's own SEO columns
// (D-06 — pages carry their OWN metaTitle/metaDescription/canonical), falling
// back to a static title/description when the row is missing or has no SEO.
//
// Server-only — NO "use client" directive. The ContactForm handles its own
// client state; this page is a thin server shell that fetches content + renders.

import type { Metadata } from "next";
import { cacheTag } from "next/cache";
import { getPublishedPage } from "@/lib/queries/pages";
import { renderPostBody } from "@/lib/post-render";
import { buildPageMetadata, type PageLike } from "@/lib/seo/metadata";
import { getSeoSettings } from "@/lib/seo/settings";
import ContactForm from "@/components/site/ContactForm";

// Static fallback metadata when the "contact" pages row is missing or has no
// metaTitle. Keeps the page SEO'd even before the admin publishes content.
const STATIC_TITLE = "Contact Us";
const STATIC_DESCRIPTION =
  "Get in touch with the Any Discussion team — we'd love to hear from you.";

/**
 * generateMetadata — uses the dashboard-managed pages row's SEO columns when
 * available (D-06), falling back to a static title + the site-wide description.
 *
 * `'use cache'` is required under `cacheComponents:true` for a generateMetadata
 * that reads external data on an otherwise-prerenderable route. The cacheTag
 * mirrors getPublishedPage's (`posts-list`) so the publish/republish flow
 * (revalidateTag('posts-list', 'max')) refreshes the metadata too.
 */
export async function generateMetadata(): Promise<Metadata> {
  "use cache";
  cacheTag("posts-list");

  const [page, s] = await Promise.all([getPublishedPage("contact"), getSeoSettings()]);

  if (!page) {
    return {
      title: STATIC_TITLE,
      description: STATIC_DESCRIPTION,
      alternates: { canonical: "/contact" },
      openGraph: {
        type: "website",
        title: STATIC_TITLE,
        description: STATIC_DESCRIPTION,
        url: "/contact",
      },
    };
  }

  // buildPageMetadata resolves: page.metaTitle || page.title, page.metaDescription
  // || site description, page.canonical || "/{slug}".
  return buildPageMetadata(
    {
      slug: page.slug,
      title: page.title,
      metaTitle: page.metaTitle,
      metaDescription: page.metaDescription,
      canonical: page.canonical,
      updatedAt: page.updatedAt,
    } satisfies PageLike,
    s,
  );
}

export default async function ContactPage() {
  // Fetch the dashboard-managed content. Cached read (Plan 06-01).
  // Missing rows / drafts fall through to the static heading + the form.
  const page = await getPublishedPage("contact");

  // Render the body ONLY when present. renderPostBody is the Pitfall #2
  // security gate (generateHTML → sanitizeBeforeRender) — the output is safe
  // for dangerouslySetInnerHTML. NEVER raw HTML here (even admin-trusted
  // content gets sanitized at render per CLAUDE.md defense-in-depth).
  const bodyHtml = page?.body ? renderPostBody(page.body) : null;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="mb-6 text-3xl font-bold text-gray-900 dark:text-white">
        {page?.title ?? STATIC_TITLE}
      </h1>

      {/* Dashboard-managed content (optional). Rendered via renderPostBody —
          the security boundary before dangerouslySetInnerHTML. Falls through
          to the form when the row is missing or has no body. */}
      {bodyHtml && (
        <div
          className="prose prose-lg mb-10 max-w-none dark:prose-invert"
          dangerouslySetInnerHTML={{ __html: bodyHtml }}
        />
      )}

      {/* The load-bearing piece (D-08 — the form is the whole point of SITE-10).
          Always rendered, even when the pages row is missing. */}
      <ContactForm />
    </div>
  );
}
