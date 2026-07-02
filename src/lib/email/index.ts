// src/lib/email/index.ts
// [CITED: RESEARCH.md Pattern 7 lines 650-683 — thin Resend wrapper; D-03]
// STUB (Plan 02-01 Task 1b): no-op sendEmail so the Better Auth instance compiles.
// Plan 02-03 replaces this with the real Resend-backed helper.
//
// Server-only — NO "use client" directive. Resend key must never reach client (ASVS V8).

/**
 * Send a transactional email (verification / password reset).
 * Fire-and-forget on error to avoid timing attacks (R8).
 *
 * @param params.to      Recipient email address.
 * @param params.subject Email subject line.
 * @param params.text    Plain-text body.
 * @param params.html    Optional HTML body.
 */
export async function sendEmail(_params: {
  to: string;
  subject: string;
  text: string;
  html?: string;
}): Promise<void> {
  // STUB — Plan 02-03 wires this to the Resend SDK (new Resend(process.env.RESEND_API_KEY)).
  // For now, log so local dev can see the verification/reset URLs during the auth flows.
  if (process.env.NODE_ENV !== "production") {
    console.info(JSON.stringify({ level: "info", msg: "[email stub]", to: _params.to, subject: _params.subject, text: _params.text }));
  }
  return;
}
