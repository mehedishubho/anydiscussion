---
phase: 5
slug: seo-basics
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
created: 2026-08-26
---

# Phase 5 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

Audited 2026-08-26 at ASVS L1 (grep-depth) via the short-circuit rule: register
authored at plan time across all 8 plans, zero open threats at the `high` block
threshold. Every `mitigate` disposition was re-verified against the live tree
(post 14b4044 middleware→proxy migration included).

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| settings table → getSeoSettings → generateMetadata | DB-sourced site-wide metadata crosses into the public HTML response; a compromised settings row could inject into `<title>`/OG/JSON-LD | public marketing metadata (non-secret by design) |
| post_seo / pages.metaTitle → buildPostMetadata → `<head>` | Editor-authored strings render into the public `<head>`; must not allow HTML injection | editor-controlled text |
| JSON-LD builder output → dangerouslySetInnerHTML | Server-built `JSON.stringify` payload rendered into a `<script>` tag in the layout body | DB-derived structured data |
| posts/post_seo → sitemap.xml / rss.xml | Published content serialized into XML responses consumed by external crawlers/feed readers | public content + XML metacharacter injection surface |
| browser → src/proxy.ts → redirects table | Proxy performs a DB read (redirects snapshot) per matched public request (05-04 flag: db-access-in-middleware) | read-only admin-populated rows; TTL-bounded |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-05-01 (05-01) | Tampering | JSON-LD `dangerouslySetInnerHTML` payload (layout/home) | medium | mitigate | JSON.stringify escapes `<` sequences; `application/ld+json` non-executing MIME; input is DB rows already gated by the double-sanitize pipeline | closed |
| T-05-02 (05-01) | Information Disclosure | settings values rendered into public metadata | low | accept | SEO settings are public marketing metadata, not secrets | closed |
| T-05-03 (05-01) | Tampering | `redirects` table data | low | accept | v1 has no redirects UI (SETT-03 deferred); rows are admin-created via SQL only. Internal-path validation (`/`-prefixed new_path) required when SETT-03 ships — v2 note | closed |
| T-05-SC (05-01/02/03) | Tampering (supply chain) | npm installs | low | accept | Zero packages installed in plans 05-01/02/03 | closed |
| T-05-02 (05-02) | Tampering/Spoofing | RSS `<content:encoded>` body (stored XSS via feed reader) | high | mitigate | renderPostBody runs generateHTML → sanitizeBeforeRender BEFORE XML; CDATA is defense-in-depth (src/app/rss.xml/route.ts; src/lib/post-render.ts) | closed |
| T-05-04 (05-02) | Tampering | XML injection via title/excerpt/URL fields | medium | mitigate | escapeXml on all text fields; sitemap URL fields constrained to Latin slugs (Phase 3 D-20 regex) | closed |
| T-05-05 (05-02) | Information Disclosure | draft/soft-deleted posts leaking into sitemap/RSS | medium | mitigate | `and(eq(status,'published'), isNull(deletedAt))` filter (src/app/sitemap.ts:44; same in rss route), pinned by unit tests | closed |
| T-05-01 (05-03) | Elevation of Privilege | saveSeoSettings (canonical hijack) | high | mitigate | `requireRole('admin')` is the FIRST statement before parse/DB write (src/actions/settings.ts:105), pinned by MUST_NOT_BE_REACHED test | closed |
| T-05-06 (05-03) | Tampering | post_seo writes via savePost (foreign-post injection) | medium | mitigate | post_seo upsert runs inside savePost AFTER assertOwnsPost/requireCan (src/actions/posts.ts:102,179) | closed |
| T-05-07 (05-03) | Tampering | redirects open-redirect (external new_path) | low | accept | No UI populates the table in v1; admin-SQL-created rows only. v2 SETT-03 must validate internal paths (dev DB now holds test rows /old→/new — dev-only) | closed |
| T-05-08 (05-03) | Tampering | redirects lookup crashing the 404/proxy path | low | mitigate | Lookup wrapped in try/catch; failure degrades to normal rendering (src/proxy.ts) | closed |
| T-05-09 (05-04) | Spoofing/Tampering | x-incoming-path header forgery | medium | mitigate | Proxy OVERWRITES the header on every matched request (src/proxy.ts:45); spoofed values can only reach admin-created DB rows | closed |
| T-05-10 (05-04) | DoS | proxy redirect lookup per public request | low | accept (mitigated) | 5s TTL snapshot cache bounds query rate to 1/5s regardless of request volume (REDIRECT_CACHE_TTL_MS, src/proxy.ts:72) | closed |
| T-05-11 (05-05) | Tampering/XSS | TiptapEditor Text tab (raw HTML source view) | high | mitigate | Three layers: ProseMirror schema strip at setContent → sanitizeBeforeStore in savePost (posts.ts:27,71) → sanitizeBeforeRender before dangerouslySetInnerHTML (shared CONFIG, drift-tested) | closed |
| T-05-SC (05-05) | Tampering (supply chain) | @tiptap/extension-text-align + character-count installs | high | mitigate | Planner registry audit 2026-08-25 (official ueberdosis/tiptap monorepo, same 3.27.1 release train); exact-pinned in package.json | closed |
| T-05-12 (05-06) | Elevation of Privilege | Publish/Submit buttons + PostRowActions | high | mitigate | UX-only client gating; authority is publishPost → assertOwnsPost + transitionPost → requireCan({post:['publish']}) + TRANSITIONS table (authors excluded, Phase-2 MUST_NOT_BE_REACHED pinned) — posts.ts:334-336 | closed |
| T-05-13 (05-06) | Tampering (content injection) | toast messages rendering action error strings | low | accept | sonner renders React-escaped text; strings originate from our own Server Actions | closed |
| T-05-SC (05-06) | Tampering (supply chain) | sonner install | high | mitigate | Registry audit 2026-08-25 (emilkowalski/sonner canonical); exact-pinned 2.0.8 | closed |
| T-05-14 (05-07) | Tampering (supply chain) | @tailwindcss/typography + @tiptap/extensions installs | high | mitigate | Registry audit 2026-08-25 (Tailwind Labs principals; @tiptap/extensions chosen over deprecated extension-placeholder); exact-pinned 0.5.20 / 3.27.1 | closed |
| T-05-15 (05-07) | Tampering | client-side slug derivation feeding savePost | low | accept | Derivation is UX-only; server contract unchanged (postSchema parse + validateSlug + assertUniqueSlug) | closed |
| T-05-16 (05-07) | Information disclosure / CSS scope | global ProseMirror + typography rules in globals.css | low | accept | Surface selector matches zero public nodes; prose utilities emit dashboard-only CSS | closed |
| T-05-14 (05-08) | Elevation of Privilege | SchedulePicker → setSchedule call site | high | mitigate | setSchedule awaits requireCan({post:['publish']}) FIRST (src/actions/posts.ts:393), pinned by D-15 tests; author-side picker hidden UX-only | closed |
| T-05-15 (05-08) | Tampering | postId prop client-editable via devtools | medium | accept | Tampering stays within editor/admin global post:publish by design; authors fail requireCan before any write | closed |
| T-05-16 (05-08) | Tampering (content injection) | toast messages rendering action error strings | low | accept | Same as T-05-13 (05-06) | closed |
| T-05-SC (05-08) | Tampering (supply chain) | package installs | high | accept | N/A — zero installs this plan | closed |
| FLAG-05-04-01 | DoS / boundary note | DB access in proxy (redirects snapshot per public request) | medium | mitigate | 5s TTL snapshot bounds query rate; read-only admin-populated table; failure degrades to normal rendering (src/proxy.ts:58-79) | closed |

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-05-01 | T-05-02 (05-01) | SEO settings are public marketing metadata — no secret surface | plan 05-01 | 2026-08-25 |
| AR-05-02 | T-05-03 (05-01), T-05-07 (05-03) | redirects table has no v1 UI (SETT-03 deferred); rows admin-SQL-created only. **v2 requirement:** validate new_path internal (`/`-prefixed) when SETT-03 ships | plan 05-01/05-03 | 2026-08-25 |
| AR-05-03 | T-05-10 (05-04) | Proxy DB read bounded by 5s TTL snapshot — negligible vs. existing per-request session-cookie work | plan 05-04 | 2026-08-25 |
| AR-05-04 | T-05-13/16 (05-06, 05-08) | sonner renders React-escaped action-originated strings | plan 05-06/05-08 | 2026-08-26 |
| AR-05-05 | T-05-15 (05-07) | Slug auto-derivation is UX-only; server validation chain unchanged | plan 05-07 | 2026-08-26 |
| AR-05-06 | T-05-15 (05-08) | postId tamper stays inside editor/admin post:publish capability; authors blocked server-side | plan 05-08 | 2026-08-26 |
| AR-05-07 | T-05-16 (05-07) | ProseMirror surface selector matches zero public nodes; CSS-only cost | plan 05-07 | 2026-08-26 |

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-08-26 | 26 | 26 | 0 | orchestrator (L1 grep verification, short-circuit rule: threats_open 0 ∧ plan-time register ∧ ASVS L1) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-08-26
