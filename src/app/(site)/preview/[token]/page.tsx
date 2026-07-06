// src/app/(site)/preview/[token]/page.tsx
// [CITED: 03-CONTEXT.md D-19 (token-gated, no auth required — token IS the authorization)]
// [CITED: PATTERNS.md row — gate-then-render analog: (admin)/layout.tsx AuthGate]
// [CITED: 03-RESEARCH.md L302 — /preview/[token] architecture diagram node]
// [CITED: CLAUDE.md — next/image only; dangerouslySetInnerHTML AFTER sanitize (Pitfall #2 site #2)]
// [CITED: 05-CONTEXT.md D-01 — wire generateMetadata into this EXISTING (site) route]
// [CITED: 05-RESEARCH.md Pitfall 1 alt path — params make this dynamic; NO 'use cache' needed]
//
// Public draft preview route. No auth required — the high-entropy previewToken
// (crypto.randomUUID, 122 bits) IS the authorization (D-19). If the token is not
// found or has been revoked/rotated, notFound() returns 404 (NOT 403 — no existence
// leak, T-03-19 mitigation).
//
// The post body is rendered via renderPostBody (Slice B's SSR pipeline:
// generateHTML → sanitizeBeforeRender). NEVER raw dangerouslySetInnerHTML without
// sanitize (Pitfall #2 site #2 — the renderPostBody gate is the security boundary).
//
// Server Components (NO "use client"). Next.js 16 cacheComponents: the token-gated DB
// lookup is uncached dynamic data, so it runs inside a <Suspense> boundary (the PPR
// pattern) rather than via the legacy `export const dynamic` segment config, which
// cacheComponents disallows. The static shell serves immediately while the dynamic
// post content streams — also correct semantically, since a draft preview is
// per-request and revocable (publishPost rotates the token).
import { Suspense } from "react";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { renderPostBody } from "@/lib/post-render";
import type { Metadata } from "next";
import { getSeoSettings } from "@/lib/seo/settings";
import { buildPostMetadata } from "@/lib/seo/metadata";

interface PreviewPageProps {
  params: Promise<{ token: string }>;
}

/**
 * Preview metadata — looks up the post by token and builds metadata with a hard
 * noindex (draft previews must NEVER be indexed — defense-in-depth per T-03-21).
 * Returns a minimal "Not Found" metadata when the token is invalid so no existence
 * leaks. NO 'use cache' here — params make this route dynamic by default (Pitfall 1
 * alternative path); the DB lookup is per-request, which is correct for a revocable
 * preview token.
 */
export async function generateMetadata({
  params,
}: PreviewPageProps): Promise<Metadata> {
  const { token } = await params;
  const [post] = await db
    .select()
    .from(schema.posts)
    .where(eq(schema.posts.previewToken, token))
    .limit(1);

  if (!post) {
    return { title: "Not Found", robots: { index: false, follow: false } };
  }

  const s = await getSeoSettings();
  return {
    ...buildPostMetadata(
      {
        id: post.id,
        title: post.title,
        slug: post.slug,
        excerpt: post.excerpt,
        featureImage: post.featureImage,
        publishedAt: post.publishedAt,
        updatedAt: post.updatedAt,
        authorName: null,
      },
      null, // preview — no post_seo row needed
      s,
    ),
    robots: { index: false, follow: false },
  };
}

export default function PreviewPage({ params }: PreviewPageProps) {
  // PPR shell — the dynamic token lookup + render streams inside Suspense.
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-3xl px-4 py-8">
          <div className="mb-6 rounded-lg border border-yellow-300 bg-yellow-50 px-4 py-3 text-sm text-yellow-800 dark:border-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-200">
            Loading draft preview…
          </div>
        </div>
      }
    >
      <PreviewContent params={params} />
    </Suspense>
  );
}

async function PreviewContent({ params }: PreviewPageProps) {
  const { token } = await params;

  // Token gate — look up the post by previewToken. If missing/revoked/rotated → 404.
  const [post] = await db
    .select()
    .from(schema.posts)
    .where(eq(schema.posts.previewToken, token))
    .limit(1);

  if (!post) {
    notFound();
  }

  // D-19 visual cue — this is unpublished content.
  const renderedHtml = renderPostBody(post.body);

  return (
    <article className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6 rounded-lg border border-yellow-300 bg-yellow-50 px-4 py-3 text-sm text-yellow-800 dark:border-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-200">
        Draft preview — not published
      </div>
      <h1 className="mb-4 text-3xl font-bold text-gray-900 dark:text-white">
        {post.title}
      </h1>
      {post.excerpt && (
        <p className="mb-6 text-lg text-gray-600 dark:text-gray-400">
          {post.excerpt}
        </p>
      )}
      {/* Pitfall #2 site #2 — renderPostBody runs generateHTML THEN sanitizeBeforeRender.
          The output is safe for dangerouslySetInnerHTML (DOMPurify defense-in-depth). */}
      <div
        className="prose prose-lg max-w-none dark:prose-invert"
        dangerouslySetInnerHTML={{ __html: renderedHtml }}
      />
    </article>
  );
}
