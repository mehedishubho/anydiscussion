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

// ============================================================================
// Plan 06-01 Task 2 — Person + BreadcrumbList builders
// [CITED: 06-01-PLAN.md — closes Phase 5 D-03 deferrals for author/taxonomy archives]
// ============================================================================

/** Input for the author-page Person builder (SITE-06 / D-11). */
export interface PersonJsonLdInput {
  name: string;
  /** Absolute URL of the author page (e.g. https://anydiscussion.com/author/mehedi). */
  url: string;
  jobTitle?: string;
  description?: string;
}

/** Input item for the BreadcrumbList builder (each crumb). */
export interface BreadcrumbItem {
  name: string;
  url: string;
}

/** Input for the taxonomy-archive BreadcrumbList builder (SITE-04/05 / D-14). */
export interface BreadcrumbListJsonLdInput {
  /** Ordered breadcrumbs from Home to the current page. */
  items: BreadcrumbItem[];
}

/**
 * Build a schema.org Person object for /author/[username] (SITE-06 / D-03).
 *
 * Closes the Phase 5 D-03 deferral for author pages. jobTitle + description
 * are optional (the author may not have set them in their profile).
 */
export function personJsonLd(i: PersonJsonLdInput) {
  return {
    "@context": "https://schema.org",
    "@type": "Person",
    name: i.name,
    url: i.url,
    ...(i.jobTitle ? { jobTitle: i.jobTitle } : {}),
    ...(i.description ? { description: i.description } : {}),
  };
}

/**
 * Build a schema.org BreadcrumbList for /category/[slug] and /tag/[slug] (SITE-04/05 / D-14).
 *
 * Closes the Phase 5 D-03 deferral for taxonomy archives. itemListElement is
 * ordered Home › Category/Tag with sequential positions (1-based).
 */
export function breadcrumbListJsonLd(i: BreadcrumbListJsonLdInput) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: i.items.map((item, idx) => ({
      "@type": "ListItem",
      position: idx + 1,
      name: item.name,
      item: item.url,
    })),
  };
}
