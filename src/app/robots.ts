// src/app/robots.ts
// [CITED: 05-02-PLAN.md Task 1 <action> — userAgent '*', allow '/', disallow list, sitemap pointer]
// [CITED: 05-RESEARCH.md Pattern 3 (L484-503) — verified MetadataRoute.Robots body]
// [CITED: 05-CONTEXT.md D-06 — disallow /preview/, /dashboard/, auth routes]
//
// Special Route Handler — cached by default. canonicalBaseUrl comes from
// getSeoSettings() (Pitfall 7 — single source, never read process.env directly).
// The publish action's existing revalidation block (D-13) + Plan 03's
// saveSeoSettings revalidatePath("/robots.txt") keep this fresh.

import type { MetadataRoute } from "next";
import { getSeoSettings } from "@/lib/seo/settings";

/**
 * The site robots.txt rules (D-06).
 *
 * - Allow everything under "/" by default.
 * - Disallow draft-preview tokens (/preview/ — must NEVER be crawled),
 *   the dashboard (/dashboard/ — admin-only), and the auth pages
 *   (no SEO value, noindex anyway).
 * - Sitemap pointer at {canonicalBaseUrl}/sitemap.xml.
 */
export default async function robots(): Promise<MetadataRoute.Robots> {
  const s = await getSeoSettings();
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/preview/", "/dashboard/", "/signin", "/signup", "/forgot-password"],
    },
    sitemap: `${s.canonicalBaseUrl}/sitemap.xml`,
  };
}
