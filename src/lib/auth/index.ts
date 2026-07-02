// src/lib/auth/index.ts
// [CITED: better-auth/docs/installation.mdx + admin.mdx + adapters/drizzle.mdx +
//  authentication/email-password.mdx — RESEARCH.md Pattern 1 lines 304-376]
// The single Better Auth instance. RBAC via the `admin` plugin (D-10 — no `access`
// plugin); Drizzle adapter bound to the existing `@/lib/db` pool (same connection,
// NOT a second pool). nextCookies() is the LAST plugin (R2 — Server Action cookies).
//
// Server-only — NO "use client" directive. Reads BETTER_AUTH_SECRET/URL from env
// (never hardcoded — ASVS V8). Real secrets live in gitignored .env.local.
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle"; // built-in 1.6.23 export
import { admin } from "better-auth/plugins";
import { nextCookies } from "better-auth/next-js";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { schema } from "@/lib/db"; // re-exported from src/db/schema
import { sendEmail } from "@/lib/email";
import { ac, adminRole, editorRole, authorRole } from "./permissions";

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  // D-21 — env-driven trusted origins (localhost dev / staging / prod).
  trustedOrigins: (process.env.BETTER_AUTH_TRUSTED_ORIGINS ?? "")
    .split(",")
    .filter(Boolean),

  database: drizzleAdapter(db, {
    provider: "pg",
    schema, // full schema so adapter sees user/session/account/verification
  }),

  emailAndPassword: {
    enabled: true,
    // D-09 — unverified accounts cannot sign in.
    requireEmailVerification: true,
    // T-02-04 — email-enumeration protection. When requireEmailVerification:true
    // AND the admin plugin is active, sign-up returns a synthetic user instead of
    // surfacing "email already exists". The docs require customSyntheticUser to
    // include the admin-plugin fields (role/banned/banReason/banExpires) so the
    // response shape matches a real user + the additionalField placeholders.
    // [CITED: better-auth email-password.mdx — Email Enumeration Protection →
    //  Plugins that add user fields; RESEARCH.md Code Examples lines 860-879]
    customSyntheticUser: ({ coreFields, additionalFields, id }) => ({
      ...coreFields,
      role: "author",
      banned: false,
      banReason: null,
      banExpires: null,
      ...additionalFields,
      id,
    }),
    // Hooks wired to the Resend-backed lib/email helper (Plan 02-03).
    // Fire-and-forget (void) per R8 — awaiting leaks send timing (timing attack).
    sendResetPassword: async ({ user, url }) => {
      void sendEmail({
        to: user.email,
        subject: "Reset your password",
        text: `Click the link to reset your password: ${url}`,
      });
    },
  },

  emailVerification: {
    sendVerificationEmail: async ({ user, url }) => {
      void sendEmail({
        to: user.email,
        subject: "Verify your email address",
        text: `Click the link to verify your email: ${url}`,
      });
    },
    sendOnSignUp: true, // fires on admin.createUser too
  },

  user: {
    additionalFields: {
      // D-24 — bio feeds Phase 6 byline/author pages.
      bio: { type: "string", required: false, input: true },
      // D-25 — avatar is an R2 object key (not binary data).
      avatar: { type: "string", required: false, input: true },
    },
  },

  session: {
    // D-18 — config-level 30-day session (remember-me UX lands in 02-02 Task 2).
    expiresIn: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24, // refresh once per day
  },

  plugins: [
    admin({
      ac,
      roles: { admin: adminRole, editor: editorRole, author: authorRole },
      // D-05/D-06 — admin sets role explicitly on creation; default is author.
      defaultRole: "author",
    }),
    // *** MUST BE LAST *** — enables cookie-setting in Server Actions (Next 16).
    // Placing this anywhere but last silently breaks Server Action auth (R2).
    nextCookies(),
  ],
});

/**
 * Server-side session reader for Server Actions / RSC.
 * Returns the Better Auth session object ({ user, session }) or null.
 */
export async function getSession() {
  return auth.api.getSession({ headers: await headers() });
}
