# Phase 7: Performance & Deploy - Context

**Gathered:** 2026-07-14
**Updated:** 2026-07-28
**Status:** Ready for planning

> ## 2026-07-28 Revision Summary
>
> This is an **update** of the original 2026-07-14 context. The original 30 decisions (D-01…D-30) were reviewed against the current codebase; most still hold. Three areas changed based on the founder's current posture:
>
> - **No staging environment.** The original plan assumed `staging.anydiscussion.com` (D-22/D-23). Founder confirmed: no staging — a push to `main` deploys to **production** directly. D-22 is **superseded** by D-32; D-23 is refined (SSL still Coolify-managed, just on the production domain). **Planner note:** ROADMAP Success Criterion #5 and REQUIREMENT PERF-06 literally say "Staging deployment" — reframe as *"Coolify git-push deploy with managed SSL against production."* The deployment requirement is still satisfied; only the separate-staging-env wording is dropped. Flag this wording mismatch; do **not** silently drop a requirement.
> - **No CI/CD pipeline.** No GitHub Actions, no separate CI layer. The deploy model is git-push → Coolify. The PERF-02 bundle/lint gate therefore runs as a **Coolify build step** (D-31), not a CI job. D-12/D-13 are refined accordingly.
> - **AUTH-06/07 email deliverability debt is closed in this phase (D-33).** Previously parked as "Phase 7 / D-04" verification debt; now explicitly in-scope: set DKIM/SPF/DMARC DNS + one real inbox test before launch. Especially important because there is no staging safety net.
>
> Items refined are marked **(refined 2026-07-28)**. New decisions are D-31…D-33.

<domain>
## Phase Boundary

The blog ships on the real self-hosted stack (Coolify + Postgres + Cloudflare + Redis) meeting the non-negotiable performance/SEO bar, with the publish→visible loop verified, bundle isolation enforced, auth rate-limited, and the Umami analytics instance deployed. Phase 7 **consumes** all prior phases — it is the verification and deployment phase that proves the system works on the real stack.

Concretely this phase delivers:

- **Performance pass (PERF-01)** — Lighthouse / Core Web Vitals audit on all public routes, targeting Lighthouse 90+ and Google 'Good' CWV thresholds (LCP < 2.5s, FID < 100ms, CLS < 0.1). Measurement via Lighthouse CI + manual audit on the real Coolify + Cloudflare stack. **No staging — audited against production** (D-32).
- **Bundle isolation audit (PERF-02)** — ESLint no-restricted-imports + a **Coolify build-step gate** (D-31) enforcing no TailAdmin/editor JS leaks into the public chunk. Public bundle size threshold < 100KB gzipped. The gate runs in the Docker build stage and aborts the deploy on failure (the only automated safety net, since there is no CI and no staging).
- **Revalidation audit (PERF-03)** — Systematic action-by-action audit of every mutating action's revalidatePath/revalidateTag calls. Publish→visible verified end-to-end on the real stack via manual test script + visual check. Output: markdown table + checklist.
- **Auth rate limiting (PERF-04)** — `@upstash/ratelimit` + `ioredis` against self-hosted Redis (D-01, refined) on all auth endpoints (sign-in, password reset, email verification, session refresh). 3 attempts / 15 min window (strict). Self-hosted Redis 7.x on Coolify (256MB, no persistence, rate limiting only in v1).
- **Production deployment on Coolify (PERF-06)** — Multi-stage Dockerfile, build-time NEXT_PUBLIC_* only, **git push to main = production deploy** (D-32, supersedes staging), Coolify managed SSL on the production domain.
- **Email deliverability hardening (AUTH-06/07 debt closure — D-33)** — Set DKIM/SPF/DMARC DNS records for the mail domain + verify real inbox delivery of password-reset and email-verification emails (Resend SMTP) before launch.
- **Umami analytics deployment (ANAL-02)** — Coolify Docker service, same Postgres instance with separate database, settings-stored script injection (Phase 6 D-17), dashboard at analytics.anydiscussion.com.
- **ISR scaling documentation** — README section + ADR documenting the single-instance ISR scaling cliff (problem + solution + v2 path with Redis-backed shared cache handler). Created during Phase 7 deployment.

**Out of scope:** backups (Phase 8 — BACKUP-01..05), staging environment (rejected — D-32), menu builder + redirects manager UI (v2), dynamic OG image generation (fast-follow), comments/reader discussion (OOS), i18n routing (OOS), multi-replica ISR scaling (v2 — documented but not implemented), separate CI/CD pipeline (rejected — D-31).

**Boundary notes for the planner:**

- Phase 7 is primarily a **verification and deployment** phase, not a feature-building phase. Most of the work is auditing, testing, documenting, and configuring — not writing new application code.
- **Single-environment production deploy (no staging) raises the stakes on build-time gates.** Because a push to `main` goes live, the Coolify build-step lint + bundle gate (D-31) is the only automated pre-production check. The planner should make this gate robust (fail-fast, clear error output in the Coolify build log).
- **No CI means no separate CI config tasks.** Do NOT plan `.github/workflows/*.yml` files. All automated checks live in: (a) the Coolify Docker build stage (lint + bundle), (b) existing `pnpm` scripts (`lint`, `test`, `test:migrations`, `test:auth-gate`).
- The **revalidation audit** is the most labor-intensive task — it requires reading every mutating action file and mapping each revalidatePath/revalidateTag call. The output (markdown table + checklist) should be thorough enough that a future phase can verify completeness.
- **AUTH-06/07 debt closure (D-33)** requires operator access to DNS (to set DKIM/SPF/DMARC) and a real inbox to verify delivery. Plan it as a manual ops task with a verification step, not pure code.
- **Redis is provisioned for rate limiting only** in v1. The ISR scaling documentation explains the v2 path (Redis-backed shared cache handler) but does NOT implement it.

</domain>

<decisions>
## Implementation Decisions

### Auth rate limiting (PERF-04)
- **D-01 (Upstash Ratelimit + ioredis + self-hosted Redis) — refined 2026-07-28:** Use the `@upstash/ratelimit` library paired with the **`ioredis`** client against a self-hosted Redis 7.x instance on Coolify. The library is MIT-licensed and works with any Redis via ioredis — **no Upstash cloud account, no paid API** (the "Upstash" name is the company; the lib is free). Confirmed over: in-memory store (resets on restart, insufficient for production), Next.js middleware-based limiting (no persistent state, and middleware is UX-only per the code comment in `src/middleware.ts`), and `@upstash/ratelimit` + Upstash REST (works but introduces a cloud dependency that tensions the no-paid-API ethos).
- **D-02 (3 attempts / 15 min window — strict):** Aggressive threshold to protect auth endpoints. Chosen over 5/10min (more lenient) — a small team of 2–5 people can tolerate the stricter limit; brute-force protection is more important than convenience.
- **D-03 (All auth endpoints rate-limited):** Sign-in, password reset, email verification, and session refresh all get rate-limited. Maximum coverage against enumeration and brute-force attacks. Sign-up is admin-only (no public registration) so it's not a target, but Better Auth's built-in endpoints are covered.
- **D-04 (Self-hosted Redis on Coolify):** Deploy Redis 7.x as a Coolify Docker service alongside Postgres and the Next.js app. 256MB memory limit, no persistence (rate limit data is ephemeral — losing it on restart is acceptable). No other Redis usage in v1 (caching, sessions are v2 concerns). Consistent with the self-hosted/no-paid-API ethos. **Redis is NOT yet in `docker-compose.yml`** (currently dev-only: Postgres 17 + MinIO) — the planner must add a Redis service for prod and wire `REDIS_URL`.

### Lighthouse / performance targets (PERF-01)
- **D-05 (Lighthouse 90+ minimum):** Strong, achievable performance bar. The ISR/PPR setup + minimal client JS + image optimization should reach this without heroic measures. Chosen over 95+ (harder to maintain, diminishing returns for a blog).
- **D-06 (Google 'Good' CWV thresholds):** LCP < 2.5s, FID < 100ms, CLS < 0.1. The standard bar for passing Core Web Vitals in search ranking. Tighter targets are aspirational but not required for v1.
- **D-07 (Lighthouse CI + manual audit):** Automated Lighthouse CI for baseline checks + manual browser DevTools audit on the real Coolify + Cloudflare stack. Catches both synthetic and real-world performance issues. Chosen over Lighthouse CI only (misses CDN/server latency) and fully automated E2E (heavier setup for a small team).
- **D-08 (All public routes audited):** Every `(site)` route gets performance-audited — home, `/blog`, `/blog/[slug]`, archive, category, tag, author, search, about, contact, terms, privacy, 404. Comprehensive coverage ensures no route regresses.
- **D-09 (Fonts — next/font with font-display: swap)** Built-in Next.js font optimization. Preloads critical fonts, swaps display to prevent FOUT/FOIT. Zero CLS from font loading. Chosen over self-hosted woff2 + preload (more manual work, same result).
- **D-10 (Images — next/image + sharp, already wired)** The existing Phase 1 `cdnImageLoader` + `remotePatterns` + `sharp` resize pipeline is already configured (verified in `next.config.ts`). Just verify it works correctly on the real stack. No new image optimization work needed. Chosen over Cloudflare Image Resizing (adds Cloudflare-specific dependency).
- **D-11 (Caching — s-maxage + stale-while-revalidate)** Standard ISR caching headers. CDN caches for s-maxage seconds, serves stale content while revalidating in background. Consistent with the `revalidatePath`/`revalidateTag` pattern already wired in Phase 3 D-25.

### Bundle audit mechanism (PERF-02)
- **D-12 (ESLint no-restricted-imports + Coolify build-step gate) — refined 2026-07-28:** The Phase 1 ESLint rule already exists. The enforcement gate runs as a **Coolify Docker build-stage step** (`pnpm lint` with `--max-warnings 0`), NOT a GitHub Actions CI job. A failing build aborts the deploy before it reaches production. Zero new CI tooling — just a build-stage command layered on existing infrastructure. Refined from "CI lint step" because there is no CI pipeline (D-31).
- **D-13 (Build-stage checks: cross-group imports + public bundle size) — refined 2026-07-28:** Two gates in the Docker build: (1) fail if `(site)` imports from `(admin)` components, (2) fail if public bundle exceeds 100KB gzipped. Both run pre-deploy in Coolify; a fail aborts the production deploy. This is the **only automated safety net** since there is no staging.
- **D-14 (100KB gzipped threshold):** Tight but achievable for a lean public site with minimal client JS. Catches TailAdmin/editor JS leaking into the public chunk early. Chosen over 150KB (too generous — would miss moderate leaks).
- **D-15 (Existing ESLint rule + build-step lint command):** Use the already-configured `no-restricted-imports` rule (verified in `src/eslint.config.mjs`). Just add the build-stage lint + bundle-size command. Chosen over a custom import-graph script (more maintenance, same result).

### Revalidation audit (PERF-03)
- **D-16 (Systematic action-by-action audit):** Map every mutating action in `src/actions/` to its revalidatePath/revalidateTag calls. Verify each action revalidates the correct paths and tags. Document in a markdown table + checklist. Then verify publish→visible end-to-end on the real Coolify stack.
- **D-17 (Manual test script + visual check for publish→visible):** A script that publishes a post via the dashboard, then checks the public URL for the content. Manual visual confirmation that revalidation worked. Chosen over automated E2E (heavier setup for a one-time verification).
- **D-18 (All mutating actions audited):** Every Server Action that writes to the DB: posts (create/update/publish), categories, tags, pages, media, settings, users. Complete coverage ensures no action is missing revalidation.
- **D-19 (Output — markdown table + checklist)** A table mapping each action to its revalidatePath/revalidateTag calls, with checkboxes for verification. Clear, auditable, easy to update. The planner should produce this as a deliverable.

### Production deployment on Coolify (PERF-06)
- **D-20 (Multi-stage Dockerfile):** Stage 1: pnpm install + next build (with lint + bundle gate). Stage 2: copy standalone output + node_modules. Smaller final image, faster deploys. Standard Next.js standalone Docker pattern. **No Dockerfile exists yet** — planner must create it.
- **D-21 (Build-time — NEXT_PUBLIC-prefixed only)** Only `NEXT_PUBLIC_*` vars are baked into the client bundle at build time. All other secrets (DATABASE_URL, BETTER_AUTH_SECRET, RESEND_API_KEY, S3 credentials, SETTINGS_ENCRYPTION_KEY, REDIS_URL) are injected at runtime via Coolify environment variables. This ensures secrets are never in the Docker image.
- **D-22 [informational] (SUPERSEDED 2026-07-28 by D-32):** ~~Git push to main = staging.~~ Replaced by: **git push to main = production deploy.** No staging environment.
- **D-23 (Coolify managed SSL, production domain) — refined 2026-07-28:** Coolify auto-provisions SSL via Let's Encrypt on the **production domain** (`anydiscussion.com` + `www`). Zero manual cert management. Refined from "staging.anydiscussion.com" because there is no staging (D-32). The `analytics.anydiscussion.com` Umami subdomain and `cdn.anydiscussion.com` R2/CDN subdomain are unaffected.
- **D-31 (NEW 2026-07-28 — No CI/CD pipeline; Coolify is the pipeline):** The project has **no** GitHub Actions / no separate CI layer by deliberate choice — the deploy model is git-push → Coolify. All automated checks (lint, bundle-size, and later Lighthouse CI baseline) run either as `pnpm` scripts locally or as Coolify build-stage steps. The planner must NOT create `.github/workflows/*.yml`. Implication: because there is no staging either, the Coolify build-step gate (D-12/D-13) is the **sole** pre-production safety net — make it robust.

### Deploy flow & environments (NEW — supersedes staging plan)
- **D-32 (NEW 2026-07-28 — No staging; single production environment):** There is **no staging environment**. A push to `main` triggers Coolify to build and deploy directly to **production** (`anydiscussion.com`). Chosen over keeping a `staging.anydiscussion.com` env (more infra, ops burden not justified for a small team) and over a manual-promotion-branch flow (more ceremony than needed right now). Consequences the planner must encode:
  - Lighthouse/CWV audit (PERF-01) and publish→visible verification (PERF-03) run **against production**, not staging.
  - The build-step gate (D-12/D-13) is the only thing between a push and a live break — it must fail-fast with clear logs.
  - **Planner flag:** ROADMAP SC#5 + REQUIREMENT PERF-06 say "Staging deployment." Reframe to "Coolify git-push deploy + managed SSL to production." Do not drop the requirement; restate the wording. If the founder later wants a safety net, a `production`-branch promotion flow (option B from discussion) is the natural fast-follow — note as deferred.

### Email deliverability debt closure (NEW — AUTH-06/07)
- **D-33 (NEW 2026-07-28 — Close AUTH-06/07 inbox-delivery debt in this phase):** The verification debt parked in STATE.md ("Phase 7 / D-04") is explicitly **in-scope** for Phase 7. Concretely: (a) set **DKIM, SPF, and DMARC DNS records** on the mail-sending domain for Resend SMTP; (b) run **one real inbox delivery test** for both password-reset and email-verification emails (verify they land in inbox, not spam). The automated hook-firing tests (53 green, Phase 2) already prove the send path; this closes the real-world delivery path. Especially necessary because there is no staging — auth email must work at first production launch. Chosen over deferring entirely (unacceptable for production auth) and over the "DNS-only, test later" split (the inbox test is cheap once DNS is set; no reason to split).

### Umami analytics deployment (ANAL-02)
- **D-24 (Coolify Docker service):** Deploy Umami as a Coolify-managed Docker service alongside the Next.js app, Postgres, and Redis. Single VPS, all services managed together. Consistent with the self-hosted ethos.
- **D-25 (Same Postgres instance, separate database):** Umami gets its own database within the same Postgres server. Simpler ops — one Postgres to manage. Analytics DB won't affect blog performance (different queries, different tables).
- **D-26 (Settings-stored script injection):** The Phase 6 analytics injection mechanism reads a script URL/ID from `settings`. Just configure the Umami script URL in the `settings/seo` page. No new code needed — Phase 6 D-17 already wired this.
- **D-27 (Separate subdomain — analytics.anydiscussion.com)** Umami's own login at a separate subdomain. Clean separation from the blog. Standard practice for self-hosted analytics.

### ISR scaling documentation
- **D-28 (README section + ADR):** Document the single-instance ISR scaling cliff in the project README + an ADR. Clear for future contributors. Created during Phase 7 deployment while the limitation is relevant context.
- **D-29 (Problem + solution + v2 path):** Explain the problem (single instance = ISR works; multi-replica = stale caches), the current solution (single instance on Coolify), and the v2 path (Redis-backed shared cache handler, SCALE-01). Practical documentation, not just a warning.
- **D-30 (ISR scaling only):** Focused documentation. Other scaling concerns (DB connection pooling, Redis for rate limiting) are already handled by the services themselves. Don't over-document premature optimization.

### Claude's Discretion
- Exact **Lighthouse CI configuration** (which runner, thresholds for pass/fail, how to trigger — runs locally or as a Coolify step, NOT in GitHub Actions per D-31).
- The **revalidation audit table format** (columns, granularity — per-action vs per-revalidation-call).
- The **Dockerfile specifics** (base image, pnpm version, Node.js version — note `.claude/CLAUDE.md` pins Node 20.19 LTS / `node:20-alpine`; layer ordering for cache efficiency; where the lint + bundle gate runs in the build stage).
- **Coolify project configuration** (resource limits, health checks, restart policy, Redis + Umami service definitions).
- The **Umami configuration** (website registration, data retention, sharing settings).
- The **ADR format** and exact README section placement for ISR scaling docs.
- The **test script details** for publish→visible verification (what to check, how to assert).
- The exact **DKIM/SPF/DMARC record values** for Resend (operator provides the domain + Resend provides the records to publish).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project-level (stack + scope — authoritative)
- `CLAUDE.md` (repo root) — **"Performance requirements"** (ISR/PPR by default; `next/image` only; `revalidatePath`/`revalidateTag` on publish — no polling/rebuild; no client-side data fetching on the public site for server-renderable content; lean client JS); **"SEO requirements"**; folder structure; "What NOT to do" (pnpm only, sanitize raw HTML, no paid APIs, no Vercel tooling).
- `.claude/CLAUDE.md` — **verified 2026 version table + code shapes**: Next.js 16.2.9 (`cacheComponents:true` PPR; `output:"standalone"`; async `params`/`searchParams`; 2-arg `revalidateTag(tag, "max")`); React 19; Zod v4.4.3; drizzle-orm 0.45.2 pinned; sharp 0.35.2; Node 20.19 LTS base image. Read before any dependency install or Dockerfile authoring.
- `.planning/PROJECT.md` — Core Value ("readers consume content at maximum speed — fast AND SEO-sound"); Key Decisions; Context (greenfield DB, growing traffic tens-of-thousands/month, small team 2–5, self-hosted/no-paid-API ethos); Constraints (locked stack, pnpm only, performance bar, security, no paid APIs).

### Phase-7-specific (requirements + roadmap)
- `.planning/REQUIREMENTS.md` — **PERF-01..04, PERF-06** (the 5 requirements this phase must satisfy), plus **ANAL-02** (Umami analytics deployment — folded into this phase from Phase 6), plus Out-of-Scope rows. **Note:** PERF-06 says "Staging deployment" — per D-32, reframe as production deploy; flag the wording.
- `.planning/ROADMAP.md` §"Phase 7: Performance & Deploy" — goal, **5 success criteria** (SC#5 says "staging" — reframe per D-32), **pitfalls owned** (#3 publish→visible verified on real stack; #6 document single-replica ISR scaling cliff; R2 op-count/sharp-CPU cost monitoring + billing alerts; Coolify build-vs-runtime env secret separation), research flag (LOW).

### Prior-phase context (carries forward — DO NOT re-plan)
- `.planning/phases/06-public-frontend/06-CONTEXT.md` — **D-17** (analytics injection mechanism wired — Phase 7 deploys the Umami instance and configures the script URL); the `(site)` routes that exist; the ISR/PPR patterns established.
- `.planning/phases/05-seo-basics/05-CONTEXT.md` — **D-13** (revalidation already wired in Phase 3 — Phase 7 audits it); the `lib/seo/*` builders consumed by `(site)` routes.
- `.planning/phases/04-dashboard-chrome/04-CONTEXT.md` — **D-28** (QueryClient scoped to `(admin)` only — Phase 7 verifies no leakage); Storage Settings pattern (Phase 7 configures the Umami script URL here).
- `.planning/phases/03-content-engine/03-CONTEXT.md` — **D-25** (publish action revalidation — Phase 7 audits every call); the `lib/storage/` provider abstraction.
- `.planning/phases/02-auth-rbac/02-CONTEXT.md` — the `src/middleware.ts` UX-only auth-gate pattern (Phase 7 adds rate limiting to the auth **endpoints**, NOT in middleware — see `src/middleware.ts` comment); `requireRole`/`requireCan` helpers; **AUTH-06/07 verification debt** that D-33 now closes.
- `.planning/phases/02-auth-rbac/02-UAT.md` (if present) — UAT-02-01 real-inbox delivery procedure; D-33 operationalizes it.
- `.planning/phases/01-foundation/01-CONTEXT.md` — Next.js 16 config (`cacheComponents:true`, `output:"standalone"`, `images.remotePatterns`); the `(site)`/`(admin)` ESLint isolation; the Drizzle schema + migration pipeline.

### Code (current state — scout-verified 2026-07-28)
- `src/middleware.ts` — **the auth gate is `middleware.ts`, NOT `proxy.ts` (RESOLVED, do not re-litigate).** Cited code comment: under Next.js 16.2.9 + Turbopack, `proxy.ts` compiles but never registers in `middleware-manifest.json` (routes zero requests); `middleware.ts` works and is labeled "ƒ Proxy (Middleware)" in build output. **Rate limiting (D-01) must NOT live here** — middleware is UX-only, no persistent state; it goes in the Server Actions / auth route handlers via `@upstash/ratelimit` + ioredis.
- `next.config.ts` — `cacheComponents:true`, `output:"standalone"`, `serverActions.bodySizeLimit:"10mb"`, `images.remotePatterns` (cdn.anydiscussion.com, res.cloudinary.com, localhost:9000), custom `loaderFile: src/lib/image-loader.ts`. The deployment configuration target — already production-shaped.
- `src/actions/posts.ts` — the publish action's revalidation block (~lines 352-368): `revalidatePath` for `/blog/${slug}`, `/`, `/blog`, category, `/sitemap.xml`, `/rss.xml` + `revalidateTag` with 2-arg form. The primary audit target for PERF-03.
- `src/actions/settings.ts` — `saveSeoSettings` revalidation: `revalidateTag("seo-settings","max")` + `revalidatePath("/", "layout")` + SEO routes. Another audit target.
- `src/app/(site)/` — all public routes (home, blog, blog/[slug], archive, category, tag, author, search, about, contact, terms, privacy, preview). The performance audit targets for PERF-01.
- `src/lib/image-loader.ts` + `next.config.ts images.remotePatterns` — the CDN image loader + allowed hostnames. Already configured; just verify on real stack.
- `src/eslint.config.mjs` — the `no-restricted-imports` rule keeping `(site)`/`(admin)` isolated. The enforcement mechanism for PERF-02; the Coolify build step (D-12) runs it with `--max-warnings 0`.
- `docker-compose.yml` — **DEV-ONLY** today: `postgres:17-alpine` + `postgres-test` (clean-room migration) + MinIO (R2/S3 parity). **No Redis service** — planner must add Redis for prod (or a separate prod compose). Postgres dev port is 5435.
- `.env.example` — documents all env vars (DATABASE_URL, BETTER_AUTH_SECRET, RESEND_API_KEY, S3 credentials, CDN URL, SETTINGS_ENCRYPTION_KEY). The reference for build-vs-runtime env separation (D-21). **Add `REDIS_URL`** for D-01.
- `package.json` scripts — `lint`, `build`, `test` (vitest), `test:migrations`, `test:auth-gate`, `setup`, `verify`. The build-step gate (D-12) reuses `lint`; a new bundle-size script is needed for the 100KB gate.
- `scripts/` — existing `.mjs` dev tooling (test-migrations, test-auth-gate, setup, verify, inspect-* from recent commits). Pattern to follow for the publish→visible test script (D-17).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`src/actions/posts.ts` revalidation block** — already wired with `revalidatePath`/`revalidateTag` (Phase 3 D-25). Phase 7 audits it, doesn't rewrite it.
- **`next.config.ts`** — already configured for standalone output + PPR + CDN loader. Phase 7 verifies the configuration works on Coolify.
- **`src/eslint.config.mjs` no-restricted-imports** — already enforces `(site)`/`(admin)` isolation. Phase 7 adds a Coolify build-step gate on top.
- **`src/app/(site)/layout.tsx`** — the public site shell. Phase 7 verifies font loading, analytics injection, and dark mode work correctly.
- **`scripts/*.mjs` pattern** — established Node-script dev tooling (`test-migrations.mjs`, `test-auth-gate.mjs`, inspect scripts). Reuse this pattern for the publish→visible verification script (D-17) rather than introducing a new test runner.
- **`package.json` `lint`/`verify` scripts** — the Coolify build-step gate (D-12) reuses these; only a bundle-size script is new.

### Established Patterns
- **ISR/revalidation over polling/rebuild** — `revalidatePath`/`revalidateTag` on publish (Phase 3 D-25); Phase 7 audits completeness.
- **`(site)`/`(admin)` isolation** — ESLint `no-restricted-imports` (Phase 1); Phase 7 adds build-step enforcement.
- **`next/image` only** — no raw `<img>` tags; the CDN loader handles optimization. Phase 7 verifies on real stack.
- **Server Components by default** — minimal client JS on public routes. Phase 7 measures the impact via Lighthouse.
- **`middleware.ts` is UX-only** — code-documented (not a security boundary); rate limiting belongs in actions/handlers, not middleware.

### Integration Points
- **Coolify project configuration** — Dockerfile (new), env vars, resource limits, health checks. New infrastructure, not application code.
- **Redis service** — new Coolify Docker service for rate limiting. `REDIS_URL` env var consumed by `ioredis` inside the `@upstash/ratelimit` wrapper. Add to `docker-compose.yml` for local/dev parity too.
- **Umami service** — new Coolify Docker service. `DATABASE_URL` pointing to the Umami-specific Postgres database.
- **Build-step gate** — a `pnpm` script (lint + bundle-size) invoked from the Dockerfile build stage; fail aborts the deploy. No GitHub Actions.
- **Lighthouse CI** — local or Coolify-step invocation (NOT GitHub Actions per D-31).
- **DNS (DKIM/SPF/DMARC)** — operator publishes records provided by Resend; verified via the D-33 inbox test.

</code_context>

<specifics>
## Specific Ideas

- **"Verify, don't build" posture** — Phase 7 is primarily a verification and deployment phase. The founder chose recommended options across all eight areas, reflecting a "ship it on the real stack" mentality. The work is auditing, testing, documenting, and configuring — not writing new application features.
- **No staging, no CI — minimal pipeline by design (2026-07-28).** The founder explicitly rejected both a separate staging environment and a GitHub Actions CI layer. The deploy model is intentionally lean: git-push → Coolify → production, with the Docker build stage doubling as the quality gate. This is a deliberate small-team trade-off — simplicity over belt-and-suspenders. The planner should treat the build-step gate as load-bearing, not optional.
- **Strict security posture** — 3 attempts / 15 min on all auth endpoints (D-02/D-03); real email deliverability verified before launch (D-33). The self-hosted Redis + ioredis avoids any cloud dependency while providing production-grade rate limiting.
- **Self-hosted everything** — Redis on Coolify (D-04), Umami on Coolify (D-24), same Postgres for Umami (D-25), Resend only for SMTP. Consistent with the no-paid-API ethos. The founder prefers managing infrastructure on their own VPS over using cloud services.
- **Documentation as a deliverable** — The ISR scaling documentation (D-28/D-29/D-30) is a deliberate choice to document the scaling cliff before it becomes a problem, not after. Proactive engineering for a small team.
- **No aesthetic/branding references** — branding remains deferred. These are performance, security, deployment, and operations decisions.

</specifics>

<deferred>
## Deferred Ideas

- **Staging environment → rejected (D-32), revisit if a safety net becomes needed.** If the founder later wants pre-production validation, the natural fast-follow is a `production`-branch promotion flow (main stays non-deploying; promotion triggers the prod deploy). Do NOT re-introduce a full staging subdomain env unless explicitly requested.
- **GitHub Actions / separate CI layer → rejected (D-31).** If the team grows or pre-merge checks become necessary, a CI pipeline can be added as a fast-follow. For v1, the Coolify build-step gate is the sole automated check.
- **Multi-replica ISR scaling (Redis-backed shared cache handler) → v2 (SCALE-01).** Documented in Phase 7 but NOT implemented. The single-instance ISR scaling cliff is a known limitation for v2.
- **Persistent rate limiting (Redis-backed across restarts) → not needed.** Rate limit data is ephemeral; losing it on restart is acceptable (D-04).
- **Automated E2E testing for publish→visible → future fast-follow.** Phase 7 uses manual verification (D-17); automated E2E is heavier setup for a small team.
- **Cloudflare Image Resizing → not needed.** The existing next/image + sharp pipeline is sufficient (D-10).
- **Custom bundle analyzer → not needed.** ESLint + build-step gate is sufficient for the import boundary (D-15).
- **Full scaling roadmap → premature.** ISR scaling only (D-30); other scaling concerns are handled by the services themselves.

### Reviewed Todos (not folded)
- **"Configurable multi-destination backup system"** (pending todo, area: database, matched Phase 7 with score 0.6) — **reviewed, NOT folded.** Already mutated into **Phase 8 — Backup & Disaster Recovery** (BACKUP-01..05); unrelated to Performance & Deploy.

</deferred>

---

*Phase: 7-Performance & Deploy*
*Context gathered: 2026-07-14*
*Context updated: 2026-07-28 (rate-limit driver confirmed; CI gate → Coolify build step; staging dropped → push-main-to-prod; AUTH-06/07 email debt closed in-phase)*
</content>
</invoke>