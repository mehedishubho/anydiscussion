// src/app/(site)/blog/[slug]/page.tsx
// [CITED: 06-03-PLAN.md — the spike: PPR cached body (LCP) + two separate <Suspense> holes]
// [CITED: 06-RESEARCH.md "HIGHEST Spike — RESOLVED" + Pattern 1 (L404-524)]
// [CITED: 06-PATTERNS.md [slug] section L61-151 — preview analog + CRITICAL deviation]
// [CITED: src/actions/posts.ts L351-368 — publishPost's revalidateTag tags matched by cacheTags]
// [CITED: src/lib/post-render.ts — renderPostBody (generateHTML → sanitizeBeforeRender) — Pitfall #2 gate]
// [CITED: src/app/sitemap.ts L85 — URL is `${base}/blog/${slug}`, so route path is /blog/[slug] (NOT /[slug])]
//
// The single-post page — the HIGHEST-complexity surface in the project. Cache
// Components recipe (verified HIGH confidence from bundled next@16.2.9 docs):
//
//   1. generateMetadata + body fetch via 'use cache' getPostForPublic (cached,
//      revalidated by publishPost's existing revalidateTag(`post-${id}`, "max")).
//   2. The Tiptap body renders SYNCHRONOUSLY from the cached fetch — it IS the
//      LCP element. NO <Suspense> around the body (wrapping would make it stream,
//      tanking LCP — RESEARCH Anti-Pattern #1).
//   3. Two SEPARATE <Suspense> holes at the bottom (Task 2): ViewCount and
//      RelatedPosts. Each streams independently (Pitfall 2 — don't combine).
//   4. ViewCount calls `await connection()` (next/server) as its FIRST line — the
//      per-request signal (Pitfall 1 — without it, build hangs or silent caching).
//
// Route path: /blog/[slug] — matches the sitemap URLs (sitemap.ts) and publishPost's
// revalidatePath literals (actions/posts.ts L352). RESEARCH Pattern 1 wrote /[slug]
// but the codebase is the source of truth (acceptance criterion).
//
// Heading IDs (06-PATTERNS.md resolution #2): the editor extensions array has NO
// heading-ID extension, so @tiptap/html generateHTML emits <h2>/<h3> WITHOUT id
// attributes. This route post-processes renderPostBody's HTML to inject matching
// IDs derived from buildToc's slugifier (idempotent — only adds id attributes to
// existing h2/h3 tags, never introduces new HTML; preserves the sanitize gate).

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { renderPostBody } from "@/lib/post-render";
import { buildPostMetadata, type PostLike, type PostSeoLike } from "@/lib/seo/metadata";
import { blogPostingJsonLd } from "@/lib/seo/jsonld";
import { getSeoSettings } from "@/lib/seo/settings";
import { getPostForPublic } from "@/lib/queries/posts";
import { deriveReadingTime } from "@/lib/reading-time";
import { buildToc, type TocItem } from "@/lib/toc";
import ViewCount from "@/components/site/ViewCount";
import RelatedPosts from "@/components/site/RelatedPosts";
import Toc from "@/components/site/Toc";
import ShareButtons from "@/components/site/ShareButtons";
import ReadProgress from "@/components/site/ReadProgress";
import {
  ViewCountSkeleton,
  RelatedPostsSkeleton,
} from "@/components/site/skeletons";

interface PostPageProps {
  params: Promise<{ slug: string }>;
}

/**
 * generateMetadata — one-liner via buildPostMetadata (Phase 5 lib/seo/metadata.ts).
 * Reads the SAME cached getPostForPublic so the body + metadata share a cache entry.
 *
 * 'use cache' lives INSIDE getPostForPublic + getSeoSettings (each tagged); this
 * generateMetadata does NOT need its own directive because it transitively reads
 * only cached data (params is the dynamic axis, the data reads are cached).
 */
export async function generateMetadata({
  params,
}: PostPageProps): Promise<Metadata> {
  const { slug } = await params;
  const data = await getPostForPublic(slug);
  if (!data) {
    return { title: "Not Found" };
  }
  // Drizzle leftJoin uses the TABLE NAME (snake_case) as the result key, not the
  // schema variable name — so postSeo → "post_seo", user → "user".
  const { posts: post, post_seo: seo, user: author } = data;
  const settings = await getSeoSettings();

  const postLike: PostLike = {
    id: post.id,
    title: post.title,
    slug: post.slug,
    excerpt: post.excerpt,
    featureImage: post.featureImage,
    publishedAt: post.publishedAt,
    updatedAt: post.updatedAt,
    authorName: author?.name ?? null,
  };

  return buildPostMetadata(postLike, seo ?? null, settings);
}

/**
 * injectHeadingIds — post-process renderPostBody's sanitized HTML to add id
 * attributes on h2/h3 tags. The IDs match buildToc's output (same slugifier +
 * same dedupe counter) because we walk the HTML headings in document order and
 * assign sequentially from the precomputed TOC array.
 *
 * SECURITY: this function ONLY adds an `id` attribute to existing <h2>/<h3>
 * tags. It never introduces new HTML, never touches child content, and never
 * changes anything outside h2/h3. The sanitize gate (sanitizeBeforeRender) ran
 * BEFORE this step, so the HTML is already safe; we only annotate.
 *
 * The regex is non-greedy with the /s flag so nested elements inside headings
 * (e.g. <strong>, <em>) are preserved verbatim. If the heading count in the
 * rendered HTML differs from the TOC length (shouldn't happen — both walk in
 * document order — but defensive), the surplus headings keep their (lack of) id.
 */
function injectHeadingIds(html: string, toc: TocItem[]): string {
  if (toc.length === 0) return html;
  let cursor = 0;
  return html.replace(
    /<(h[23])(\s[^>]*)?>([\s\S]*?)<\/\1>/gi,
    (match, tag: string, attrs?: string, _inner?: string) => {
      if (cursor >= toc.length) return match;
      const id = toc[cursor++].id;
      // If an id is already present (defensive — generateHTML emits none), keep it.
      if (attrs && /\sid\s*=/.test(attrs)) return match;
      const safeAttrs = attrs ?? "";
      return `<${tag} id="${id}"${safeAttrs}>${_inner}</${tag}>`;
    },
  );
}

/**
 * PostPage — the single-post route. Body renders SYNCHRONOUSLY from the cached
 * fetch (the LCP element — NO Suspense around it). Two streaming holes
 * (ViewCount + RelatedPosts) are added in Task 2; TOC/Share/ReadProgress client
 * islands are integrated in Task 3 (this Task renders the TOC inline as anchor
 * links so the route is complete and tsc-clean end-to-end).
 */
export default async function PostPage({ params }: PostPageProps) {
  const { slug } = await params;
  const data = await getPostForPublic(slug);
  if (!data) {
    notFound();
  }

  // Drizzle leftJoin uses the TABLE NAME (snake_case) as the result key, not the
  // schema variable name — so postSeo → "post_seo", user → "user".
  const { posts: post, post_seo: seo, user: author } = data;

  // Body pipeline: renderPostBody (generateHTML → sanitizeBeforeRender) →
  // inject heading IDs (post-sanitize; only adds id attrs to h2/h3 — Pitfall #8).
  const rawBodyHtml = renderPostBody(post.body);
  const toc = buildToc(post.body);
  const bodyHtml = injectHeadingIds(rawBodyHtml, toc);

  const readingMinutes = deriveReadingTime(post.body);

  // Settings — needed for JSON-LD publisher fields. Cached via getSeoSettings.
  const settings = await getSeoSettings();
  const canonicalRel = seo?.canonicalUrl || `/blog/${post.slug}`;
  const canonicalAbs = `${settings.canonicalBaseUrl}${canonicalRel}`;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 lg:py-12">
      {/* ReadProgress — client island (D-14). Thin fixed top bar; pure decoration.
          Position: fixed so placement in the tree is irrelevant. */}
      <ReadProgress />
      <div className="lg:grid lg:grid-cols-[1fr_220px] lg:gap-12">
        <article className="mx-auto w-full max-w-3xl">
          {/* BlogPosting JSON-LD — real <script> per Phase 5 Pitfall 2 (the
              Metadata API explicitly excludes <script> tags). Stringified from
              trusted DB-derived data; no script execution surface. */}
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{
              __html: JSON.stringify(
                blogPostingJsonLd({
                  title: post.title,
                  description: post.excerpt || settings.siteDescription,
                  image: seo?.ogImage || post.featureImage || null,
                  datePublished: post.publishedAt ?? post.updatedAt,
                  dateModified: post.updatedAt,
                  authorName: author?.name ?? null,
                  canonicalUrl: canonicalAbs,
                  publisherName: settings.siteTitle,
                  publisherLogo: settings.defaultOgImage || null,
                }),
              ),
            }}
          />

          {/* Title */}
          <h1 className="mb-3 text-3xl font-bold leading-tight text-gray-900 sm:text-4xl dark:text-white">
            {post.title}
          </h1>

          {/* Meta row — author byline (→ /author/[username]), reading time, date, share */}
          <div className="mb-8 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-gray-600 dark:text-gray-400">
            {author?.name ? (
              author?.username ? (
                <Link
                  href={`/author/${author.username}`}
                  className="font-medium text-gray-800 hover:underline dark:text-gray-200"
                >
                  {author.name}
                </Link>
              ) : (
                <span className="font-medium text-gray-800 dark:text-gray-200">
                  {author.name}
                </span>
              )
            ) : null}
            <span aria-hidden="true">•</span>
            <span>{readingMinutes} min read</span>
            {post.publishedAt ? (
              <>
                <span aria-hidden="true">•</span>
                <time dateTime={post.publishedAt.toISOString()}>
                  {new Intl.DateTimeFormat("en-US", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  }).format(post.publishedAt)}
                </time>
              </>
            ) : null}
            {/* ShareButtons — client island (D-14). Plain anchors for X/FB/LinkedIn,
                one copy-link button. SSR-safe (hrefs built after mount). */}
            <ShareButtons slug={post.slug} title={post.title} />
          </div>

          {/* BODY — the LCP. Rendered SYNCHRONOUSLY from the cached fetch.
              NO <Suspense> around this div — wrapping would make the body stream,
              tanking LCP (RESEARCH Anti-Pattern #1). dangerouslySetInnerHTML flows
              through renderPostBody (the generateHTML → sanitizeBeforeRender gate,
              Pitfall #8). The heading-ID post-process ran AFTER sanitize and only
              added id attributes (preserves the security boundary). */}
          <div
            className="prose prose-lg max-w-none dark:prose-invert"
            dangerouslySetInnerHTML={{ __html: bodyHtml }}
          />

          {/* Mobile TOC — Toc client island (D-05 + D-15). Renders only when
              items is non-empty; collapses to a "On this page" card on mobile.
              Scroll-spy via IntersectionObserver highlights the active section. */}
          <Toc items={toc} variant="mobile" />

          {/* STREAMING HOLE #1 — view count. Two SEPARATE Suspense boundaries
              (Pitfall 2 — don't combine with related-posts). ViewCount's FIRST
              line is `await connection()` (next/server) — the per-request signal
              that prevents build hangs / silent caching (Pitfall 1). Then runs
              the atomic UPDATE views = views + 1 (D-01) and renders the count.
              The increment fires exactly once per real visit — the streaming
              slot is never part of the cached prerender, so ISR regeneration of
              the static body does NOT re-invoke it. */}
          <div className="mt-12 flex items-center gap-2 border-t border-gray-200 pt-6 text-sm text-gray-500 dark:border-gray-800 dark:text-gray-400">
            <Suspense fallback={<ViewCountSkeleton />}>
              <ViewCount postId={post.id} />
            </Suspense>
          </div>

          {/* STREAMING HOLE #2 — related posts. 'use cache' + cacheLife('hours') +
              cacheTag('posts-list') + cacheTag(`category-${cid}`) inside the
              component — matches publishPost's existing 2-arg revalidateTag(...,
              "max") calls so publishes refresh this slot. */}
          <Suspense fallback={<RelatedPostsSkeleton />}>
            <RelatedPosts postId={post.id} categoryId={post.categoryId} />
          </Suspense>
        </article>

        {/* Desktop TOC — Toc client island (desktop variant). Sticky sidebar in
            the grid's column 2 (lg:grid-cols-[1fr_220px]). Scroll-spy highlights
            the active section. Renders nothing when items is empty (the grid then
            collapses to a single column naturally). */}
        <Toc items={toc} variant="desktop" />
      </div>
    </div>
  );
}
