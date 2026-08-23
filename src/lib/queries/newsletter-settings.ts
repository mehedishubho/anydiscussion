// src/lib/queries/newsletter-settings.ts
// [CITED: 260824-3l2-CONTEXT.md D-02 — newsletter.enabled/.heading/.description/
//  .success_message settings keys with built-in defaults, absent rows = defaults]
// [CITED: src/lib/queries/social-links.ts — the multi-consumer cached-reader shape
//  this module mirrors line for line ("use cache" + cacheTag("seo-settings"))]
// [CITED: src/lib/seo/settings.ts — the defaults-without-seed pattern (getSeoSettings)]
//
// Public read query for the newsletter settings rows. Shared module with TWO
// consumers: the cached SiteFooter (visibility + texts for the newsletter
// column) and the dashboard settings page (initial form values). The
// seo-settings cache tag lets saveNewsletterSettings invalidate both consumers
// with its existing revalidateTag("seo-settings", "max") — zero new cache
// machinery (D-02: "matches the established settings-key + cached-footer
// architecture").
//
// NO seed migration — defaults-without-seed is the established getSeoSettings
// pattern: absent/empty rows fall back to the built-in defaults below.
//
// Server-only — no client directives anywhere in this module.

import { cacheTag } from "next/cache";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";

/** Settings keys for the footer newsletter column (D-02). */
const NEWSLETTER_KEYS = [
  "newsletter.enabled",
  "newsletter.heading",
  "newsletter.description",
  "newsletter.success_message",
] as const;

/**
 * Defaults-applied newsletter settings snapshot. All fields are NON-null —
 * the dashboard form consumes this directly (no null-coalescing at the edges).
 */
export interface NewsletterSettings {
  enabled: boolean;
  heading: string;
  description: string;
  successMessage: string;
}

/** Built-in defaults (D-02) — used when a row is absent or whitespace-empty. */
const DEFAULTS = {
  heading: "Newsletter",
  description: "Subscribe for the latest posts delivered straight to your inbox.",
  successMessage: "Thanks for subscribing!",
} as const;

/** Fall back to the default when the stored value is null or whitespace-empty. */
function withDefault(value: string | null, fallback: string): string {
  return value && value.trim() !== "" ? value : fallback;
}

/**
 * readNewsletterSettings — reads the four newsletter settings rows (one
 * round-trip per key in a single Promise.all) and applies the built-in
 * defaults. `enabled` defaults TRUE (absent = enabled per D-02): only the
 * exact stored string "false" disables the column — anything else (absent,
 * "true", garbage) keeps it on.
 *
 * 'use cache' + cacheTag('seo-settings') REQUIRED under cacheComponents:true:
 * the footer consumer renders inside the (site) layout, whose body is NOT
 * cached — without a cache boundary here, every (site) route hits an uncached
 * DB read at prerender -> "Uncached data outside <Suspense>" build error. The
 * footer's OWN boundary also carries the seo-settings tag, so the save
 * action's revalidateTag refreshes both the footer markup and this snapshot.
 */
export async function readNewsletterSettings(): Promise<NewsletterSettings> {
  "use cache";
  cacheTag("seo-settings");
  // Single fetch of all four keys — one round-trip per key in parallel.
  const all = await Promise.all(
    NEWSLETTER_KEYS.map(async (k) => {
      const [row] = await db
        .select()
        .from(schema.settings)
        .where(eq(schema.settings.key, k))
        .limit(1);
      return [k, row?.value ?? null] as const;
    }),
  );
  const map = Object.fromEntries(all);
  return {
    // Only the exact string "false" is false; absent/anything else is true (D-02).
    enabled: map["newsletter.enabled"] !== "false",
    heading: withDefault(map["newsletter.heading"], DEFAULTS.heading),
    description: withDefault(map["newsletter.description"], DEFAULTS.description),
    successMessage: withDefault(
      map["newsletter.success_message"],
      DEFAULTS.successMessage,
    ),
  };
}
