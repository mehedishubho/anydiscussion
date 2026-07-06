// src/lib/seo/settings.ts
// [CITED: 05-CONTEXT.md D-04 — metadataBase/canonical base URL from settings + env fallback]
// [CITED: 05-CONTEXT.md D-11 — five site-wide SEO settings keys seeded at boot]
// [CITED: 05-RESEARCH.md Pattern 1 (L350-378) + Pitfall 1 (L707-711) + Pitfall 6 (L746-750)]
// [CITED: 05-PATTERNS.md — GREENFIELD: first 'use cache' + cacheTag site in the repo]
//
// The single cached SEO settings snapshot. Consumed by every metadata-emitting
// route ((site)/layout.tsx generateMetadata, (site)/page.tsx generateMetadata,
// (site)/preview/[token]/page.tsx generateMetadata, and transitively by Plan 02's
// sitemap.ts / robots.ts / rss.xml/route.ts).
//
// UNDER cacheComponents:true (next.config.ts L5), generateMetadata that reads from
// Drizzle on an otherwise-prerenderable route raises a build error unless the data
// is explicitly cached (05-RESEARCH.md Pitfall 1). The 'use cache' directive +
// cacheTag('seo-settings') is the verified resolution. Plan 03's saveSeoSettings
// action calls revalidateTag('seo-settings', 'max') (2-arg form — Pitfall 6) to
// invalidate this cache when the admin edits the settings/seo page — without the
// tag, settings changes would be invisible until container restart.
//
// Server-only — NO "use client" directive.

import { cacheTag } from "next/cache";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import type { SeoSettings } from "@/lib/seo/metadata";

/** The five settings keys that feed the SEO snapshot (D-11). */
const SEO_SETTING_KEYS = {
  siteTitle: "site.title",
  siteDescription: "site.description",
  defaultOgImage: "seo.default_og_image",
  canonicalBaseUrl: "site.canonical_base_url",
  twitterHandle: "seo.twitter_handle",
} as const;

/**
 * Read a single settings row by key (null when the row is absent or value is empty).
 * Mirrors the readSetting helper shape from src/actions/storage-settings.ts L69-76.
 */
async function readSetting(key: string): Promise<string | null> {
  const [row] = await db
    .select()
    .from(schema.settings)
    .where(eq(schema.settings.key, key))
    .limit(1);
  const value = row?.value;
  return value && value.trim() !== "" ? value : null;
}

/**
 * The cached SEO settings snapshot. This is the SINGLE source for metadataBase,
 * the canonical base URL, default OG image, site title/description, and twitter
 * handle across every public-facing route. No consumer reads
 * NEXT_PUBLIC_SITE_URL directly — getSeoSettings is the only place the env is
 * consulted (Pitfall 7 — prevents env-vs-settings canonical drift).
 *
 * The env fallback fires only when the settings row is absent or empty (dev-time
 * before the seed runs, or a fresh DB).
 */
export async function getSeoSettings(): Promise<SeoSettings> {
  "use cache";
  cacheTag("seo-settings");

  const [siteTitle, siteDescription, defaultOgImage, canonicalBaseUrl, twitterHandle] =
    await Promise.all([
      readSetting(SEO_SETTING_KEYS.siteTitle),
      readSetting(SEO_SETTING_KEYS.siteDescription),
      readSetting(SEO_SETTING_KEYS.defaultOgImage),
      readSetting(SEO_SETTING_KEYS.canonicalBaseUrl),
      readSetting(SEO_SETTING_KEYS.twitterHandle),
    ]);

  return {
    siteTitle: siteTitle ?? "Any Discussion",
    siteDescription: siteDescription ?? "",
    defaultOgImage: defaultOgImage ?? "",
    canonicalBaseUrl:
      canonicalBaseUrl ??
      process.env.NEXT_PUBLIC_SITE_URL ??
      "http://localhost:3000",
    twitterHandle: twitterHandle,
  };
}
