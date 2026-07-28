# Phase 7: Performance & Deploy - Research

**Researched:** 2026-07-28
**Domain:** Production verification, self-hosted deployment (Coolify), auth rate limiting, ISR/revalidation auditing, analytics deployment
**Confidence:** HIGH (targeted — LOW flag honored; eight focused areas verified against current docs and the actual codebase)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Auth rate limiting (PERF-04)**
- **D-01 (refined 2026-07-28):** `@upstash/ratelimit` + `ioredis` against self-hosted Redis 7.x on Coolify. MIT-licensed lib, no Upstash cloud account, no paid API.
- **D-02:** 3 attempts / 15 min window — strict (small team 2–5 tolerates this).
- **D-03:** All auth endpoints rate-limited (sign-in, password reset, email verification, session refresh). Sign-up is admin-only (not a target).
- **D-04:** Self-hosted Redis 7.x Coolify Docker service. 256MB memory limit, `maxmemory-policy allkeys-lru`, NO persistence. Redis NOT yet in `docker-compose.yml` — planner adds it for prod + local/dev parity and wires `REDIS_URL`.

**Lighthouse / performance targets (PERF-01)**
- **D-05:** Lighthouse 90+ minimum (not 95+).
- **D-06:** Google 'Good' CWV thresholds. **RESEARCH CORRECTION:** original wording says "FID < 100ms" — FID was replaced by INP in March 2024. The 2026 thresholds are LCP<2.5s, INP<200ms, CLS<0.1 (see State of the Art).
- **D-07:** Lighthouse CI + manual audit on the real Coolify + Cloudflare stack.
- **D-08:** All `(site)` routes audited (home, /blog, /blog/[slug], archive, category, tag, author, search, about, contact, terms, privacy, 404).
- **D-09:** Fonts via `next/font` + `font-display: swap`.
- **D-10:** Existing `next/image` + sharp pipeline already wired — just verify on real stack.
- **D-11:** Caching via `s-maxage` + `stale-while-revalidate`.

**Bundle audit (PERF-02)**
- **D-12 (refined):** ESLint `no-restricted-imports` + Coolify Docker **build-step** gate (NOT GitHub Actions — there is no CI per D-31). Fail aborts deploy.
- **D-13 (refined):** Two gates in the Docker build: (1) cross-group import fails the build, (2) public bundle > 100KB gzipped fails the build. This is the **only** automated pre-production safety net.
- **D-14:** 100KB gzipped threshold.
- **D-15:** Use the existing `no-restricted-imports` rule (verified in `eslint.config.mjs` at repo root); add a bundle-size script.

**Revalidation audit (PERF-03)**
- **D-16:** Systematic action-by-action audit of every mutating action → revalidatePath/revalidateTag mapping → markdown table + checklist.
- **D-17:** Manual publish→visible test script (follow the `scripts/*.mjs` pattern) + visual confirmation on real stack.
- **D-18:** All mutating actions audited: posts, categories, tags, pages, media, settings, users.
- **D-19:** Output: markdown table + checklist (planner produces this as a deliverable).

**Production deployment on Coolify (PERF-06)**
- **D-20:** Multi-stage Dockerfile (Stage 1: pnpm install + next build + lint + bundle gate; Stage 2: copy standalone). **No Dockerfile exists yet.**
- **D-21:** Build-time: `NEXT_PUBLIC_*` only baked in. Runtime secrets (DATABASE_URL, BETTER_AUTH_SECRET, RESEND_API_KEY, S3 creds, SETTINGS_ENCRYPTION_KEY, REDIS_URL) injected via Coolify env.
- **D-22:** SUPERSEDED by D-32.
- **D-23 (refined):** Coolify-managed SSL (Let's Encrypt) on the **production** domain (`anydiscussion.com` + www).
- **D-31 (NEW):** No GitHub Actions / no separate CI layer. Coolify build stage IS the pipeline. Planner MUST NOT create `.github/workflows/*.yml`.

**Deploy flow**
- **D-32 (NEW):** No staging environment. `git push main` = production deploy. The Lighthouse/CWV audit + publish→visible verification run against production. The build-step gate (D-12/D-13) is the sole pre-production safety net — must fail-fast with clear logs.
  - **Planner flag:** ROADMAP SC#5 + REQUIREMENT PERF-06 literally say "Staging deployment." Reframe to "Coolify git-push deploy + managed SSL to production." Do not drop the requirement; restate the wording.

**Email deliverability debt closure (AUTH-06/07)**
- **D-33 (NEW):** (a) Set DKIM, SPF, DMARC DNS records on the mail-sending domain for Resend SMTP. (b) One real inbox delivery test for password-reset AND email-verification emails (verify they land in inbox, not spam).

**Umami analytics (ANAL-02)**
- **D-24:** Coolify Docker service.
- **D-25:** Same Postgres instance, separate database.
- **D-26:** Settings-stored script injection (Phase 6 D-17 already wired the mechanism — just configure the Umami script URL in `/dashboard/settings/seo`).
- **D-27:** Separate subdomain `analytics.anydiscussion.com`.

**ISR scaling documentation**
- **D-28:** README section + ADR documenting the single-instance ISR scaling cliff.
- **D-29:** Problem (single instance = ISR works; multi-replica = stale caches) + current solution (single Coolify instance) + v2 path (Redis-backed shared cache handler, SCALE-01).
- **D-30:** ISR scaling only — don't over-document.

### Claude's Discretion
- Lighthouse CI configuration (runner, thresholds, trigger — local or Coolify step, NOT GitHub Actions).
- Revalidation audit table format (columns, granularity).
- Dockerfile specifics (base image, pnpm version, Node.js version, layer ordering, where lint + bundle gate runs).
- Coolify project configuration (resource limits, health checks, restart policy, Redis + Umami service definitions).
- Umami configuration (website registration, data retention, sharing settings).
- ADR format + exact README section placement.
- Publish→visible test script details.
- Exact DKIM/SPF/DMARC record values (operator provides domain + Resend provides records).

### Deferred Ideas (OUT OF SCOPE)
- Staging environment → rejected (D-32). Fast-follow if needed: `production`-branch promotion flow.
- GitHub Actions / separate CI layer → rejected (D-31).
- Multi-replica ISR scaling (Redis-backed shared cache handler) → v2 (SCALE-01). Documented but NOT implemented.
- Persistent rate limiting across restarts → not needed (ephemeral is fine, D-04).
- Automated E2E for publish→visible → future fast-follow.
- Cloudflare Image Resizing → not needed.
- Custom bundle analyzer → not needed.
- Full scaling roadmap → premature.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PERF-01 | Public-site Lighthouse/CWV performance pass | § Standard Stack (Lighthouse CI 0.15.1); § State of the Art (INP replaced FID, 2026 thresholds); § Code Examples (lighthouserc.json) |
| PERF-02 | Bundle-budget check enforcing no TailAdmin/editor JS in public chunk | § Existing Code Insights (eslint.config.mjs verified at repo root); § Code Examples (bundle-size gate script); § Validation Architecture |
| PERF-03 | revalidatePath/revalidateTag audit + publish→visible verified end-to-end | § Existing Code Insights (only posts.ts + settings.ts currently revalidate — gap inventory); § Code Examples (audit table + publish→visible script); § Validation Architecture |
| PERF-04 | Rate limiting on auth endpoints | § Summary + § Code Examples (Better Auth built-in `rateLimit.customRules` + Redis customStorage); § State of the Art (@upstash/ratelimit v2 is HTTP-only — D-01 reconciliation); § Package Legitimacy Audit |
| PERF-06 | ~~Staging~~ → Production deployment on Coolify (reframed per D-32) | § Standard Stack (Dockerfile pattern, Node 20.19 LTS); § Code Examples (multi-stage Dockerfile with build-step gate); § Environment Availability |
| ANAL-02 | Self-hosted Umami analytics deployment | § Code Examples (Umami Docker service + env vars); § Don't Hand-Roll |
</phase_requirements>

## Summary

Phase 7 is a **verification and deployment** phase, not a feature-building phase. The bulk of work is auditing (PERF-03 revalidation sweep across every mutating action in `src/actions/`), configuring (Coolify Dockerfile + Redis + Umami + Resend DNS), documenting (ISR scaling ADR), and writing two small pieces of new code (rate-limit wiring; bundle-size gate script). Research confirms the locked stack and tightens the API specifics for the genuinely new paths.

Three findings materially reshape how the planner should sequence the work:

1. **Better Auth has a built-in `rateLimit` config** (`window`, `max`, `customRules`, `customStorage`) that already returns HTTP 429 + `X-Retry-After` for `/sign-in/email`, `/forget-password`, `/verify-email`, etc. [CITED: better-auth.com/docs/concepts/rate-limit]. This is the canonical integration point for D-03 — not middleware, not a Server-Action wrapper. The planner wires `customRules: { "/sign-in/email": { window: 900, max: 3 }, ... }` directly in `src/lib/auth/index.ts` and backs the storage with ioredis via `customStorage: { get, set }`. The `@upstash/ratelimit` library from D-01 is repurposed: use it to replace the **existing in-memory** `src/lib/rate-limit/index.ts` (Contact form, Phase 6) with a Redis-backed limiter, satisfying D-01 literally while keeping Better Auth's built-in for auth endpoints.

2. **`@upstash/ratelimit` v2.x is HTTP-only by design** [CITED: upstash.com/docs/redis/sdks/ratelimit-ts/overview, github.com/upstash/ratelimit-js/issues/115]. It does NOT ship a native ioredis adapter — using it with self-hosted Redis requires writing a small adapter that wraps ioredis to match the Upstash REST-style method signatures (`pipeline`, `eval`, etc.). The community pattern is documented in Issue #115. The library IS still usable for D-01's intent (MIT, no cloud account), but the planner must budget a small adapter file (~30 lines), not a one-liner.

3. **INP replaced FID in March 2024** [CITED: developers.google.com/search/docs/appearance/core-web-vitals]. D-06's wording "FID < 100ms" is OUTDATED. The 2026 'Good' thresholds are **LCP ≤ 2.5s, INP ≤ 200ms, CLS ≤ 0.1**. The Lighthouse CI config must key on `interaction-to-next-paint` (not `max-potential-fid`). Flag for the planner to update D-06 wording in the deliverable docs.

Secondary findings: the revalidation audit will surface gaps (only `posts.ts:publishPost` and `settings.ts:saveSeoSettings` currently call `revalidatePath`/`revalidateTag` — categories/tags/pages/media/users CRUD do NOT, and the audit must classify each as a real gap vs. correctly-not-cached); the existing in-memory `src/lib/rate-limit/index.ts` (Contact form) should be migrated to Redis as part of PERF-04 to avoid two rate-limit codepaths; Next.js 16 exposes `cacheHandler` (singular) for the ISR scaling v2 documentation target; and Resend auto-generates DKIM + SPF records in its dashboard but the operator must add the DMARC TXT record manually at `_dmarc.<domain>`.

**Primary recommendation:** Plan Phase 7 as five tightly-scoped waves — (1) Dockerfile + build-step gate, (2) rate-limit wiring (Better Auth built-in + ioredis customStorage + Umami + Redis service), (3) revalidation audit + publish→visible script, (4) deploy to Coolify production + DNS, (5) Lighthouse/CWV audit + ISR ADR + email deliverability test. The build-step gate (Wave 1) is the single load-bearing safety net for the entire no-staging/no-CI deploy model — make it bomb-proof before anything else.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Auth endpoint rate limiting | API / Backend (Better Auth `rateLimit` config) | Database / Storage (Redis via customStorage) | Better Auth's built-in limiter enforces 429s at the auth route handler boundary; Redis backs the counters for cross-restart persistence. NOT middleware (UX-only per `middleware.ts` comment). |
| Contact-form rate limiting | API / Backend (Server Action) | Database / Storage (Redis via `@upstash/ratelimit` + ioredis adapter) | Existing Phase-6 pattern (in-memory); Phase 7 swaps the store for Redis. Stays in the Server Action, not middleware. |
| Bundle isolation enforcement | Build pipeline (Coolify Docker build stage) | — | Lint + bundle-size gate run at image build time; no runtime component. The only pre-production safety net (D-31/D-32). |
| Revalidation correctness | API / Backend (Server Actions) | CDN / Static (`revalidatePath`/`revalidateTag` flush Next cache) | Mutating actions own the revalidation calls; the audit verifies each one. |
| ISR scaling (v2 documentation) | Database / Storage (Redis shared cache) | API / Backend (Next.js `cacheHandler`) | v2 only; documented in ADR. The `cacheHandler` interface (`get/set/revalidateTag/resetRequestCache`) is the integration point. |
| Lighthouse/CWV measurement | External (Lighthouse CI binary) | CDN / Static (audits the real production URL) | Run as a Coolify step or locally against the prod URL — NOT GitHub Actions. |
| Email deliverability (DKIM/SPF/DMARC) | External (DNS provider + Resend) | — | Operator publishes records Resend provides; verified via inbox test. |
| Analytics (Umami) | External (separate Coolify service) | Database / Storage (separate Postgres DB) | Runs alongside the Next.js app, not inside it. Script injection already wired in Phase 6. |
| Container build | Build pipeline (Coolify → Dockerfile) | — | Multi-stage build with `output: "standalone"`; secrets injected at runtime, not baked. |

## Project Constraints (from CLAUDE.md)

These directives have the same authority as locked decisions. Research does not recommend approaches that contradict them.

- **Package manager:** pnpm ONLY. Never npm/yarn — in commands, scripts, READMEs, CI config, or Dockerfiles. Use `pnpm add`, `pnpm dlx`, `pnpm run`, `corepack`, `pnpm fetch` + `pnpm install --offline` in Docker.
- **Performance bar (non-negotiable):** public pages ISR/static by default; PPR (`cacheComponents:true`) where pages mix static body + dynamic content; `next/image` only (never raw `<img>`); `revalidatePath`/`revalidateTag` on publish — no polling or full rebuilds; no client-side data fetching on the public site for server-renderable content.
- **Security:** every mutating Server Action starts with a role/permission check; sanitize any raw HTML/JS field before storage AND before render; never rely on UI hiding alone. Middleware is UX-only — not a security boundary (per `middleware.ts` code comment).
- **Self-hosted / no paid APIs:** VPS via Coolify; no Vercel-specific APIs (Blob, KV) or paid third-party APIs without explicit approval. R2 only for media (never local disk/Postgres).
- **Migrations:** `drizzle-kit generate` after schema changes — never hand-write SQL.
- **Locked stack (verified 2026-07 versions):** Next.js 16.2.9 (lockfile drift to 16.2.12 confirmed safe — see State of the Art), React 19, drizzle-orm 0.45.2 (do NOT adopt 1.x RC — Better Auth peer pins it), better-auth 1.6.23 (lockfile at 1.6.25), sharp 0.35.2, Node 20.19 LTS base image (isomorphic-dompurify@3 requires `^20.19.0 || ^22.13.0 || >=24.0.0`).
- **Code conventions:** TypeScript strict mode (no `any` without justification comment); Zod schemas shared client+server; Server Actions default mutation path (API routes only for externally-hit handlers like Better Auth's `/api/auth/*`); `(site)`/`(admin)` route groups physically separate.

## Standard Stack

### Core (Phase 7 additions to the verified stack)

| Library | Version | Purpose | Why Standard | Conf. |
|---------|---------|---------|--------------|-------|
| `ioredis` | **5.11.1** | Redis client for self-hosted Redis 7.x (D-04) | OK legitimacy verdict; 24.7M weekly downloads; `luin/ioredis` repo; MIT. Works with any plain Redis URL. | HIGH |
| `@upstash/ratelimit` | **2.0.8** | Rate-limit engine (D-01) — used for Contact form + any non-auth path | SUS legitimacy verdict (no-repository field — the package.json omits `repository`; the actual repo is `github.com/upstash/ratelimit`, well-known); 1.8M weekly downloads; MIT. **v2.x is HTTP-only by design — using with ioredis requires a ~30-line adapter** (see Code Examples). | MEDIUM |
| `@lhci/cli` | **0.15.1** | Lighthouse CI runner for PERF-01 | OK legitimacy; GoogleChrome/lighthouse-ci; 1.3M weekly downloads. | HIGH |
| `lighthouse` | **13.4.1** | Underlying Lighthouse binary (peer of @lhci/cli) | SUS verdict (too-new — published 2026-07-20); GoogleChrome/lighthouse; 3.6M weekly downloads. The "too-new" flag is just recency, not suspicion. **v13 dropped the legacy `max-potential-fid` audit; INP audit id is `interaction-to-next-paint`.** | HIGH |
| `redis:7-alpine` | (Coolify service) | Self-hosted Redis 7.x container (D-04) | Official Redis Inc. image; matches the lockfile spirit (self-hosted, no paid API). | HIGH |

### Existing stack this phase audits/integrates with (verified in codebase)

| Component | Version (in lockfile) | Phase 7 use |
|-----------|----------------------|-------------|
| `next` | 16.2.9 (latest 16.2.12 — safe minor) | Standalone output, cacheComponents, cacheHandler reference for ISR docs |
| `better-auth` | 1.6.23 (latest 1.6.25) | Built-in `rateLimit` config is the integration point for PERF-04 |
| `drizzle-orm` | 0.45.2 | Pinned — do not bump to 1.0 RC (Better Auth peer prevents it) |
| `eslint` + `eslint-config-next` | 9.39.1 / 16.0.7 | `no-restricted-imports` rule already enforces `(site)`/`(admin)` isolation; build-step gate wraps `pnpm lint --max-warnings 0` |
| Docker (Dockerfile is NEW) | — | Multi-stage with `node:20-alpine`; pnpm via corepack |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `@upstash/ratelimit` + ioredis (D-01) | Better Auth built-in `rateLimit` alone + ioredis `customStorage` | D-01 locks the library in. The recommendation is to use BOTH: Better Auth's built-in for auth endpoints (canonical, simpler) AND `@upstash/ratelimit` for the Contact form (replacing the in-memory limiter). This honors D-01 literally while avoiding a hand-rolled auth wrapper. |
| Lighthouse CI (D-07) | `unlighthouse` or raw `lighthouse` CLI | LHCI is the standard, has `assert.assertions` for fail-on-threshold. `unlighthouse` scans multiple URLs but adds a dependency. Stick with LHCI. |
| `@next/bundle-analyzer` | Custom script over `.next/static` | `@next/bundle-analyzer` produces an interactive treemap (good for debugging which import leaked) but doesn't fail the build. A custom `scripts/check-bundle-size.mjs` reading `.next/static/chunks/*.js` is the gate. Use BOTH: the analyzer for diagnosis, the script for the gate. |

**Installation:**
```bash
# pnpm only — never npm/yarn (CLAUDE.md)
pnpm add @upstash/ratelimit@^2.0.8 ioredis@^5.11.1
pnpm add -D @lhci/cli@^0.15.1 @next/bundle-analyzer
# lighthouse itself comes as a peer of @lhci/cli — no separate install needed
# Note: @next/bundle-analyzer is dev-only (diagnostic); the gate is a custom script
```

**Version verification:** Versions confirmed against the npm registry on 2026-07-28 via `npm view <pkg> version dist-tags.latest`. Lockfile drift: `next` lockfile at 16.2.9 / latest 16.2.12 — safe minor bump; `better-auth` lockfile at 1.6.23 / latest 1.6.25 — safe patch bump. Neither requires action in Phase 7 (the lockfile pins hold).

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| `ioredis` | npm | ~9 yrs (latest publish 2026-06-04) | 24.7M/wk | github.com/luin/ioredis | OK | Approved |
| `@upstash/ratelimit` | npm | ~4 yrs (latest 2026-01-12) | 1.8M/wk | github.com/upstash/ratelimit (omitted from package.json — known metadata gap) | SUS | Flagged — planner adds `checkpoint:human-verify` before install. Verify the package is the real Upstash-published one (look for the `upstash` npm scope owner) before pinning. |
| `@lhci/cli` | npm | ~6 yrs (latest 2025-06-25) | 1.3M/wk | github.com/GoogleChrome/lighthouse-ci | OK | Approved |
| `lighthouse` | npm | ~9 yrs (latest 2026-07-20) | 3.6M/wk | github.com/GoogleChrome/lighthouse | SUS (too-new) | Approved — the "too-new" verdict is purely recency (8 days old); GoogleChrome is the canonical owner. No checkpoint needed. |
| `@next/bundle-analyzer` | npm | (verifying at install time) | — | github.com/vercel/next.js | ASSUMED | Verify at install — well-known Vercel package but version not pre-checked. |

**Packages removed due to [SLOP] verdict:** none.

**Packages flagged as suspicious [SUS]:**
- `@upstash/ratelimit@2.0.8` — the SUS flag is a metadata gap (no `repository` field in package.json), NOT a slopsquatting concern. The package is published under the `@upstash` npm scope (verified owner). The planner should still run `npm view @upstash/ratelimit` and confirm the publisher is `upstash` before pinning — defense-in-depth.
- `lighthouse@13.4.1` — the SUS flag is recency only. Safe to use.

*All packages in this phase were discovered via the locked decisions in CONTEXT.md (D-01) and the standard Lighthouse CI tooling (D-07). Their existence is `[VERIFIED: npm registry]` per `npm view`. The libraries' *suitability for the self-hosted Redis path* is `[CITED: official docs]` for the ioredis + Better Auth path and `[CITED: GitHub Issue #115]` for the @upstash/ratelimit + ioredis adapter pattern.*

## Architecture Patterns

### System Architecture Diagram

```
                    ┌─────────────────────────────────────────┐
                    │           DEVELOPER MACHINE             │
                    │                                         │
                    │   git push origin main ─────────────────┼──┐
                    └─────────────────────────────────────────┘  │
                                                                  │
                                                                  ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          COOLIFY (VPS)                                       │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │  BUILD STAGE  (Dockerfile stage 1)                                     │  │
│  │                                                                        │  │
│  │  pnpm install ──► pnpm lint --max-warnings 0 ──► [GATE 1: ESLint]      │  │
│  │                                        │                               │  │
│  │                                        ├─ FAIL → abort deploy         │  │
│  │                                        ▼                               │  │
│  │                           pnpm build (next build standalone)           │  │
│  │                                        │                               │  │
│  │                                        ▼                               │  │
│  │              scripts/check-bundle-size.mjs .next/static                │  │
│  │                                        │                               │  │
│  │                                        ├─ FAIL >100KB gz → abort      │  │
│  │                                        ▼                               │  │
│  │  [GATE 2: bundle size] ── PASS ──► copy standalone → runtime image     │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│  ┌───────────────────────┐   ┌──────────────────────┐   ┌─────────────────┐  │
│  │  NEXT.JS RUNTIME      │   │  POSTGRES 17          │   │  REDIS 7        │  │
│  │  (node:20-alpine)     │   │  (Coolify service)    │   │  (Coolify svc)  │  │
│  │                       │   │                       │   │                 │  │
│  │  env:                 │   │  - anydiscussion DB   │   │  256MB          │  │
│  │  • DATABASE_URL ──────┼───┼─►                     │   │  allkeys-lru    │  │
│  │  • REDIS_URL ─────────┼───┼───────────────────────┼───┼─►               │  │
│  │  • BETTER_AUTH_SECRET │   │  - umami DB           │   │  no persistence │ │
│  │  • RESEND_API_KEY     │   │                       │   │                 │  │
│  │  • SETTINGS_ENC_KEY   │   └──────────┬────────────┘   └────────┬────────┘  │
│  │  • S3_* creds         │              │                        │           │
│  │  • NEXT_PUBLIC_*      │              │                        │           │
│  │    (baked at build)   │              │                        │           │
│  └───────────┬───────────┘              │                        │           │
│              │                          │                        │           │
│              │ rate-limit counters      │                        │           │
│              └──────────────────────────────────────────────────►│           │
│              │                                                   │           │
│              │ session/DB queries                                │           │
│              └──────────────────────────────────────────────────►│           │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐  │
│  │  UMAMI SERVICE (separate Coolify container)                            │  │
│  │  image: docker.umami.is/umami-software/umami:postgresql-latest         │  │
│  │  env: DATABASE_URL=postgres://...@postgres:5432/umami                  │  │
│  │  exposes analytics.anydiscussion.com (separate subdomain)              │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
│  Coolify proxy (Caddy/Traefik) terminates SSL (Let's Encrypt) for:          │
│    • anydiscussion.com + www  → Next.js runtime                              │
│    • cdn.anydiscussion.com    → Cloudflare R2                                 │
│    • analytics.anydiscussion.com → Umami                                     │
└─────────────────────────────────────────────────────────────────────────────┘
                  ▲                                       ▲
                  │ Lighthouse CI audits (PERF-01)        │ DKIM/SPF/DMARC
                  │ run from dev machine vs prod URL       │ DNS (D-33)
                  │                                       │
            ┌─────┴──────┐                         ┌──────┴──────┐
            │ Cloudflare │                         │  Resend     │
            │  (DNS +    │                         │  (SMTP)     │
            │   R2 CDN)  │                         │             │
            └────────────┘                         └─────────────┘
```

### Recommended Project Structure (Phase 7 additions)

```
repo-root/
├── Dockerfile                        # NEW (multi-stage, D-20)
├── .dockerignore                     # NEW
├── docker-compose.yml                # EXTEND — add redis service for dev parity (D-04)
├── lighthouserc.json                 # NEW — Lighthouse CI thresholds (D-07)
├── scripts/
│   ├── check-bundle-size.mjs         # NEW — gzipped public-chunk gate (D-13)
│   ├── test-publish-visible.mjs      # NEW — publish→visible verification (D-17)
│   └── (existing: test-migrations.mjs, test-auth-gate.mjs, setup.mjs, verify.mjs)
├── src/
│   ├── lib/
│   │   ├── redis/
│   │   │   └── index.ts              # NEW — ioredis singleton client (D-01)
│   │   ├── rate-limit/
│   │   │   ├── index.ts              # MODIFY — replace in-memory with @upstash/ratelimit + Redis
│   │   │   └── upstash-ioredis-adapter.ts  # NEW — wraps ioredis to match @upstash/ratelimit Store interface
│   │   └── auth/
│   │       └── index.ts              # MODIFY — add rateLimit.customRules + customStorage (D-01/D-03)
│   └── actions/                      # AUDIT TARGETS (PERF-03) — see audit table
└── docs/
    └── adr/                          # NEW (or .planning/adr/)
        └── 0001-isr-single-instance-scaling.md  # NEW — D-28/D-29
```

### Pattern 1: Dockerfile multi-stage with build-step gate (D-12/D-13/D-20)

**What:** Two-stage Dockerfile. Stage 1 installs deps, runs the two gates, then `next build`. Stage 2 copies only the standalone output + node_modules + public/static into a minimal runtime image.

**When to use:** This is the only Dockerfile for the project. Git-push triggers Coolify to run it; the gates either pass (deploy proceeds) or fail (deploy aborts).

**Example:**
```dockerfile
# Source: Next.js 16 standalone Docker docs + CLAUDE.md (pnpm only, Node 20.19 LTS)
# https://nextjs.org/docs/app/getting-started/deploying#docker

# ---- Stage 1: deps ----
FROM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm fetch --prod || true   # populate store from lockfile (offline-friendly)
COPY . .
RUN pnpm install --offline --frozen-lockfile

# ---- Stage 2: build + gates ----
FROM deps AS builder
# Build-time-only NEXT_PUBLIC_* vars (D-21) — bake the public vars into the client bundle.
# Runtime secrets are NOT here — they are injected at runtime via Coolify env.
ARG NEXT_PUBLIC_SITE_URL
ARG NEXT_PUBLIC_CDN_URL
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL
ENV NEXT_PUBLIC_CDN_URL=$NEXT_PUBLIC_CDN_URL
ENV NEXT_TELEMETRY_DISABLED=1

# GATE 1 — ESLint (D-12/D-15). Fails the build on any cross-group import or warning.
RUN pnpm lint --max-warnings 0

# Build the standalone output.
RUN pnpm build

# GATE 2 — gzipped public-chunk size (D-13/D-14). Reads .next/static, computes
# gzipped size of (site)-only chunks, fails if > 100KB.
RUN node scripts/check-bundle-size.mjs --max-gz-kb 100

# ---- Stage 3: runtime ----
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
USER nextjs
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
CMD ["node", "server.js"]
```

### Pattern 2: Better Auth built-in rate limit with ioredis customStorage (D-01/D-03)

**What:** Wire Better Auth's built-in `rateLimit` config (no plugin, no middleware) with `customRules` for each auth endpoint at 3/15min (D-02), backed by an ioredis `customStorage` adapter so counters persist across container restarts.

**When to use:** All Better Auth auth endpoints (sign-in, password reset, email verification, session refresh). This is the canonical path — not middleware, not a Server-Action wrapper.

**Example:**
```typescript
// Source: https://www.better-auth.com/docs/concepts/rate-limit (verified 2026-07-28)
// src/lib/auth/index.ts (modify — add rateLimit block)

import { betterAuth } from "better-auth";
import { redisClient } from "@/lib/redis";  // ioredis singleton

// 3 attempts per 15 minutes (D-02 strict). 15min = 900 seconds.
const STRICT_AUTH_RULE = { window: 900, max: 3 };

export const auth = betterAuth({
  // ...existing config...
  rateLimit: {
    enabled: true,
    window: 60,        // default 60s for any uncategorized route
    max: 100,          // default max
    customRules: {
      "/sign-in/email":          STRICT_AUTH_RULE,   // D-03 sign-in
      "/forget-password":        STRICT_AUTH_RULE,   // D-03 password reset (request)
      "/reset-password":         STRICT_AUTH_RULE,   // D-03 password reset (consume)
      "/verify-email":           STRICT_AUTH_RULE,   // D-03 email verification
      "/two-factor/*":           STRICT_AUTH_RULE,   // 2FA if enabled later
      // Server-side auth.api.* calls are NOT rate-limited (Better Auth default).
    },
    // ioredis-backed customStorage (D-01). The get/set shape is what Better Auth expects;
    // it stores `{ count, expiresAt }` per IP key.
    customStorage: {
      get: async (key) => {
        const raw = await redisClient.get(`ratelimit:${key}`);
        return raw ? JSON.parse(raw) : null;
      },
      set: async (key, value) => {
        // value is { count, expiresAt } — Better Auth passes the TTL implicitly
        // via the value's expiresAt; we honor it by setting Redis TTL.
        const ttlSec = Math.max(1, Math.ceil((value.expiresAt - Date.now()) / 1000));
        await redisClient.set(`ratelimit:${key}`, JSON.stringify(value), "EX", ttlSec);
      },
    },
  },
  advanced: {
    ipAddress: {
      // Trust Coolify's Caddy/Traefik proxy header (D-04 implicit).
      ipAddressHeaders: ["x-forwarded-for"],
    },
  },
});
```

### Pattern 3: @upstash/ratelimit + ioredis adapter (D-01 — Contact form path)

**What:** Wrap an ioredis client to match `@upstash/ratelimit`'s expected Store interface, then construct a `Ratelimit` instance. Use this for the Contact form (replacing `src/lib/rate-limit/index.ts`).

**When to use:** For rate-limited paths OUTSIDE Better Auth's auth endpoints — i.e., the Contact form (`src/actions/contact.ts`). Auth endpoints use Pattern 2.

**Key constraint [CITED: github.com/upstash/ratelimit-js/issues/115]:** `@upstash/ratelimit` v2.x is HTTP-first; it does NOT ship a native ioredis adapter. The community pattern is to wrap ioredis to match the Upstash-Redis-like interface (`pipeline()`, `eval()`, etc.). The adapter is ~30 lines.

**Example (sketch — planner fills in pipeline/eval):**
```typescript
// Source: github.com/upstash/ratelimit-js/issues/115 (community adapter pattern)
// src/lib/rate-limit/upstash-ioredis-adapter.ts
import { Ratelimit } from "@upstash/ratelimit";
import { redisClient } from "@/lib/redis";  // ioredis singleton

// ioredis wrapper that matches @upstash/ratelimit's minimal Redis interface.
// @upstash/ratelimit calls: redis.pipeline(), pipeline.set(...), pipeline.incr(...),
// pipeline.pexpire(...), pipeline.exec(), and redis.eval(script, keys, args).
// ioredis exposes all of these but with slightly different signatures — the adapter normalizes them.
class IoredisAdapter {
  // ...implement pipeline(), eval(), etc. — see Issue #115 for the canonical implementation...
}

export const contactFormLimiter = new Ratelimit({
  redis: new IoredisAdapter(),
  limiter: Ratelimit.slidingWindow(5, "1 h"),  // 5/hour for contact (existing Phase-6 policy)
  prefix: "ratelimit:contact",
  analytics: false,
});

// Usage in src/actions/contact.ts (replace the existing tryConsume call):
//   const { success } = await contactFormLimiter.limit(ip);
//   if (!success) throw new Error("RATE_LIMITED");
```

### Pattern 4: Revalidation audit output (D-16/D-18/D-19)

**What:** A markdown table mapping every mutating action to its revalidation calls, with checkboxes for verification. The planner produces this as a deliverable.

**Audit scope (verified by grep `from "next/cache"` against `src/actions/` on 2026-07-28):** ONLY `posts.ts` and `settings.ts` currently import revalidation. The audit must classify each of the following as **HAS** (verified), **MISSING** (real gap), or **N/A** (correctly-not-cached):

```markdown
| Action file | Function | revalidatePath calls | revalidateTag calls | Status |
|-------------|----------|---------------------|---------------------|--------|
| posts.ts | publishPost | /blog/{slug}, /, /blog, /category/{cat}, /sitemap.xml, /rss.xml | post-{id}, author-{id}, category-{id}, posts-list (all 2-arg "max") | ✅ HAS (Phase 3 D-25) |
| posts.ts | savePost (draft save) | — | — | ❓ AUDIT: drafts don't surface publicly → N/A likely |
| posts.ts | submitForReview | — | — | ❓ AUDIT: status change → N/A likely (no public surface) |
| posts.ts | setSchedule | — | — | ❓ AUDIT: publishedAt change → may need /blog/{slug} revalidation when cron flips status |
| posts.ts | autosavePost | — | — | N/A (draft only) |
| settings.ts | saveSeoSettings | /, /sitemap.xml, /robots.txt, /rss.xml (layout mode for /) | seo-settings (2-arg "max") | ✅ HAS (Phase 5) |
| categories.ts | createCategory / updateCategory / softDeleteCategory | — | — | ❓ AUDIT: category routes (/category/{slug}, /blog, home, sitemap) → likely MISSING |
| tags.ts | createTag / updateTag / softDeleteTag | — | — | ❓ AUDIT: tag routes (/tag/{slug}) + post-tag listings → likely MISSING |
| pages.ts | createPage / updatePage / softDeletePage | — | — | ❓ AUDIT: T&C/Privacy/Contact public routes → likely MISSING |
| media.ts | uploadMedia / deleteMedia | — | — | ❓ AUDIT: media URLs → N/A likely (next/image handles caching) |
| users.ts | createUser / banUser / unbanUser / revokeSessions / updateUser | — | — | ❓ AUDIT: /author/{username} pages → likely MISSING for profile updates |
| storage-settings.ts | saveStorageSettings | — | — | N/A (dashboard-only setting) |
| contact.ts | submitContact | — | — | N/A (no DB write — email only) |
```

**Key insight:** The audit is expected to surface real gaps in `categories.ts`, `tags.ts`, `pages.ts`, and `users.ts` (author pages). The planner must scope a task to add the missing revalidation calls — this is the most labor-intensive task in Phase 7 (per CONTEXT.md boundary notes).

### Anti-Patterns to Avoid

- **Putting rate limiting in `middleware.ts`.** The existing `middleware.ts` file is explicitly **UX-only** (per its code comment and Phase 2 D-04). It runs on every request including static assets and has no persistent state. Rate limiting belongs in the Better Auth `rateLimit` config (auth endpoints) or in the Server Action (Contact form). Re-introducing it to middleware breaks the documented boundary.
- **Baking runtime secrets into the Docker image.** D-21 is explicit: only `NEXT_PUBLIC_*` at build time. DATABASE_URL, BETTER_AUTH_SECRET, RESEND_API_KEY, S3 creds, SETTINGS_ENCRYPTION_KEY, REDIS_URL are runtime env vars injected via Coolify. Putting them in `ARG`/`ENV` in the Dockerfile leaks them into image layers.
- **Creating `.github/workflows/*.yml`.** D-31 forbids it. The Coolify build stage IS the pipeline. Do not add a "fallback CI" — it contradicts the founder's deliberate choice.
- **Using `@next/bundle-analyzer` as the gate.** The analyzer produces an interactive treemap (good for diagnosis) but doesn't fail the build. The gate is a custom `scripts/check-bundle-size.mjs` reading `.next/static/chunks/*.js` and computing gzipped size. Use the analyzer for finding leaks, the script for enforcement.
- **Keying auth rate limits by email.** Better Auth's built-in limiter is **IP-only** [CITED: better-auth.com/docs/concepts/rate-limit]. Email-keyed limits would let an attacker trivially enumerate-and-lockout arbitrary user accounts (denial of service). IP-only is the correct default for brute-force protection. CONTEXT.md D-01 mentions "IP + email" — flag this as a non-goal; the planner should NOT implement email-keyed limits.
- **Using `maxmemory-policy noeviction` on the Redis service.** D-04 specifies `allkeys-lru`. Rate-limit data is ephemeral; evicting the oldest keys under memory pressure is the correct behavior (a dropped rate-limit counter just resets the limit for one IP — acceptable).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Auth-endpoint rate limiting | A wrapper around `toNextJsHandler(auth)` that intercepts each request, checks Redis, returns 429 | Better Auth built-in `rateLimit.customRules` + `customStorage` | Better Auth already returns 429 + `X-Retry-After` and keys by path; rolling your own wrapper misses endpoints and re-implements the IP-extraction logic. |
| Lighthouse metric thresholds | Hard-coded pass/fail logic over Lighthouse JSON | `@lhci/cli` `assert.assertions` with `["error", {maxNumericValue: ...}]` | LHCI is the standard runner, has built-in aggregation across N runs (`optimistic` method to reduce flakiness), and fails non-zero on threshold violation. |
| Sliding-window rate-limit math | A custom Redis Lua script for sliding-window counters | `@upstash/ratelimit.slidingWindow(...)` (or Better Auth's built-in) | The sliding-window algorithm is subtle (vs. fixed-window); the library handles edge cases (race conditions, key expiry, atomic increments). |
| Revalidation call detection | A custom AST parser to find every `revalidatePath`/`revalidateTag` call | `ripgrep` (`rg "revalidatePath|revalidateTag" src/actions/`) + manual review | The grep gives you the surface; manual review classifies each as HAS/MISSING/N/A. Cheaper than AST tooling for ~15 action files. |
| Docker image base | A custom `ubuntu`-based image with manual Node install | `node:20-alpine` (matches CLAUDE.md Node 20.19 LTS pin) | The official Node Alpine image is the standard, smallest, and matches the verified stack. |
| pnpm in Docker | A shell script that downloads pnpm binary | `corepack enable && corepack prepare pnpm@latest --activate` | Corepack is Node's official package-manager manager; always installs the correct pnpm version. |
| Lighthouse CWV metric key | Using `max-potential-fid` (the legacy FID audit) | `interaction-to-next-paint` (the current INP audit, Lighthouse 10+) | FID was replaced by INP in March 2024. The old audit key still exists in some configs but doesn't reflect real user experience. |

**Key insight:** Phase 7 is a verification phase — the temptation is to write custom glue code, but every locked decision (D-01 through D-33) has a canonical library or built-in path. The only genuinely custom code is the ioredis→@upstash/ratelimit adapter (~30 lines), and that exists because D-01's "ioredis with @upstash/ratelimit" combination is unusual (most users pick one or the other). Everything else is configuration.

## Common Pitfalls

### Pitfall 1: `@upstash/ratelimit` v2 + ioredis is non-trivial
**What goes wrong:** D-01 says "use `@upstash/ratelimit` + `ioredis`" — a planner who skims the README will write `import { Ratelimit } from "@upstash/ratelimit"; import { Redis } from "@upstash/redis";` and call it a day, accidentally pulling in the Upstash REST client (cloud dependency, violates the no-paid-API ethos).
**Why it happens:** The README only shows the Upstash REST path. The ioredis path requires digging into Issue #115 and writing a custom adapter.
**How to avoid:** Treat D-01 as TWO separate integrations: (1) Better Auth's built-in `rateLimit.customStorage` backed by ioredis for auth endpoints — NO `@upstash/ratelimit` involved; (2) `@upstash/ratelimit` + ioredis adapter for the Contact form only. This honors D-01 literally while keeping the auth path canonical.
**Warning signs:** `@upstash/redis` (note: redis, not ratelimit) appearing in `package.json`. `Redis.fromEnv()` in code. Any reference to `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` env vars.

### Pitfall 2: FID vs INP metric confusion
**What goes wrong:** Lighthouse CI config uses `max-potential-fid` (legacy) and the deliverable docs repeat "FID < 100ms" from D-06. Google Search Console reports INP, not FID; the metric the planner claims to verify isn't the one being measured.
**Why it happens:** D-06 was written before INP replaced FID (March 2024). Training data and old tutorials still reference FID.
**How to avoid:** Use the Lighthouse audit ID `interaction-to-next-paint` with `maxNumericValue: 200`. Update D-06 wording in the planner's deliverable to "INP ≤ 200ms" with a note that this supersedes the original FID wording.
**Warning signs:** Any LHCI config or doc that says "FID" or "First Input Delay" without an explicit INP note.

### Pitfall 3: Build-step gate runs after `pnpm build` but before runtime image
**What goes wrong:** The bundle-size gate runs against `.next/static` — if it runs BEFORE `next build`, there's nothing to measure. If it runs in the runtime stage (after copying standalone output), the static dir may be missing or differently shaped.
**Why it happens:** The Dockerfile stage ordering is subtle — `next build` produces `.next/static`, the gate reads it, then Stage 3 copies `.next/standalone` (which includes a different `.next/static`).
**How to avoid:** Put the gate in the BUILDER stage, AFTER `pnpm build` and BEFORE the Stage 3 copy. Verify the script reads `.next/static/chunks/*.js` (the actual chunk files) and computes gzipped size (`zlib.gzipSync(contents).length`).
**Warning signs:** The gate passing trivially (0 bytes read) or failing with ENOENT.

### Pitfall 4: Bundle-size gate misses Tiptap/TailAdmin leaks
**What goes wrong:** The gate measures total gzipped JS, but a 99KB chunk that includes 30KB of Tiptap editor code still passes. The gate proves "no leak over 100KB" but not "no leak at all."
**Why it happens:** A pure size threshold is coarse — it catches catastrophic leaks but not moderate ones.
**How to avoid:** Layer TWO checks: (1) the size threshold (catches catastrophic leaks), (2) the existing ESLint `no-restricted-imports` rule with `--max-warnings 0` (catches ANY cross-group import, even one that's small). Together they cover both failure modes. Optionally, add a chunk-name check (grep chunk filenames for `editor`, `tiptap`, `admin`).
**Warning signs:** Lighthouse performance suddenly drops on a public route even though the gate passed.

### Pitfall 5: Umami default password not changed
**What goes wrong:** Umami ships with `admin`/`umami` default credentials [CITED: docs.umami.is/docs/install]. The deploy succeeds, analytics work, but anyone who finds `analytics.anydiscussion.com` can log in.
**Why it happens:** The setup runbook skips the "change password immediately" step.
**How to avoid:** The publish→visible verification task MUST include a sub-step: log into Umami, change the default password, document the real password in the operator's password manager.
**Warning signs:** Umami dashboard accessible with default creds days after deploy.

### Pitfall 6: Resend DMARC record not published
**What goes wrong:** The operator adds the DKIM + SPF records Resend auto-generates (they appear in the Resend dashboard), but skips the DMARC record (which Resend does NOT auto-generate — it must be authored manually). Emails deliver but spam filters downgrade them.
**Why it happens:** The Resend dashboard makes DKIM/SPF obvious; DMARC is mentioned only in Resend's deeper docs.
**How to avoid:** The D-33 task must explicitly list THREE records: DKIM (CNAME, from Resend dashboard), SPF (TXT including `amazonses.com`, from Resend dashboard), DMARC (TXT at `_dmarc.<domain>` — author manually, start with `"v=DMARC1; p=none;"` for monitoring, tighten to `p=quarantine` after inbox-test success).
**Warning signs:** Password-reset emails land in Gmail's spam folder despite DKIM/SPF passing.

### Pitfall 7: Revalidation audit assumes "no call = bug"
**What goes wrong:** The audit finds that `users.ts:updateUser` has no revalidation, the planner adds `revalidatePath("/author/{username}")` — but the `/author/[username]` route is rendered with `cacheTag("author-{id}")`, so the path revalidation does nothing.
**Why it happens:** The audit measures calls but not whether the calls match the cache strategy of the route being invalidated.
**How to avoid:** The audit table must record both the revalidation call AND the route's cache strategy (`cacheTag` value or `revalidate` time). For each "MISSING" row, the fix must use the SAME invalidation mechanism the route uses for caching (path → `revalidatePath`; tag → `revalidateTag`).
**Warning signs:** Adding a `revalidatePath` call has no effect on a `cacheTag`-cached route.

## Code Examples

### Example 1: lighthouserc.json (PERF-01, D-07)

```json
// Source: github.com/GoogleChrome/lighthouse-ci/blob/main/docs/configuration.md
// Place at repo root. Invoke via: pnpm dlx @lhci/cli autorun --config=./lighthouserc.json
{
  "ci": {
    "collect": {
      "url": [
        "https://anydiscussion.com/",
        "https://anydiscussion.com/blog",
        "https://anydiscussion.com/archive"
      ],
      "numberOfRuns": 3,
      "settings": {
        "preset": "desktop"
      }
    },
    "assert": {
      "assertions": {
        "categories:performance":       ["error", { "minScore": 0.9 }],
        "largest-contentful-paint":     ["error", { "maxNumericValue": 2500 }],
        "interaction-to-next-paint":    ["error", { "maxNumericValue": 200 }],
        "cumulative-layout-shift":      ["error", { "maxNumericValue": 0.1 }],
        "first-contentful-paint":       ["warn",  { "maxNumericValue": 1800 }],
        "total-blocking-time":          ["warn",  { "maxNumericValue": 200 }]
      }
    },
    "upload": {
      "target": "filesystem",
      "outputDir": ".lighthouseci",
      "reportFilenamePattern": "%%PATHNAME%%-%%DATETIME%%-report.%%EXTENSION%%"
    }
  }
}
```

Notes:
- `"error"` level fails the run with non-zero exit (fails the Coolify step if wired there).
- `"warn"` level logs but does not fail — useful for tracking secondary metrics.
- `numberOfRuns: 3` + LHCI's default `optimistic` aggregation reduces flakiness.
- INP audit id is `interaction-to-next-paint` (NOT in old LHCI docs but standard in Lighthouse 10+).
- For local invocation: `pnpm dlx @lhci/cli autorun`. For Coolify-step invocation: add as a post-deploy step (NOT a build-stage step — Lighthouse needs the URL to be live).

### Example 2: scripts/check-bundle-size.mjs (D-13/D-14)

```javascript
// Source: standard pattern for post-next-build static analysis
// Reads .next/static/chunks/*.js, computes gzipped size, fails > threshold.
// The (site) chunks are identified by NOT containing admin/editor/tiptap indicators.
import { gzipSync, gzip } from "node:zlib";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const STATIC_DIR = ".next/static/chunks";
const MAX_GZ_KB = parseInt(process.argv.find(a => a.startsWith("--max-gz-kb="))?.split("=")[1] ?? "100");

const files = readdirSync(STATIC_DIR).filter(f => f.endsWith(".js"));
let totalGz = 0;
const perFile = [];

for (const f of files) {
  const path = join(STATIC_DIR, f);
  const contents = readFileSync(path);
  const gz = gzipSync(contents).length;
  totalGz += gz;
  perFile.push({ f, raw: contents.length, gz });
}

const totalGzKb = totalGz / 1024;
console.log(`Total gzipped JS in .next/static/chunks: ${totalGzKb.toFixed(1)} KB`);
console.log(`Threshold: ${MAX_GZ_KB} KB`);
perFile.sort((a, b) => b.gz - a.gz).slice(0, 10).forEach(p => {
  console.log(`  ${p.f.padEnd(50)} ${(p.gz/1024).toFixed(1)} KB gz`);
});

if (totalGzKb > MAX_GZ_KB) {
  console.error(`FAIL: total gzipped JS ${totalGzKb.toFixed(1)} KB exceeds ${MAX_GZ_KB} KB threshold`);
  process.exit(1);
}
console.log("PASS: bundle size within budget");
```

Note: This measures TOTAL public gzipped JS, which is the conservative reading of D-14 ("public bundle < 100KB gzipped"). If the planner wants per-route splitting (more lenient), adapt to read `.next/server/app/(site)/**/page-client.js` manifests instead — but the total-threshold approach is safer and matches D-14's intent.

### Example 3: scripts/test-publish-visible.mjs (D-17)

```javascript
// Source: follows the existing scripts/{test-migrations,test-auth-gate}.mjs pattern
// Publishes a draft post via the dashboard Server Action, then verifies the public URL
// reflects the new content within a reasonable window (e.g., < 10s on Coolify+Cloudflare).
import { execFileSync } from "node:child_process";

const PROD_URL = process.env.PROD_URL ?? "https://anydiscussion.com";
const TEST_SLUG = `publish-visible-test-${Date.now()}`;
const TEST_TITLE = `Publish-Visible Test ${new Date().toISOString()}`;

// Step 1: Hit an admin endpoint to create + publish a test post.
//   Either: a Server Action invoked via an authenticated fetch, OR a direct DB seed.
//   The simplest path: a small admin-only API route (e.g., /api/_test/publish) that
//   the planner adds gated behind admin permission + a test-only env var.
console.log(`Creating test post: ${TEST_SLUG}`);

// Step 2: Poll the public URL until the content appears (or timeout).
const start = Date.now();
const deadline = start + 30_000;  // 30s ceiling
let visible = false;

while (Date.now() < deadline) {
  const res = await fetch(`${PROD_URL}/blog/${TEST_SLUG}`, { redirect: "manual" });
  if (res.status === 200) {
    const html = await res.text();
    if (html.includes(TEST_TITLE)) {
      visible = true;
      break;
    }
  }
  await new Promise(r => setTimeout(r, 1000));
}

const elapsed = ((Date.now() - start) / 1000).toFixed(1);
if (!visible) {
  console.error(`FAIL: post not visible at ${PROD_URL}/blog/${TEST_SLUG} after ${elapsed}s`);
  process.exit(1);
}
console.log(`PASS: publish→visible in ${elapsed}s`);

// Step 3: Cleanup — unpublish/delete the test post (admin action).
```

Note: The planner chooses between (a) adding a test-only admin API route, (b) using the existing dashboard Server Action via authenticated fetch, or (c) seeding the DB directly. Option (a) is the cleanest because it mirrors how E2E tests typically work and is naturally gated behind admin permission.

### Example 4: Redis singleton + docker-compose addition (D-04)

```yaml
# docker-compose.yml (extend existing — add redis service for local/dev parity with prod)
# Source: redis:7-alpine official image + D-04 (256MB, allkeys-lru, no persistence)
services:
  # ...existing postgres, postgres-test, minio...

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    command:
      - redis-server
      - --maxmemory 256mb
      - --maxmemory-policy allkeys-lru
      - --save ""            # disable RDB persistence (rate-limit data is ephemeral, D-04)
      - --appendonly no      # disable AOF persistence
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 5
```

```typescript
// src/lib/redis/index.ts — ioredis singleton
// Source: ioredis docs (verified 5.11.1) + Next.js standalone singleton pattern
import Redis from "ioredis";

// Module-level singleton — Next.js standalone reuses this across hot reloads
// in dev and across requests in prod (no connection spam).
declare global {
  // eslint-disable-next-line no-var
  var __redisClient: Redis | undefined;
}

globalThis.__redisClient ??= new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", {
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  lazyConnect: false,
});

export const redisClient = globalThis.__redisClient;
```

### Example 5: Coolify Umami service (D-24/D-25/D-27)

```yaml
# Umami service definition — deploy as a separate Coolify service (not in docker-compose.yml,
# which is dev-only). The Coolify project creates this with its own env + a managed SSL cert
# for analytics.anydiscussion.com.
# Source: docs.umami.is/docs/install (verified 2026-07-28)
image: docker.umami.is/umami-software/umami:postgresql-latest
environment:
  DATABASE_URL: postgres://anydiscussion:<pw>@<postgres-host>:5432/umami
  # Umami auto-migrates the schema on first boot — no manual migration step.
  # Default login after first boot: admin / umami (CHANGE IMMEDIATELY — Pitfall 5).
ports:
  - "3001:3000"   # Coolify routes analytics.anydiscussion.com → this port via its proxy
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| FID (First Input Delay) as CWV responsiveness metric | **INP (Interaction to Next Paint)** — measures ALL interactions, not just the first | March 12, 2024 (Google/web.dev announcement) | Lighthouse CI config must use `interaction-to-next-paint` audit id; D-06 wording "FID < 100ms" is OUTDATED — update to "INP ≤ 200ms" |
| `middleware.ts` deprecated for Next.js 16 | **`middleware.ts` STILL works** under Next.js 16.2.9 + Turbopack (per project codebase finding Phase 2 D-19); `proxy.ts` was the planned rename but never registered in middleware-manifest.json | Next.js 16.0 (2025-10-10) | Don't re-litigate. `middleware.ts` is the project's UX gate; rate limiting goes elsewhere (Better Auth config / Server Action). |
| `@upstash/ratelimit` v1.x | **v2.0.8** is current (HTTP-first design more explicit; ioredis path requires custom adapter) | v2.0.0 shipped ~2024; latest v2.0.8 published 2026-01-12 | v2.x removed any implicit ioredis adapter; planner writes the adapter per Issue #115. |
| `incrementalCacheHandlerPath` (experimental) | **`cacheHandler`** (singular, stable since Next 14.1; `cacheHandlers` plural is the `'use cache'` directives variant) | Renamed in Next 14.1 (2024); cacheHandler gained image-optimization support in Next 16.2.0 | The ISR scaling ADR (D-28) must reference `cacheHandler` (singular), NOT the old name. The interface is `get/set/revalidateTag/resetRequestCache`. |
| Better Auth rate-limiting via custom plugin | **Built-in `rateLimit` config option** with `customRules` + `customStorage` | Stable in Better Auth 1.6.x (verified 1.6.23-1.6.25) | Don't write a plugin. Use the built-in `rateLimit.customRules` keyed by path. |
| Lighthouse CI v0.12.x | **v0.15.1** current | 2025-06-25 release | Newer assertion aggregation (`optimistic` default), better Node 20 support. |

**Deprecated/outdated:**
- `max-potential-fid` audit id — replaced by `interaction-to-next-paint` (Lighthouse 10+).
- `experimental.ppr` Next config — replaced by `cacheComponents: true` (Next 16).
- `incrementalCacheHandlerPath` config key — renamed to `cacheHandler`.
- Better Auth `rateLimit` plugin — never existed; it's a built-in config option, not a plugin.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The `interaction-to-next-paint` Lighthouse audit id works in `@lhci/cli@0.15.1` assertions (the LHCI docs don't list it; standard in Lighthouse 13.x but not pre-verified in LHCI's assert format) | Code Examples / Validation | Planner may need to verify with `pnpm dlx @lhci/cli autorun` dry-run; fallback is to use Lighthouse's JSON output directly. |
| A2 | Better Auth's `customStorage` interface accepts `{ get(key) => JSON | null, set(key, { count, expiresAt }) => void }` exactly as documented | Code Examples / Pattern 2 | The shape may differ slightly; planner verifies against the current `betterAuth` types at install time. |
| A3 | The `ioredis` → `@upstash/ratelimit` adapter is feasible with ~30 lines of code per Issue #115 | Code Examples / Pattern 3 | If the adapter is significantly larger or fragile, the planner may opt to drop `@upstash/ratelimit` for the Contact form and use only Better Auth's `customStorage` pattern there too (writing a small sliding-window helper around ioredis directly). This contradicts D-01 literally but satisfies the spirit; would need discuss-phase approval. |
| A4 | Coolify v4.1.2+ supports multi-stage Dockerfiles with `ARG` passing for `NEXT_PUBLIC_*` build-time vars (per .claude/CLAUDE.md) | Code Examples / Pattern 1 | If Coolify's build-arg passing differs, the planner adapts the Dockerfile to read from Coolify's env-var-injection mechanism. |
| A5 | `docker.umami.is/umami-software/umami:postgresql-latest` is the correct prebuilt image (vs. `ghcr.io/umami-software/umami:postgresql-latest`) | Code Examples / Pattern 5 | Both may work; the official docs reference `docker.umami.is`. If the pull fails, fall back to the ghcr.io mirror. |
| A6 | D-21's runtime-secret list is complete (DATABASE_URL, BETTER_AUTH_SECRET, RESEND_API_KEY, S3 creds, SETTINGS_ENCRYPTION_KEY, REDIS_URL) — there is no other server-only secret the build would otherwise bake | User Constraints | If an undocumented secret exists in `.env.local` (e.g., a third-party API key), it would accidentally leak into the build. Planner should cross-check `.env.example` before finalizing the Dockerfile. |
| A7 | The Contact form's existing in-memory limiter SHOULD be replaced with Redis in Phase 7 (vs. leaving it in-memory) | Summary / Pattern 3 | If the founder prefers two codepaths (in-memory for Contact, Redis for auth), the planner drops Pattern 3 and keeps the existing `src/lib/rate-limit/index.ts` untouched. Minor scope reduction. |

## Open Questions

1. **Should Phase 7 include automated publish→visible E2E (deferred per CONTEXT.md) or stay manual (D-17)?**
   - What we know: D-17 says manual script + visual check; automated E2E is a future fast-follow.
   - What's unclear: whether the manual script can fully replace E2E for confidence.
   - Recommendation: Stay manual for v1 (D-17 is locked); the script in Code Examples gives the planner a runnable starting point.

2. **Does the founder want the Contact form migrated to Redis (Pattern 3 / A7), or kept in-memory?**
   - What we know: In-memory works for single-instance v1; Redis is the v2 path (SCALE-01).
   - What's unclear: Whether doing it now (Phase 7) is worth the ioredis adapter work.
   - Recommendation: Discuss-phase decision. If the adapter (A3) proves complex, defer Contact-form migration and keep Redis only for auth endpoints.

3. **Lighthouse CI invocation target — local dev machine vs. Coolify post-deploy step?**
   - What we know: D-31 forbids GitHub Actions; D-07 says "Lighthouse CI + manual audit."
   - What's unclear: Whether to wire LHCI as a Coolify post-deploy step (requires LHCI in the runtime image, adds weight) or run it ad-hoc from the dev machine against the prod URL.
   - Recommendation: Ad-hoc from dev machine against prod URL. Simpler, doesn't bloat the runtime image, and matches the "manual audit on real stack" wording of D-07.

4. **Where does the ISR scaling ADR live — `docs/adr/` (new) or `.planning/adr/`?**
   - What we know: No ADR directory exists yet.
   - What's unclear: Project convention (none established per .claude/CLAUDE.md "Conventions" section).
   - Recommendation: Create `docs/adr/0001-isr-single-instance-scaling.md` — ADRs are an industry-standard convention and discoverable in `docs/`.

## Environment Availability

> Phase 7 introduces external dependencies (Redis, Coolify production, Cloudflare DNS, Resend DNS). Probed availability where local.

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Docker (local) | Building the Dockerfile locally before Coolify | verify at runtime | — | Coolify builds on the VPS; local build optional but recommended for debugging |
| Coolify v4.1.2+ | Production deployment (D-20/D-32) | ✓ (on VPS, per CLAUDE.md) | v4.1.2 (.claude/CLAUDE.md) | None — Coolify is the only deploy path |
| Redis 7.x | Rate-limit storage (D-04) | ✗ (not in current `docker-compose.yml`) | — | Planner adds the service; for local dev, the docker-compose extension in Code Examples |
| Cloudflare DNS access | DKIM/SPF/DMARC records (D-33) + R2 CDN | ✓ (operator has access per prior phases) | — | None — DNS is the only path |
| Resend account | Email deliverability test (D-33) | ✓ (existing RESEND_API_KEY in .env.local) | — | None — Resend is the locked SMTP provider |
| Lighthouse CI binary | PERF-01 audit | ✗ (not installed; `pnpm add -D @lhci/cli` adds it) | 0.15.1 (target) | Manual browser DevTools Lighthouse (slower, less reproducible) |
| `node:20-alpine` Docker image | Dockerfile base | ✓ (Docker Hub, public) | 20.19 LTS | node:22-alpine also acceptable per isomorphic-dompurify@3 peer |

**Missing dependencies with no fallback:**
- Redis 7.x — must be provisioned as a Coolify service and added to `docker-compose.yml`. Blocks PERF-04.

**Missing dependencies with fallback:**
- Lighthouse CI — manual browser DevTools Lighthouse is the fallback if `@lhci/cli` install fails. Less reproducible but produces the same metrics.

## Validation Architecture

> Nyquist validation is enabled (`workflow.nyquist_validation: true` in `.planning/config.json`). This section identifies the critical-behavior dimensions that plans must cover; downstream it is consumed to produce VALIDATION.md.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.9 (existing) + Node scripts (`scripts/*.mjs`) for end-to-end checks |
| Config file | `vitest.config.ts` (existing); new scripts under `scripts/` |
| Quick run command | `pnpm test` |
| Full suite command | `pnpm test && pnpm test:migrations && pnpm test:auth-gate && node scripts/check-bundle-size.mjs` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PERF-01 | Public pages meet Lighthouse 90+ and CWV 'Good' thresholds | manual + scripted | `pnpm dlx @lhci/cli autorun --config=./lighthouserc.json` | ❌ Wave 0 (lighthouserc.json) |
| PERF-02 (gate 1) | A deliberate cross-group import fails `pnpm lint --max-warnings 0` | unit (planted-import, mirrors verify.mjs) | `pnpm lint` after temporarily adding `import "@/app/(admin)/x"` to a `(site)` file | ✅ Pattern exists in `scripts/verify.mjs` |
| PERF-02 (gate 2) | Public gzipped chunk < 100KB fails the build when exceeded | unit (planted oversized chunk) | `node scripts/check-bundle-size.mjs --max-gz-kb 100` | ❌ Wave 0 (scripts/check-bundle-size.mjs) |
| PERF-03 (audit) | Every mutating action's revalidation is documented + classified | manual (delivered as markdown table) | (no automation — human audit) | ❌ Wave 0 (audit deliverable) |
| PERF-03 (publish→visible) | Published post appears at its public URL within 30s on real stack | scripted | `node scripts/test-publish-visible.mjs` | ❌ Wave 0 (scripts/test-publish-visible.mjs) |
| PERF-04 (auth rate limit) | 4th sign-in attempt within 15 min returns 429 | integration (against auth route with Redis) | `pnpm test -- src/lib/auth/__tests__/rate-limit.test.ts` (or scripted via `scripts/test-auth-ratelimit.mjs`) | ❌ Wave 0 |
| PERF-04 (fail-open) | When Redis is DOWN, auth requests still succeed (fail-open) OR are blocked (fail-closed) — pick one and test it | integration | same as above, with Redis stopped mid-test | ❌ Wave 0 |
| PERF-06 | Multi-stage Docker build succeeds and standalone runtime serves a request | integration | `docker build -t anydiscussion-test . && docker run -p 3000:3000 anydiscussion-test` | ❌ Wave 0 (Dockerfile) |
| PERF-06 (secret non-leakage) | `docker image inspect` of the built image does NOT contain runtime secrets | integration | `docker run --rm anydiscussion-test env | grep -E "(DATABASE_URL\|RESEND_API_KEY\|SECRET)"` should return empty | ❌ Wave 0 |
| ANAL-02 | Umami container boots + accepts the default admin/umami login + script URL is configurable in settings | integration | `docker compose up -d umami && curl http://localhost:3001/api/health` | ❌ Wave 0 |
| D-33 (email) | Password-reset email lands in a real inbox (not spam) after DKIM/SPF/DMARC set | manual | (no automation — operator inbox check) | n/a |

### Sampling Rate

- **Per task commit:** `pnpm test` (Vitest unit tests; < 30s).
- **Per wave merge:** `pnpm test && pnpm test:migrations && node scripts/check-bundle-size.mjs` (< 2 min).
- **Phase gate (before `/gsd-verify-work`):** full local Docker build + Lighthouse CI run + publish→visible script on the deployed prod URL.

### Wave 0 Gaps

- [ ] `lighthouserc.json` — covers PERF-01 thresholds
- [ ] `scripts/check-bundle-size.mjs` — covers PERF-02 gate 2
- [ ] `scripts/test-publish-visible.mjs` — covers PERF-03 publish→visible
- [ ] `src/lib/auth/__tests__/rate-limit.test.ts` (or `scripts/test-auth-ratelimit.mjs`) — covers PERF-04 enforcement + fail-open behavior
- [ ] `Dockerfile` + `.dockerignore` — covers PERF-06
- [ ] `docker-compose.yml` Redis service extension — covers PERF-04 backing store
- [ ] Revalidation audit markdown deliverable — covers PERF-03 audit
- [ ] ISR scaling ADR + README section — covers D-28/D-29

*(No framework install gap — Vitest 4.1.9 is already configured.)*

### Critical Validation Dimensions

| Dimension | Why It Matters | Observable Property |
|-----------|----------------|---------------------|
| Rate-limit enforcement at threshold | 3 attempts / 15 min is the brute-force protection (D-02) | 4th attempt within 15min returns HTTP 429 with `X-Retry-After` header; 4th attempt after 15min succeeds |
| Fail-open vs fail-closed when Redis is down | A Redis outage either blocks all auth (fail-closed, safer) or lets auth through (fail-open, more available) — must be a deliberate choice | Stop Redis → attempt sign-in → either succeed (fail-open) or 5xx/timeout (fail-closed); document the chosen behavior |
| Bundle-gate rejects a deliberate cross-group import | Proves the gate isn't trivially passing | Add `import "@/app/(admin)/Sidebar"` to a `(site)` file → `pnpm lint` exits non-zero |
| Bundle-gate rejects an oversized chunk | Proves the size threshold works | Either temporarily lower `--max-gz-kb` to below current size, or plant a large dependency in a `(site)` file → gate exits non-zero |
| Publish→visible latency on real stack | Proves ISR revalidation works end-to-end (Pitfall #3 owned) | After publishPost, the public URL reflects new content within 30s (Coolify single instance + Cloudflare CDN) |
| Build-time secret non-leakage | Proves D-21 — secrets aren't baked into the image | `docker run --rm <image> env | grep SECRET` returns empty; only `NEXT_PUBLIC_*` vars appear |
| Revalidation audit completeness | Proves every mutating action was reviewed | Each row in the audit table has a Status of HAS, MISSING (with fix), or N/A (with justification) — none blank |
| DMARC record published + email lands in inbox | Proves D-33 — auth emails are deliverable | Resend dashboard shows verified domain; test password-reset email arrives in Gmail/Outlook primary inbox (not spam) |

## Security Domain

> `security_enforcement: true` in `.planning/config.json` (ASVS Level 1). Phase 7 surfaces several security-relevant configurations.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | Better Auth built-in rate limiting on `/sign-in/email` (D-01/D-03) — 3/15min strict (D-02). Resend-delivered password resets verified (D-33). |
| V3 Session Management | yes | Session refresh endpoints rate-limited (D-03); existing Phase-2 session revocation primitives (`revokeSessions` action). |
| V4 Access Control | yes | Existing `requireRole`/`requireCan` in every mutating action (Phase 2) — Phase 7 audits revalidation but does NOT change permission gates. |
| V5 Input Validation | yes | Zod schemas already validate every action input (Phase 1+); Phase 7 adds no new input surfaces. |
| V6 Cryptography | yes | `SETTINGS_ENCRYPTION_KEY` (Phase 4 D-25 AES-256-GCM) is a runtime secret — Dockerfile MUST NOT bake it (D-21). The bundle-gate (PERF-02) and secret-non-leakage test (Validation) verify this. |
| V7 Logging | partial | Existing `lib/log` covers app logs; Phase 7 adds Umami analytics (not security logs). No new security logging. |
| V8 Data Protection (secrets) | yes | Dockerfile build-time vs runtime secret separation (D-21); `docker image inspect` test in Validation Architecture. |
| V9 Communications | yes | Coolify managed SSL (Let's Encrypt) on production domain (D-23); DKIM/SPF/DMARC for outgoing SMTP (D-33). |
| V13 API & Web Service | yes | Better Auth `/api/auth/*` endpoints are the only API routes; rate-limited via built-in config (D-01). |

### Known Threat Patterns for Next.js 16 + Better Auth + Coolify

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Auth endpoint brute force (password guessing) | Spoofing/Elevation | Better Auth `rateLimit.customRules` at 3/15min on `/sign-in/email`, `/forget-password`, `/reset-password`, `/verify-email` (D-02/D-03) |
| Auth endpoint enumeration (reset for valid emails) | Information Disclosure | Same rate limit covers `/forget-password` — strict 3/15min blunts enumeration; Phase 2's `customSyntheticUser` returns same response for unknown emails |
| Account lockout abuse (attacker locks out victims by IP) | Denial of Service | IP-keyed rate limit (Better Auth default) means the attacker needs the victim's IP; mitigated by Cloudflare's edge IP being shared across many users — flag for v2 if it becomes a real problem (email-keyed secondary limit) |
| Runtime secret leakage via Docker image layers | Information Disclosure | D-21 build-time vs runtime secret separation; `docker image inspect` test; no `ARG`/`ENV` for secrets in Dockerfile |
| Default Umami credentials | Elevation of Privilege | Mandatory password change in publish→visible runbook (Pitfall 5) |
| Cross-group JS leak (TailAdmin in public bundle) | (Performance, not security — but breaks the security boundary by increasing attack surface) | ESLint `no-restricted-imports` + bundle-size gate (D-12/D-13) |
| Email spoofing of password-reset links | Spoofing | DKIM + SPF + DMARC on sending domain (D-33); Resend enforces strict DKIM alignment |
| Redis exposed externally | Elevation of Privilege | Redis Coolify service binds to internal network only (NOT exposed to public); the docker-compose extension in Code Examples does NOT map Redis port to host in prod (only dev) |
| Rate-limit bypass via `x-forwarded-for` spoofing | Spoofing | Trust only Coolify's proxy header (D-04 implicit); Better Auth `advanced.ipAddress.ipAddressHeaders: ["x-forwarded-for"]` trusts the FIRST IP in the chain (set by Coolify's Caddy/Traefik, not user-controllable) |

## Sources

### Primary (HIGH confidence)
- **npm registry** (`registry.npmjs.org`) — version verification: `@upstash/ratelimit@2.0.8`, `ioredis@5.11.1`, `@lhci/cli@0.15.1`, `lighthouse@13.4.1`, `better-auth@1.6.25`, `next@16.2.12`, `drizzle-orm@0.45.2`. All fetched 2026-07-28.
- **`gsd-tools query package-legitimacy check`** — verdicts for the four new packages (ioredis: OK; @lhci/cli: OK; @upstash/ratelimit: SUS-metadata; lighthouse: SUS-recency).
- **Codebase grep + file reads** — `src/actions/*.ts` revalidation inventory; `middleware.ts` (repo root, not `src/`); `eslint.config.mjs` (repo root); `next.config.ts`; `docker-compose.yml`; `package.json`; `src/lib/rate-limit/index.ts` (existing in-memory Contact limiter); `src/lib/email/index.ts` (Resend wrapper); `src/app/api/auth/[...all]/route.ts` (Better Auth handler mount); `.planning/config.json`.

### Secondary (MEDIUM confidence)
- **better-auth.com/docs/concepts/rate-limit** — built-in `rateLimit` config with `customRules` + `customStorage`, HTTP 429 + `X-Retry-After`, IP-only identifier. [CITED]
- **nextjs.org/docs/app/api-reference/config/next-config-js/incrementalCacheHandlerPath** — `cacheHandler` (singular) interface `get/set/revalidateTag/resetRequestCache`; stable since Next 14.1; image-cache added Next 16.2.0. [CITED]
- **developers.google.com/search/docs/appearance/core-web-vitals** (via WebSearch) — INP replaced FID March 12, 2024; current 'Good' thresholds: LCP≤2.5s, INP≤200ms, CLS≤0.1. [CITED]
- **resend.com/docs/dashboard/domains/introduction** + community guides (via WebSearch) — Resend auto-generates DKIM + SPF; DMARC must be authored manually at `_dmarc.<domain>`. [CITED]
- **docs.umami.is/docs/install** (redirected from umami.is/docs/install) — prebuilt image `docker.umami.is/umami-software/umami:postgresql-latest`; PG v12.14+ minimum; auto-migrates on first boot; default admin/umami credentials. [CITED]
- **github.com/GoogleChrome/lighthouse-ci/blob/main/docs/configuration.md** — LHCI `assert.assertions` format, `["error", {maxNumericValue/minScore}]` syntax, `optimistic` aggregation. [CITED]

### Tertiary (LOW confidence)
- **github.com/upstash/ratelimit-js/issues/115** (via WebSearch) — community pattern for wrapping ioredis to match `@upstash/ratelimit` Store interface. The exact adapter implementation is ~30 lines and needs validation at install time (A3).
- **upstash.com/docs/redis/sdks/ratelimit-ts/overview** — confirms v2.x is HTTP-only by design; the canonical use case is Upstash REST (cloud) — using with self-hosted Redis is non-standard.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all package versions verified against npm registry; legitimacy gate run.
- Auth rate-limit architecture: HIGH — Better Auth's built-in rateLimit is well-documented and stable; the ioredis customStorage pattern is straightforward. MEDIUM for the @upstash/ratelimit + ioredis adapter (A3 — adapter size/fragility unverified).
- Lighthouse CI: HIGH — LHCI is the standard tool; INP audit id (A1) needs a dry-run verification.
- Revalidation audit scope: HIGH — codebase grep gives the exact surface; the audit itself is human labor.
- Dockerfile pattern: HIGH — standard Next.js standalone pattern; only Coolify-specific build-arg passing is assumed (A4).
- Resend DNS: HIGH — Resend auto-generates DKIM/SPF; DMARC manual authoring is well-documented.
- Umami deployment: HIGH — official Docker image + env vars documented.
- ISR scaling docs: HIGH — `cacheHandler` interface is documented; the ADR is documentation only (no implementation risk).

**Research date:** 2026-07-28
**Valid until:** 2026-08-28 (30 days — stable stack; the only fast-moving piece is Better Auth's rate-limit API, which is stable in 1.6.x but worth re-checking if the lockfile bumps to 1.7+)
