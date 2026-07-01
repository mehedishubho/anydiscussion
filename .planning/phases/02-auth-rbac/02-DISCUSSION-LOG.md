# Phase 2: Auth + RBAC - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-02
**Phase:** 2-Auth + RBAC
**Areas discussed:** Email delivery, Account setup, Permission model, Review workflow, Ban primitive, Session policy, Redirect-after-login, Gate scope, Session revoke, Origins/cookies/CSRF

---

## Email delivery

| Option | Description | Selected |
|--------|-------------|----------|
| Free transactional service | Resend/Brevo/SES free tier — reliable deliverability, not a paid API, mild external-dep tension | ✓ |
| Self-hosted MTA on VPS | Mailu/Postal/Postfix — pure ethos, but you own deliverability (SPF/DKIM/DMARC, IP rep) | |
| nodemailer + SMTP relay | nodemailer client + free SMTP relay host — middle ground | |
| You decide | Claude picks the source | |

**User's choice:** Free transactional service
**Notes:** Deliverability from a fresh VPS IP is the dealbreaker for email verification — pragmatic call over pure self-hosting.

| Option (provider) | Selected |
|--------|----------|
| Resend / Amazon SES / Brevo / You decide | ✓ You decide → Resend (Claude default, researcher verifies quota) |

| Option (architecture) | Selected |
|--------|----------|
| Thin lib/email helper / Provider abstraction / You decide | ✓ Thin lib/email helper |

---

## Account setup

| Option | Description | Selected |
|--------|-------------|----------|
| Invite-email flow | Admin enters email+role; invite email sent; user sets own password | |
| Admin sets temp password | Admin sets a temp password, shares out-of-band, forced change on first login | |
| Admin sets full credentials | Admin sets email+password+role, hands over credentials (weakest security) | ✓ |
| You decide | | |

**User's choice:** Admin sets full credentials
**Notes:** Tradeoff (admin knows the password) acknowledged; defensible for a small trusted team; AUTH-07 verification still fires.

| Option (bootstrap) | Selected |
|--------|----------|
| Dedicated seed script / Folded into pnpm setup / Better Auth CLI | ✗ — user overrode with free-text |

**User's choice (free-text):** "create a flow where when this application run first time it will ask to create admin account then it will redirect to login page"
**Notes:** Reframed as a first-run setup wizard (WordPress-style install screen). Detection = `count(admins) === 0`.

| Option (setup screen location) | Selected |
|--------|----------|
| Repurpose signup page / Dedicated /setup route / You decide | ✓ Repurpose signup page |

| Option (verification strictness) | Selected |
|--------|----------|
| Require before sign-in / Allow (verify in background) / You decide | ✓ Require before sign-in |

---

## Permission model

| Option | Description | Selected |
|--------|-------------|----------|
| 3 fixed roles (role-based) | admin/editor/author, fixed permission sets via createAccessControl; access plugin NOT pulled in | ✓ |
| Fine-grained (access plugin) | Per-user permission statements; max flexibility, more setup | |
| Hybrid (roles + statements) | Roles only, but permissions defined as auditable statements | |
| You decide | | |

**User's choice:** 3 fixed roles (role-based)
**Notes:** Closes the STATE.md blocker — access plugin is NOT needed beyond the 3 roles.

---

## Review workflow

| Option (edit-after-publish) | Description | Selected |
|--------|-------------|----------|
| Live edits (stays published) | Author edits own published post → stays published, changes live | ✓ (via "You decide") |
| Re-approval on edit (demote) | Edit drops to pending_review; disruptive in v1 (no revisions) | |
| Authors can't edit published | Only editor/admin edits published posts | |
| You decide | | ✓ |

**User's choice:** You decide → Claude picked Live edits (v1 has no revision history; demote would take posts offline).

| Option (edge policy) | Selected |
|--------|----------|
| Trusting/flexible / Review-queue stability / You decide | ✓ You decide → Trusting/flexible (consistent with live-edits) |

---

## Ban primitive

| Option | Selected |
|--------|----------|
| Ship primitive now / Defer to Phase 4 / You decide | ✓ Ship primitive now |

---

## Session policy

| Option | Selected |
|--------|----------|
| Defaults + remember-me / Fixed duration, no toggle / You decide | ✓ Defaults + remember-me |

---

## Redirect after login

| Option | Selected |
|--------|----------|
| Deep-link return / Always dashboard home / You decide | ✓ Deep-link return |

---

## Already-authed + gate scope

| Option | Selected |
|--------|----------|
| Yes, those defaults / Adjust / You decide | ✓ Yes, those defaults |

---

## Session revoke

| Option | Selected |
|--------|----------|
| Ship primitive now / Defer to Phase 4 / You decide | ✓ Ship primitive now |

---

## Origins / cookies / CSRF

| Option | Selected |
|--------|----------|
| Yes, that posture / Adjust / You decide | ✓ Yes, that posture |

---

## Claude's Discretion

- Email provider → Resend (D-02), pending quota verification.
- Email architecture → thin helper, not abstraction (D-03).
- Edit-after-publish policy → live edits (D-13), due to no-revision-history constraint.
- Edge policy → trusting/flexible (D-14), consistent with D-13.
- AUTH-08 profile/avatar → bio + R2 avatar now (D-24/D-25).

## Deferred Ideas

- Stricter editorial control (publish→pending_review on edit) → v2, needs CONTv2-01.
- Gravatar avatar source → v2 fast-follow.
- Social links / job title byline fields → Phase 6 (SITE-06).
- Ban / revoke / session-listing management UI → Phase 4 (DASH-04).
- Rate limiting on auth endpoints → Phase 7 (PERF-04).
- DKIM/SPF/DMARC + mail from-domain DNS → deploy / Phase 7 (flagged D-04).
- OAuth / social sign-in / 2FA / magic links / passkeys → out of scope (v1).
