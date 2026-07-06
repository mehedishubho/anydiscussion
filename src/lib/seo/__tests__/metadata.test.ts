// src/lib/seo/__tests__/metadata.test.ts
// [CITED: 05-VALIDATION.md rows "05-01-T2" — SEO-01, SEO-04, SEO-05]
// [CITED: 05-RESEARCH.md Pattern 1 (L344-424) — verified buildPostMetadata body]
//
// Pure-builder unit tests — no DB mock needed. The fixtures (shared-fixtures.ts)
// are plain objects passed directly into the builder functions.
//
// NOTE: Next.js `Metadata.openGraph` and `Metadata.twitter` are discriminated unions
// (OpenGraphMetadata | OpenGraphArticle | ..., TwitterMetadata | ...). The base
// variants lack `type`, `card`, `publishedTime`, etc. — these fields exist only on
// specific variants our builders construct. To assert on them without runtime casts
// scattered through every test, we define typed accessor helpers below. The cast is
// safe because our builders always construct the article/website/twitter-card variant.

import type { Metadata } from "next";
import { describe, it, expect } from "vitest";
import {
  buildPostMetadata,
  buildPageMetadata,
  buildSiteMetadata,
  buildArchiveMetadata,
} from "../metadata";
import {
  fakePost,
  fakePostNoImage,
  fakePostSeo,
  fakeSettings,
  fakeSettingsNoOg,
  fakePage,
} from "./shared-fixtures";

/** Typed accessor for openGraph fields that exist only on specific union variants. */
function og(m: Metadata) {
  return m.openGraph as {
    type?: string;
    title?: string;
    description?: string;
    url?: string;
    publishedTime?: string | null;
    modifiedTime?: string | null;
    authors?: string[];
    images?: Array<{ url: string }>;
    siteName?: string;
  } | null | undefined;
}

/** Typed accessor for twitter fields that exist only on specific union variants. */
function tw(m: Metadata) {
  return m.twitter as {
    card?: string;
    title?: string;
    description?: string;
    site?: string;
    images?: string[];
  } | null | undefined;
}

describe("SEO-01 / SEO-04 / D-04: buildPostMetadata — canonical override + fallback", () => {
  it("respects postSeo.canonicalUrl override when set", () => {
    const m = buildPostMetadata(fakePost, fakePostSeo, fakeSettings);
    expect(m.alternates?.canonical).toBe(fakePostSeo.canonicalUrl);
  });

  it("derives canonical from slug when postSeo is null", () => {
    const m = buildPostMetadata(fakePost, null, fakeSettings);
    expect(m.alternates?.canonical).toBe(`/${fakePost.slug}`);
  });

  it("derives canonical from slug when postSeo.canonicalUrl is empty", () => {
    const m = buildPostMetadata(fakePost, { ...fakePostSeo, canonicalUrl: "" }, fakeSettings);
    // Empty string is falsy — falls through to slug derivation.
    expect(m.alternates?.canonical).toBe(`/${fakePost.slug}`);
  });

  it("uses postSeo.metaTitle when set, else post.title", () => {
    const withOverride = buildPostMetadata(fakePost, fakePostSeo, fakeSettings);
    expect(withOverride.title).toBe(fakePostSeo.metaTitle);

    const noOverride = buildPostMetadata(fakePost, null, fakeSettings);
    expect(noOverride.title).toBe(fakePost.title);
  });

  it("uses postSeo.metaDescription → post.excerpt → siteDescription fallback chain", () => {
    const withSeo = buildPostMetadata(fakePost, fakePostSeo, fakeSettings);
    expect(withSeo.description).toBe(fakePostSeo.metaDescription);

    const noSeo = buildPostMetadata(fakePost, null, fakeSettings);
    expect(noSeo.description).toBe(fakePost.excerpt);

    const noExcerpt = buildPostMetadata(
      { ...fakePost, excerpt: null },
      null,
      fakeSettings,
    );
    expect(noExcerpt.description).toBe(fakeSettings.siteDescription);
  });
});

describe("SEO-05 / D-09: buildPostMetadata — OG fallback chain + twitter card", () => {
  it("uses postSeo.ogImage when set (highest priority)", () => {
    const m = buildPostMetadata(fakePost, fakePostSeo, fakeSettings);
    expect(og(m)?.images).toEqual([{ url: fakePostSeo.ogImage }]);
  });

  it("falls back to post.featureImage when postSeo.ogImage is null", () => {
    const m = buildPostMetadata(fakePost, null, fakeSettings);
    expect(og(m)?.images).toEqual([{ url: fakePost.featureImage }]);
  });

  it("falls back to settings.defaultOgImage when neither postSeo nor post has an image", () => {
    const m = buildPostMetadata(fakePostNoImage, null, fakeSettings);
    expect(og(m)?.images).toEqual([{ url: fakeSettings.defaultOgImage }]);
  });

  it("twitter.card is summary_large_image when an OG image resolves", () => {
    const m = buildPostMetadata(fakePost, fakePostSeo, fakeSettings);
    expect(tw(m)?.card).toBe("summary_large_image");
  });

  it("twitter.card is summary when NO image resolves anywhere", () => {
    const m = buildPostMetadata(fakePostNoImage, null, fakeSettingsNoOg);
    expect(tw(m)?.card).toBe("summary");
    expect(tw(m)?.images).toBeUndefined();
  });

  it("includes twitter:site handle when settings.twitterHandle is set", () => {
    const m = buildPostMetadata(fakePost, null, fakeSettings);
    expect(tw(m)?.site).toBe("@anydiscussion");
  });

  it("omits twitter:site when settings.twitterHandle is null", () => {
    const m = buildPostMetadata(fakePost, null, {
      ...fakeSettings,
      twitterHandle: null,
    });
    expect(tw(m)?.site).toBeUndefined();
  });
});

describe("SEO-01: buildPostMetadata — openGraph article fields", () => {
  it("sets openGraph.type to 'article'", () => {
    const m = buildPostMetadata(fakePost, null, fakeSettings);
    expect(og(m)?.type).toBe("article");
  });

  it("sets publishedTime as ISO 8601", () => {
    const m = buildPostMetadata(fakePost, null, fakeSettings);
    expect(og(m)?.publishedTime).toBe(fakePost.publishedAt?.toISOString());
  });

  it("sets modifiedTime as ISO 8601", () => {
    const m = buildPostMetadata(fakePost, null, fakeSettings);
    expect(og(m)?.modifiedTime).toBe(fakePost.updatedAt.toISOString());
  });

  it("includes authorName in authors when present", () => {
    const m = buildPostMetadata(fakePost, null, fakeSettings);
    expect(og(m)?.authors).toEqual([fakePost.authorName]);
  });
});

describe("SEO-01: buildPageMetadata — pages carry their OWN SEO columns (D-06)", () => {
  it("uses page.metaTitle override else page.title", () => {
    const m = buildPageMetadata(fakePage, fakeSettings);
    expect(m.title).toBe(fakePage.metaTitle);
  });

  it("falls back to page.title when metaTitle is null", () => {
    const m = buildPageMetadata({ ...fakePage, metaTitle: null }, fakeSettings);
    expect(m.title).toBe(fakePage.title);
  });

  it("uses page.metaDescription else siteDescription fallback", () => {
    const withDesc = buildPageMetadata(fakePage, fakeSettings);
    expect(withDesc.description).toBe(fakePage.metaDescription);

    const noDesc = buildPageMetadata(
      { ...fakePage, metaDescription: null },
      fakeSettings,
    );
    expect(noDesc.description).toBe(fakeSettings.siteDescription);
  });

  it("respects page.canonical override else derives /{slug}", () => {
    const withCanon = buildPageMetadata(
      { ...fakePage, canonical: "https://ext.com/about" },
      fakeSettings,
    );
    expect(withCanon.alternates?.canonical).toBe("https://ext.com/about");

    const noCanon = buildPageMetadata(fakePage, fakeSettings);
    expect(noCanon.alternates?.canonical).toBe(`/${fakePage.slug}`);
  });
});

describe("SEO-01: buildSiteMetadata — metadataBase + title template", () => {
  it("returns metadataBase as a URL(canonicalBaseUrl)", () => {
    const m = buildSiteMetadata(fakeSettings);
    expect(m.metadataBase).toBeInstanceOf(URL);
    expect((m.metadataBase as URL).href).toBe("https://anydiscussion.com/");
  });

  it("returns title as {default, template} pair", () => {
    const m = buildSiteMetadata(fakeSettings);
    expect(m.title).toEqual({
      default: "Any Discussion",
      template: "%s | Any Discussion",
    });
  });

  it("sets openGraph.type to 'website'", () => {
    const m = buildSiteMetadata(fakeSettings);
    expect(og(m)?.type).toBe("website");
  });

  it("includes defaultOgImage in openGraph.images when set", () => {
    const m = buildSiteMetadata(fakeSettings);
    expect(og(m)?.images).toEqual([{ url: fakeSettings.defaultOgImage }]);
  });

  it("omits images when defaultOgImage is empty", () => {
    const m = buildSiteMetadata(fakeSettingsNoOg);
    expect(og(m)?.images).toBeUndefined();
  });
});

describe("SEO-01: buildArchiveMetadata — category/tag/author/search (Phase 6 seam)", () => {
  it("builds a category archive title", () => {
    const m = buildArchiveMetadata(
      { name: "Technology", kind: "category", path: "/category/technology" },
      fakeSettings,
    );
    expect(m.title).toBe("Category: Technology");
    expect(m.alternates?.canonical).toBe("/category/technology");
  });

  it("builds a search archive title", () => {
    const m = buildArchiveMetadata(
      { name: "Next.js", kind: "search", path: "/search?q=nextjs" },
      fakeSettings,
    );
    expect(m.title).toBe("Search: Next.js");
  });

  it("uses the provided description when given", () => {
    const m = buildArchiveMetadata(
      {
        name: "Tech",
        kind: "tag",
        path: "/tag/tech",
        description: "Posts tagged with Tech.",
      },
      fakeSettings,
    );
    expect(m.description).toBe("Posts tagged with Tech.");
  });
});
