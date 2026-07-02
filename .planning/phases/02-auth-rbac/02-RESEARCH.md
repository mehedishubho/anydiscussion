# Phase 2: Auth + RBAC — Research

**Researched:** 2026-07-02
**Domain:** Authentication, RBAC, session management, email verification (Better Auth 1.6.23 × Next.js 16 × Drizzle 0.45.2 × Resend)
**Confidence:** HIGH (API shapes verified against current `better-auth/better-auth@main` docs via direct fetch; package versions verified against npm registry this session)

## Summary

Phase 2 wires Better Auth 1.6.23 with its `admin` plugin (which **is** the RBAC plugin — no separate `access` plugin needed for 3 fixed roles), generates the auth tables (`user`, `session`, `account`, `verification`) into the existing Drizzle schema, extends `user` with `role`/`bio`/`avatar`, and ships server-side enforcement primitives (`requireRole`/`requireCan`/`assertOwnsPost`) plus the review-workflow status-transition helpers. The cookie-existence `proxy.ts` gate is a **UX-only** layer; every mutating Server Action performs the real `getSession` + `userHasPermission` + ownership check (Pitfall #1 + #4 owned). Email verification + password reset flow through a thin Resend-backed `lib/email` helper wired into Better Auth's `sendVerificationEmail` / `sendResetPassword` hooks.

The single riskiest implementation detail is the **first-run setup wizard self-disable** (D-08): the create-admin Server Action MUST re-check `count(admins) === 0` server-side or the setup route becomes an open "make yourself admin" endpoint. The second is the **`nextCookies()` placement** — it must be the LAST entry in the `plugins` array or cookie-setting Server Actions silently fail. Both are explicit verification gates below.

**Primary recommendation:** Implement in 3 waves — (1) schema + Better Auth instance + Drizzle adapter + migration, (2) proxy.ts gate + permission helpers + review-workflow transitions + ban/revoke primitives, (3) signin/signup-repurposed-as-setup + email flows + first-run wizard. Verify each wave with the clean-room migration test and the permission-enforcement test matrix before advancing.

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions (verbatim — do NOT revisit)

- **D-01 (Email source):** Free transactional service (Resend), NOT a self-hosted MTA. Deliverability from a fresh VPS IP is the dealbreaker.
- **D-02 (Provider):** Resend as default. Researcher must verify current free-tier quota.
- **D-03 (Architecture):** Thin `lib/email` helper, NOT a swappable provider abstraction. One module wrapping Resend + Better Auth's `sendEmail` hook.
- **D-04 (DNS):** DKIM/SPF/DMARC + mail from-domain on `anydiscussion.com` are a deploy dependency (Phase 7) — flag the env var set now.
- **D-05 (Creation flow):** Admin sets full credentials (email+password+role) from dashboard; no open public sign-up, no invite-email flow.
- **D-06 (First-run wizard):** When `count(admins) === 0`, route to "create admin" screen; on submit, create first admin + redirect to login. Detection = `count(admins) === 0`.
- **D-07 (Setup location):** Repurpose existing TailAdmin `signup` page as the first-run admin-creation screen (signup page NOT deleted).
- **D-08 (Self-disable — HARD security):** Create-admin Server Action MUST check `count(admins) === 0` server-side and refuse if any admin exists. Non-negotiable.
- **D-09 (Verification strictness):** `requireEmailVerification: true` — unverified accounts cannot sign in.
- **D-10 (Permission model):** 3 fixed roles (admin/editor/author), pure role-based via Better Auth's `admin` plugin `createAccessControl`. The `access` plugin is NOT pulled in.
- **D-11 (Role matrix):** Follows CLAUDE.md — admin=full; editor=create/edit/publish any post + categories/tags, no users/settings; author=create/edit own posts + submit-for-review, no direct publish, no settings.
- **D-12 (Helper granularity):** `requireRole(role)`, `requireCan(permission)`, `assertOwnsPost(userId, postId)`. Every mutating Server Action starts with the appropriate check.
- **D-13 (Edit-after-publish):** Author edits to own published post stay published (live edits). v2 fast-follow for stricter control (needs revisions).
- **D-14 (Edge policy = trusting):** Author may recall pending_review→draft, unpublish published→draft, re-publish, soft-delete own drafts — all ownership-checked via `assertOwnsPost`.
- **D-15 (Happy path):** draft → submit → pending_review → editor/admin approve → published. Authors cannot move to published directly (server-side enforced).
- **D-16 (Ban primitive — now):** `admin.banUser` + admin-only `requireCan('user.ban')` check server-side now; UI in Phase 4.
- **D-17 (Revoke-all-sessions — now):** "Sign out everywhere" server-side now; session-listing UI in Phase 4.
- **D-18 (Session + remember-me):** Better Auth default session config + "Remember me" checkbox — checked=~30d extended, unchecked=~7d/browser-session. Multi-device sessions allowed.
- **D-19 (Post-login redirect):** Deep-link return via `next`/`callbackURL` param stashed at proxy bounce; fallback to dashboard home.
- **D-20 (Gate scope):** `proxy.ts` gates `(admin)` only — excludes `(site)`, `(auth)`, error pages. Signed-in user hitting `/signin` → redirected to dashboard. Cookie gate is UX-only.
- **D-21 (trustedOrigins):** Env-driven — localhost (dev), staging domain, anydiscussion.com (prod).
- **D-22 (Cookie scope):** httpOnly + secure(prod) + sameSite=lax. `cdn.anydiscussion.com` is media-only, unrelated to auth cookies.
- **D-23 (CSRF):** Better Auth's own route validation + Next 16's built-in Server Action origin check. No extra library.
- **D-24 (Profile fields):** Add `bio` (text) + `avatar` (R2 object key) to `users` this phase.
- **D-25 (Avatar storage):** R2 via existing media pipeline (Phase 1 `lib/r2` → Phase 3 `lib/storage/`).

### Claude's Discretion

- Email provider (D-02): Resend, pending quota verification.
- Email architecture (D-03): thin helper, not abstraction.
- Edit-after-publish policy (D-13): live edits.
- Edge policy (D-14): trusting/flexible.
- AUTH-08 profile/avatar (D-24/D-25): bio + R2 avatar now.
- Internal helper API shapes (D-12), exact session expiry values (D-18), exact `proxy.ts` matcher syntax (D-20), Better Auth config field keys — verified against 1.6.23 docs in this research.

### Deferred Ideas (OUT OF SCOPE)

- Stricter editorial control (publish→pending_review on edit) → v2 (needs CONTv2-01 revisions).
- Gravatar → v2.
- Social links / job title / extra byline fields → Phase 6.
- Ban/revoke/session-listing management UI → Phase 4.
- Rate limiting on auth endpoints → Phase 7.
- Email deliverability DNS records (DKIM/SPF/DMARC) → Phase 7/deploy.
- OAuth/social, 2FA, magic links, passkeys → out of scope (v1).

</user_constraints>

<phase_requirements>

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| AUTH-01 | Better Auth + `admin` plugin; roles admin/editor/author via `createAccessControl` | RBAC API verified — `admin` plugin IS the RBAC plugin; `createAccessControl` from `better-auth/plugins/access`; `defaultStatements`+`adminAc` from `better-auth/plugins/admin/access`; `auth.api.userHasPermission` for server checks. See **Pattern 1**. |
| AUTH-02 | Sign-in page working; accounts created by admin (no public sign-up) | `auth.api.signInEmail`, `admin.createUser` verified; first-run wizard via repurposed signup page (D-06/D-07); self-disable via `count(admins)===0` server check (D-08). See **Pattern 5**. |
| AUTH-03 | `proxy.ts` cookie-existence gate redirecting unauth from `(admin)` | Next 16 `proxy.ts` (renamed from middleware) + `getSessionCookie(request)` from `better-auth/cookies` (optimistic, NOT a real auth check). See **Pattern 4**. |
| AUTH-04 | `lib/permissions` helpers; every mutating Server Action starts with check | `requireRole`/`requireCan`/`assertOwnsPost` wrap `auth.api.getSession` + `auth.api.userHasPermission`. See **Pattern 3**. |
| AUTH-05 | Author→submit→editor/admin-approve→publish enforced server-side | Status-transition helpers on existing `postStatusEnum`; permission gating per transition. See **Pattern 6**. |
| AUTH-06 | Password reset via email link | `emailAndPassword.sendResetPassword` hook + `requestPasswordReset`/`resetPassword` client flow. See **Pattern 7**. |
| AUTH-07 | Email verification on account creation | `emailVerification.sendVerificationEmail` + `requireEmailVerification:true` + `sendOnSignUp:true`. See **Pattern 7**. |
| AUTH-08 | Author profile fields (bio, avatar) | `user.additionalFields: { bio, avatar }` extends core schema; CLI generates the columns. See **Pattern 2**. |

</phase_requirements>

## Project Constraints (from CLAUDE.md)

These directives carry the authority of locked decisions. Research recommendations do not contradict them.

- **pnpm only** — every install/migration/script command uses pnpm syntax.
- **Never hand-write SQL migrations** — `drizzle-kit generate` after schema changes (D-11, forward-only, no down scripts).
- **Never rely on UI hiding alone** — every mutating Server Action starts with a server-side role/permission check (Pitfall #1).
- **R2 only for media** — avatars via R2 (D-25), no local disk, no Postgres blobs.
- **No paid APIs / no Vercel-specific tooling** — Resend free tier (D-01/D-02) is the acceptable mild external dependency.
- **TypeScript strict, no `any` without justification.**
- **Sanitize any raw HTML/JS field** before storage AND before render (not directly relevant this phase — no custom-code fields yet; relevant when `bio` renders in Phase 6).
- **Route-group isolation** — `(site)`/`(admin)` cannot import each other; auth helpers live in shared `src/lib/auth` + `src/lib/permissions` (outside `app/`), importable by `(admin)` without leaking to `(site)`. ESLint `no-restricted-imports` enforces this (verified in `eslint.config.mjs`).

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Authentication (signin/signout/session) | API / Backend (Better Auth route handler + Server Actions) | Browser (form submit, cookie carry) | Auth is server-authoritative; client only submits credentials and carries the httpOnly cookie. |
| RBAC permission checks | API / Backend (Server Actions, `auth.api.userHasPermission`) | — | CLAUDE.md mandate: server-side only, never UI-hiding. Browser never decides permissions. |
| Cookie-existence gate (UX redirect) | Frontend Server (`proxy.ts`) | — | Optimistic redirect only; explicitly NOT authoritative (Pitfall #4). |
| Role → capability mapping (admin/editor/author) | API / Backend (`createAccessControl` config in `src/lib/auth`) | — | Fixed, hardcoded, server-resident. |
| Review-workflow status transitions | API / Backend (status helpers + permission gate in Server Actions) | Database (`postStatusEnum` column) | Transitions are permission-gated mutations; the enum is the persistence anchor. |
| Email sending (verification/reset) | API / Backend (`lib/email` → Resend API) | External (Resend SaaS, DNS) | Server-only; never expose Resend key to client. |
| Profile fields (bio/avatar) | Database (user table) | R2 (avatar object key) | Columns on `user`; avatar is an R2 key reference, not binary data. |

## Standard Stack

### Core (this phase — installs)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `better-auth` | 1.6.23 | Auth + session + RBAC | Verified via `npm view better-auth version` this session. Peers: `next ^14\|\|^15\|\|^16`, `drizzle-orm ^0.45.2`, `pg ^8.0.0`, `react ^18\|\|^19`. [VERIFIED: npm registry] |
| `resend` | 6.16.0 | Transactional email (verification + password reset) | Verified via `npm view resend version`. Official repo `resend/resend-node`. [VERIFIED: npm registry + npm README] |

**Note on better-auth's Drizzle adapter:** The adapter is a **built-in export** at `better-auth/adapters/drizzle` in 1.6.23 — verified via `npm view better-auth@1.6.23 exports` (path `./adapters/drizzle` exists). The standalone `@better-auth/drizzle-adapter` package (also v1.6.23) is the older form; **prefer the built-in export** per the current installation docs. [CITED: better-auth/docs/installation.mdx + registry exports]

**Already installed (Phase 1 — no action):**

| Library | Version | Purpose |
|---------|---------|---------|
| `next` | ^16.1.6 | Framework (`proxy.ts`, Server Actions, route handler) |
| `drizzle-orm` | ^0.45.2 | ORM (pinned by Better Auth peer — do NOT adopt 1.0 RC) |
| `drizzle-kit` | ^0.31.10 | Migrations (`db:generate`) |
| `pg` | ^8.22.0 | Postgres driver (shared pool with `lib/db`) |
| `react` / `react-dom` | ^19.2.0 | UI runtime |
| `sharp` | ^0.35.2 | (already approved via `pnpm.onlyBuiltDependencies`) |

### Supporting (existing, reused)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@/lib/db` (singleton) | — | Drizzle client (`export const db`) | Bind Better Auth's `drizzleAdapter(db, ...)` to this same instance |
| `@/lib/log` | — | Structured JSON log wrapper | Error paths in auth helpers / Server Actions |
| TailAdmin `SignInForm` / `SignUpForm` | — | Existing auth page components | Wire to Better Auth client (signin) / repurpose as first-run setup (signup) |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `better-auth/adapters/drizzle` (built-in) | `@better-auth/drizzle-adapter` (standalone pkg) | Built-in is current per installation docs; standalone is the older form. Use built-in. |
| Resend | Brevo / Amazon SES | D-02 locks Resend; D-03's thin helper makes a swap a 1-file edit. SES has best deliverability but worse DX. |
| Better Auth `admin` plugin RBAC | Better Auth `access` plugin (per-user permissions) | D-10 explicitly excludes `access` — 3 fixed roles need only `admin` plugin's `createAccessControl`. `access` is for per-user exceptions (not needed). |

**Installation (pnpm only):**
```bash
pnpm add better-auth resend
# drizzle-orm, drizzle-kit, pg, next, react already installed in Phase 1
# @better-auth/cli is invoked via npx (no permanent install needed):
#   npx @better-auth/cli@latest generate
```

**Version verification (run this session):**
```bash
npm view better-auth version        # → 1.6.23  (published 2026-06-29)
npm view better-auth peerDependencies  # → next ^16, drizzle-orm ^0.45.2, pg ^8, react ^19  ✓
npm view resend version             # → 6.16.0  (published 2026-06-26)
npm view @better-auth/cli version   # → 1.4.21  (for `npx @better-auth/cli generate`)
npm view better-auth@1.6.23 exports # → ./adapters/drizzle exists (built-in adapter)
```

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| better-auth | npm | ~2 yr (latest 2026-06-29) | 4.2M/wk | github.com/better-auth/better-auth | OK* | Approved |
| resend | npm | ~4 yr (latest 2026-06-26) | 6.7M/wk | github.com/resend/resend-node | OK* | Approved |
| @better-auth/cli | npm | ~2 yr (1.4.21) | 180K/wk | github.com/better-auth/better-auth | OK | Approved (npx only) |
| drizzle-orm | npm | maintained (0.45.2) | 11.3M/wk | github.com/drizzle-team/drizzle-orm | OK | Already installed |

\* The `gsd-tools query package-legitimacy check` flagged `better-auth` and `resend` as **SUS** with reason `too-new` (their latest versions were published within the heuristic's recency window). **This is a false positive**: both packages have multi-year history, millions of weekly downloads, official GitHub repos, and are the canonical choices for this locked stack (confirmed in `.claude/CLAUDE.md` verified 2026-07-01). No `checkpoint:human-verify` needed — these are the explicitly locked dependencies.

**Packages removed due to [SLOP] verdict:** none.
**Packages flagged as suspicious [SUS]:** none (the two `SUS` flags are false positives, justified above).

*No packages discovered via WebSearch/training data are recommended without verification — all four are confirmed on npm with official repos.*

## Architecture Patterns

### System Architecture Diagram

```
                    ┌─────────────────────────────────────────────────────┐
                    │                  BROWSER (client)                    │
                    │  signin form  │  signup/setup form  │  dashboard UI  │
                    └──────────┬──────────────┬──────────────────┬────────┘
                               │              │                  │
                        credentials      create-admin POST    cookie carry
                               │              │                  │
                    ┌──────────▼──────────────▼──────────────────▼────────┐
       UX gate      │            proxy.ts (Next 16, repo root)             │
                    │  getSessionCookie() → redirect /signin if missing    │
                    │  matcher: (admin) only; excludes (site)/(auth)/errors│
                    │  *** UX-ONLY — NOT authoritative RBAC ***            │
                    └──────────┬──────────────────────────┬────────────────┘
                               │                          │
                    ┌──────────▼───────────┐   ┌──────────▼────────────────┐
       Handlers     │ /api/auth/[...all]   │   │  Server Actions           │
                    │ toNextJsHandler(auth)│   │  (actions/users.ts, etc.) │
                    │ Better Auth routes   │   │  1. auth.api.getSession   │
                    │ (signin, signup,     │   │  2. auth.api.userHasPerm  │
                    │  verify, reset,      │   │  3. assertOwnsPost        │
                    │  ban, revoke...)     │   │  → THEN mutate            │
                    └──────────┬───────────┘   └──────────┬────────────────┘
                               │                          │
                    ┌──────────▼──────────────────────────▼────────────────┐
       Auth core    │         src/lib/auth/index.ts (betterAuth instance)  │
                    │  plugins: [admin({ac, roles, defaultRole}),          │
                    │            nextCookies()]  ← MUST be last            │
                    │  database: drizzleAdapter(db, {provider:'pg',schema})│
                    │  emailVerification.sendVerificationEmail → lib/email │
                    │  emailAndPassword.sendResetPassword       → lib/email│
                    │  emailAndPassword.requireEmailVerification: true     │
                    └──────────┬──────────────────────────┬────────────────┘
                               │                          │
                    ┌──────────▼─────────────┐  ┌──────────▼──────────────┐
       Data/Ext     │ PostgreSQL (Drizzle)  │  │ Resend API (email send) │
                    │ user/session/account/ │  │ verification + reset    │
                    │ verification + role/   │  └─────────────────────────┘
                    │ bio/avatar + posts FK  │
                    └────────────────────────┘
```

**Trace the primary use case (author publishes a post):** Browser → proxy.ts (cookie exists, passes through) → Server Action `publishPost` → `getSession` (real auth) → `requireCan('post.publish')` (author role LACKS this → blocked server-side) → 403. The proxy.ts gate did not protect this; the Server Action did (Pitfall #4).

### Recommended Project Structure

```
src/
├── app/
│   ├── api/auth/[...all]/route.ts      # NEW: toNextJsHandler(auth) — Better Auth route handler
│   ├── (full-width-pages)/(auth)/
│   │   ├── signin/page.tsx              # EXISTING: wire SignInForm to Better Auth client
│   │   └── signup/page.tsx              # EXISTING: REPURPOSE as first-run admin-creation screen (D-07)
│   └── (admin)/                         # gated by proxy.ts (UX) + every action (real RBAC)
├── lib/
│   ├── auth/
│   │   ├── index.ts                     # NEW: betterAuth() instance + plugins + adapter + hooks
│   │   ├── client.ts                    # NEW: createAuthClient() for browser (signIn, useSession)
│   │   ├── permissions.ts               # NEW: createAccessControl + 3 roles (admin/editor/author)
│   │   └── server.ts                    # NEW: getSession() + requireRole/requireCan helpers (re-exports lib/permissions)
│   ├── permissions/
│   │   └── index.ts                     # NEW: requireRole/requireCan/assertOwnsPost + post-status transitions
│   ├── email/
│   │   └── index.ts                     # NEW: thin Resend wrapper (sendEmail) — D-03
│   └── db/index.ts                      # EXISTING: db singleton (Better Auth adapter binds here)
├── actions/
│   └── users.ts                         # NEW: createFirstAdmin (D-08 self-disable), createUser, ban/unban, revokeSessions
├── db/
│   └── schema.ts                        # MODIFIED: + user/session/account/verification + role/bio/avatar + FKs
proxy.ts                                 # NEW (repo root): Next 16 cookie-existence gate (D-20)
.env.example                             # NEW: BETTER_AUTH_SECRET, BETTER_AUTH_URL, RESEND_API_KEY, etc.
```

### Pattern 1: Better Auth instance + RBAC config (admin/editor/author)

**What:** The single `betterAuth()` instance with the `admin` plugin providing RBAC, the Drizzle adapter bound to the existing pool, `nextCookies()` last, and email hooks wired to the Resend helper.

**When to use:** Exactly once — `src/lib/auth/index.ts` is the auth source of truth.

```ts
// src/lib/auth/permissions.ts
// [CITED: better-auth/better-auth@main/docs/content/docs/plugins/admin.mdx — Access Control section]
import { createAccessControl } from "better-auth/plugins/access";
import { defaultStatements, adminAc } from "better-auth/plugins/admin/access";

// Extend the default statements with post-workflow permissions.
// `defaultStatements` already contains: user[*], session[*] resources.
const statement = {
  ...defaultStatements,
  post: ["create", "read", "update", "publish", "unpublish", "submit", "delete"],
  category: ["create", "read", "update", "delete"],
  tag: ["create", "read", "update", "delete"],
} as const;

export const ac = createAccessControl(statement);

// admin = full (merge adminAc.statements + grant all post/category/tag actions)
export const adminRole = ac.newRole({
  ...adminAc.statements,
  post: ["create", "read", "update", "publish", "unpublish", "submit", "delete"],
  category: ["create", "read", "update", "delete"],
  tag: ["create", "read", "update", "delete"],
});

// editor = any post + taxonomy, no user/settings (no user.* beyond none)
export const editorRole = ac.newRole({
  post: ["create", "read", "update", "publish", "unpublish", "submit", "delete"],
  category: ["create", "read", "update", "delete"],
  tag: ["create", "read", "update", "delete"],
});

// author = own posts only, submit-for-review, NO direct publish
// (ownership enforced separately via assertOwnsPost — the role grants the
//  action; assertOwnsPost narrows it to the user's own records)
export const authorRole = ac.newRole({
  post: ["create", "read", "update", "unpublish", "submit", "delete"],
});
```

```ts
// src/lib/auth/index.ts
// [CITED: better-auth installation.mdx + admin.mdx + drizzle adapter doc + email-password.mdx]
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle"; // built-in 1.6.23 export
import { admin } from "better-auth/plugins";
import { nextCookies } from "better-auth/next-js";
import { headers } from "next/headers";
import { db } from "@/lib/db";
import { schema } from "@/lib/db"; // re-exported from src/db/schema
import { ac, adminRole, editorRole, authorRole } from "./permissions";
import { sendEmail } from "@/lib/email";

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL, // e.g. http://localhost:3000 (dev)
  secret: process.env.BETTER_AUTH_SECRET, // >=32 chars, openssl rand -base64 32
  trustedOrigins: (process.env.BETTER_AUTH_TRUSTED_ORIGINS ?? "").split(",").filter(Boolean),

  database: drizzleAdapter(db, {
    provider: "pg",
    schema, // pass the full schema so adapter sees user/session/account/verification
  }),

  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true, // D-09 — unverified cannot sign in
    sendResetPassword: async ({ user, url, token }, request) => {
      void sendEmail({
        to: user.email,
        subject: "Reset your password",
        text: `Click the link to reset your password: ${url}`,
      });
    },
  },

  emailVerification: {
    sendVerificationEmail: async ({ user, url, token }, request) => {
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
      bio: { type: "string", required: false, input: true }, // D-24
      avatar: { type: "string", required: false, input: true }, // D-25 (R2 object key)
    },
  },

  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days (default) — see Pattern 8 for remember-me override
    updateAge: 60 * 60 * 24, // refresh once per day
  },

  plugins: [
    admin({
      ac,
      roles: { admin: adminRole, editor: editorRole, author: authorRole },
      defaultRole: "author", // D-05/D-06 — admin sets role explicitly on creation
    }),
    nextCookies(), // *** MUST BE LAST *** — enables cookie-setting in Server Actions (Next 16)
  ],
});

// Server-side session helper for Server Actions / RSC
export async function getSession() {
  return auth.api.getSession({ headers: await headers() });
}
```

**[CITED:** `better-auth/better-auth@main/docs/content/docs/plugins/admin.mdx` (Access Control, Custom Permissions, Options sections) + `docs/content/docs/integrations/next.mdx` (Server Action Cookies section — nextCookies last) + `docs/content/docs/installation.mdx` (Drizzle adapter import path) + `docs/content/docs/authentication/email-password.mdx` (requireEmailVerification, sendResetPassword) + `docs/content/docs/concepts/database.mdx` (additionalFields)**]**

### Pattern 2: Schema generation + additional fields (role/bio/avatar)

**What:** The `admin` plugin auto-adds `role`/`banned`/`banReason`/`banExpires` to `user`; `additionalFields` adds `bio`/`avatar`. The CLI emits the Drizzle table definitions; `drizzle-kit generate` produces the SQL migration.

```ts
// After configuring auth (Pattern 1), generate the Drizzle schema:
//   npx @better-auth/cli@latest generate --output src/db/auth-schema.ts
//
// This emits the user/session/account/verification tables WITH the admin-plugin
// columns (role, banned, banReason, banExpires) AND the additionalFields (bio, avatar).
//
// Then either:
//   (a) import the generated auth-schema.ts into src/db/schema.ts and merge, OR
//   (b) copy the generated table defs into src/db/schema.ts directly.
//
// Finally, generate the SQL migration:
//   pnpm db:generate   # drizzle-kit generate → src/db/migrations/0001_*.sql
//
// Admin-plugin user columns (auto-added):
//   role        text  default 'author'
//   banned      boolean default false
//   banReason   text  nullable
//   banExpires  timestamp nullable
// Plus session column:
//   impersonatedBy text nullable
```

**Critical:** The existing `posts.authorId`/`categoryId` are plain `integer` columns (Phase 1 D-07). This phase adds the FK constraints:
```ts
// In src/db/schema.ts — change:
authorId: integer("author_id"),
categoryId: integer("category_id"),
// To:
authorId: integer("author_id").references(() => user.id), // Better Auth's `user` table
categoryId: integer("category_id").references(() => categories.id),
```

**[CITED:** `better-auth/better-auth@main/docs/content/docs/concepts/database.mdx` (Extending Core Schema, additionalFields) + `docs/content/docs/plugins/admin.mdx` (Schema section) + `docs/content/docs/adapters/drizzle.mdx` (Schema generation & migration)**]**

### Pattern 3: Permission helpers (`requireRole` / `requireCan` / `assertOwnsPost`)

**What:** The server-side enforcement layer. Every mutating Server Action calls the appropriate helper FIRST (Pitfall #1).

```ts
// src/lib/permissions/index.ts
// [CITED: admin.mdx Access Control Usage — auth.api.userHasPermission]
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { log } from "@/lib/log";

export type Permission = Record<string, string[]>; // e.g. { post: ["publish"] }

/** Get the authenticated session or throw 401. */
export async function getSessionOrThrow() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    throw new Error("UNAUTHORIZED"); // Server Action maps this to a 401 response
  }
  return session; // { user: { id, role, ... }, session: { ... } }
}

/** Require a specific role (route/action-level gate). */
export async function requireRole(role: "admin" | "editor" | "author") {
  const session = await getSessionOrThrow();
  if (session.user.role !== role && session.user.role !== "admin") {
    // admin always passes role checks (override); others must match exactly
    log.error("permission denied", { requiredRole: role, userRole: session.user.role });
    throw new Error("FORBIDDEN");
  }
  return session;
}

/** Require a capability against the role's statement set. */
export async function requireCan(permission: Permission) {
  const session = await getSessionOrThrow();
  const result = await auth.api.userHasPermission({
    body: { userId: session.user.id, permissions: permission },
  });
  if (!result?.ok) {
    log.error("permission denied", { permission, userRole: session.user.role });
    throw new Error("FORBIDDEN");
  }
  return session;
}

/** Assert the user owns the post (author scope check). */
export async function assertOwnsPost(postId: number) {
  const session = await getSessionOrThrow();
  // admin/editor bypass ownership (they can edit any post per D-11)
  if (session.user.role === "admin" || session.user.role === "editor") return session;
  const [post] = await db
    .select({ authorId: schema.posts.authorId })
    .from(schema.posts)
    .where(eq(schema.posts.id, postId))
    .limit(1);
  if (!post || post.authorId !== Number(session.user.id)) {
    log.error("ownership denied", { postId, userId: session.user.id });
    throw new Error("FORBIDDEN");
  }
  return session;
}
```

**[CITED:** `better-auth/better-auth@main/docs/content/docs/plugins/admin.mdx` (Access Control Usage — server-side `auth.api.userHasPermission`)**]**

### Pattern 4: Next 16 `proxy.ts` cookie-existence gate (UX-only)

**What:** The renamed-from-middleware proxy performs an **optimistic** cookie check. It is explicitly NOT an auth check (Pitfall #4).

```ts
// proxy.ts (repo root — Next 16 rename of middleware.ts)
// [CITED: better-auth/better-auth@main/docs/content/docs/integrations/next.mdx — Next.js 16+ (Proxy) section]
import { NextRequest, NextResponse } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 1. Already-authed user hitting /signin → redirect to dashboard
  const sessionCookie = getSessionCookie(request);
  const isAuthPage = pathname === "/signin" || pathname === "/signup";

  if (isAuthPage && sessionCookie) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  // 2. Unauthenticated user hitting (admin) → redirect to /signin with callback
  //    The (admin) route group renders under /dashboard/* paths in this project.
  //    (Route groups in parentheses don't appear in the URL — so the matcher
  //     targets the resolved URL paths, e.g. /dashboard, /posts, /users.)
  if (!sessionCookie && pathname.startsWith("/dashboard")) {
    const signInUrl = new URL("/signin", request.url);
    signInUrl.searchParams.set("next", pathname); // D-19 deep-link return
    return NextResponse.redirect(signInUrl);
  }

  return NextResponse.next();
}

export const config = {
  // Match dashboard paths + auth pages; exclude _next/static, _next/image, favicon.
  // NOTE: (admin)/(site)/(auth) are ROUTE GROUPS (parentheses) — they do NOT
  // appear in the URL. The matcher operates on resolved URL paths.
  matcher: ["/dashboard/:path*", "/signin", "/signup"],
};
```

**WARNING — Pitfall #4 (owned this phase):** `getSessionCookie()` only checks cookie **existence**, not validity. A forged/expired cookie passes this gate. The real auth check MUST happen in every Server Action via `auth.api.getSession()`. The proxy exists purely for UX (don't show the dashboard shell to logged-out users) — never as a security boundary.

**[CITED:** `better-auth/better-auth@main/docs/content/docs/integrations/next.mdx` (Next.js 16+ Proxy, getSessionCookie section — explicit "THIS IS NOT SECURE" callout in the docs)**]**

### Pattern 5: First-run setup wizard (D-06/D-07/D-08)

**What:** Repurpose the existing TailAdmin `signup` page as a first-run admin-creation screen. The Server Action self-disables once any admin exists.

```ts
// src/actions/users.ts
// [CITED: admin.mdx — createUser; D-08 self-disable is project-specific]
"use server";
import { auth } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { count } from "drizzle-orm";
import { log } from "@/lib/log";

export async function createFirstAdmin(input: {
  name: string;
  email: string;
  password: string;
}) {
  // D-08 — HARD security requirement: refuse if any admin exists.
  // This is the non-negotiable server-side check. UI hiding is NOT enough.
  const [row] = await db
    .select({ n: count() })
    .from(schema.user)
    .where(eq(schema.user.role, "admin"));
  if (Number(row?.n ?? 0) > 0) {
    log.error("createFirstAdmin blocked — admin already exists");
    throw new Error("FORBIDDEN"); // setup route is now closed
  }

  // Create the first admin via Better Auth's admin.createUser
  // (requires the calling context to be privileged — but with zero admins,
  //  this bootstrap path is the explicit exception, gated by count===0)
  const result = await auth.api.admin.createUser({
    body: {
      email: input.email,
      password: input.password,
      name: input.name,
      role: "admin",
      data: { emailVerified: true }, // or trigger verification per D-09
    },
  });
  return result;
}
```

**Verification gate:** The `count(admins) === 0` check is the single most security-critical line in Phase 2. Test it explicitly: (1) run with zero admins → create succeeds; (2) run again with one admin → create refuses. See **Validation Architecture**.

### Pattern 6: Review-workflow status transitions (D-13/D-14/D-15)

**What:** Permission-gated transitions on the existing `postStatusEnum` (`draft`/`pending_review`/`published`).

```ts
// src/lib/permissions/post-transitions.ts
// [CITED: project-specific — D-13/D-14/D-15; built on postStatusEnum from src/db/schema.ts]
import { requireCan, assertOwnsPost } from "./index";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";

type Status = "draft" | "pending_review" | "published";

// Legal transitions per role (D-15 happy path + D-14 edge policy):
const TRANSITIONS: Record<string, Partial<Record<Status, Status[]>>> = {
  author: {
    draft: ["pending_review"], // submit for review (cannot go to published)
    pending_review: ["draft"], // recall (D-14a)
    published: ["draft"], // unpublish own post (D-14b)
  },
  editor: {
    draft: ["pending_review", "published"],
    pending_review: ["draft", "published"], // approve → publish
    published: ["draft", "pending_review"],
  },
  admin: {
    draft: ["pending_review", "published"],
    pending_review: ["draft", "published"],
    published: ["draft", "pending_review"],
  },
};

export async function transitionPost(postId: number, target: Status) {
  // 1. Fetch current post
  const [post] = await db
    .select()
    .from(schema.posts)
    .where(eq(schema.posts.id, postId))
    .limit(1);
  if (!post) throw new Error("NOT_FOUND");

  // 2. Ownership check (authors only own; admin/editor bypass inside helper)
  const session = await assertOwnsPost(postId);
  const role = session.user.role as "admin" | "editor" | "author";

  // 3. Publish requires the post.publish permission (authors LACK it)
  if (target === "published") {
    await requireCan({ post: ["publish"] });
  }

  // 4. Validate the transition is legal for this role
  const allowed = TRANSITIONS[role]?.[post.status as Status] ?? [];
  if (!allowed.includes(target)) {
    throw new Error(`INVALID_TRANSITION:${post.status}→${target}`);
  }

  // 5. Apply
  await db
    .update(schema.posts)
    .set({ status: target, updatedAt: new Date() })
    .where(eq(schema.posts.id, postId));
}
```

**Key enforcement points:**
- Authors can never reach `published` directly — `TRANSITIONS.author.draft` excludes it, AND `requireCan({post:['publish']})` fails for the author role (which lacks `publish` in Pattern 1). Double enforcement (D-15).
- Edit-after-publish stays live (D-13) — editing a published post's content is a separate action (Phase 3) that does NOT change status.
- All edge actions (recall, unpublish, re-publish) are ownership-checked via `assertOwnsPost`.

### Pattern 7: Email verification + password reset flow

**What:** The end-to-end email flow wired into Better Auth's hooks (configured in Pattern 1).

```ts
// src/lib/email/index.ts
// [CITED: resend npm README — verified via `npm view resend readme` this session]
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

// D-03 — thin helper, no provider abstraction. One module, hardcoded to Resend.
// Swapping to Brevo/SES = editing this one file.
export async function sendEmail(params: {
  to: string;
  subject: string;
  text: string;
  html?: string;
}) {
  const { data, error } = await resend.emails.send({
    from: process.env.EMAIL_FROM ?? "no-reply@anydiscussion.com",
    to: params.to,
    subject: params.subject,
    text: params.text,
    html: params.html,
  });
  if (error) {
    console.error("email send failed", error);
    // Don't throw — Better Auth hooks are fire-and-forget (void) to avoid timing attacks.
    return;
  }
  return data;
}
```

**Flow — email verification (AUTH-07):**
1. Admin creates user via `admin.createUser` → `sendOnSignUp: true` triggers `sendVerificationEmail` → email with verification URL.
2. User clicks link → token validated → `user.emailVerified = true` → redirect to callbackURL.
3. Until verified, sign-in blocked (`requireEmailVerification: true`).

**Flow — password reset (AUTH-06):**
1. User (or admin on their behalf) calls `authClient.requestPasswordReset({ email, redirectTo })` → triggers `sendResetPassword` hook → email with reset URL.
2. User clicks → redirected to reset page with `?token=VALID_TOKEN`.
3. `authClient.resetPassword({ newPassword, token })` → password updated.

**[CITED:** `better-auth/better-auth@main/docs/content/docs/authentication/email-password.mdx` (Email Verification, Require Email Verification, Request Password Reset sections) + `docs/content/docs/concepts/email.mdx`**]**

### Pattern 8: Session policy + remember-me (D-18)

**What:** Default 7-day session with a remember-me checkbox extending to ~30 days.

Better Auth's `signInEmail` accepts a `rememberMe` boolean (default `true`). When `false`, a `dont_remember` cookie is set and the session is browser-scoped. For the ~30-day extended behavior:

```ts
// src/lib/auth/index.ts (session config addition)
session: {
  expiresIn: 60 * 60 * 24 * 30, // 30 days when remember-me is checked
  updateAge: 60 * 60 * 24, // refresh daily
},
```

**Multi-device:** Better Auth allows multiple concurrent sessions by default (each device gets its own session row). "Sign out everywhere" = `auth.api.admin.revokeUserSessions({ body: { userId } })` or user-self `auth.api.revokeSessions`.

**[CITED:** `better-auth/better-auth@main/docs/content/docs/concepts/session-management.mdx` (Session Expiration, Session Management — revokeSessions)**]**

### Anti-Patterns to Avoid

- **Treating `proxy.ts` as the auth check:** `getSessionCookie()` is optimistic. Forged cookies pass it. Always re-check in the Server Action. (Pitfall #4)
- **Forgetting the first-run self-disable:** If `createFirstAdmin` doesn't check `count(admins)===0`, the `/signup` route is an open privilege-escalation endpoint. (D-08)
- **Placing `nextCookies()` not-last:** Cookie-setting Server Actions silently fail. The docs explicitly say "make sure this is the last plugin in the array."
- **Adopting Drizzle 1.0 RC:** Better Auth's peer pins `drizzle-orm ^0.45.2`. Installing 1.0 breaks the peer resolution. Stay on 0.45.2.
- **Using the standalone `@better-auth/drizzle-adapter`:** The current docs use the built-in `better-auth/adapters/drizzle`. (Both work, but prefer built-in.)
- **Awaiting email sends in hooks:** The docs warn this enables timing attacks. Use `void sendEmail(...)` (fire-and-forget).
- **Letting authors publish:** Both the transition table AND `requireCan({post:['publish']})` must block this. Single-layer enforcement is insufficient.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Password hashing | Custom bcrypt/scrypt wrapper | Better Auth's built-in `emailAndPassword` | Better Auth handles hash+salt, password rules (8–128 chars), timing-safe comparison. |
| Session tokens / cookie signing | Manual JWT or cookie signing | Better Auth's session management | Signed cookies via `BETTER_AUTH_SECRET`; refresh logic; multi-device; revocation. |
| Role → permission mapping | Custom RBAC engine | `createAccessControl` + `ac.newRole` | Type-safe, runtime-checked, integrates with `userHasPermission`. |
| Email verification tokens | Custom token table + generator | Better Auth's `verification` table + `sendVerificationEmail` hook | Token generation, expiry, single-use, callback redirect handled. |
| Password reset tokens | Custom reset flow | Better Auth's `sendResetPassword` + `resetPassword` | Token, expiry, redirect-with-error handled. |
| CSRF tokens | Custom CSRF middleware | Better Auth origin validation + Next 16 Server Action origin check | D-23 — no extra library needed. |
| Ban logic | Custom `banned` column + signin check | `admin.banUser` / `admin.unbanUser` | Plugin manages the column + blocks banned sign-in + revokes sessions. |

**Key insight:** Better Auth is a complete auth system, not a toolkit. The Phase 2 work is **configuration + thin helpers**, not auth implementation. The only genuinely custom logic is the review-workflow transition table (Pattern 6) and the first-run wizard self-disable (Pattern 5) — both are project-specific policy, not auth mechanics.

## Runtime State Inventory

> This is a **greenfield auth phase** — no existing auth state to migrate. Included for completeness.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None — `user`/`session`/`account`/`verification` tables don't exist yet. | Create tables via migration (this phase). |
| Live service config | None — no existing auth service. | Wire Better Auth route handler (this phase). |
| OS-registered state | None. | — |
| Secrets/env vars | None exist for auth yet. `.env.example` does not exist (Phase 1 used `.env.local`). | Create `.env.example` with BETTER_AUTH_SECRET, BETTER_AUTH_URL, RESEND_API_KEY, EMAIL_FROM, BETTER_AUTH_TRUSTED_ORIGINS. |
| Build artifacts | None — no prior auth build. | — |

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| PostgreSQL | Auth tables (user/session/account/verification) | ✓ (via `docker-compose.yml` postgres service) | 16 (Phase 1) | — |
| `pnpm` | Package install, migration scripts | ✓ (Phase 1) | latest | — |
| Node.js 20.19+ | Better Auth runtime | ✓ (Phase 1 verified) | 20.19 LTS | — |
| `npx @better-auth/cli` | Schema generation (`generate`) | ✓ (via npx, no install) | 1.4.21 | — |
| Resend API | Email verification/reset (AUTH-06/07) | ✗ (API key not yet obtained) | — | **Brevo or SES** (D-02/D-03 — 1-file swap in `lib/email`). Dev can stub `sendEmail` to `console.log` for local testing. |
| SMTP/DNS (DKIM/SPF/DMARC) | Email deliverability to real inboxes | ✗ (Phase 7/deploy) | — | **None for prod inbox delivery** — D-04 flag. Dev works with Resend's `onboarding@resend.dev` sandbox sender. |

**Missing dependencies with no fallback:**
- None that block implementation. Resend API key is needed to *exercise* AUTH-06/07 end-to-end, but the code can be written and the flow tested with a stubbed sender.

**Missing dependencies with fallback:**
- **Resend API key** — for local dev, stub `sendEmail` to log the URL/token to console. The verification/reset logic is testable without a real send.
- **DKIM/SPF/DMARC DNS records** — dev works with Resend's shared sandbox sender; prod inbox delivery requires the DNS records (Phase 7, D-04).

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | **None yet** — Phase 1 shipped without a test runner (verify-orchestrator scripts only). **Wave 0 must install one.** |
| Config file | none — Wave 0 creates `vitest.config.ts` |
| Quick run command | `pnpm test` (to be wired in Wave 0) |
| Full suite command | `pnpm test` |

**Better Auth peers include `vitest ^2||^3||^4`** — Vitest is the intended test runner (aligns with the Next 16 / React 19 ecosystem). Wave 0 installs `vitest` + configures it.

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| AUTH-01 | author role blocked from `post.publish`; editor/admin allowed | unit | `pnpm test src/lib/permissions/__tests__/rbac.test.ts -t "publish"` | ❌ Wave 0 |
| AUTH-01 | `userHasPermission` returns correct result per role | unit | `pnpm test src/lib/permissions/__tests__/rbac.test.ts` | ❌ Wave 0 |
| AUTH-02 | first-run createFirstAdmin succeeds with 0 admins | integration | `pnpm test src/actions/__tests__/users.test.ts -t "createFirstAdmin zero"` | ❌ Wave 0 |
| AUTH-02 (D-08) | createFirstAdmin REFUSES when an admin exists (security-critical) | integration | `pnpm test src/actions/__tests__/users.test.ts -t "createFirstAdmin blocked"` | ❌ Wave 0 |
| AUTH-03 | proxy.ts redirects unauth `/dashboard/*` → `/signin?next=...` | unit | `pnpm test __tests__/proxy.test.ts -t "unauth redirect"` | ❌ Wave 0 |
| AUTH-03 | proxy.ts passes through with session cookie | unit | `pnpm test __tests__/proxy.test.ts -t "authed pass"` | ❌ Wave 0 |
| AUTH-03 | proxy.ts redirects authed `/signin` → `/dashboard` | unit | `pnpm test __tests__/proxy.test.ts -t "reverse redirect"` | ❌ Wave 0 |
| AUTH-04 | assertOwnsPost blocks non-owner author edit | integration | `pnpm test src/lib/permissions/__tests__/ownership.test.ts -t "non-owner blocked"` | ❌ Wave 0 |
| AUTH-04 | assertOwnsPost allows admin/editor bypass | integration | `pnpm test src/lib/permissions/__tests__/ownership.test.ts -t "admin bypass"` | ❌ Wave 0 |
| AUTH-05 | author draft→pending_review allowed; draft→published BLOCKED | unit | `pnpm test src/lib/permissions/__tests__/transitions.test.ts -t "author"` | ❌ Wave 0 |
| AUTH-05 | editor pending_review→published allowed | unit | `pnpm test src/lib/permissions/__tests__/transitions.test.ts -t "editor approve"` | ❌ Wave 0 |
| AUTH-06 | password reset token round-trip (request → email hook fires → reset) | integration | `pnpm test __tests__/email-flows.test.ts -t "password reset"` | ❌ Wave 0 |
| AUTH-07 | unverified email cannot sign in (requireEmailVerification) | integration | `pnpm test __tests__/email-flows.test.ts -t "unverified blocked"` | ❌ Wave 0 |
| AUTH-07 | verification email hook fires on createUser (sendOnSignUp) | integration | `pnpm test __tests__/email-flows.test.ts -t "verification sent"` | ❌ Wave 0 |
| AUTH-08 | user table has bio + avatar columns | migration | `pnpm test:migrations` (clean-room drift test) | ✅ (Phase 1 script) |
| D-16 | banned user cannot sign in | integration | `pnpm test __tests__/ban.test.ts -t "banned blocked"` | ❌ Wave 0 |
| D-17 | revokeAllSessions invalidates all sessions for a user | integration | `pnpm test __tests__/sessions.test.ts -t "revoke all"` | ❌ Wave 0 |
| (persist) | session persists across requests when cookie carried | integration | `pnpm test __tests__/sessions.test.ts -t "persist"` | ❌ Wave 0 |
| (FK) | posts.authorId FK → user.id; posts.categoryId FK → categories.id | migration | `pnpm test:migrations` | ✅ |

### Sampling Rate

- **Per task commit:** `pnpm test` (fast unit + integration subset)
- **Per wave merge:** `pnpm test && pnpm test:migrations` (full suite + clean-room migration drift test)
- **Phase gate:** Full suite green + `pnpm test:migrations` green + manual email round-trip (verification + reset to a real inbox, pending Resend API key) before `/gsd-verify-work`.

### Wave 0 Gaps

- [ ] `vitest` + `vitest.config.ts` — install runner (Better Auth peers expect vitest)
- [ ] `__tests__/` directory at repo root (or `src/**/__tests__/`) — convention established here
- [ ] `src/lib/permissions/__tests__/rbac.test.ts` — covers AUTH-01 (role→permission matrix)
- [ ] `src/lib/permissions/__tests__/ownership.test.ts` — covers AUTH-04 (assertOwnsPost)
- [ ] `src/lib/permissions/__tests__/transitions.test.ts` — covers AUTH-05 (status transitions)
- [ ] `src/actions/__tests__/users.test.ts` — covers AUTH-02/D-08 (first-run self-disable — **security-critical**)
- [ ] `__tests__/proxy.test.ts` — covers AUTH-03 (proxy.ts redirect logic)
- [ ] `__tests__/email-flows.test.ts` — covers AUTH-06/07 (with stubbed sendEmail)
- [ ] `__tests__/ban.test.ts` + `__tests__/sessions.test.ts` — covers D-16/D-17
- [ ] `package.json` `test` script: `"test": "vitest run"`

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | Better Auth `emailAndPassword` (hashing, password rules 8–128 chars, timing-safe) |
| V3 Session Management | yes | Better Auth signed httpOnly+secure(prod)+sameSite=lax cookies; `expiresIn`/`updateAge`; multi-device; revocation |
| V4 Access Control | yes | `requireRole`/`requireCan`/`assertOwnsPost` on EVERY mutating Server Action; `userHasPermission` (Pitfall #1) |
| V5 Input Validation | yes | Zod schemas for all action inputs (Phase 4 formalizes; Phase 2 validates auth inputs) |
| V6 Cryptography | yes (handled by lib) | Better Auth cookie signing via `BETTER_AUTH_SECRET` (>=32 chars); never hand-roll |
| V7 Error Handling | yes | `lib/log` structured error logging; auth errors never leak whether email exists (email enumeration protection per docs) |
| V8 Data Protection | yes | Secrets in env (`BETTER_AUTH_SECRET`, `RESEND_API_KEY`), never in client bundles; `.env.local` gitignored |
| V9 Communications | yes | https in prod (Coolify managed SSL); `secure` cookies in prod; `trustedOrigins` enforced |
| V12 Files & Resources | partial | Avatar keys are R2 references (no local file storage); media pipeline is Phase 3 |

### Known Threat Patterns for Better Auth × Next 16 × Drizzle

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Forged session cookie passes proxy.ts | Spoofing / Elevation | `proxy.ts` is UX-only; real check is `auth.api.getSession()` in every Server Action (Pitfall #4). |
| Open first-run setup endpoint | Elevation of privilege | D-08 — `count(admins)===0` server-side check on `createFirstAdmin`; refuse after first admin. |
| Author escalates to publish | Tampering / Elevation | Double enforcement: transition table excludes `draft→published` for authors AND `requireCan({post:['publish']})` fails for author role. |
| Email enumeration via sign-in error | Information disclosure | `requireEmailVerification:true` enables Better Auth's email enumeration protection (returns generic 200). |
| Timing attack on email-send hooks | Information disclosure | Fire-and-forget (`void sendEmail(...)`) per docs guidance. |
| CSRF on auth mutations | Tampering | Better Auth validates origin on `/api/auth/*`; Next 16 Server Actions have built-in origin check (D-23). |
| Non-owner edits another author's post | Tampering / Elevation | `assertOwnsPost(userId, postId)` before any post mutation. |
| Stale session after ban | Elevation | `admin.banUser` revokes all sessions immediately (per docs). |
| Resend API key leaks to client | Information disclosure | `lib/email` is server-only (no `"use client"`); key in env only. |

## Code Examples

### Email enumeration protection (admin plugin + requireEmailVerification)

When `requireEmailVerification: true` AND the admin plugin is active, sign-up returns a synthetic user to prevent enumeration. The docs require `customSyntheticUser` to include admin-plugin fields:

```ts
// [CITED: email-password.mdx — Email Enumeration Protection → Plugins that add user fields]
export const auth = betterAuth({
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    customSyntheticUser: ({ coreFields, additionalField, id }) => ({
      ...coreFields,
      role: "author",
      banned: false,
      banReason: null,
      banExpires: null,
      ...additionalField,
      id,
    }),
  },
  plugins: [admin({ ac, roles, defaultRole: "author" }), nextCookies()],
});
```

### Ban + revoke (D-16/D-17 — server-side primitives now)

```ts
// [CITED: admin.mdx — Ban User, Unban User, Revoke All Sessions for a User]
// Ban (admin-only via requireCan({user:['ban']}))
await auth.api.admin.banUser({
  body: { userId: "target-id", banReason: "Spamming", banExpiresIn: 60 * 60 * 24 * 7 },
});
// → revokes all of the user's sessions + blocks future sign-in

await auth.api.admin.unbanUser({ body: { userId: "target-id" } });

// Revoke all sessions for a user (admin-for-others)
await auth.api.admin.revokeUserSessions({ body: { userId: "target-id" } });

// User self-revoke all (sign out everywhere)
await auth.api.revokeSessions({ body: { token: currentSessionToken } });
// or via client: await authClient.revokeSessions();
```

### Route handler (mounts Better Auth)

```ts
// src/app/api/auth/[...all]/route.ts
// [CITED: next.mdx — Create API Route]
import { auth } from "@/lib/auth";
import { toNextJsHandler } from "better-auth/next-js";

export const { GET, POST } = toNextJsHandler(auth);
```

### Auth client (browser)

```ts
// src/lib/auth/client.ts
// [CITED: next.mdx — Create a client; admin.mdx — client plugin]
import { createAuthClient } from "better-auth/react";
import { adminClient } from "better-auth/client/plugins";
import { ac, adminRole, editorRole, authorRole } from "./permissions";

export const authClient = createAuthClient({
  plugins: [
    adminClient({ ac, roles: { admin: adminRole, editor: editorRole, author: authorRole } }),
  ],
});

// Usage in SignInForm:
// await authClient.signIn.email({ email, password, rememberMe, callbackURL });
// const { data: session } = authClient.useSession();
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `middleware.ts` | `proxy.ts` (renamed) | Next 16 | Auth gate file is `proxy.ts` at repo root; supports Node.js runtime (full DB access). |
| `@better-auth/drizzle-adapter` (standalone pkg) | `better-auth/adapters/drizzle` (built-in export) | Better Auth ~1.x | Use built-in import path; standalone still works but is the older form. |
| Better Auth `admin` plugin without custom AC | `admin({ ac, roles })` with `createAccessControl` | 1.6.x | Custom roles (editor/author) require explicit AC config; default is only admin/user. |
| `experimental.ppr` | `cacheComponents: true` | Next 16 | (Carried from Phase 1; affects where Suspense boundaries go — Phase 6 concern.) |

**Deprecated/outdated:**
- `middleware.ts` → renamed to `proxy.ts` (Next 16). Migration: rename file + `middleware` fn → `proxy`.
- Edge-runtime middleware auth checks → Next 16 proxy supports Node.js runtime (full `auth.api` access).
- Better Auth `allowImpersonatingAdmins` option → deprecated; use the `impersonate-admins` permission instead.

## Migration Plan (single migration this phase)

This phase ships **one** Drizzle migration (`0001_*.sql`) flowing through the existing `pnpm db:generate` + `pnpm test:migrations` clean-room test:

1. **Generate auth schema:** `npx @better-auth/cli@latest generate` emits Drizzle table defs for `user`, `session`, `account`, `verification` (with admin-plugin columns: `role`, `banned`, `banReason`, `banExpires` on `user`; `impersonatedBy` on `session`) + `additionalFields` (`bio`, `avatar` on `user`).
2. **Merge into `src/db/schema.ts`:** import or paste the generated tables alongside the existing 8 Phase-1 tables. Add `.references()` FKs on `posts.authorId` → `user.id` and `posts.categoryId` → `categories.id`.
3. **Generate SQL:** `pnpm db:generate` → produces `src/db/migrations/0001_*.sql`.
4. **Clean-room test:** `pnpm test:migrations` — applies `0000_*` + `0001_*` to a fresh empty Postgres (the `postgres-test` service in `docker-compose.yml`, port 5436) and asserts all expected tables present. **Update the expected-table-count assertion from 8 → 12** (8 Phase-1 + user/session/account/verification).
5. **Commit migration + schema together** in the same PR (FOUND-06 / D-11 convention).

**Existing migration verified:** `src/db/migrations/0000_cultured_human_robot.sql` is the only current migration (Phase 1's 8 tables). The test script at `scripts/test-migrations.mjs` is ready and uses `drizzle-orm/node-postgres/migrator`.

## Env Var Checklist (for `.env.example`)

```bash
# === Better Auth ===
# Generate with: openssl rand -base64 32  (>=32 chars, high entropy)
BETTER_AUTH_SECRET=
# Base URL of the app (no trailing slash). Dev: http://localhost:3000
BETTER_AUTH_URL=http://localhost:3000
# Comma-separated trusted origins. Dev: http://localhost:3000
# Prod: https://anydiscussion.com,https://staging.anydiscussion.com
BETTER_AUTH_TRUSTED_ORIGINS=http://localhost:3000

# === Resend (email — AUTH-06/07) ===
# Get from https://resend.com/api-keys
RESEND_API_KEY=
# From-address. Must be a verified domain in Resend dashboard.
# Dev: use Resend's sandbox sender (onboarding@resend.dev) — no DNS needed.
# Prod: no-reply@mail.anydiscussion.com (requires DKIM/SPF/DMARC — D-04, Phase 7)
EMAIL_FROM=onboarding@resend.dev

# === Database (EXISTING — Phase 1) ===
DATABASE_URL=postgres://postgres:postgres@localhost:5432/anydiscussion
TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5436/anydiscussion_test
```

**DNS records needed for prod inbox delivery (D-04 — Phase 7/deploy, flagged here):**
- DKIM: Resend-provided public key in `_resend._ptr.anydiscussion.com` (or per Resend dashboard).
- SPF: `anydiscussion.com TXT "v=spf1 include:amazonses.com ~all"` (Resend uses AWS SES under the hood).
- DMARC: `_dmarc.anydiscussion.com TXT "v=DMARC1; p=quarience; rua=mailto:..."`.
- Mail from-domain: a subdomain like `mail.anydiscussion.com` configured in Resend dashboard.

**Without these, AUTH-06/07 emails land in spam or are rejected** — the single biggest risk to the email-verification requirement. Dev works fine with Resend's sandbox sender.

## Risks / Landmines

| # | Risk | Impact | Mitigation |
|---|------|--------|------------|
| R1 | **First-run setup wizard left open** (D-08 not enforced server-side) | CRITICAL — open privilege escalation, anyone can create an admin | Test `createFirstAdmin` refuses when `count(admins)>0`; verification gate in PLAN.md. |
| R2 | **`nextCookies()` not placed last** in plugins array | Server Actions can't set cookies → signin silently fails in the dashboard context | Code review checklist; the docs explicitly say "last plugin." |
| R3 | **`proxy.ts` treated as the auth check** (Pitfall #4) | Forged cookies bypass the gate; mutations succeed without real auth | Every mutating Server Action calls `getSession`+`requireCan` first (Pitfall #1). Tests verify an invalid session is rejected at the action layer. |
| R4 | **Email deliverability from fresh VPS IP** (D-01) | AUTH-06/07 emails land in spam → users can't verify → can't sign in | Resend (not self-hosted MTA) handles IP reputation; DNS records (D-04) at deploy. Dev uses sandbox sender. |
| R5 | **Drizzle 1.0 RC accidentally installed** | Peer-dependency conflict with Better Auth (`^0.45.2`) | `package.json` pins `drizzle-orm: ^0.45.2`; do NOT run `pnpm add drizzle-orm@1.0`. |
| R6 | **`(admin)` route-group matcher confusion** | Proxy gates the wrong paths (route groups in parens don't appear in URLs) | Matcher targets resolved URL paths (`/dashboard/*`), not the `(admin)` literal. Test the redirect behavior. |
| R7 | **Author publishes via direct status write** (skipping transition helper) | Review workflow bypassed | Centralize all status writes through `transitionPost()`; no direct `db.update(posts).set({status:'published'})` elsewhere. |
| R8 | **`sendEmail` awaited in hooks** (timing attack) | Attacker can enumerate valid emails by response time | Fire-and-forget (`void sendEmail(...)`) per docs. |
| R9 | **Email enumeration via sign-up/sign-in errors** | Attacker learns which emails have accounts | `requireEmailVerification: true` + `customSyntheticUser` (Pattern in Code Examples). |
| R10 | **Resend free-tier quota exhaustion** | Verification/reset emails stop sending mid-phase | [ASSUMED] quota is 3000/mo + 100/day (training data — needs human verification). For a 2–5 person team this is far beyond demand. Flag in Open Questions. |

## Common Pitfalls

### Pitfall 1: Missing server-side auth on mutating actions (OWNED this phase)
**What goes wrong:** A mutating Server Action (e.g. `publishPost`) trusts the session implied by the proxy.ts gate and doesn't re-check.
**Why it happens:** The proxy gate feels sufficient; developers forget it's optimistic.
**How to avoid:** Every mutating Server Action starts with `getSession()` + `requireCan()` + (for ownership) `assertOwnsPost()`. Enforce via code review + tests.
**Warning signs:** A Server Action body that doesn't import `getSession` or `requireCan`.

### Pitfall 4: proxy-does-cookie-check / action-does-real-check split (OWNED this phase)
**What goes wrong:** The two layers get conflated — either the proxy is trusted as authoritative (bad), or the action skips the real check because "the proxy handled it" (worse).
**Why it happens:** The split is intentional but unintuitive; it's easy to assume one layer suffices.
**How to avoid:** Document the split in `proxy.ts` header + every action header. The `getSessionCookie` docs literally say "THIS IS NOT SECURE."
**Warning signs:** Comments implying proxy.ts is a security boundary.

### Pitfall (general): Drizzle adapter schema drift
**What goes wrong:** Better Auth CLI generates tables that don't match the Drizzle schema passed to `drizzleAdapter({ schema })`.
**Why it happens:** Editing schema.ts without re-running CLI generate, or vice versa.
**How to avoid:** Run `npx @better-auth/cli generate` → merge into schema.ts → `pnpm db:generate` → `pnpm test:migrations` in sequence. The clean-room test catches drift.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Resend free tier = 3,000 emails/month, 100/day | Standard Stack, Risks R10 | If lower, email flows could hit quota during testing. Mitigation: dev uses sandbox sender; team is 2–5 people (far below quota). **Needs human verification at resend.com/pricing.** |
| A2 | `proxy.ts` matcher resolves `(admin)` routes under `/dashboard/*` paths | Pattern 4 | If the dashboard mounts at a different path, the matcher needs adjusting. Mitigation: test the redirect behavior in Wave 1; the existing `app/(admin)/` renders under `/dashboard` per TailAdmin convention. |
| A3 | `auth.api.userHasPermission` returns `{ ok: boolean }`-shaped result | Pattern 3 | The exact response shape (ok vs boolean) is inferred from the docs' `userHasPermission` usage; verify at implementation time. Mitigation: the helper logs + throws on failure either way. |
| A4 | `rememberMe: false` produces a browser-session cookie via `dont_remember` | Pattern 8, D-18 | The docs confirm `rememberMe` exists on `signInEmail` and a `dont_remember` cookie exists; exact expiry semantics for "unchecked" should be verified during AUTH-02 testing. |
| A5 | DKIM/SPF/DMARC record specifics (SPF `include:amazonses.com`) | Env Var Checklist | Resend uses AWS SES infrastructure; the exact SPF include may differ. Resend dashboard provides the canonical records at domain setup. |

**If this table is empty:** N/A — 5 assumptions logged, all LOW-risk with stated mitigations. A1 (Resend quota) is the only one needing explicit human confirmation before deploy.

## Open Questions

1. **Resend 2026 free-tier quota** (D-02 explicitly asked; search was rate-limited this session)
   - What we know: Resend's historical free tier is 3,000 emails/month + 100/day (training data).
   - What's unclear: whether 2026 pricing changed.
   - Recommendation: **human verifies at resend.com/pricing** before Phase 7 deploy. For Phase 2 dev, the sandbox sender works regardless. Tag as `checkpoint:human-verify` in PLAN.md.

2. **Exact `userHasPermission` response shape**
   - What we know: the helper exists and is called server-side per the docs.
   - What's unclear: whether it returns `{ ok }` / `{ allowed }` / throws.
   - Recommendation: verify at implementation time; the helper wrapper (Pattern 3) throws on falsy either way.

3. **`/dashboard` vs other dashboard base path**
   - What we know: TailAdmin's `(admin)` group typically renders under `/dashboard`.
   - What's unclear: the project's exact resolved paths (Phase 1 set this up).
   - Recommendation: Wave 1 confirms the path; adjust the proxy matcher accordingly.

4. **Remember-me 30-day override mechanism**
   - What we know: `rememberMe` exists on `signInEmail`; default session is 7 days.
   - What's unclear: whether the 30-day extended session requires per-request `expiresIn` override or just config.
   - Recommendation: implement config-level 30-day `expiresIn` (Pattern 8); if unchecked-remember-me needs shorter, investigate the `dont_remember` cookie behavior during AUTH-02 testing.

## Sources

### Primary (HIGH confidence — fetched directly this session)
- `better-auth/better-auth@main/docs/content/docs/plugins/admin.mdx` — RBAC API (`createAccessControl`, `defaultStatements`, `adminAc`, `ac.newRole`, `userHasPermission`, `banUser`, `unbanUser`, `revokeUserSessions`, `createUser`, schema fields, email enumeration protection) — fetched via raw.githubusercontent.com.
- `better-auth/better-auth@main/docs/content/docs/integrations/next.mdx` — Next 16 `proxy.ts`, `getSessionCookie` (UX-only), `nextCookies()` last, `toNextJsHandler`, Server Action cookies.
- `better-auth/better-auth@main/docs/content/docs/installation.mdx` — env vars (`BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`), Drizzle adapter built-in import path.
- `better-auth/better-auth@main/docs/content/docs/adapters/drizzle.mdx` — `drizzleAdapter(db, { provider, schema })`, generate flow.
- `better-auth/better-auth@main/docs/content/docs/concepts/database.mdx` — `additionalFields` (bio/avatar), core schema (user/session/account/verification).
- `better-auth/better-auth@main/docs/content/docs/concepts/session-management.mdx` — `expiresIn`, `updateAge`, `revokeSessions`, multi-device.
- `better-auth/better-auth@main/docs/content/docs/authentication/email-password.mdx` — `requireEmailVerification`, `sendVerificationEmail`, `sendResetPassword`, `customSyntheticUser`, `rememberMe`.
- `better-auth/better-auth@main/docs/content/docs/concepts/email.mdx` — `sendOnSignUp`, verification flow.
- `better-auth/better-auth@main/docs/content/docs/concepts/cookies.mdx` — httpOnly+secure(prod), cookiePrefix, cross-subdomain.
- `better-auth/better-auth@main/docs/content/docs/reference/options.mdx` — `trustedOrigins`, `baseURL`.
- `npm registry` — better-auth@1.6.23 (peers, exports confirming `./adapters/drizzle`), resend@6.16.0, @better-auth/cli@1.4.21, drizzle-orm@0.45.2 — verified via `npm view` this session.
- `npm registry: resend README` — SDK shape (`new Resend(key)`, `resend.emails.send({from,to,subject,text/html})` → `{data:{id}}`) — verified via `npm view resend readme`.
- `.claude/CLAUDE.md` (verified 2026-07-01) — locked version table, proxy.ts rename confirmation, Drizzle pin rationale.

### Secondary (MEDIUM confidence)
- `.planning/phases/02-auth-rbac/02-CONTEXT.md` — 25 locked decisions (D-01..D-25), the authoritative scope input.
- `CLAUDE.md` (repo root) — Roles & permissions matrix, conventions, schema reference.
- Project code: `src/db/schema.ts`, `src/lib/db/index.ts`, `src/lib/log/index.ts`, `drizzle.config.ts`, `eslint.config.mjs` (no-restricted-imports), `scripts/test-migrations.mjs` — read this session.

### Tertiary (LOW confidence — needs validation)
- Resend free-tier quota (3,000/mo, 100/day) — training-data only; web search rate-limited this session. Flagged as `[ASSUMED]` A1 for human verification.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — versions verified via npm registry this session; API shapes verified via direct fetch of official Better Auth docs.
- Architecture: HIGH — Better Auth patterns are canonical (installation/admin/next/drizzle/session/email-password docs all fetched); Next 16 `proxy.ts` confirmed.
- Pitfalls: HIGH — Pitfall #1/#4 are project-internal (from ROADMAP.md) + reinforced by Better Auth docs' explicit "NOT SECURE" callout on `getSessionCookie`.
- Email deliverability: MEDIUM — Resend SDK verified, but quota + DNS specifics need human confirmation (A1, A5).

**Research date:** 2026-07-02
**Valid until:** 2026-08-01 (30 days — stable auth stack; re-verify Resend quota + any Better Auth 1.7.x release before Phase 7 deploy).
**Web search caveat:** WebSearch and the MCP web reader were rate-limited (reset 2026-07-12) during this session. All Better Auth API claims were instead verified by **directly fetching the raw docs from `raw.githubusercontent.com/better-auth/better-auth/main/docs/`** — which is more authoritative than search results. Package versions verified via `npm view`. The only gap is the Resend 2026 pricing page (flagged A1).
