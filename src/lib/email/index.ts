// src/lib/email/index.ts
// [CITED: resend npm README — verified via `npm view resend readme` in research;
//  RESEARCH.md Pattern 7 lines 650-683 — thin Resend wrapper; D-03]
// [CITED: .claude/CLAUDE.md — Resend 6.16.0 verified; SDK shape new Resend(key) + resend.emails.send({...})]
//
// D-03 — thin helper, NO provider abstraction. One module, hardcoded to Resend.
// Swapping to Brevo/SES = editing this one file (the only place that imports `resend`).
// Mirrors the src/lib/r2 thin-wrapper-around-external-SDK pattern + env-with-dev-default
// (PATTERNS.md "src/lib/email/index.ts" section lines 217-249).
//
// Server-only — NO "use client" directive. The Resend key MUST NEVER reach a client
// bundle (ASVS V8 / T-02-06). Real secrets live in gitignored .env.local.
import { Resend } from "resend";

// Singleton Resend client — mirrors src/lib/r2's `s3Client` pattern.
// RESEND_API_KEY may be empty in dev until the Task 3 manual round-trip; the
// Resend SDK throws in its constructor when the key is falsy ("Missing API key"),
// which breaks Next.js build-time page data collection. We pass a dev placeholder
// so construction never throws — the real send call fails at runtime when the key
// is invalid, and lib/email swallows that failure silently (R8 — see below).
// [CITED: resend/dist/index.mjs line 1134 — constructor throws on falsy key]
// `||` (not `??`) so an empty-string env var (the dev .env.local default until
// Task 3) also falls back — mirrors src/lib/r2's `S3_ENDPOINT || "..."` idiom.
const resend = new Resend(process.env.RESEND_API_KEY || "dev-placeholder");

/**
 * Send a transactional email (verification / password reset).
 *
 * Fire-and-forget on error to avoid timing attacks (R8): callers in Better Auth
 * hooks invoke this via `void sendEmail(...)` and MUST NOT await it. This helper
 * returns silently on send failure (logs, does NOT throw) so a slow/failed send
 * cannot leak timing or whether an email was dispatched.
 *
 * @param params.to      Recipient email address.
 * @param params.subject Email subject line.
 * @param params.text    Plain-text body (required — the verification/reset URL lives here).
 * @param params.html    Optional HTML body.
 * @returns The Resend send result on success, or `undefined` on error (never throws).
 */
export async function sendEmail(params: {
  to: string;
  subject: string;
  text: string;
  html?: string;
}) {
  const { data, error } = await resend.emails.send({
    // Dev default: Resend's shared sandbox sender (delivers ONLY to the account
    // owner's inbox). Prod sets EMAIL_FROM to a verified from-domain. Mirrors the
    // r2 `S3_ENDPOINT || "http://localhost:9000"` dev-default pattern.
    from: process.env.EMAIL_FROM ?? "onboarding@resend.dev",
    to: params.to,
    subject: params.subject,
    text: params.text,
    html: params.html,
  });
  if (error) {
    // Do NOT throw — Better Auth hooks are fire-and-forget (R8). Throwing would
    // leak send-failure timing to a sign-up/reset caller (timing attack surface).
    // Structured console.error mirrors the src/lib/log idiom for server-side logs.
    console.error(
      JSON.stringify({
        level: "error",
        msg: "email send failed",
        to: params.to,
        subject: params.subject,
        error,
      }),
    );
    return;
  }
  return data;
}
