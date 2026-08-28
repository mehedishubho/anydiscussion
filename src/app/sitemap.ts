// src/app/sitemap.ts
// [CITED: 05-02-PLAN.md Task 1 <action> — home + published posts + published pages]
// [CITED: 05-RESEARCH.md Pattern 2 (L426-481) — verified MetadataRoute.Sitemap body]
// [CITED: 05-CONTEXT.md D-05 — single sitemap, extensible; D-08 — status/deletedAt filter]
// [CITED: 05-CONTEXT.md D-13 — revalidatePath("/sitemap.xml") already wired in actions/posts.ts]
//
// Special Route Handler — cached by default. The publish action's existing
// `revalidatePath("/sitemap.xml")` (src/actions/posts.ts L284, D-13 carry-forward)
// refreshes this route without a full rebuild. NO `'use cache'` directive here —
// special Route Handlers have their own caching semantics under cacheComponents.
//
// canonicalBaseUrl comes from getSeoSettings() — the SINGLE source (Pitfall 7 — never
// read process.env directly; the env is only the seed/fallback inside settings.ts).

import type { MetadataRoute } from "next";
import { db, schema } from "@/lib/db";
import { eq, and, isNull, desc } from "drizzle-orm";
import { getSeoSettings } from "@/lib/seo/settings";
import { UNCATEGORIZED_SLUG } from "@/lib/post-card";

/**
 * The dynamic sitemap — home + every published post + every published page.
 *
 * Per-content-type priority/changeFrequency (SEO-08, D-05):
 *   - home:      priority 1.0, changeFrequency "daily"
 *   - posts:     priority 0.8, changeFrequency "weekly",  lastModified ← posts.updatedAt
 *   - pages:     priority 0.5, changeFrequency "monthly", lastModified ← pages.updatedAt
 *
 * Drafts and soft-deleted rows are excluded by the SQL filter
 * (status='published' AND deletedAt IS NULL) — T-05-05 mitigation.
 *
 * Phase 6 extends the returned array with category/tag/author archive entries
 * without rewriting this file (D-05 extensibility seam).
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const s = await getSeoSettings();
  const base = s.canonicalBaseUrl;

  const home = buildHomeSitemapEntry(base);

  // Published posts — exclude drafts + soft-deleted (T-05-05).
  // 260828-blog-url: left-join categories so the entry URL can include the
  // category slug (/blog/{category}/{slug}). Posts without a category use the
  // literal "uncategorized" segment — matches the single-post route's WHERE
  // filter in src/lib/queries/posts.ts#getPostForPublic.
  const publishedPosts = await db
    .select({
      slug: schema.posts.slug,
      updatedAt: schema.posts.updatedAt,
      categorySlug: schema.categories.slug,
    })
    .from(schema.posts)
    .leftJoin(
      schema.categories,
      eq(schema.categories.id, schema.posts.categoryId),
    )
    .where(and(eq(schema.posts.status, "published"), isNull(schema.posts.deletedAt)))
    .orderBy(desc(schema.posts.publishedAt));
  const postEntries: MetadataRoute.Sitemap = publishedPosts.map((p) =>
    buildPostSitemapEntry(p.slug, p.categorySlug, p.updatedAt, base),
  );

  // Published pages — same status + soft-delete filter.
  const publishedPages = await db
    .select({ slug: schema.pages.slug, updatedAt: schema.pages.updatedAt })
    .from(schema.pages)
    .where(and(eq(schema.pages.status, "published"), isNull(schema.pages.deletedAt)));
  const pageEntries: MetadataRoute.Sitemap = publishedPages.map((p) =>
    buildPageSitemapEntry(p.slug, p.updatedAt, base),
  );

  // Phase 6 TODO: append category/tag/author archive entries here (D-05).
  return [home, ...postEntries, ...pageEntries];
}

/**
 * Home sitemap entry — priority 1.0, changeFrequency daily (SEO-08 / D-05).
 * Extracted as a pure helper so the unit test can assert the shape without a DB.
 */
export function buildHomeSitemapEntry(base: string): MetadataRoute.Sitemap[number] {
  return {
    url: base,
    lastModified: new Date(),
    changeFrequency: "daily",
    priority: 1.0,
  };
}

/**
 * Post sitemap entry — priority 0.8, weekly, url
 * {base}/blog/{categorySlug|uncategorized}/{slug} (SEO-08 / D-05).
 *
 * 260828-blog-url: categorySlug is the categories.slug value, falling back to
 * the literal "uncategorized" for posts whose categoryId IS NULL. The
 * single-post route at /blog/[category]/[slug] accepts the same fallback
 * (see lib/queries/posts.ts — `category === "uncategorized" ? isNull(...) : ...`).
 */
export function buildPostSitemapEntry(
  slug: string,
  categorySlug: string | null,
  updatedAt: Date,
  base: string,
): MetadataRoute.Sitemap[number] {
  return {
    url: `${base}/blog/${categorySlug || UNCATEGORIZED_SLUG}/${slug}`,
    lastModified: updatedAt,
    changeFrequency: "weekly",
    priority: 0.8,
  };
}

/**
 * Page sitemap entry — priority 0.5, monthly, url {base}/{slug} (SEO-08 / D-05).
 */
export function buildPageSitemapEntry(
  slug: string,
  updatedAt: Date,
  base: string,
): MetadataRoute.Sitemap[number] {
  return {
    url: `${base}/${slug}`,
    lastModified: updatedAt,
    changeFrequency: "monthly",
    priority: 0.5,
  };
}
