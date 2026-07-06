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
