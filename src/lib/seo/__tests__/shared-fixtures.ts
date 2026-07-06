// src/lib/seo/__tests__/shared-fixtures.ts
// [CITED: 05-RESEARCH.md Validation Architecture (L1023-1029) + Pitfall 3 (L719-732)]
//
// Shared fixtures for the SEO pure-builder unit tests. No DB mock needed — these
// are plain objects passed directly into the builder functions. The empirical
// Bangla fixture is a realistic 59-grapheme meta description (verified via
// Intl.Segmenter on Node 24 — the exact string that .length would count as 97
// UTF-16 units, demonstrating why grapheme counting is the correct rule for SEO-06).

import type {
  PostLike,
  PostSeoLike,
  PageLike,
  SeoSettings,
} from "@/lib/seo/metadata";

/**
 * A realistic 59-grapheme Bangla meta description. Verified:
 *   graphemes (Intl.Segmenter): 59
 *   UTF-16 code units (.length): 97
 *   UTF-8 bytes: 264
 * Under the Latin-style `.max(155)` rule this would be falsely rejected; under
 * the grapheme rule (≤200) it passes comfortably — the SEO-06 guarantee.
 */
export const BANLA_59_GRAPHEMES =
  "এই ব্লগে আপনি পাবেন প্রযুক্তি, বিজ্ঞান এবং প্রোগ্রামিং ও জীবনযাপন নিয়ে গভীর বিশ্লেষণমূলক আলোচনা।";

/** A 250-grapheme Latin string — over the DESC_MAX_GRAPHEMES (200) cap; must FAIL. */
export const LATIN_250_GRAPHEMES = "A".repeat(250);

/** A fake published post with all fields populated. */
export const fakePost: PostLike = {
  id: 1,
  title: "Understanding Next.js 16 Cache Components",
  slug: "understanding-nextjs-16-cache-components",
  excerpt: "A deep dive into how Cache Components change data fetching in Next.js 16.",
  featureImage: "https://cdn.anydiscussion.com/images/nextjs-cache.jpg",
  publishedAt: new Date("2026-06-15T10:00:00Z"),
  updatedAt: new Date("2026-06-20T12:00:00Z"),
  authorName: "Mehedi Shubho",
};

/** A fake post with NO feature image (exercises the OG fallback chain). */
export const fakePostNoImage: PostLike = {
  ...fakePost,
  id: 2,
  featureImage: null,
};

/** A fake post_seo row with all four fields populated. */
export const fakePostSeo: PostSeoLike = {
  metaTitle: "Next.js 16 Cache Components Explained (Custom Override)",
  metaDescription: "Everything you need to know about Cache Components in Next.js 16.",
  ogImage: "https://cdn.anydiscussion.com/images/nextjs-cache-og.jpg",
  canonicalUrl: "https://example.com/custom-canonical/nextjs-cache",
};

/** Fake SeoSettings snapshot (matches the five D-11 seeded keys). */
export const fakeSettings: SeoSettings = {
  canonicalBaseUrl: "https://anydiscussion.com",
  siteTitle: "Any Discussion",
  siteDescription: "A fast, SEO-optimized blog from Any Discussion.",
  defaultOgImage: "https://cdn.anydiscussion.com/images/default-og.png",
  twitterHandle: "@anydiscussion",
};

/** Fake SeoSettings with NO default OG image (exercises twitter.card='summary'). */
export const fakeSettingsNoOg: SeoSettings = {
  ...fakeSettings,
  defaultOgImage: "",
};

/** A fake managed page (pages carry their OWN SEO columns per D-06). */
export const fakePage: PageLike = {
  slug: "about",
  title: "About",
  metaTitle: "About Any Discussion",
  metaDescription: "Learn more about the Any Discussion blog and its mission.",
  canonical: "",
  updatedAt: new Date("2026-06-01T00:00:00Z"),
};

// ============================================================================
// Plan 05-02 fixtures — sitemap.ts / robots.ts / rss.xml/route.ts tests
// [CITED: 05-02-PLAN.md Task 1 <action> — post-row + page-row arrays + XML-special title]
// ============================================================================

/**
 * Post rows simulating the sitemap DB query result (AFTER the SQL filter
 * `status='published' AND deletedAt IS NULL`). Two published posts — the draft
 * and soft-deleted fixtures below simulate rows that the query EXCLUDES, so the
 * test can assert their slugs never appear in the output.
 */
export const fakeSitemapPosts: Array<{
  slug: string;
  updatedAt: Date;
}> = [
  { slug: "understanding-cache-components", updatedAt: new Date("2026-06-20T12:00:00Z") },
  { slug: "drizzle-full-text-search", updatedAt: new Date("2026-06-18T10:00:00Z") },
];

/** Published page rows for the sitemap (one managed page). */
export const fakeSitemapPages: Array<{
  slug: string;
  updatedAt: Date;
}> = [
  { slug: "about", updatedAt: new Date("2026-06-01T00:00:00Z") },
];

/** Slug of a draft post that must NEVER appear in the sitemap (D-05 exclusion). */
export const DRAFT_POST_SLUG = "draft-post-excluded";

/** Slug of a published-but-soft-deleted post that must NEVER appear (T-05-05). */
export const SOFT_DELETED_POST_SLUG = "soft-deleted-post-excluded";

/**
 * RSS post rows — the full shape the RSS Route Handler selects
 * (title, slug, body, excerpt, publishedAt). Two published posts with realistic
 * dates; the body is minimal Tiptap JSON (renderPostBody is mocked in rss.test.ts).
 */
export const fakeRssPosts: Array<{
  title: string;
  slug: string;
  body: unknown;
  excerpt: string | null;
  publishedAt: Date | null;
}> = [
  {
    title: "First Published Post",
    slug: "first-published-post",
    body: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Hello world" }] }] },
    excerpt: "First post excerpt",
    publishedAt: new Date("2026-06-20T08:00:00Z"),
  },
  {
    title: "Second Published Post",
    slug: "second-published-post",
    body: null,
    excerpt: "Second post excerpt",
    publishedAt: new Date("2026-06-18T08:00:00Z"),
  },
];

/**
 * A single RSS post whose title + excerpt contain ALL FIVE XML-special characters
 * (less-than, greater-than, ampersand, apostrophe, quote). Used to assert escapeXml
 * covers every special char and that the raw chars NEVER reach the XML output
 * (T-05-04 XML-injection mitigation).
 */
export const fakeRssPostWithSpecialChars = {
  title: `A & B < C > D 'E' "F"`,
  slug: "special-chars-post",
  body: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "body" }] }] },
  excerpt: `Excerpt with < & > 'and' "quotes"`,
  publishedAt: new Date("2026-06-19T08:00:00Z"),
} as const;

/** The fixed sanitized-HTML string the renderPostBody mock returns in rss.test.ts. */
export const MOCK_RENDERED_BODY = "<p>sanitized body html</p>";
