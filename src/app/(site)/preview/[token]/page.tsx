// src/app/(site)/preview/[token]/page.tsx
// [CITED: 03-CONTEXT.md D-19 (token-gated, no auth required — token IS the authorization)]
// [CITED: PATTERNS.md row — gate-then-render analog: (admin)/layout.tsx AuthGate]
// [CITED: 03-RESEARCH.md L302 — /preview/[token] architecture diagram node]
// [CITED: CLAUDE.md — next/image only; dangerouslySetInnerHTML AFTER sanitize (Pitfall #2 site #2)]
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
// Server Component (NO "use client") — uses Next.js 16 async params.
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { renderPostBody } from "@/lib/post-render";
import type { Metadata } from "next";

// Defense-in-depth: prevent search engines from indexing draft previews (D-19 doesn't
// require this but it's cheap — T-03-21 mitigation).
export const metadata: Metadata = {
  title: "Draft Preview | Any Discussion",
  robots: { index: false, follow: false },
};

interface PreviewPageProps {
  params: Promise<{ token: string }>;
}

export default async function PreviewPage({ params }: PreviewPageProps) {
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
