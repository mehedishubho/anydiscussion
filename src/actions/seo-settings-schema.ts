// src/actions/seo-settings-schema.ts
// [CITED: 05-CONTEXT.md D-10 — shared Zod schema, reused client+server]
// [CITED: src/actions/storage-settings-schema.ts — the established pure-schema module pattern]
// [CITED: CLAUDE.md "Code conventions" — Zod schemas live alongside their feature]
//
// Pure Zod v4 schema module for the SEO Settings form. SHARED between the
// dashboard form (react-hook-form via zodResolver) and the Server Action
// (seoSettingsSchema.parse) — same contract on both sides per CLAUDE.md.
//
// SEPARATED from src/actions/settings.ts (which has "use server") because a
// "use server" file can ONLY export async functions — exporting a Zod object
// or a type from it causes a Next.js build error ("A 'use server' file can
// only export async functions, found object"). Mirrors the storage-settings →
// storage-settings-schema split.
//
// NO "use server" / "use client" directive — pure schema module imported by both.
import { z } from "zod";

/**
 * seoSettingsSchema — the five site-wide SEO defaults (D-11).
 *
 * siteTitle + canonicalBaseUrl are required (the site MUST have a title + a
 * canonical base for metadataBase). The other three are optional (empty string
 * = "use the auto-derive fallback" in getSeoSettings).
 */
export const seoSettingsSchema = z.object({
  siteTitle: z.string().min(1, "Site title is required").max(255),
  siteDescription: z.string().max(500).optional(),
  defaultOgImage: z.string().url().optional().or(z.literal("")),
  canonicalBaseUrl: z.string().url("Canonical base URL must be a valid URL"),
  twitterHandle: z.string().max(50).optional(),
});

export type SeoSettingsInput = z.input<typeof seoSettingsSchema>;
