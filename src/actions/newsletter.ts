// src/actions/newsletter.ts
// [CITED: 260824-3l2-CONTEXT.md D-01/D-02/D-03/D-05/D-06 — the newsletter feature actions]
// [CITED: src/actions/settings.ts — saveSeoSettings: the admin write-action template
//  (requireRole('admin') FIRST, Zod parse, Promise.all upserts, revalidation block)]
// [CITED: src/actions/contact.ts — the public-unauthenticated-action template
//  (Wave 3's subscribeNewsletter: honeypot + per-IP rate limit, no permission gate)]
//
// The newsletter Server Actions. Wave 2 ships saveNewsletterSettings ONLY —
// subscribeNewsletter arrives in Wave 3 (public subscribe + rate limit),
// listSubscribers/countSubscribers/deleteSubscriber in Wave 4 (admin list
// hygiene surface).
//
// Security (260824-3l2 threat model T-3l2-02): requireRole("admin") is the
// FIRST line of every gated action here, BEFORE any Zod parse or DB write.
// The private upsertSetting helper is NEVER exported — every export of a
// "use server" module is a publicly invocable endpoint, and a generic
// upsertSetting(key, value) would let any unauthenticated caller write
// arbitrary settings keys. The helper is duplicated privately per the
// established convention (settings.ts / storage-settings.ts both do this).
//
// NO 'use cache' anywhere in this file — Server Actions are mutations, never
// cached (06-RESEARCH Pitfall 7: a cached Server Action silently no-ops after
// the first submission).
"use server";
import { revalidatePath, revalidateTag } from "next/cache";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { requireRole } from "@/lib/permissions";
import { log } from "@/lib/log";
import {
  newsletterSettingsSchema,
  type NewsletterSettingsInput,
} from "./newsletter-schema";

// === 260824-3l2 D-02: newsletter configuration (admin-only save surface) =======

// The four settings keys that feed the readNewsletterSettings() snapshot
// (src/lib/queries/newsletter-settings.ts — cached via 'use cache' +
// cacheTag('seo-settings')). saveNewsletterSettings writes these keys; the
// revalidateTag('seo-settings','max') call below invalidates BOTH that
// snapshot AND the footer's own cache boundary so new texts/visibility are
// visible without a rebuild.
const NEWSLETTER_KEYS = {
  enabled: "newsletter.enabled",
  heading: "newsletter.heading",
  description: "newsletter.description",
  successMessage: "newsletter.success_message",
} as const;

// newsletterSettingsSchema + NewsletterSettingsInput live in
// ./newsletter-schema (separate pure-schema module) because a "use server"
// file can ONLY export async functions. Mirrors the settings →
// seo-settings-schema split.

/**
 * upsertSetting — write-or-insert a single settings row by key. Duplicated
 * PRIVATELY from src/actions/settings.ts (the established per-file convention).
 * Drizzle node-postgres returns rowcount on update; 0 = no row matched → fall
 * back to insert with onConflictDoNothing so re-runs are safe.
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
 * saveNewsletterSettings (D-02) — admin-only. Persists the enable toggle plus
 * the three footer texts (empty string = "use the built-in default" at read
 * time).
 *
 * Security ordering (T-3l2-02 — non-negotiable): requireRole('admin') is the
 * FIRST line, BEFORE any parse or DB write. A non-admin caller throws
 * FORBIDDEN immediately. Proven by the MUST_NOT_BE_REACHED test in
 * src/actions/__tests__/newsletter.test.ts.
 *
 * Revalidation delta vs saveSeoSettings: ONLY revalidateTag('seo-settings',
 * 'max') + revalidatePath('/', 'layout') — no sitemap/robots/rss path
 * revalidations because no SEO route reads newsletter keys.
 *
 * @throws Error("FORBIDDEN") when the caller is not admin (requireRole FIRST).
 */
export async function saveNewsletterSettings(
  input: NewsletterSettingsInput | unknown,
): Promise<{ ok: true }> {
  // 1. Admin re-check FIRST (D-02). Before any parse or DB write.
  //    Proven by newsletter.test.ts MUST_NOT_BE_REACHED pattern (T-3l2-02).
  await requireRole("admin");

  // 2. Validate via the shared Zod schema (never trust the client shape).
  const data = newsletterSettingsSchema.parse(input);

  // 3. Persist the four keys. Empty strings are VALID for the three text
  //    fields — empty means "fall back to the built-in default" at read time.
  //    The boolean is stored as String(data.enabled) ("true"/"false") because
  //    settings.value is a text column (D-02).
  await Promise.all([
    upsertSetting(NEWSLETTER_KEYS.enabled, String(data.enabled)),
    upsertSetting(NEWSLETTER_KEYS.heading, data.heading ?? ""),
    upsertSetting(NEWSLETTER_KEYS.description, data.description ?? ""),
    upsertSetting(NEWSLETTER_KEYS.successMessage, data.successMessage ?? ""),
  ]);

  // 4. Revalidation: refresh every cached surface that reads newsletter
  //    settings (the footer's own seo-settings boundary + the
  //    readNewsletterSettings snapshot). 2-arg revalidateTag is mandatory in
  //    Next.js 16.2.x (single-arg is deprecated).
  revalidateTag("seo-settings", "max");
  revalidatePath("/", "layout");

  log.info("newsletter settings saved", { enabled: data.enabled });
  return { ok: true };
}
