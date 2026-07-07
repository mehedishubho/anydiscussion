---
phase: 06
slug: public-frontend
status: ready
nyquist_compliant: true
wave_0_complete: false
created: 2026-07-07
---

# Phase 06 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.9 (already installed) |
| **Config file** | vitest.config.ts (repo root — already present) |
| **Quick run command** | `pnpm test` (`vitest run`) |
| **Full suite command** | `pnpm test` (single command; no watch per config) |
| **Estimated runtime** | ~15-20 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm test` (the relevant test file(s) for that task)
- **After every plan wave:** Run `pnpm test` (full suite)
- **Before `/gsd-verify-work`:** Full suite green + `pnpm build` succeeds + build output shows `/blog/[slug]` as a PPR route
- **Max feedback latency:** ~20 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 06-01-01 | 01 | 1 | SITE-07/08/13/17 | T-06-02 | Schema migration produces correct columns | CLI | `pnpm drizzle-kit generate --name add_featured_views_username_fts` | ✅ | ⬜ pending |
| 06-01-02 | 01 | 1 | SITE-07/08 | T-06-01/02 | Published-only filter; atomic increment; FTS 'simple' config | unit | `pnpm test src/lib/queries` | ❌ W0 | ⬜ pending |
| 06-01-03 | 01 | 1 | SITE-13 | — | Reading time via Intl.Segmenter; TOC H2/H3 only; rate-limit per-IP | unit | `pnpm test src/lib/reading-time src/lib/toc src/lib/rate-limit` | ❌ W0 | ⬜ pending |
| 06-02-01 | 02 | 2 | SITE-16 | T-06-06 | Dark mode route-isolated (site-theme key, no ThemeContext import) | lint/grep | `grep -r "ThemeContext" src/app/(site) src/components/site` | ✅ existing | ⬜ pending |
| 06-02-02 | 02 | 2 | ANAL-01/02 | T-06-05 | Analytics URL https-validated, no arbitrary HTML | grep | `grep -c "dangerouslySetInnerHTML" src/components/site/Analytics.tsx == 0` | ❌ | ⬜ pending |
| 06-03-01 | 03 | 2 | SITE-07 | T-06-07 | renderPostBody before dangerouslySetInnerHTML; body NOT in Suspense | grep | `grep renderPostBody src/app/(site)/blog/[slug]/page.tsx` | ❌ | ⬜ pending |
| 06-03-02 | 03 | 2 | SITE-07/17 | T-06-09 | connection() in ViewCount; two separate Suspense boundaries | grep | `grep -c Suspense src/app/(site)/blog/[slug]/page.tsx >= 2` | ❌ | ⬜ pending |
| 06-03-03 | 03 | 2 | SITE-13/14 | — | TOC/Share/ReadProgress are "use client" islands | grep | `grep -c "use client" src/components/site/{Toc,ShareButtons,ReadProgress}.tsx` | ❌ | ⬜ pending |
| 06-04-01 | 04 | 3 | SITE-01/02 | T-06-11 | Home uses listFeatured + listPublished; /blog paginated | grep | `grep listFeatured src/app/(site)/page.tsx` | ❌ | ⬜ pending |
| 06-04-02 | 04 | 3 | SITE-03 | T-06-10 | Archive filters via URL searchParams; numbered pagination | grep | `grep listArchive src/app/(site)/archive/page.tsx` | ❌ | ⬜ pending |
| 06-04-03 | 04 | 3 | SITE-04/05 | — | Category/tag reuse ArchiveList + BreadcrumbList JSON-LD | grep | `grep breadcrumbListJsonLd src/app/(site)/category/[slug]/page.tsx` | ❌ | ⬜ pending |
| 06-05-01 | 05 | 2 | SITE-10 | T-06-12 | Honeypot + rate-limit; no 'use cache'; no requireCan | unit+grep | `pnpm test src/actions/__tests__/contact.test.ts` (if created); `grep -c "use cache" src/actions/contact.ts == 0` | ❌ W0 | ⬜ pending |
| 06-05-02 | 05 | 2 | SITE-10 | — | RHF + Zod + useTransition (NOT useMutation) | grep | `grep useTransition src/components/site/ContactForm.tsx` | ❌ | ⬜ pending |
| 06-06-01 | 06 | 2 | SITE-09 | — | About is hard-coded TSX (no DB queries) | grep | `grep -c "getPublishedPage\|listPublished" src/app/(site)/about/page.tsx == 0` | ❌ | ⬜ pending |
| 06-06-02 | 06 | 2 | SITE-11 | T-06-15 | T&C/Privacy use renderPostBody; notFound on missing | grep | `grep renderPostBody src/app/(site)/terms-and-conditions/page.tsx` | ❌ | ⬜ pending |
| 06-06-03 | 06 | 2 | SITE-12/15 | T-06-16 | Two Suspense on 404; preview verified not rebuilt | grep | `grep -c Suspense src/app/not-found.tsx >= 2` | ✅ existing | ⬜ pending |
| 06-07-01 | 07 | 3 | SITE-08 | T-06-17 | Search GET form; no client autocomplete; FTS in Suspense | grep | `grep 'method="GET"' src/components/site/SearchForm.tsx` | ❌ | ⬜ pending |
| 06-07-02 | 07 | 3 | SITE-06 | T-06-18 | Author page Person JSON-LD; getUserByUsername; notFound | grep | `grep personJsonLd src/app/(site)/author/[username]/page.tsx` | ❌ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/lib/queries/__tests__/posts.test.ts` — covers incrementViewCount (atomicity), published-only filter, getPostForPublic (cached, slug-based), listRelated (category→tags fallback), searchPosts (FTS 'simple' config)
- [ ] `src/lib/queries/__tests__/users.test.ts` — covers getUserByUsername, listAuthorPosts
- [ ] `src/lib/reading-time/__tests__/reading-time.test.ts` — covers Intl.Segmenter word count, Bangla sample, empty body
- [ ] `src/lib/toc/__tests__/toc.test.ts` — covers H2/H3 extraction, ID generation, dedupe
- [ ] `src/lib/rate-limit/__tests__/rate-limit.test.ts` — covers per-IP windowed limit

*Framework: Vitest 4.1.9 already in package.json + vitest.config.ts present — no install needed.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Single-post LCP paints immediately (body before Suspense holes) | SITE-07 | Requires visual inspection of PPR streaming behavior | Open /blog/[slug] in browser with throttling; verify body renders before view-count/related-posts stream in |
| Dark mode toggle works + no flash on reload | SITE-16 | Requires browser interaction + visual check | Toggle ThemeToggle in header; reload page; verify no FOUC |
| Contact form email delivery | SITE-10 | Requires real Resend API key + inbox | Submit the contact form; verify email arrives at the configured recipient (requires RESEND_API_KEY env) |
| Build output shows /blog/[slug] as PPR route | SITE-07 | Requires build inspection | Run `pnpm build`; check output labels /blog/[slug] with partial prerender (ƒ or ○ PPR marker) |
| View count increments on page visit | SITE-17 | Requires real DB + browser | Visit /blog/[slug]; reload; verify the view count span increases by 1 each real visit |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 20s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** ready 2026-07-07
