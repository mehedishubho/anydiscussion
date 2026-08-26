---
phase: 02
slug: auth-rbac
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
created: 2026-08-27
---

# Phase 02 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

> Retroactive audit (State B): the phase executed 2026-07 without a SECURITY.md
> (`security_enforcement` was enabled after execution). Register sourced from the
> `<threat_model>` blocks of all six PLANs (02-01 … 02-06); mitigation presence
> verified against the implementation at ASVS L1 (grep-depth) on 2026-08-27, plus
> live UAT evidence recorded 2026-08-24 in 02-UAT.md and the goal-backward
> verification in 02-VERIFICATION.md.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| Browser → middleware.ts (proxy) | Unauthenticated requests; optimistic cookie-EXISTENCE check only (UX layer, non-authoritative — Pitfall #4) | Session cookie presence |
| Browser → /api/auth/[...all] | Credentials, verification/reset tokens; Better Auth validates + sets httpOnly cookie | Passwords, one-time tokens |
| Browser → createFirstAdmin action | Bootstrap boundary — MUST self-close after first admin (D-08) | First admin credentials |
| Browser → user-management Server Actions | Admin-only mutations; each re-checks requireCan server-side | Role/ban/session mutations |
| (admin) layout → protected dashboard | Server Component getSession() gate — authoritative DB-backed session validation | Session validity |
| Better Auth hooks → lib/email → Resend API | Server-only; RESEND_API_KEY never reaches client (ASVS V8) | API key, email content |
| Email link click → /api/auth/* | Untrusted token URL parameter validated server-side by Better Auth | Verification/reset tokens |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-02-01 | Spoofing/Elevation | middleware.ts proxy UX-only + Server Actions | high | mitigate | Proxy is cookie-existence only; every mutating action starts with requireCan (users.ts:112/165/189/211/256) — Pitfall #4 | closed |
| T-02-02 | Elevation of privilege | createFirstAdmin open setup endpoint | critical | mitigate | D-08 count(admins)===0 server-side check BEFORE any auth.api call, throws FORBIDDEN (users.ts:73-84); self-disable confirmed live in UAT Test 2 | closed |
| T-02-03 | Tampering/Elevation | author escalates to publish | high | mitigate | TRANSITIONS.author excludes `published` (post-transitions.ts:24) + requireCan({post:['publish']}) double enforcement | closed |
| T-02-04 | Information disclosure | auth errors leak account existence (signup/signin/forgot-password) | medium | mitigate | requireEmailVerification + customSyntheticUser; ForgotPasswordForm always shows generic "Check your email…" — confirmed live in UAT Test 4 | closed |
| T-02-05 | Tampering | CSRF on auth mutations | medium | mitigate | trustedOrigins env-driven (auth/index.ts:25) + Next 16 built-in Server Action origin check | closed |
| T-02-06 | Information disclosure | Resend API key leak to client | high | mitigate | lib/email/index.ts server-only (no "use client"); RESEND_API_KEY in env only | closed |
| T-02-07 | Information disclosure | signin error reveals valid emails | medium | mitigate | Better Auth generic error responses; no per-email messaging in SignInForm error UI | closed |
| T-02-08 | Spoofing | forged callbackURL redirects to malicious host | medium | mitigate | useCallbackURL accepts only same-origin paths — startsWith("/") && !startsWith("//"), /dashboard fallback (SignInForm.tsx:24-31) | closed |
| T-02-09 | Tampering/Elevation | createUser/banUser called without admin permission | high | mitigate | requireCan({user:['create'/'ban']}) first in each action; ordering invariant pinned by users.test.ts FORBIDDEN test | closed |
| T-02-08b | Elevation | banned user retains active session | high | mitigate | banUser delegates to auth.api.banUser which revokes all sessions; proven by coverage D4 automated test (banned sign-in blocked + revoke-all invalidates) | closed |
| T-02-10 | Spoofing/Tampering | forged/intercepted verification or reset token | high | mitigate | Better Auth single-use tokens with expiry, validated against the verification table (framework-owned, Don't Hand-Roll); live round-trips passed in UAT Tests 4 & 5 | closed |
| T-02-11 | Spoofing | open redirect via redirectTo param | low | accept | redirectTo hardcoded to "/reset-password" in form code — never user-controlled | closed |
| T-02-05-01 | Spoofing / Broken Access Control | unauthenticated /dashboard access | critical | mitigate | Authoritative server-side getSession() gate in (admin)/layout.tsx:53-55 redirects to /signin; HTTP integration test (scripts/test-auth-gate.mjs): no-cookie GET → 307 → /signin | closed |
| T-02-05-02 | Information Disclosure | statically prerendered /dashboard served to all | high | mitigate | getSession() (dynamic API) forces dynamic rendering; build shows /dashboard ◐ PPR with gate streaming inside Suspense — no dashboard content in static shell | closed |
| T-02-05-03 | Tampering | forged/expired session cookie passes proxy cookie-existence check | medium | accept | Proxy checks cookie EXISTENCE by design (documented UX-only, Pitfall #4); forged cookies are rejected by the DB-backed getSession() gate and by requireCan in every Server Action | closed |
| T-02-06-01 | Denial of Service | createUser verification email never sent → dashboard-created users permanently locked out | high | mitigate | Explicit auth.api.sendVerificationEmail call after creation (users.ts:144-152); causal link pinned by action-layer regression tests; live round-trip passed in UAT Test 5 (2026-08-24) | closed |
| T-02-06-02 | Tampering (error masking) | propagated send rejection reports creation as failed while user exists (ghost user) | medium | mitigate | try/catch around the send, result returned regardless, failure logged via log.error (users.ts:144-152) | closed |
| T-02-06-03 | Information Disclosure | email enumeration via sendVerificationEmail attempts | low | accept | Endpoint's own anti-enumeration branch + ≤500ms constant-time floor; action passes only the email the permitted admin just created | closed |
| T-02-06-04 | Spoofing (permission bypass) | 02-06 fix reorders permission check away from first | high | mitigate | requireCan stays first (users.ts:112); existing FORBIDDEN ordering test still asserts it; pnpm test green post-fix | closed |
| T-02-SC | Tampering | npm/pnpm supply chain | high | mitigate | Locked deps only (better-auth, resend — canonical, verified); drizzle-orm pinned ^0.45.2 (package.json:53); no new packages in 02-04/02-05/02-06 | closed |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-02-01 | T-02-11 | redirectTo hardcoded, never user-controlled; Better Auth originCheck validates callbackURL on the GET callback endpoint | Plan 02-04 (plan-time) | 2026-07-02 |
| AR-02-02 | T-02-05-03 | Proxy cookie-existence check is intentionally non-authoritative (Pitfall #4); authoritative getSession() gate + requireCan cover forged cookies | Plan 02-05 (plan-time) | 2026-07-03 |
| AR-02-03 | T-02-06-03 | sendVerificationEmail endpoint implements anti-enumeration + constant-time floor; caller is requireCan-gated admin passing a just-created email | Plan 02-06 (plan-time) | 2026-08-24 |

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-08-27 | 20 | 20 | 0 | Claude (gsd-secure-phase, ASVS L1 — retroactive State B from plan-time registers; short-circuit rule: threats_open 0, plan-authored register, L1) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-08-27
