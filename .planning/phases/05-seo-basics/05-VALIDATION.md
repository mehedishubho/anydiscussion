---
phase: 5
slug: seo-basics
status: ready
nyquist_compliant: true
wave_0_complete: false
created: 2026-07-07
---

# Phase 5 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
>
> **Source:** `05-RESEARCH.md` → `## Validation Architecture` (15 unit-test mappings +
> 5-success-criterion trace table). Lifted into the Per-Task Verification Map below.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.9 (installed — `pnpm test` runs `vitest run`) |
| **Config file** | `vitest.config.ts` (project-wide, existing) |
| **Quick run command** | `pnpm test -- src/lib/seo --run` (SEO-only subset) |
| **Full suite command** | `pnpm test` (runs `vitest run` — full regression) |
| **Estimated runtime** | ~15-25 seconds (SEO subset < 5s; full suite includes auth/posts/pages/media/storage regression) |

---

## Sampling Rate

- **After every task commit:** Run `pnpm test -- src/lib/seo --run` (SEO subset) + `pnpm tsc --noEmit`
- **After every plan wave:** Run `pnpm test` (full suite — regression on auth, posts, pages, media, storage)
- **Before `/gsd-verify-work`:** Full suite green + `pnpm build` succeeds
- **Max feedback latency:** ~25 seconds (full suite)

---

## Per-Task Verification Map

> Each plan task maps to one row. Test framework is vitest.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 05-01-T1 (schema push) | 01 | 1 | SEO-01 (redirects enable D-12) | T-05-03 | redirects table DDL in generated migration; no hand-written SQL | CLI + grep | `pnpm db:generate && grep -c "old_path" src/db/migrations/0004_*.sql` | ✅ (generated) | ⬜ pending |
| 05-01-T2 (pure builders + tests) | 01 | 1 | SEO-01, SEO-03, SEO-04, SEO-05, SEO-06 | T-05-01 | buildPostMetadata respects canonical override; OG fallback chain; twitter card logic; JSON-LD schema.org shape; Bangla grapheme rule | unit (pure builders) | `pnpm test -- src/lib/seo/__tests__/metadata.test.ts src/lib/seo/__tests__/jsonld.test.ts src/lib/seo/__tests__/validation.test.ts --run` | ❌ W0 (this task creates them) | ⬜ pending |
| 05-01-T3 (cached reader + site metadata) | 01 | 1 | SEO-01, SEO-03, SEO-05 | T-05-01 | getSeoSettings has 'use cache' + cacheTag('seo-settings'); (site)/layout.tsx generateMetadata + JSON-LD script tags; build succeeds under cacheComponents | build + tsc | `pnpm tsc --noEmit && pnpm build` | ✅ (build) | ⬜ pending |
| 05-02-T1 (sitemap + robots) | 02 | 2 | SEO-02, SEO-08 | T-05-05 | draft/soft-deleted excluded; per-type priority/changefreq; robots disallow list | unit (DB mocked) | `pnpm test -- src/lib/seo/__tests__/sitemap.test.ts src/lib/seo/__tests__/robots.test.ts --run` | ❌ W0 (this task creates them) | ⬜ pending |
| 05-02-T2 (RSS route handler) | 02 | 2 | SEO-07 | T-05-02, T-05-04 | RSS XML well-formed; escapeXml on 5 special chars; CDATA body wrap; renderPostBody sanitize pipeline; RSS_LIMIT cap | unit (DB mocked) | `pnpm test -- src/lib/seo/__tests__/rss.test.ts --run && pnpm build` | ❌ W0 (this task creates them) | ⬜ pending |
| 05-03-T1 (post SEO panel + post_seo writes) | 03 | 2 | SEO-01, SEO-06 | T-05-06 | savePost upserts post_seo via safeParse (defensive); SeoPanel renders 4 fields; inherits assertOwnsPost gate | tsc + full regression | `pnpm tsc --noEmit && pnpm test --run` | ✅ (existing suite) | ⬜ pending |
| 05-03-T2 (settings/seo page + saveSeoSettings) | 03 | 2 | SEO-01, SEO-06 | T-05-01 | requireRole('admin') FIRST (MUST_NOT_BE_REACHED); 2-arg revalidateTag('seo-settings','max'); revalidatePath('/','layout') | unit (permission gate) | `pnpm test -- src/actions/__tests__/seo-settings.test.ts --run && pnpm tsc --noEmit` | ❌ W0 (this task creates it) | ⬜ pending |
| 05-03-T3 (redirects check in not-found.tsx) | 03 | 2 | SEO-01 (D-12) | T-05-07, T-05-08 | redirects lookup in Node runtime (not edge middleware); try/catch fallback to 404; permanentRedirect on match | tsc + build | `pnpm tsc --noEmit && pnpm build` | ✅ (build) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

> Wave 0 test files created by the plan tasks themselves (no separate scaffolding plan needed —
> each task that introduces a new test file creates it as part of its TDD/verify cycle).

- [x] `src/lib/seo/__tests__/shared-fixtures.ts` — fake PostLike, PostSeoLike, SeoSettings, PageLike + the empirical 59-grapheme Bangla fixture + 250-grapheme Latin fixture (created by 05-01-T2, extended by 05-02-T1/T2)
- [x] `src/lib/seo/__tests__/metadata.test.ts` — SEO-01/04/05 builder assertions (created by 05-01-T2)
- [x] `src/lib/seo/__tests__/jsonld.test.ts` — SEO-03 JSON-LD shape assertions (created by 05-01-T2)
- [x] `src/lib/seo/__tests__/validation.test.ts` — SEO-06 Bangla-passes + Latin-overlong-fails (created by 05-01-T2)
- [x] `src/lib/seo/__tests__/sitemap.test.ts` — SEO-02/08 sitemap builder (created by 05-02-T1)
- [x] `src/lib/seo/__tests__/robots.test.ts` — SEO-02 robots shape (created by 05-02-T1)
- [x] `src/lib/seo/__tests__/rss.test.ts` — SEO-07 RSS handler + escaping (created by 05-02-T2)
- [x] `src/actions/__tests__/seo-settings.test.ts` — T-05-01 admin gate MUST_NOT_BE_REACHED (created by 05-03-T2)

*Framework: Vitest 4.1.9 — already installed; no install needed.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Home page renders correct `<title>` + JSON-LD script tags in HTML source | SEO-01, SEO-03 | Requires a running dev server + browser/curl to inspect rendered HTML (build proves compilation; manual proves the metadata actually streams) | 1. `pnpm dev`; 2. `curl http://localhost:3000/` ; 3. confirm `<title>Any Discussion</title>` present; 4. confirm two `<script type="application/ld+json">` tags in the body (WebSite + Organization) |
| `/sitemap.xml` returns valid XML with published posts/pages | SEO-02 | Requires a populated DB + running server (unit test mocks the DB; manual proves the live query) | 1. Seed a published post + page; 2. `curl http://localhost:3000/sitemap.xml`; 3. confirm home + post + page entries with correct priority/changefreq |
| `/robots.txt` returns allow/disallow + sitemap pointer | SEO-02 | Live route output | `curl http://localhost:3000/robots.txt` — confirm allow "/", disallow "/preview/" and "/dashboard/", sitemap pointer |
| `/rss.xml` returns valid RSS 2.0 with full-text bodies | SEO-07 | Live route + feed-validator check | 1. `curl http://localhost:3000/rss.xml`; 2. paste into a feed validator (rssboard.org or validator.w3.org/feed); 3. confirm well-formed + full-text `<content:encoded>` |
| Settings change propagates to home page title (cacheTag invalidation) | SEO-01 (D-11) | Requires the cacheTag ↔ revalidateTag link to work end-to-end on a running server | 1. `pnpm dev`; 2. open /dashboard/settings/seo as admin; 3. change site title; 4. save; 5. `curl http://localhost:3000/` — confirm the new title (not the old cached one) |
| Post-editor SEO panel saves post_seo to the DB | SEO-01 (D-08) | Requires the dashboard UI + a DB inspection | 1. As an editor, create a post with SEO fields filled; 2. save; 3. query the post_seo table — confirm the row exists with the four fields |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify (every task has automated verify)
- [x] Wave 0 covers all MISSING references (each test file is created by its consuming task)
- [x] No watch-mode flags (all commands use `--run`)
- [x] Feedback latency < 30s (SEO subset < 5s; full suite ~25s)
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** ready for execution
