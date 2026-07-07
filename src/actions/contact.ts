// src/actions/contact.ts
// [CITED: 06-05-PLAN.md Task 1 — Server Action: parse + honeypot + rate-limit + sendEmail]
// [CITED: src/actions/pages.ts L23-29 — the "use server" + Zod parse pattern,
//  adapted by DROPPING requireCan since contact is unauthenticated]
// [CITED: src/lib/email/index.ts L40-72 — sendEmail signature; fire-and-forget; never throws (R8)]
// [CITED: src/lib/rate-limit/index.ts — tryConsume(ip, limit, windowMs) from Plan 06-01]
// [CITED: 06-CONTEXT.md D-07 — reuse lib/email; honeypot + in-memory per-IP rate-limit]
// [CITED: 06-CONTEXT.md D-08 — email-only, NO DB storage]
// [CITED: 06-RESEARCH.md Pitfall 7 (L703-708) — do NOT add 'use cache' to the contact
//  action; Server Actions are mutations, never cached (cached → only first submission
//  delivers, later ones silently no-op)]
// [CITED: 06-PATTERNS.md L373-426 — the suggested contact.ts shape]
//
// The Contact form Server Action (SITE-10). This is the ONLY mutating Server
// Action in the project WITHOUT a requireCan permission gate — contact is
// unauthenticated by design (D-07: published-content ethos; the only public
// write besides the view-count increment, and this one is email-only with no
// DB footprint). The honeypot + per-IP in-memory rate-limit are the controls.
//
// NO 'use cache' (Pitfall 7 — Server Actions are mutations, never cached).
// NO requireCan (the form is public — the only controls are honeypot + rate-limit).
// NO DB write (D-08 — fire the email and store nothing).

"use server";
import { headers } from "next/headers";
import { contactSchema } from "./contact-schema";
import { sendEmail } from "@/lib/email";
import { tryConsume } from "@/lib/rate-limit";
import { getSetting } from "@/actions/settings";

// Per-IP rate-limit profile (CONTEXT.md discretion item — D-07).
// 5 submissions per IP per hour. Generous enough for a real user who needs to
// retry; tight enough to blunt scripted abuse. Single-instance in-memory only
// (v1 — the Coolify deploy is a single replica; v2 swaps for Redis SCALE-01).
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour

// Fallback recipient when the admin has not yet set contact.recipient_email
// via the dashboard settings. The real address is admin-configurable so it can
// change without a redeploy.
const FALLBACK_RECIPIENT = "admin@anydiscussion.com";

/**
 * submitContact — parse the form input, run the honeypot + rate-limit gates,
 * then fire the email via lib/email (which NEVER throws — Phase 2 R8).
 *
 * Returns `{ ok: true }` on every user-facing success path:
 *   - Real submission → email sent.
 *   - Honeypot tripped (bot) → silently succeed WITHOUT sending (the bot
 *     thinks it worked; D-07).
 *
 * Throws on:
 *   - Invalid input (Zod parse failure) — the client form validates first, but
 *     the server re-validates per CLAUDE.md ("never trust the client shape").
 *   - Rate-limit exceeded → `Error("RATE_LIMITED")`. The client form maps this
 *     to a friendly "Too many messages — please try again later" message.
 *
 * @param input  shape matching {@link ContactInput} (parsed by contactSchema).
 * @returns      `{ ok: true }` on success (real or honeypot-tripped).
 */
export async function submitContact(
  input: unknown,
): Promise<{ ok: true }> {
  // 1. Validate via the shared Zod schema (Pitfall #1 — never trust the client
  //    shape; same schema reused on both sides per CLAUDE.md). Throws on invalid.
  const data = contactSchema.parse(input);

  // 2. Honeypot — silent succeed WITHOUT sending (D-07). Bots auto-fill hidden
  //    fields named "website"/"url"; a real user leaves it blank. Returning ok
  //    (instead of an error) makes the bot think the submission worked, so it
  //    doesn't retry with a different payload.
  if (data.website && data.website.trim() !== "") {
    return { ok: true };
  }

  // 3. Rate-limit — per-IP, in-memory (D-07; tryConsume from Plan 06-01).
  //    x-forwarded-for is the standard proxy header (Coolify's Caddy/Traefik
  //    sets it). Fall back to "unknown" when no header is present (local dev).
  const headerList = await headers();
  const forwardedFor = headerList.get("x-forwarded-for");
  const ip = forwardedFor?.split(",")[0]?.trim() || "unknown";
  if (!tryConsume(ip, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS)) {
    throw new Error("RATE_LIMITED");
  }

  // 4. Read recipient from settings (admin-configurable via the dashboard).
  //    Fall back to the dev default when unset. contact.recipient_email is
  //    seeded in Plan 06-01 (seedPublicFrontendSettings); an empty value there
  //    triggers the fallback here.
  const recipient =
    (await getSetting("contact.recipient_email")) || FALLBACK_RECIPIENT;

  // 5. Fire-and-forget email via the Phase-2 Resend wrapper (D-07).
  //    lib/email NEVER throws (R8) — on send failure it logs + returns undefined,
  //    so a downstream Resend outage does NOT propagate to the user. The user
  //    sees the success state; the admin inbox just doesn't get the message.
  //    This is the documented trade-off (D-08: email-only, no DB resilience).
  //    Structured fields → no email-header-injection surface (T-06-14): name/
  //    email/subject/message are passed as discrete Resend SDK params, never
  //    concatenated into a raw SMTP string; Zod already validated email format.
  await sendEmail({
    to: recipient,
    subject: `Contact: ${data.subject ?? data.name}`,
    text: `From: ${data.name} <${data.email}>\n\n${data.message}`,
  });

  return { ok: true };
}
