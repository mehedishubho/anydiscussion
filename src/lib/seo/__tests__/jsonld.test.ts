// src/lib/seo/__tests__/jsonld.test.ts
// [CITED: 05-VALIDATION.md row "05-01-T2" — SEO-03 JSON-LD schema.org shapes]
// [CITED: 05-RESEARCH.md Pattern 4 (L505-594) — verified BlogPosting/WebSite/Organization]
//
// Pure-builder unit tests — no DB mock needed. The builders return plain objects
// (NOT stringified); the consumer does JSON.stringify + dangerouslySetInnerHTML.

import { describe, it, expect } from "vitest";
import {
  blogPostingJsonLd,
  websiteJsonLd,
  organizationJsonLd,
  personJsonLd,
  breadcrumbListJsonLd,
} from "../jsonld";
import { fakePost, fakePostSeo, fakeSettings } from "./shared-fixtures";

describe("SEO-03 / D-03: blogPostingJsonLd — schema.org BlogPosting shape", () => {
  const ld = blogPostingJsonLd({
    title: fakePost.title,
    description: fakePost.excerpt ?? "",
    image: fakePost.featureImage,
    datePublished: fakePost.publishedAt!,
    dateModified: fakePost.updatedAt,
    authorName: fakePost.authorName,
    canonicalUrl: `https://anydiscussion.com/${fakePost.slug}`,
    publisherName: fakeSettings.siteTitle,
    publisherLogo: fakeSettings.defaultOgImage,
  });

  it("sets @context and @type", () => {
    expect(ld["@context"]).toBe("https://schema.org");
    expect(ld["@type"]).toBe("BlogPosting");
  });

  it("sets headline to the title", () => {
    expect(ld.headline).toBe(fakePost.title);
  });

  it("sets datePublished as ISO 8601", () => {
    expect(ld.datePublished).toBe(fakePost.publishedAt!.toISOString());
  });

  it("sets dateModified as ISO 8601", () => {
    expect(ld.dateModified).toBe(fakePost.updatedAt.toISOString());
  });

  it("author is a Person with the author name", () => {
    expect(ld.author["@type"]).toBe("Person");
    expect(ld.author.name).toBe(fakePost.authorName);
  });

  it("mainEntityOfPage is a WebPage with @id = canonical URL", () => {
    expect(ld.mainEntityOfPage["@type"]).toBe("WebPage");
    expect(ld.mainEntityOfPage["@id"]).toBe(
      `https://anydiscussion.com/${fakePost.slug}`,
    );
  });

  it("publisher is an Organization with a logo ImageObject when provided", () => {
    expect(ld.publisher["@type"]).toBe("Organization");
    expect(ld.publisher.name).toBe(fakeSettings.siteTitle);
    expect(ld.publisher.logo).toBeDefined();
    expect(ld.publisher.logo!["@type"]).toBe("ImageObject");
    expect(ld.publisher.logo!.url).toBe(fakeSettings.defaultOgImage);
  });

  it("includes image as an array when provided", () => {
    expect(ld.image).toEqual([fakePost.featureImage]);
  });

  it("falls back author name to publisherName when authorName is null", () => {
    const ld2 = blogPostingJsonLd({
      title: "Test",
      description: "",
      image: null,
      datePublished: new Date("2026-01-01"),
      dateModified: new Date("2026-01-01"),
      authorName: null,
      canonicalUrl: "https://example.com/test",
      publisherName: "Any Discussion",
      publisherLogo: null,
    });
    expect(ld2.author.name).toBe("Any Discussion");
    expect(ld2.image).toBeUndefined();
    expect(ld2.publisher.logo).toBeUndefined();
  });
});

describe("SEO-03 / D-03: websiteJsonLd — schema.org WebSite + SearchAction", () => {
  const ld = websiteJsonLd({
    canonicalBaseUrl: fakeSettings.canonicalBaseUrl,
    siteTitle: fakeSettings.siteTitle,
    siteDescription: fakeSettings.siteDescription,
  });

  it("sets @context and @type=WebSite", () => {
    expect(ld["@context"]).toBe("https://schema.org");
    expect(ld["@type"]).toBe("WebSite");
  });

  it("sets url, name, description from settings", () => {
    expect(ld.url).toBe(fakeSettings.canonicalBaseUrl);
    expect(ld.name).toBe(fakeSettings.siteTitle);
    expect(ld.description).toBe(fakeSettings.siteDescription);
  });

  it("includes potentialAction SearchAction targeting /search?q={search_term_string}", () => {
    expect(ld.potentialAction["@type"]).toBe("SearchAction");
    expect(ld.potentialAction.target).toBe(
      `${fakeSettings.canonicalBaseUrl}/search?q={search_term_string}`,
    );
    expect(ld.potentialAction["query-input"]).toBe(
      "required name=search_term_string",
    );
  });
});

describe("SEO-03 / D-03: organizationJsonLd — schema.org Organization", () => {
  const ld = organizationJsonLd({
    canonicalBaseUrl: fakeSettings.canonicalBaseUrl,
    siteTitle: fakeSettings.siteTitle,
    defaultOgImage: fakeSettings.defaultOgImage,
  });

  it("sets @context and @type=Organization", () => {
    expect(ld["@context"]).toBe("https://schema.org");
    expect(ld["@type"]).toBe("Organization");
  });

  it("sets name, url, logo from settings", () => {
    expect(ld.name).toBe(fakeSettings.siteTitle);
    expect(ld.url).toBe(fakeSettings.canonicalBaseUrl);
    expect(ld.logo).toBe(fakeSettings.defaultOgImage);
  });
});

// ============================================================================
// Plan 06-01 Task 2 — Person + BreadcrumbList JSON-LD builders
// [CITED: 06-01-PLAN.md Task 2 — closes Phase 5 D-03 deferrals for author/taxonomy]
// ============================================================================

describe("SITE-06 / D-03: personJsonLd — schema.org Person shape", () => {
  const ld = personJsonLd({
    name: "Mehedi Shubho",
    url: "https://anydiscussion.com/author/mehedi",
    jobTitle: "Founder & Editor",
    description: "Tech writer and developer.",
  });

  it("sets @context and @type=Person", () => {
    expect(ld["@context"]).toBe("https://schema.org");
    expect(ld["@type"]).toBe("Person");
  });

  it("sets name, url, jobTitle, description", () => {
    expect(ld.name).toBe("Mehedi Shubho");
    expect(ld.url).toBe("https://anydiscussion.com/author/mehedi");
    expect(ld.jobTitle).toBe("Founder & Editor");
    expect(ld.description).toBe("Tech writer and developer.");
  });

  it("omits jobTitle when not provided", () => {
    const ld2 = personJsonLd({
      name: "Anonymous",
      url: "https://example.com/author/anon",
    });
    expect(ld2.jobTitle).toBeUndefined();
    expect(ld2.description).toBeUndefined();
  });
});

describe("SITE-04/05 / D-03: breadcrumbListJsonLd — schema.org BreadcrumbList", () => {
  const ld = breadcrumbListJsonLd({
    items: [
      { name: "Home", url: "https://anydiscussion.com" },
      { name: "Technology", url: "https://anydiscussion.com/category/tech" },
    ],
  });

  it("sets @context and @type=BreadcrumbList", () => {
    expect(ld["@context"]).toBe("https://schema.org");
    expect(ld["@type"]).toBe("BreadcrumbList");
  });

  it("itemListElement has correct length and position", () => {
    expect(ld.itemListElement).toHaveLength(2);
    expect(ld.itemListElement[0].position).toBe(1);
    expect(ld.itemListElement[1].position).toBe(2);
  });

  it("each item is a ListItem with name + url", () => {
    expect(ld.itemListElement[0]["@type"]).toBe("ListItem");
    expect(ld.itemListElement[0].name).toBe("Home");
    expect(ld.itemListElement[0].item).toBe("https://anydiscussion.com");
    expect(ld.itemListElement[1].name).toBe("Technology");
    expect(ld.itemListElement[1].item).toBe(
      "https://anydiscussion.com/category/tech",
    );
  });

  it("handles a single-item breadcrumb", () => {
    const ld2 = breadcrumbListJsonLd({
      items: [{ name: "Home", url: "https://anydiscussion.com" }],
    });
    expect(ld2.itemListElement).toHaveLength(1);
    expect(ld2.itemListElement[0].position).toBe(1);
  });
});
