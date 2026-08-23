// src/lib/queries/social-links.ts
// [CITED: 260823-79v-PLAN.md Task 1 — readSocialLinks moved verbatim from SiteFooter.tsx into a shared cached-query module]
// [CITED: 260823-79v-PLAN.md locked decision 4 — extract, do not duplicate; footer rendered output stays byte-identical]
// [CITED: 260823-6je-PLAN.md locked decision 3 — social circles render ONLY for configured settings keys, no dead links]
//
// Public read query for the optional social-link settings rows. Shared module
// with TWO consumers: the SiteFooter brand column and SiteHeader row 2's
// social circles (260823-79v decision 2). Values are admin-configured via
// saveSeoSettings; the configured-only picking (trim, order, labels) lives in
// the pure helper pickSocialLinks (@/lib/footer-links).
//
// Server-only — no client directives anywhere in this module.

import { cacheTag } from "next/cache";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";

/** Settings keys for optional social links (D-10). */
const SOCIAL_KEYS = [
  "footer.social_twitter",
  "footer.social_facebook",
  "footer.social_linkedin",
] as const;

/**
 * Raw social-link settings snapshot: each configured URL or null when the
 * settings row is absent.
 */
export interface SocialLinkSettings {
  twitter: string | null;
  facebook: string | null;
  linkedin: string | null;
}

/**
 * readSocialLinks — reads the optional social-link settings rows (one
 * round-trip per key in a single Promise.all). Returns each key's raw value
 * (null when absent); pass the result through pickSocialLinks for the
 * configured-only picking.
 *
 * 'use cache' + cacheTag('seo-settings') REQUIRED under cacheComponents:true:
 * BOTH consumers render inside the (site) layout, whose component body is NOT
 * cached (only its generateMetadata is). Without a cache boundary here, every
 * (site) route hits an uncached DB read at prerender -> "Uncached data outside
 * <Suspense>" build error. The seo-settings tag lets saveSeoSettings
 * invalidate social-link edits too (2-arg revalidateTag in
 * src/actions/settings.ts).
 */
export async function readSocialLinks(): Promise<SocialLinkSettings> {
  "use cache";
  cacheTag("seo-settings");
  // Single fetch of all three keys — one round-trip per key in parallel.
  const all = await Promise.all(
    SOCIAL_KEYS.map(async (k) => {
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
    twitter: map[SOCIAL_KEYS[0]] ?? null,
    facebook: map[SOCIAL_KEYS[1]] ?? null,
    linkedin: map[SOCIAL_KEYS[2]] ?? null,
  };
}
