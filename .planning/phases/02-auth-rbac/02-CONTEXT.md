# Phase 2: Auth + RBAC - Context

**Gathered:** 2026-07-02
**Status:** Ready for planning

<domain>
## Phase Boundary

A small editorial team (admin/editor/author) can securely sign into the dashboard, and the **server-side enforcement primitives** for the review workflow exist and are exercised — so that when posts ship in Phase 3, role/ownership checks are genuinely enforced, not decorative. Concretely this phase delivers:

- **Better Auth + `admin` plugin** wired in (`src/lib/auth/`), generating the `users` table + auth tables via the Drizzle adapter, then extending `users` with a `role` field and the AUTH-08 profile fields (`bio`, `avatar`).
- **`posts.author_id` / `category_id` FK constraints** added (Phase 1 left them as plain integer columns per D-07).
- **`proxy.ts`** (Next 16 — renamed from `middleware.ts`) cookie-existence gate on `(admin)`, plus reverse redirect of already-authed users away from `/signin`.
- **`src/lib/permissions/`** helpers — `requireRole`, `requireCan`, `assertOwnsPost` — that every mutating Server Action calls first (Pitfall #1 + #4 owned here).
- **Sign-in + first-run setup** — the existing TailAdmin `signin` page wired to Better Auth; the existing `signup` page repurposed as a first-run "create admin" setup screen that self-disables once any admin exists.
- **SMTP** for password-reset + email-verification (AUTH-06/07) via a thin `lib/email` helper (Resend), with email verification required before sign-in.
- **Review-workflow primitives** — status transition rules + permission helpers built on the already-existing `postStatusEnum` (`draft`/`pending_review`/`published`), enforcing author → submit-for-review → editor/admin-approve → publish.
- **Session + ban primitives** — "sign out everywhere" (revoke-all-sessions) and user ban/disable, server-side now; management UI in Phase 4.

**Out of scope:** posts/content CRUD + Tiptap + media UI (Phase 3), TailAdmin wiring to real data + users/ban/session management UI (Phase 4), SEO (Phase 5), public frontend (Phase 6), rate limiting on auth endpoints (Phase 7 / PERF-04), the production backup system (Phase 8). Reader-facing auth / open public sign-up remains explicitly excluded.

</domain>

<decisions>
## Implementation Decisions

### Email delivery (AUTH-06, AUTH-07)
- **D-01 (Source):** **Free transactional service** for auth emails (verification + password reset), NOT a self-hosted MTA. Rationale: deliverability from a fresh VPS IP is the practical dealbreaker for email verification — auth emails landing in spam would silently break AUTH-07. Free tier is NOT a paid API; acceptable mild external-dependency tension vs the self-hosted ethos.
- **D-02 (Provider):** **Resend** as the default provider (best Next 16 DX, clean SDK). **Researcher must verify the current free-tier quota** (not in the 2026-07-01 version check). Brevo / Amazon SES are easy swaps. Lock-in is low because of D-03.
- **D-03 (Architecture):** **Thin `lib/email` helper**, not a swappable provider abstraction. One module wrapping the Resend SDK + Better Auth's `sendEmail` hook, hardcoded for v1. Email is unlike storage (no per-request cost concerns, low volume, auth-only) — abstracting now is over-engineering. Swapping later = a 1-file edit.
- **D-04 (From-domain / DNS):** DKIM/SPF/DMARC + a mail from-domain on `anydiscussion.com` are a **deploy dependency** — Phase 7 stands up the prod Coolify environment, but the DNS records MUST exist for AUTH-07 to actually reach inboxes. **Flag for the researcher/planner** to specify the env vars + record set; do not leave email deliverability implicit.

### Account setup & bootstrap (AUTH-02)
- **D-05 (Creation flow):** **Admin sets full credentials** (email + password + role) from the dashboard and hands them over. No open public sign-up, no invite-email flow. Tradeoff acknowledged: the admin knows the password — defensible for a small trusted team (2–5 people), recorded here and not re-litigated. AUTH-07 verification still fires on every creation (so future password resets reach a real inbox).
- **D-06 (First-run setup wizard):** When the app runs with **zero admin accounts**, it routes to a "create admin account" screen; on submit it creates the first admin and redirects to the login page. Detection = `count(admins) === 0`. This is the only bootstrap path — no seed script, no CLI.
- **D-07 (Setup screen location):** **Repurpose the existing TailAdmin `(full-width-pages)/(auth)/signup` page** as the first-run admin-creation screen (the `signup` page is NOT deleted). The existing `signin` page is wired to Better Auth normally.
- **D-08 (Setup self-disables — HARD security requirement):** The create-admin Server Action **must** check `count(admins) === 0` server-side and refuse (redirect/fail) if any admin already exists. Otherwise the setup route is an open "make yourself admin" endpoint. UI hiding alone is not enough (CLAUDE.md security constraint). This is non-negotiable.
- **D-09 (Verification strictness):** **Email verification required before sign-in** (`requireEmailVerification: true`). An unverified account cannot sign in until the verification link is clicked — guarantees every signed-in user has a reachable email, so AUTH-06 password resets never route to a dead inbox.

### Permission model (AUTH-01, AUTH-04) — resolves STATE.md blocker
- **D-10 (Model):** **3 fixed roles (admin/editor/author), pure role-based**, via Better Auth's `admin` plugin `createAccessControl`. Each role maps to a fixed, hardcoded permission set. The `access` plugin is **NOT pulled in** — no per-user permission statements, no per-user exceptions. This closes the open STATE.md blocker ("is the access plugin needed beyond the 3 roles?" → No).
- **D-11 (Role → capability matrix):** Follows CLAUDE.md "Roles & permissions" — **admin** = full (content, users, all settings, custom code, menus/header-footer, SEO); **editor** = create/edit/publish any post, manage categories/tags, no users/settings; **author** = create/edit only own posts, submit for review, cannot publish directly, no settings. Helpers (`requireRole`/`requireCan`/`assertOwnsPost`) check against this fixed mapping.
- **D-12 (Helper granularity):** `requireRole(role)` for route/action-level role gates; `requireCan(permission)` for capability checks against the role's statement set; `assertOwnsPost(userId, postId)` for ownership. Every mutating Server Action starts with the appropriate check (Pitfall #1). Exact statement names + internal structure are planner discretion.

### Review workflow transition rules (AUTH-05)
- **D-13 (Edit-after-publish = live edits):** When an author edits their own **published** post, it **stays published** — changes go live immediately. The author effectively retains publish-equivalent power over their own already-approved posts. Chosen because v1 has no revision history (CONTv2-01 deferred) — the "demote to pending_review on edit" alternative would take the post offline until re-approval, which is disruptive without revisions. **Stricter editorial control is a v2 fast-follow** once CONTv2-01 exists.
- **D-14 (Edge policy = trusting/flexible):** Consistent with D-13's trusting posture, an author may: (a) **recall** their own `pending_review` post → `draft` (submitted prematurely); (b) **unpublish** their own `published` post → `draft`; (c) **re-publish** their own previously-published post; (d) **soft-delete** their own `draft` posts. Every one of these is **ownership-checked via `assertOwnsPost`**. Editors/admins retain override on any post. `deletedAt` soft-delete per Phase-1 D-08.
- **D-15 (Happy path):** Author saves `draft` → submits → `pending_review` → editor/admin approves → `published`. Authors cannot move a post to `published` directly (enforced server-side). The status enum already exists in `schema.ts`; Phase 2 locks the transition rules + the helpers that enforce them.

### Ban + session primitives (AUTH-01/04, ahead of Phase 4 UI)
- **D-16 (Ban primitive — ship now):** Implement the server-side ban/unban capability now via the admin plugin (`admin.banUser`, optional reason/expiry) + an admin-only `requireCan('user.ban')` check, and confirm Better Auth blocks banned users from signing in. The dashboard UI to invoke it lands in **Phase 4 (DASH-04)**. Consistent with the phase goal ("primitives exist and are exercised").
- **D-17 (Revoke-all-sessions primitive — ship now):** Implement "sign out everywhere" (revoke all sessions for the current user; and admin-revoke-for-others, same shape as D-16) now, server-side. Session-listing/management UI lands in **Phase 4**. Same primitive-now/UI-later split.

### Session policy
- **D-18 (Duration + remember-me):** Better Auth's default session config + a **"Remember me" checkbox** on the sign-in page — checked = extended session (e.g. 30 days), unchecked = short session (e.g. 7 days / browser-session). **Multi-device sessions allowed** (Better Auth default). Researcher confirms exact expiry values against Better Auth 1.6.23.

### Sign-in / gate behavior
- **D-19 (Post-login redirect = deep-link return):** After a successful sign-in, redirect back to the **originally-requested URL** (via a `next`/`callbackURL` param stashed when `proxy.ts` bounced them to `/signin`). If none, fall back to the dashboard home. Standard deep-link UX for a team working from notification links.
- **D-20 (Gate scope):** `proxy.ts` gates **`(admin)` only** — matcher explicitly excludes `(site)`, the `(auth)` pages (`signin`, `signup`/setup), and error pages. A signed-in user hitting `/signin` is **redirected to the dashboard**. The cookie-existence gate is a **UX layer only** — authoritative RBAC happens server-side in every Server Action (Pitfall #4 owned). Researcher verifies exact Next 16 `proxy.ts` matcher syntax.

### Origins / cookies / CSRF
- **D-21 (trustedOrigins):** Env-driven — `localhost` (dev), staging domain, `anydiscussion.com` (prod). Better Auth config reads the list from env.
- **D-22 (Cookie scope):** Auth cookies are **httpOnly + secure (prod) + sameSite=lax**, scoped to the app domain. `cdn.anydiscussion.com` carries **media only** (the `next/image` loader) — it is unrelated to auth cookies and does NOT need cross-subdomain cookie scope.
- **D-23 (CSRF):** Handled by **Better Auth on its own routes** + **Next 16's built-in Server Action origin check**. No extra CSRF library.

### AUTH-08 — profile fields (Claude's discretion; user did not elect to discuss)
- **D-24 (Profile fields now):** Add **`bio` (text)** + **`avatar` (R2 object key)** to the `users` table this phase — both feed the Phase 6 byline/author pages (SITE-06). Display name uses Better Auth's default `user.name` field. Social links / job title / other byline niceties **defer to Phase 6** (not needed to satisfy AUTH-08).
- **D-25 (Avatar storage = R2):** Avatars upload via the **existing media pipeline** (Phase 1 `lib/r2` → Phase 3 `lib/storage/`) — consistent with the project's R2-only media rule, no external Gravatar dependency (aligns with self-hosted ethos). Gravatar as a v2 fast-follow if ever desired.

### Claude's Discretion
Areas the user explicitly delegated ("You decide") — researcher/planner has flexibility, decisions above record Claude's pick + the rationale:
- **Email provider** (D-02): Resend, pending quota verification.
- **Email architecture** (D-03): thin helper, not an abstraction.
- **Edit-after-publish policy** (D-13): live edits, due to v1's no-revision-history constraint.
- **Edge policy** (D-14): trusting/flexible, consistent with D-13.
- **AUTH-08 profile/avatar** (D-24/D-25): bio + R2 avatar now.
- Internal helper API shapes (D-12), exact session expiry values (D-18), exact `proxy.ts` matcher syntax (D-20), Better Auth config field keys — all researcher/planner verified against 1.6.23 docs.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project-level (stack + scope — authoritative)
- `CLAUDE.md` (repo root) — locked stack, conventions, folder structure, schema reference, "Roles & permissions" (admin/editor/author matrix), and "What NOT to do" (never rely on UI hiding alone; never hand-write SQL; pnpm only; R2 only for media).
- `.claude/CLAUDE.md` — **verified 2026 version table + code shapes**: Better Auth 1.6.23 (peers `next ^16`, `drizzle-orm ^0.45.2`), the `admin` plugin **is** the RBAC plugin (`createAccessControl`, `userHasPermission`), `nextCookies()` plugin added **last**, Drizzle pinned 0.45.2 (do NOT adopt 1.0 RC), Next 16 `proxy.ts` (renamed from middleware), 2-arg `revalidateTag`. Read before any Better Auth install/config.
- `.planning/PROJECT.md` — v1 scope, Key Decisions, Context (existing TailAdmin scaffold, small fixed team 2–5, no reader auth, self-hosted/no-paid-API ethos).

### Phase-2-specific (requirements + roadmap)
- `.planning/REQUIREMENTS.md` — **AUTH-01..08** (the 8 requirements this phase must satisfy), plus the Out-of-Scope row "Reader-facing auth / open public sign-up".
- `.planning/ROADMAP.md` §"Phase 2: Auth + RBAC" — goal, 5 success criteria, **Pitfalls #1** (missing server-side auth on mutating actions) **and #4** (proxy-does-cookie-check / action-does-real-check split), **research flag (MEDIUM)**: re-verify `admin` plugin API (`createAccessControl`, `userHasPermission`), whether `access` plugin is needed beyond 3 roles (→ resolved NO by D-10), `nextCookies()`-last placement, exact `proxy.ts` matcher.

### Prior-phase context (carries forward)
- `.planning/phases/01-foundation/01-CONTEXT.md` — **D-07** (`users` table deferred to Phase 2 — Better Auth generates it; `posts.author_id`/`category_id` FK added Phase 2), **D-08** (soft-delete `deletedAt`), **D-11** (forward-only migrations, no down scripts), **D-16** (`@/*`→`src/*`), **D-17** (`lib/log` wrapper exists).

### Code (current state — scout-verified)
- `src/db/schema.ts` — current 8-table schema; **`users` table is NOT present** (Better Auth generates it this phase); `postStatusEnum` (`draft`/`pending_review`/`published`) **already exists** — Phase 2 builds transition rules on top; `posts.authorId`/`categoryId` are plain `integer` columns with no `.references()` (FK added this phase per D-07).
- `src/lib/log/index.ts` — the dependency-free log wrapper (D-17) to reuse inside Server Actions / auth helpers for structured error logging.
- `src/lib/db/index.ts` — the Drizzle client singleton Better Auth's adapter will bind to.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **TailAdmin `(auth)` pages** — `src/app/(full-width-pages)/(auth)/signin/page.tsx` (wire to Better Auth sign-in) and `src/app/(full-width-pages)/(auth)/signup/page.tsx` (**repurpose as the first-run setup screen** per D-07), plus their `layout.tsx`. Reuse, don't recreate.
- **`(admin)` shell** — `AppSidebar`/`AppHeader`/contexts in `src/layout/` already exist; Phase 2 only adds the auth gate in front of them (Phase 4 wires real data).
- **`lib/log`** — structured logging wrapper for auth/action error paths.
- **`lib/db`** — Drizzle client singleton; Better Auth's Drizzle adapter reuses the same connection.

### Established Patterns
- **pnpm-only**; migrations via `drizzle-kit generate` (never hand-write SQL); clean-room migration test (`pnpm test:migrations`) catches drift — the new `users` table + `role`/`bio`/`avatar` columns + FKs flow through the same pipeline.
- **Server Actions as the default mutation path** + Zod schemas shared client/server (Phase 4 formalizes RHF+Zod; Phase 2 establishes the action-first + permission-check-first convention).
- **ESLint `no-restricted-imports`** keeps `(site)`/`(admin)` isolated — auth helpers live in shared `src/lib/auth` + `src/lib/permissions` (outside `app/`), importable by `(admin)` without leaking to `(site)`.

### Integration Points
- **New config/route files:** `proxy.ts` at repo root (Next 16 rename of `middleware.ts`); `src/lib/auth/index.ts` (Better Auth instance + `nextCookies` last) + `src/lib/auth/server.ts` (`getSession` etc.); `src/lib/permissions/index.ts` (`requireRole`/`requireCan`/`assertOwnsPost`); `src/lib/email/index.ts` (Resend + `sendEmail` hook).
- **New Server Actions:** `src/actions/users.ts` (create user with full credentials, ban/unban, revoke sessions) — each starting with the appropriate permission check.
- **Schema changes (one migration):** Better Auth generates `users` + session/account/verification tables via its Drizzle adapter; then add `role` (enum: admin/editor/author), `bio`, `avatar` columns to `users`; add `.references()` FKs on `posts.authorId` → `users.id` and `posts.categoryId` → `categories.id`.
- **Env additions (`.env.example`):** Better Auth secret + base URL; Resend API key + from-domain; `trustedOrigins` list. (`.env.example` currently has MinIO/storage defaults from Phase 1.)

</code_context>

<specifics>
## Specific Ideas

- **First-run setup wizard** (D-06/D-07): the user gave a concrete vision — *"when this application run first time it will ask to create admin account then it will redirect to login page."* This is the WordPress-style install screen pattern, repurposing the existing TailAdmin signup page. The self-disable server check (D-08) is the non-negotiable security counterpart.
- No aesthetic/branding references (branding deferred to the UI phase, per PROJECT.md). The founder's preferences here are security/posture/workflow choices (D-01..D-25), not look-and-feel.

</specifics>

<deferred>
## Deferred Ideas

- **Stricter editorial control (publish → pending_review on edit) → v2.** Needs revision history (CONTv2-01) to work without taking posts offline. Phase 2 ships live-edits (D-13) instead.
- **Gravatar avatar source → v2 fast-follow** (D-25). v1 uses R2 via the existing media pipeline.
- **Social links / job title / extra byline fields → Phase 6** (SITE-06 author/byline pages). AUTH-08 only needs bio + avatar.
- **Ban / revoke / session-listing management UI → Phase 4** (DASH-04). Phase 2 ships the server-side primitives only.
- **Rate limiting on auth endpoints → Phase 7** (PERF-04) — sign-in, password reset.
- **Email deliverability DNS records (DKIM/SPF/DMARC + mail from-domain) → deploy / Phase 7**, but flagged here (D-04) because AUTH-07 cannot reach inboxes without them.
- **OAuth/social sign-in, 2FA, magic links, passkeys → out of scope (v1).** Auth is for the dashboard team only; admin sets credentials.

### Reviewed Todos (not folded)
- **"Configurable multi-destination backup system"** (pending todo, area: database, matched Phase 2 with score 0.6) — **reviewed, NOT folded.** The match was a false positive (generic keyword overlap: "planning, requirements, phase"). This todo was already mutated into the new **Phase 8 — Backup & Disaster Recovery** (BACKUP-01..05) via the roadmap update on 2026-07-02; it is unrelated to auth/RBAC and remains Phase 8's concern. See `.planning/todos/pending/2026-06-30-configurable-multi-destination-backup-system.md`.

</deferred>

---

*Phase: 2-Auth + RBAC*
*Context gathered: 2026-07-02*
