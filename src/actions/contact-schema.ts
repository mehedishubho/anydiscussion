// src/actions/contact-schema.ts
// [CITED: 06-05-PLAN.md Task 1 — pure Zod schema + zodResolver re-export]
// [CITED: src/actions/seo-settings-schema.ts — the established pure-schema sibling pattern]
// [CITED: 06-PATTERNS.md L727-734 — Server Action shape; "use server" files can ONLY
//  export async functions, so the schema + type live in this sibling module]
// [CITED: CLAUDE.md "Code conventions" — Zod schemas live alongside their feature;
//  same schema reused for RHF client parsing + Server Action input parsing]
//
// Pure Zod v4 schema module for the Contact form (SITE-10). SHARED between the
// public ContactForm (react-hook-form via zodResolver) and the submitContact
// Server Action (contactSchema.parse) — same contract on both sides per CLAUDE.md.
//
// SEPARATED from src/actions/contact.ts (which has "use server") because a
// "use server" file can ONLY export async functions — exporting a Zod object
// or a type from it causes a Next.js build error ("A 'use server' file can
// only export async functions, found object"). Mirrors the established split
// between storage-settings.ts / storage-settings-schema.ts and
// settings.ts / seo-settings-schema.ts.
//
// The "website" field is the HONEYPOT (D-07): a visually-hidden input that real
// users never fill but bots auto-fill. The Server Action silently succeeds
// WITHOUT sending the email when this field is non-empty (the bot thinks it
// worked). The field name "website" is a CONTEXT.md discretion item — bots
// auto-fill fields named "website"/"url" most reliably.
//
// NO "use server" / "use client" directive — pure schema module imported by:
//   - src/actions/contact.ts (the Server Action; uses contactSchema.parse)
//   - src/components/site/ContactForm.tsx (the client form; uses zodResolver +
//     contactSchema for RHF validation)
// Both pull from the same source — a single contract for client + server.

import { z } from "zod";

/**
 * contactSchema — the four visible Contact fields + the honeypot.
 *
 * name + email + message are required (min 1 / email format / min 1). subject
 * is optional (the email subject line falls back to the sender's name in the
 * action). website is the honeypot — optional in the schema so a real user
 * (who leaves it blank) passes validation; the action rejects a filled value.
 */
export const contactSchema = z.object({
  name: z.string().min(1, "Name is required").max(255),
  email: z.string().email("A valid email is required").max(255),
  subject: z.string().max(255).optional(),
  message: z.string().min(1, "Message is required").max(10_000),
  website: z.string().optional(), // honeypot — D-07
});

export type ContactInput = z.infer<typeof contactSchema>;

// Re-export zodResolver so the client form imports both the schema + the
// resolver from one module (the established single-import-surface pattern).
// `@hookform/resolvers/zod` is a pure adapter (wraps a Zod schema parse into
// the RHF Resolver shape); it has no client-only side effects at module load
// and is safe to re-export from this shared module.
export { zodResolver } from "@hookform/resolvers/zod";
