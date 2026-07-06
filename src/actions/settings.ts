// src/actions/settings.ts
// [CITED: src/actions/users.ts — the established Server Action template (PATTERNS.md row)]
// [CITED: 03-CONTEXT.md D-14 — the READ path for site.timezone (settings key-value table)]
// [CITED: 03-03 seed.ts — seedStorageSettings populates storage.active_provider +
//  site.timezone + site.feature_image_default into the settings table]
// [CITED: 05-CONTEXT.md D-11 — admin-only settings/seo page; saveSeoSettings writes 5 keys]
// [CITED: 05-RESEARCH.md Pitfall 6 (L746-750) — revalidateTag('seo-settings','max') 2-arg form]
// [CITED: src/actions/storage-settings.ts L84-97 + L111-147 — upsertSetting + requireRole('admin') FIRST pattern]
//
// Thin Server Action for reading the settings key-value table. This is the D-14 read
// path for site.timezone (consumed by SchedulePicker) AND the Phase-4 DASH-09
// admin-configurability surface (the Storage Settings UI will read/write the same table).
//
// Phase 5 D-11 adds saveSeoSettings — the admin-only write surface for the five
// site-wide SEO defaults (site.title, site.description, seo.default_og_image,
// site.canonical_base_url, seo.twitter_handle). Mirrors the proven Storage Settings
// action pattern: requireRole('admin') FIRST, then Zod parse, then upsert + revalidate.
//
// Server-only — top directive mandatory for Server Actions.
"use server";
import { revalidatePath, revalidateTag } from "next/cache";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { requireRole } from "@/lib/permissions";
import { log } from "@/lib/log";

/**
 * getSetting — read a single key from the settings key-value table.
 *
 * @param key The settings key (e.g. "site.timezone", "storage.active_provider").
 * @returns The stored value, or null if the key does not exist.
 */
export async function getSetting(key: string): Promise<string | null> {
  const [row] = await db
    .select()
    .from(schema.settings)
    .where(eq(schema.settings.key, key))
    .limit(1);
  return row?.value ?? null;
}

// === Phase 5 D-11: site-wide SEO settings (admin-only save surface) ============
//
// The five settings keys that feed the getSeoSettings() snapshot (Plan 01's
// src/lib/seo/settings.ts — cached via 'use cache' + cacheTag('seo-settings')).
// saveSeoSettings writes these keys; the revalidateTag('seo-settings','max') call
// at the end invalidates the cached snapshot so the new values are visible without
// a container restart (Pitfall 6 — without the tag, changes are invisible until restart).
const SEO_KEYS = {
  siteTitle: "site.title",
  siteDescription: "site.description",
  defaultOgImage: "seo.default_og_image",
  canonicalBaseUrl: "site.canonical_base_url",
  twitterHandle: "seo.twitter_handle",
} as const;

/**
 * seoSettingsSchema — the Zod schema for the settings/seo dashboard form.
 * Shared client+server per CLAUDE.md (D-10). The client form uses this via
 * zodResolver; the Server Action calls .parse. siteTitle + canonicalBaseUrl are
 * required (the site MUST have a title + a canonical base for metadataBase); the
 * other three are optional (empty string = "use the auto-derive fallback").
 */
export const seoSettingsSchema = z.object({
  siteTitle: z.string().min(1, "Site title is required").max(255),
  siteDescription: z.string().max(500).optional(),
  defaultOgImage: z.string().url().optional().or(z.literal("")),
  canonicalBaseUrl: z.string().url("Canonical base URL must be a valid URL"),
  twitterHandle: z.string().max(50).optional(),
});

export type SeoSettingsInput = z.input<typeof seoSettingsSchema>;

/**
 * upsertSetting — write-or-insert a single settings row by key. Mirrors the
 * storage-settings.ts helper verbatim (D-08 idempotent pattern). Drizzle
 * node-postgres returns rowcount on update; 0 = no row matched → fall back to
 * insert with onConflictDoNothing so re-runs are safe (matches seed.ts pattern).
 */
async function upsertSetting(key: string, value: string): Promise<void> {
  const updated = await db
    .update(schema.settings)
    .set({ value, updatedAt: new Date() })
    .where(eq(schema.settings.key, key));
  if (!updated || (Array.isArray(updated) && updated.length === 0)) {
    await db
      .insert(schema.settings)
      .values({ key, value })
      .onConflictDoNothing();
  }
}

/**
 * saveSeoSettings (D-11) — admin-only. Persists the five site-wide SEO defaults.
 *
 * Security ordering (T-05-01 — Pitfall #1 non-negotiable): requireRole('admin')
 * is the FIRST line, BEFORE any DB write or Zod parse. A non-admin caller throws
 * FORBIDDEN immediately. Proven by the MUST_NOT_BE_REACHED test in
 * src/actions/__tests__/seo-settings.test.ts.
 *
 * After the write, the revalidation block refreshes every route that reads the
 * cached getSeoSettings() snapshot (Pitfall 6):
 *   - revalidateTag('seo-settings', 'max') — invalidates the cacheTag on
 *     getSeoSettings (2-arg form — single-arg is DEPRECATED in Next.js 16.2.9).
 *   - revalidatePath('/', 'layout') — refreshes the (site)/layout.tsx shell
 *     (site-wide metadataBase + title template + JSON-LD).
 *   - revalidatePath('/sitemap.xml') + '/robots.txt' + '/rss.xml' — the three
 *     SEO routes from Plan 02 that read canonicalBaseUrl via getSeoSettings.
 *
 * @throws Error("FORBIDDEN") when the caller is not admin (requireRole FIRST).
 */
export async function saveSeoSettings(
  input: SeoSettingsInput | unknown,
): Promise<{ ok: true }> {
  // 1. Admin re-check FIRST (D-11 — explicit admin). Before any parse or DB write.
  //    Proven by seo-settings.test.ts MUST_NOT_BE_REACHED pattern (T-05-01).
  await requireRole("admin");

  // 2. Validate via the shared Zod schema (Pitfall #1 — never trust the client shape).
  const data = seoSettingsSchema.parse(input);

  // 3. Persist the five keys. Empty strings are valid for the optional fields
  //    (siteDescription, defaultOgImage, twitterHandle) — empty means "use the
  //    auto-derive fallback". siteTitle + canonicalBaseUrl are required (Zod enforces).
  await Promise.all([
    upsertSetting(SEO_KEYS.siteTitle, data.siteTitle),
    upsertSetting(SEO_KEYS.siteDescription, data.siteDescription ?? ""),
    upsertSetting(SEO_KEYS.defaultOgImage, data.defaultOgImage ?? ""),
    upsertSetting(SEO_KEYS.canonicalBaseUrl, data.canonicalBaseUrl),
    upsertSetting(SEO_KEYS.twitterHandle, data.twitterHandle ?? ""),
  ]);

  // 4. Revalidation block (Pitfall 6 — without these, settings changes are invisible
  //    until container restart). 2-arg revalidateTag is mandatory in Next.js 16.2.9.
  revalidateTag("seo-settings", "max");
  revalidatePath("/", "layout");
  revalidatePath("/sitemap.xml");
  revalidatePath("/robots.txt");
  revalidatePath("/rss.xml");

  log.info("seo settings saved", { siteTitle: data.siteTitle });
  return { ok: true };
}
