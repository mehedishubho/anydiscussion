// src/lib/seo/metadata.ts
// [CITED: 05-CONTEXT.md D-02 — metadata builders; D-04 canonical override; D-09 OG fallback chain]
// [CITED: 05-RESEARCH.md Pattern 1 (L344-424) — verified buildPostMetadata body + Metadata type shapes]
// [CITED: 05-PATTERNS.md — src/lib/excerpt/index.ts analog (pure-lib, no DB access)]
//
// PURE builders: take already-fetched DB rows + a settings snapshot IN, return typed
// Next.js `Metadata` shapes OUT. No DB access, no fetch, no side effects — trivially
// unit-testable with the shared fixtures (05-RESEARCH.md "Primary recommendation" L126-127).
//
// Phase 6's per-route `generateMetadata` calls these as one-liners; the DB fetch +
// 'use cache' directive lives in the route / lib/seo/settings.ts, not here.
//
// Server-only — NO "use client" directive.

import type { Metadata } from "next";

// --- Input interfaces (mirror RESEARCH Pattern 1 L384-389 shapes) ---

/** Fields from `posts` the post builder reads (subset — not the full Drizzle row). */
export interface PostLike {
  id: number;
  title: string;
  slug: string;
  excerpt: string | null;
  featureImage: string | null;
  publishedAt: Date | null;
  updatedAt: Date;
  authorName: string | null;
}

/** Fields from `post_seo` the post builder reads (null when no SEO row exists). */
export interface PostSeoLike {
  metaTitle: string | null;
  metaDescription: string | null;
  ogImage: string | null;
  canonicalUrl: string | null;
}

/** Fields from `pages` the page builder reads (pages carry their OWN SEO columns — D-06). */
export interface PageLike {
  slug: string;
  title: string;
  metaTitle: string | null;
  metaDescription: string | null;
  canonical: string | null;
  updatedAt: Date;
}

/** Cached SEO settings snapshot (produced by lib/seo/settings.ts getSeoSettings). */
export interface SeoSettings {
  canonicalBaseUrl: string;
  siteTitle: string;
  siteDescription: string;
  defaultOgImage: string;
  twitterHandle: string | null;
}

/** Input for the archive builder (category/tag/author/search — consumed by Phase 6). */
export interface ArchiveMetadataInput {
  /** Display name of the archive (e.g. "Technology" category, "John Doe" author). */
  name: string;
  /** The archive type — appears in the title as "Posts in {name} | {site}". */
  kind: "category" | "tag" | "author" | "search";
  /** Relative path of the archive (e.g. "/category/technology"). */
  path: string;
  /** Optional description for the archive (category.description, etc.). */
  description?: string | null;
}

// --- Builders ---

/**
 * Build `<title>` / meta description / canonical / OG / Twitter metadata for a
 * single published post.
 *
 * - Title: `postSeo.metaTitle` overrides `post.title` (D-08 manual-override).
 * - Description: `postSeo.metaDescription` → `post.excerpt` → `siteDescription` fallback.
 * - Canonical (D-04): `postSeo.canonicalUrl` overrides; else derives `/{post.slug}`
 *   (metadataBase resolves to absolute).
 * - OG image (D-09 fallback chain): `postSeo.ogImage` → `post.featureImage` →
 *   `settings.defaultOgImage`.
 * - openGraph.type is "article" with publishedTime/modifiedTime/authors.
 * - twitter.card is "summary_large_image" when an image resolves, else "summary".
 */
export function buildPostMetadata(
  post: PostLike,
  seo: PostSeoLike | null,
  s: SeoSettings,
): Metadata {
  const title = seo?.metaTitle || post.title;
  const description =
    seo?.metaDescription || post.excerpt || s.siteDescription;
  // D-04 — canonical override: respect post_seo.canonicalUrl else derive from slug.
  const canonical = seo?.canonicalUrl || `/${post.slug}`;
  // D-09 — OG fallback chain: post_seo.ogImage → posts.featureImage → site default.
  const ogImage = seo?.ogImage || post.featureImage || s.defaultOgImage;
  const hasImage = Boolean(ogImage);

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      type: "article",
      title,
      description,
      url: canonical,
      images: [{ url: ogImage }],
      publishedTime: post.publishedAt?.toISOString(),
      modifiedTime: post.updatedAt.toISOString(),
      authors: post.authorName ? [post.authorName] : [],
    },
    twitter: {
      card: hasImage ? "summary_large_image" : "summary",
      title,
      description,
      ...(hasImage ? { images: [ogImage] } : {}),
      ...(s.twitterHandle ? { site: s.twitterHandle } : {}),
    },
  };
}

/**
 * Build metadata for a managed page (pages carry their OWN SEO columns — D-06).
 * Same override-else-derive logic as the post builder.
 */
export function buildPageMetadata(page: PageLike, s: SeoSettings): Metadata {
  const title = page.metaTitle || page.title;
  const description = page.metaDescription || s.siteDescription;
  const canonical = page.canonical || `/${page.slug}`;

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      type: "website",
      title,
      description,
      url: canonical,
    },
  };
}

/**
 * Build metadata for an archive route (category/tag/author/search — Phase 6).
 * Thin shape: title/description/canonical only. Phase 6 extends rather than rewrites.
 */
export function buildArchiveMetadata(
  opts: ArchiveMetadataInput,
  s: SeoSettings,
): Metadata {
  const title =
    opts.kind === "search"
      ? `Search: ${opts.name}`
      : `${cap(opts.kind)}: ${opts.name}`;
  const description =
    opts.description || `${cap(opts.kind)} archive for ${opts.name}.`;

  return {
    title,
    description,
    alternates: { canonical: opts.path },
    openGraph: {
      type: "website",
      title,
      description,
      url: opts.path,
    },
  };
}

/**
 * Build site-wide metadata (home route + (site)/layout.tsx base).
 * Returns `metadataBase` as a URL, a title `{default, template}` pair, and
 * `openGraph.type "website"`. The layout caller augments with twitter defaults.
 */
export function buildSiteMetadata(s: SeoSettings): Metadata {
  return {
    metadataBase: new URL(s.canonicalBaseUrl),
    title: {
      default: s.siteTitle,
      template: `%s | ${s.siteTitle}`,
    },
    description: s.siteDescription,
    openGraph: {
      type: "website",
      siteName: s.siteTitle,
      ...(s.defaultOgImage ? { images: [{ url: s.defaultOgImage }] } : {}),
    },
    twitter: {
      card: s.defaultOgImage ? "summary_large_image" : "summary",
      ...(s.twitterHandle ? { site: s.twitterHandle } : {}),
    },
  };
}

/** Capitalize the first letter (helper for archive titles). */
function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
