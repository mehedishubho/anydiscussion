// src/actions/newsletter-schema.ts
// [CITED: 260824-3l2-CONTEXT.md D-01/D-05 (subscribe schema) + D-02 (settings schema)]
// [CITED: src/actions/contact-schema.ts — the established pure-schema sibling pattern
//  (email style + honeypot field name + zodResolver re-export)]
// [CITED: src/actions/seo-settings-schema.ts — the settings-schema split precedent]
// [CITED: CLAUDE.md "Code conventions" — Zod schemas live alongside their feature;
//  same schema reused for RHF client parsing + Server Action input parsing]
//
// Pure Zod v4 schema module for the newsletter feature. Contains BOTH schemas so
// this file is touched once (the subscribe schema is consumed by Wave 3's island
// + action; the settings schema by the dashboard form + save action).
//
// SEPARATED from src/actions/newsletter.ts (which has "use server") because a
// "use server" file can ONLY export async functions — exporting a Zod object
// or a type from it causes a Next.js build error. Mirrors the established
// contact.ts / contact-schema.ts and settings.ts / seo-settings-schema.ts splits.
//
// NO "use server" / "use client" directive — pure schema module imported by:
//   - src/actions/newsletter.ts (the Server Actions; .parse)
//   - src/app/(admin)/dashboard/settings/newsletter/NewsletterSettingsForm.tsx
//     (the dashboard form; zodResolver + newsletterSettingsSchema)
//   - src/components/site/NewsletterForm.tsx (the public island; SubscribeState type)

import { z } from "zod";

/**
 * newsletterSettingsSchema — the four footer-newsletter configuration keys (D-02).
 *
 * `enabled` is required (the toggle is the whole point of the page). The three
 * text fields are optional-with-default-"" — an EMPTY stored value means "fall
 * back to the built-in default" at read time (readNewsletterSettings), matching
 * the seoSettingsSchema empty-string convention.
 */
export const newsletterSettingsSchema = z.object({
  enabled: z.boolean(),
  heading: z.string().max(100).optional().default(""),
  description: z.string().max(500).optional().default(""),
  successMessage: z.string().max(200).optional().default(""),
});

export type NewsletterSettingsInput = z.input<typeof newsletterSettingsSchema>;

/**
 * subscribeSchema — the public footer subscribe form payload (D-01/D-05).
 *
 * email: trim + lowercase NORMALIZATION lives here in Zod (no citext extension;
 * Better Auth itself lowercases emails — same convention). Max 255 matches the
 * text column + contact-schema precedent. The email validation style mirrors
 * contact-schema.ts (`z.string().email("A valid email is required")`).
 *
 * website: the HONEYPOT (D-05, contact-schema precedent) — optional in the
 * schema so real users (who never see the field) pass; the Server Action
 * silently succeeds WITHOUT inserting when it is non-empty after trim.
 */
export const subscribeSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email("A valid email is required")
    .max(255),
  website: z.string().optional(), // honeypot — D-05
});

export type SubscribeInput = z.infer<typeof subscribeSchema>;

/**
 * SubscribeState — the useActionState payload for the public subscribe island
 * (Wave 3). Error states carry a SENTINEL message ("INVALID_EMAIL",
 * "RATE_LIMITED", "UNKNOWN") which the island maps to friendly copy — the
 * action payload stays constant; the configured success text comes from the
 * settings prop, not from the action.
 */
export type SubscribeState =
  | { status: "idle" }
  | { status: "success" }
  | { status: "error"; message: string };

// Re-export zodResolver so the dashboard form imports both the schema + the
// resolver from one module (the single-import-surface pattern; contact-schema
// precedent). The dashboard settings form uses RHF; the public island does not
// (FormData-based useActionState) — the re-export serves the former.
export { zodResolver } from "@hookform/resolvers/zod";
