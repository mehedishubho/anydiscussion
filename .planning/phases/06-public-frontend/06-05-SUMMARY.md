---
phase: 06-public-frontend
plan: 05
subsystem: ui
tags: [react-hook-form, zod, server-actions, resend, next.js-16, rate-limiting, honeypot]

# Dependency graph
requires:
  - phase: 02-auth-rbac
    provides: lib/email (Phase-2 Resend wrapper — fire-and-forget, never throws R8)
  - phase: 04-dashboard-chrome
    provides: Dashboard-managed "contact" pages row (D-17 seed) + RHF+zodResolver form pattern
  - phase: 05-seo-basics
    provides: buildPageMetadata / getSeoSettings / renderPostBody (Pitfall #2 gate)
  - phase: 06-public-frontend
    provides: lib/rate-limit tryConsume + lib/queries/pages getPublishedPage (Plan 06-01)
provides:
  - Public Contact form (SITE-10) — RHF + Zod + useTransition, submitted via the submitContact Server Action
  - submitContact Server Action — honeypot + per-IP in-memory rate-limit + fire-and-forget email via lib/email (D-07/D-08)
  - Shared contact-schema.ts (Zod v4) reused by both the client form (RHF) and the Server Action
  - /contact page rendering dashboard-managed content + the form (works regardless of content row presence)
affects: [07-performance-deploy, uat, v2-redis-rate-limit]

# Tech tracking
tech-stack:
  added: []  # no new packages — all primitives already in package.json
  patterns:
    - "Server Action WITHOUT requireCan (contact is unauthenticated — honeypot + rate-limit are the controls, D-07)"
    - "useTransition + startTransition for Server Action invocation in (site) — NOT useMutation (D-28 forbids TanStack Query in (site))"
    - "Pure-schema sibling module (contact-schema.ts) re-exporting zodResolver — 'use server' files can only export async functions"
    - "Honeypot field visually hidden via absolute off-screen positioning (NOT display:none — bots skip those)"

key-files:
  created:
    - src/actions/contact-schema.ts
    - src/actions/contact.ts
    - src/components/site/ContactForm.tsx
    - src/app/(site)/contact/page.tsx
  modified: []

key-decisions:
  - "Honeypot field named 'website' — bots auto-fill fields named website/url most reliably (CONTEXT.md discretion item, D-07)"
  - "Rate-limit profile: 5 submissions per IP per hour (tryConsume from 06-01's in-memory limiter; single-instance v1 — Redis is v2 SCALE-01)"
  - "Recipient fallback admin@anydiscussion.com when contact.recipient_email setting is unset (admin-configurable via dashboard, no redeploy)"
  - "Email subject fallback uses sender's name when subject field is empty (`Contact: ${data.subject ?? data.name}`)"
  - "ContactForm copies INPUT_CLASS/LABEL_CLASS strings from SeoSettingsForm (NOT imported — route-group isolation); brand-*/error-*/success-* tokens are global"

patterns-established:
  - "Pattern: unauthenticated public Server Action (no requireCan) — honeypot + per-IP rate-limit replace the permission gate (D-07)"
  - "Pattern: (site) client interactivity via useTransition — D-28's TanStack-Query-forbidden-in-(site) resolution for form submissions"
  - "Pattern: silent-success honeypot — bots see `{ ok: true }` (same UX as a real user) so they don't retry with a different payload"

requirements-completed: [SITE-10]

# Coverage metadata (#1602)
coverage:
  - id: D1
    description: "submitContact Server Action — Zod parse + honeypot silent-success + per-IP rate-limit (5/hr) + fire-and-forget sendEmail via lib/email. NO 'use cache' (Pitfall 7), NO requireCan (unauthenticated), NO DB writes (D-08)."
    requirement: "SITE-10"
    verification:
      - kind: unit
        ref: "src/actions/contact.ts — structural greps confirm: no 'use cache' directive, no requireCan call (comments only), honeypot `if (data.website)` check present, tryConsume from @/lib/rate-limit invoked, sendEmail from @/lib/email invoked, no db.insert/update/delete"
        status: pass
      - kind: unit
        ref: "pnpm test (full suite) — 384 tests / 37 files all green after 06-05 changes"
        status: pass
    human_judgment: true
    rationale: "Email delivery path (lib/email → Resend) requires operator RESEND_API_KEY + DNS deliverability — same UAT deferral as Phase 2 AUTH-06/07. Automation proves the action's structure + types + suite-green but cannot prove a real inbox receives the message."
  - id: D2
    description: "ContactForm client component (RHF + zodResolver + useTransition) with honeypot field, success/error states, and rate-limit-aware messaging. No useMutation (D-28), no @tanstack/react-query import in (site)."
    requirement: "SITE-10"
    verification:
      - kind: unit
        ref: "src/components/site/ContactForm.tsx — structural greps confirm: 'use client' directive, useForm present, zodResolver present, useTransition() invoked (line 78), useMutation never invoked, no @tanstack/react-query import, honeypot field with tabIndex -1 + aria-hidden + autoComplete off"
        status: pass
      - kind: unit
        ref: "pnpm tsc --noEmit — no errors in any 06-05 file (pre-existing errors in unrelated storage-settings test + auth forms remain — out of scope)"
        status: pass
    human_judgment: true
    rationale: "Form UX (visual layout, accessibility, success/error messaging tone, honeypot invisibility to real users) requires human visual verification — automation proves structure but not feel."
  - id: D3
    description: "/contact page — server component rendering the dashboard-managed 'contact' pages row body via renderPostBody (Pitfall #2 gate) followed by ContactForm. generateMetadata uses buildPageMetadata with the page's SEO columns or static fallback. Form renders even when the content row is missing."
    requirement: "SITE-10"
    verification:
      - kind: unit
        ref: "src/app/(site)/contact/page.tsx — structural greps confirm: getPublishedPage('contact') called, <ContactForm> rendered, renderPostBody invoked before dangerouslySetInnerHTML"
        status: pass
    human_judgment: true
    rationale: "Page composition + metadata rendering requires browser-driven visual verification against a real 'contact' pages row (the dashboard-managed content)."

# Metrics
duration: 11min
completed: 2026-07-07
status: complete
---

# Phase 6 Plan 5: Contact Form Summary

**Public Contact form (SITE-10) — RHF + shared Zod submitted via useTransition → submitContact Server Action with honeypot + per-IP rate-limit + fire-and-forget Resend email (D-07 reuse, D-08 no DB).**

## Performance

- **Duration:** 11 min
- **Started:** 2026-07-07T15:59:07Z
- **Completed:** 2026-07-07T16:10:47Z
- **Tasks:** 2
- **Files modified:** 4 (all created)

## Accomplishments

- Built the project's ONLY mutating Server Action without a `requireCan` permission gate (`submitContact`) — honeypot + per-IP in-memory rate-limit replace the auth gate per D-07. Email-only with zero DB footprint per D-08.
- Hardened the action against the Pitfall 7 footgun (no `'use cache'` — Server Actions are mutations, never cached) and the T-06-12 spam/DoS threat (honeypot silent-success + 5-per-hour rate-limit).
- Reused the established pure-schema-sibling pattern (`contact-schema.ts` next to `contact.ts`) so the shared Zod v4 schema is provably the same contract on client (RHF) and server (parse) — mirrors the `seo-settings-schema.ts` / `settings.ts` split.
- Established the (site) form-submission idiom: `useTransition` + `startTransition` for Server Action invocation. This is D-28's resolution for "no TanStack Query in (site)" applied to a real form (the dashboard's `useMutation` pattern does NOT cross the route boundary).
- Wired the dashboard-managed "contact" pages row (seeded Phase 4 D-17) into the public `/contact` route via `getPublishedPage` + `renderPostBody` (Pitfall #2 gate), with a static fallback heading so the form works even before the admin publishes content.

## Task Commits

Each task was committed atomically:

1. **Task 1: contact-schema + submitContact Server Action** — `865ef93` (feat)
2. **Task 2: ContactForm client component + /contact page** — `a6d6c4b` (feat)

## Files Created/Modified

- `src/actions/contact-schema.ts` — Pure Zod v4 schema (`contactSchema`: name/email/subject/message/website-honeypot) + `ContactInput` type + re-export of `zodResolver`. Shared by client + server (single contract).
- `src/actions/contact.ts` — `"use server"` action `submitContact`: Zod parse → honeypot silent-success → tryConsume rate-limit (5/hr per IP via `lib/rate-limit`) → `sendEmail` via `lib/email` (fire-and-forget, never throws R8). Reads `contact.recipient_email` from settings with `admin@anydiscussion.com` fallback. NO `'use cache'`, NO `requireCan`, NO DB writes.
- `src/components/site/ContactForm.tsx` — `"use client"` RHF form. `useForm` + `zodResolver(contactSchema)` + `useTransition` + `startTransition` (NOT `useMutation` — D-28). Five fields including the visually-hidden honeypot (off-screen absolute positioning + `aria-hidden` + `tabIndex -1` + `autoComplete off`). Success ("Message sent!") and error states (rate-limit-aware messaging). `INPUT_CLASS`/`LABEL_CLASS` copied (NOT imported) from `SeoSettingsForm` per route-group isolation.
- `src/app/(site)/contact/page.tsx` — Server component. Fetches the "contact" pages row via `getPublishedPage` (Plan 06-01), renders the body via `renderPostBody` (Pitfall #2 gate) before `dangerouslySetInnerHTML`, then mounts `<ContactForm>`. `generateMetadata` uses `buildPageMetadata` with the page's SEO columns or a static "Contact Us" fallback. Form renders even when the row is missing.

## Decisions Made

- **Honeypot field name: `website`** — bots auto-fill fields named "website"/"url" most reliably (CONTEXT.md discretion item per D-07). The schema marks it `optional()` so real users pass validation; the action rejects any non-empty value with silent success.
- **Rate-limit profile: 5 submissions per IP per hour** — generous enough for a real user who needs to retry; tight enough to blunt scripted abuse. Uses `tryConsume(ip, 5, 3600000)` from Plan 06-01's in-memory limiter (single-instance v1; Redis is v2 SCALE-01).
- **Recipient fallback: `admin@anydiscussion.com`** — the real address lives in the `contact.recipient_email` setting (seeded in Plan 06-01) so the admin can change it without a redeploy. The fallback covers dev/empty-seed cases.
- **Subject fallback: `Contact: ${data.subject ?? data.name}`** — when the optional subject field is empty, the email subject uses the sender's name so the admin inbox still has a meaningful subject line.
- **Form styling: copy class strings, don't import** — `INPUT_CLASS`/`LABEL_CLASS` are duplicated from `SeoSettingsForm.tsx` because the (site)/(admin) isolation rule forbids cross-imports. The `brand-*`/`error-*`/`success-*` color tokens are global (defined in `src/app/globals.css`), so the same Tailwind classes work in both route groups.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None for code — `contact.recipient_email` is seeded in Plan 06-01 and falls back to `admin@anydiscussion.com` when unset. The admin should set the real recipient via the dashboard settings before launch (no code change required).

Email delivery end-to-end requires operator `RESEND_API_KEY` + DNS deliverability (DKIM/SPF/DMARC) — same UAT deferral as Phase 2 AUTH-06/07. The action's `lib/email` wrapper never throws (R8), so a missing/invalid key degrades gracefully (user sees success; admin inbox just doesn't get the message).

## Next Phase Readiness

- SITE-10 closed. The Contact form is the only public mutation besides the view-count increment (Plan 06-04) and is fully wired.
- Email delivery verification deferred to UAT (requires operator `RESEND_API_KEY` + DNS) — same handler as Phase 2's AUTH-06/07 real-inbox deferral.
- Phase 7 (Performance & Deploy) will audit the (site) bundle for dashboard-JS leakage (PERF-02) — `ContactForm.tsx` is `useTransition`-based, not `useMutation`, so no `@tanstack/react-query` JS enters the public bundle.
- v2 (SCALE-01) will swap `lib/rate-limit`'s in-memory Map for Redis when a second Coolify replica is added.

## Self-Check: PASSED

- All 4 created files exist on disk: `src/actions/contact-schema.ts`, `src/actions/contact.ts`, `src/components/site/ContactForm.tsx`, `src/app/(site)/contact/page.tsx`.
- Both task commits present in git log: `865ef93` (Task 1), `a6d6c4b` (Task 2).
- SUMMARY.md itself present at `.planning/phases/06-public-frontend/06-05-SUMMARY.md`.

---
*Phase: 06-public-frontend*
*Completed: 2026-07-07*
