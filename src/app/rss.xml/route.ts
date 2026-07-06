// src/app/rss.xml/route.ts
// [CITED: 05-02-PLAN.md Task 2 <action> — RSS 2.0 Route Handler, full-text, escapeXml, CDATA]
// [CITED: 05-RESEARCH.md Pattern 5 (L598-679) — verified rss.xml/route.ts body + escapeXml + CDATA]
// [CITED: 05-CONTEXT.md D-07 — full-text posts-only feed; D-13 — revalidatePath already wired]
// [CITED: 05-CONTEXT.md threat T-05-02 — renderPostBody sanitize pipeline; T-05-04 — escapeXml]
//
// Route Handler emitting a full-text RSS 2.0 feed of the latest published posts.
// Full-text per D-07 (readers-maximum-reach posture — PROJECT.md core value).
// The body is sanitized via renderPostBody (Phase 3 CONT-03 double-sanitize pipeline)
// and wrapped in CDATA as defense-in-depth (T-05-02). Text fields pass through
// escapeXml to close the XML-injection vector (T-05-04).
//
// canonicalBaseUrl comes from getSeoSettings() — the SINGLE source (Pitfall 7).
// The publish action's existing revalidatePath("/rss.xml") (src/actions/posts.ts L285,
// D-13 carry-forward) refreshes this route without a full rebuild.

import { db, schema } from "@/lib/db";
import { eq, isNull, desc, and } from "drizzle-orm";
import { renderPostBody } from "@/lib/post-render";
import { getSeoSettings } from "@/lib/seo/settings";

/** D-07 — sensible cap in the 20-50 range. */
export const RSS_LIMIT = 30;

/**
 * GET /rss.xml — full-text RSS 2.0 feed of the latest published posts.
 *
 * Security:
 *   - T-05-05: only published, non-soft-deleted posts (SQL filter).
 *   - T-05-02: body sanitized via renderPostBody (generateHTML → sanitizeBeforeRender).
 *   - T-05-04: text fields escaped via escapeXml; body wrapped in CDATA.
 */
export async function GET(): Promise<Response> {
  const s = await getSeoSettings();
  const base = s.canonicalBaseUrl;

  const posts = await db
    .select({
      title: schema.posts.title,
      slug: schema.posts.slug,
      body: schema.posts.body,
      excerpt: schema.posts.excerpt,
      publishedAt: schema.posts.publishedAt,
    })
    .from(schema.posts)
    .where(and(eq(schema.posts.status, "published"), isNull(schema.posts.deletedAt)))
    .orderBy(desc(schema.posts.publishedAt))
    .limit(RSS_LIMIT);

  // Defense-in-depth: cap at RSS_LIMIT even if the SQL limit is ever misconfigured.
  const capped = posts.slice(0, RSS_LIMIT);

  const items = capped
    .map((p) => {
      // D-07 — full-text body via the Phase 3 sanitized render pipeline. Excerpt
      // fallback when body is null (T-05-02: renderPostBody double-sanitizes).
      const bodyHtml = p.body ? renderPostBody(p.body) : (p.excerpt ?? "");
      return buildRssItem(
        { title: p.title, slug: p.slug, excerpt: p.excerpt, publishedAt: p.publishedAt },
        base,
        bodyHtml,
      );
    })
    .join("\n");

  const feed = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <title>${escapeXml(s.siteTitle)}</title>
    <link>${escapeXml(base)}</link>
    <description>${escapeXml(s.siteDescription)}</description>
    <language>en-us</language>
    <atom:link href="${escapeXml(base)}/rss.xml" rel="self" type="application/rss+xml" />
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
${items}
  </channel>
</rss>`;

  return new Response(feed, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      // Supplements the path-based revalidatePath (D-13).
      "Cache-Control": "s-maxage=600, stale-while-revalidate",
    },
  });
}

/**
 * Build a single RSS <item> string for a published post.
 *
 * Pure helper — extracted so the unit test can exercise it without the DB.
 * Escapes the 5 XML-special chars in title/excerpt/link; wraps the rendered
 * HTML body in CDATA (defense-in-depth — the body is already sanitized by
 * renderPostBody, CDATA protects against residual HTML entities breaking the parser).
 */
export function buildRssItem(
  post: {
    title: string;
    slug: string;
    excerpt: string | null;
    publishedAt: Date | null;
  },
  base: string,
  renderedBody: string,
): string {
  const url = `${base}/blog/${post.slug}`;
  const pubDate = post.publishedAt
    ? new Date(post.publishedAt).toUTCString()
    : new Date().toUTCString();
  return `    <item>
      <title>${escapeXml(post.title)}</title>
      <link>${escapeXml(url)}</link>
      <guid isPermaLink="true">${escapeXml(url)}</guid>
      <description>${escapeXml(post.excerpt ?? "")}</description>
      <content:encoded><![CDATA[${renderedBody}]]></content:encoded>
      <pubDate>${pubDate}</pubDate>
    </item>`;
}

/**
 * Escape the five XML-special characters in text fields (T-05-04).
 *
 * Bangla UTF-8 content is fine in UTF-8 XML (the encoding declaration above);
 * only <>&'" need escaping. CDATA wraps the body so unescaped HTML entities
 * pass through verbatim.
 */
export function escapeXml(s: string): string {
  return s.replace(/[<>&'"]/g, (c) =>
    c === "<" ? "&lt;" :
    c === ">" ? "&gt;" :
    c === "&" ? "&amp;" :
    c === "'" ? "&apos;" :
    "&quot;");
}
