// src/lib/seo/jsonld.ts
// [CITED: 05-CONTEXT.md D-03 — BlogPosting + WebSite + Organization JSON-LD]
// [CITED: 05-RESEARCH.md Pattern 4 (L505-594) — verified schema.org shapes + injection pattern]
// [CITED: 05-RESEARCH.md Pitfall 2 — JSON-LD via real <script>, NOT metadata.other]
//
// PURE builders returning plain objects (NOT stringified). The consumer
// (page/layout Server Component) does `JSON.stringify(...)` and injects via
// `<script type="application/ld+json" dangerouslySetInnerHTML>`. This is the only
// Next.js-16-supported path for JSON-LD — the Metadata API explicitly excludes
// `<script>` tags (05-RESEARCH.md "Unsupported Metadata" table).
//
// No imports beyond TypeScript types — the builders return plain schema.org objects.
//
// Server-only — NO "use client" directive.

import type { SeoSettings } from "@/lib/seo/metadata";

/** Input for the per-post BlogPosting builder. */
export interface BlogPostingInput {
  title: string;
  description: string;
  /** OG/feature image URL (may be null — image is required for rich results). */
  image: string | null;
  datePublished: Date;
  dateModified: Date;
  authorName: string | null;
  /** Absolute canonical URL (resolved by buildPostMetadata / the route). */
  canonicalUrl: string;
  publisherName: string;
  publisherLogo: string | null;
}

/** Input for the site-wide WebSite builder. */
export interface WebSiteJsonLdInput {
  canonicalBaseUrl: string;
  siteTitle: string;
  siteDescription: string;
}

/** Input for the site-wide Organization builder. */
export interface OrganizationJsonLdInput {
  canonicalBaseUrl: string;
  siteTitle: string;
  defaultOgImage: string;
}

/**
 * Build a schema.org BlogPosting object for a single published post (SEO-03).
 * Google Article rich-result required fields: headline, image, datePublished, author.
 * Recommended: publisher, mainEntityOfPage, dateModified, description.
 */
export function blogPostingJsonLd(i: BlogPostingInput) {
  return {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: i.title,
    description: i.description,
    ...(i.image ? { image: [i.image] } : {}),
    datePublished: i.datePublished.toISOString(),
    dateModified: i.dateModified.toISOString(),
    author: {
      "@type": "Person",
      name: i.authorName || i.publisherName,
    },
    publisher: {
      "@type": "Organization",
      name: i.publisherName,
      ...(i.publisherLogo
        ? { logo: { "@type": "ImageObject", url: i.publisherLogo } }
        : {}),
    },
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": i.canonicalUrl,
    },
  };
}

/**
 * Build a schema.org WebSite object (site-wide, on `(site)/layout.tsx`).
 * Includes the `potentialAction` SearchAction so Google can show a sitelinks
 * search box (D-03). Target points at the /search route (Phase 6 SITE-09).
 */
export function websiteJsonLd(s: WebSiteJsonLdInput) {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    url: s.canonicalBaseUrl,
    name: s.siteTitle,
    description: s.siteDescription,
    potentialAction: {
      "@type": "SearchAction",
      target: `${s.canonicalBaseUrl}/search?q={search_term_string}`,
      "query-input": "required name=search_term_string",
    },
  };
}

/**
 * Build a schema.org Organization object (site-wide, on `(site)/layout.tsx`).
 * Feeds the Google brand knowledge-panel. `logo` uses the default OG image as
 * the brand logo (D-11 — operator sets via the settings/seo page in Plan 03).
 */
export function organizationJsonLd(s: OrganizationJsonLdInput) {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: s.siteTitle,
    url: s.canonicalBaseUrl,
    logo: s.defaultOgImage,
  };
}
