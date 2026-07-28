# Phase 7: Performance & Deploy - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-14
**Phase:** 7-Performance & Deploy
**Areas discussed:** Auth rate limiting approach, Lighthouse/performance targets, Bundle audit mechanism, Coolify staging deployment, Revalidation audit approach, Umami analytics deployment, ISR scaling documentation, Redis instance configuration

---

## Auth rate limiting approach

### How should auth endpoints be rate-limited?

| Option | Description | Selected |
|--------|-------------|----------|
| Upstash Ratelimit (Recommended) | Redis-backed, works on VPS/Coolify, per-endpoint rules, sliding window. Battle-tested with Next.js. | ✓ |
| Simple in-memory store | No external dependency — a Map in memory per IP. Resets on restart. Sufficient for single-instance v1. | |
| Middleware-based (Next.js built-in) | Rate limit logic in proxy.ts. Lightweight but limited — no persistent state across requests. | |

**User's choice:** Upstash Ratelimit (Recommended)

### What rate-limit thresholds for auth endpoints?

| Option | Description | Selected |
|--------|-------------|----------|
| 5 attempts / 10 min window | Moderate — blocks aggressive brute force, allows forgotten-password retries. | |
| 3 attempts / 15 min window | Strict — tighter security, may frustrate legitimate users with password issues. | ✓ |
| You decide | Let the planner pick sensible defaults based on the auth flow patterns. | |

**User's choice:** 3 attempts / 15 min window (strict)

### Which auth endpoints get rate-limited?

| Option | Description | Selected |
|--------|-------------|----------|
| Sign-in + password reset only | The two endpoints that grant access. Minimal surface. | |
| All auth endpoints | Sign-in, password reset, email verification, session refresh. Maximum coverage. | ✓ |
| You decide | Let the planner determine the minimal set based on attack surface. | |

**User's choice:** All auth endpoints

### Where does the Upstash Redis instance come from?

| Option | Description | Selected |
|--------|-------------|----------|
| Upstash cloud (free tier) | Managed Redis, 10K commands/day free. Easy setup, no infra. Adds a paid dependency if usage grows. | |
| Self-hosted Redis on Coolify | No external dependency — runs as a Coolify service next to Postgres. Consistent with self-hosted ethos. | ✓ |
| You decide | Let the planner choose based on Coolify setup complexity. | |

**User's choice:** Self-hosted Redis on Coolify

---

## Lighthouse/performance targets

### What Lighthouse score minimum should the public site target?

| Option | Description | Selected |
|--------|-------------|----------|
| 90+ (Recommended) | Strong performance. Achievable with ISR/PPR + image optimization + minimal client JS. | ✓ |
| 95+ | Excellent but harder. Requires careful font loading, aggressive caching, minimal third-party scripts. | |
| You decide | Let the planner set targets based on what's achievable with the current stack. | |

**User's choice:** 90+ (Recommended)

### What Core Web Vitals thresholds for the public site?

| Option | Description | Selected |
|--------|-------------|----------|
| Google 'Good' thresholds (Recommended) | LCP < 2.5s, FID < 100ms, CLS < 0.1. The standard bar for passing Core Web Vitals. | ✓ |
| Tighter targets | LCP < 1.8s, FID < 50ms, CLS < 0.05. More aggressive but may require extra optimization. | |
| You decide | Let the planner set thresholds based on realistic stack capabilities. | |

**User's choice:** Google 'Good' thresholds (Recommended)

### How should performance be measured and verified?

| Option | Description | Selected |
|--------|-------------|----------|
| Lighthouse CI + manual audit (Recommended) | Lighthouse CI for automated checks + manual browser DevTools audit on real stack. | ✓ |
| Lighthouse CI only | Fully automated CI gate. May miss real-world factors (CDN, Cloudflare, server latency). | |
| You decide | Let the planner choose the measurement approach. | |

**User's choice:** Lighthouse CI + manual audit (Recommended)

### Which pages should be performance-audited?

| Option | Description | Selected |
|--------|-------------|----------|
| Homepage + single post + archive (Recommended) | The three most-trafficked routes. Covers the main public surfaces. | |
| All public routes | Every (site) page audited. More thorough but more maintenance. | ✓ |
| You decide | Let the planner pick the audit scope. | |

**User's choice:** All public routes

### How should fonts be loaded for optimal performance?

| Option | Description | Selected |
|--------|-------------|----------|
| next/font with font-display: swap (Recommended) | Built-in Next.js font optimization. Preloads critical fonts, swaps display. Zero CLS. | ✓ |
| Self-hosted woff2 + preload | Manual font hosting with <link rel=preload>. More control but more maintenance. | |
| You decide | Let the planner choose based on current font setup. | |

**User's choice:** next/font with font-display: swap (Recommended)

### What image optimization strategy for the public site?

| Option | Description | Selected |
|--------|-------------|----------|
| next/image + sharp (already wired) (Recommended) | Already configured with CDN loader + remotePatterns. Just verify on real stack. | ✓ |
| Add Cloudflare Image Resizing | Cloudflare's image resizing at the edge. Faster delivery but adds Cloudflare-specific dependency. | |
| You decide | Let the planner choose based on the current setup. | |

**User's choice:** next/image + sharp (already wired) (Recommended)

### What caching headers strategy for the public site?

| Option | Description | Selected |
|--------|-------------|----------|
| Cache-Control: s-maxage + stale-while-revalidate (Recommended) | CDN caches for s-maxage seconds, serves stale while revalidating. Standard ISR pattern. | ✓ |
| Aggressive caching + revalidation only on publish | Longer s-maxage, rely entirely on revalidatePath/revalidateTag. Simpler but stale content risk. | |
| You decide | Let the planner set caching headers based on the ISR setup. | |

**User's choice:** Cache-Control: s-maxage + stale-while-revalidate (Recommended)

---

## Bundle audit mechanism

### How should bundle isolation between (site) and (admin) be enforced?

| Option | Description | Selected |
|--------|-------------|----------|
| ESLint no-restricted-imports + CI gate (Recommended) | Already configured in Phase 1. Add a CI step that fails on cross-group imports. | ✓ |
| Bundle analyzer + size thresholds | @next/bundle-analyzer to visualize bundle composition. Set size budgets. | |
| Both: ESLint + bundle analyzer | ESLint catches imports at write time; bundle analyzer catches runtime leaks. | |

**User's choice:** ESLint no-restricted-imports + CI gate (Recommended)

### What should the bundle audit CI step check?

| Option | Description | Selected |
|--------|-------------|----------|
| Cross-group imports + public bundle size (Recommended) | Fail if (site) imports from (admin). Also fail if public bundle exceeds size threshold. | ✓ |
| Cross-group imports only | Just enforce the import boundary. Simpler but catches less. | |
| You decide | Let the planner determine the minimal CI checks. | |

**User's choice:** Cross-group imports + public bundle size (Recommended)

### What public bundle size threshold should trigger a CI failure?

| Option | Description | Selected |
|--------|-------------|----------|
| < 100KB gzipped (Recommended) | Tight but achievable for a lean public site. Catches TailAdmin/editor JS leaking early. | ✓ |
| < 150KB gzipped | More generous. Allows some third-party scripts while still catching major leaks. | |
| You decide | Let the planner set a realistic threshold based on current bundle size. | |

**User's choice:** < 100KB gzipped (Recommended)

### Should the cross-group import check use the existing ESLint rule or a custom script?

| Option | Description | Selected |
|--------|-------------|----------|
| Existing ESLint rule + CI lint step (Recommended) | The Phase 1 no-restricted-imports rule already exists. Just add `eslint --max-warnings 0` to CI. | ✓ |
| Custom import-graph script | A dedicated script that analyzes the import graph. More precise but more maintenance. | |
| You decide | Let the planner choose the enforcement mechanism. | |

**User's choice:** Existing ESLint rule + CI lint step (Recommended)

---

## Coolify staging deployment

### How should the Dockerfile be structured for Coolify?

| Option | Description | Selected |
|--------|-------------|----------|
| Multi-stage build (Recommended) | Stage 1: pnpm install + build. Stage 2: copy standalone output + node_modules. Smaller final image. | ✓ |
| Single-stage build | Simpler but larger image. Build deps remain in the final image. | |
| You decide | Let the planner design the Dockerfile based on Next.js standalone best practices. | |

**User's choice:** Multi-stage build (Recommended)

### How should build-time vs runtime env secrets be separated?

| Option | Description | Selected |
|--------|-------------|----------|
| Build-time: NEXT_PUBLIC_* only (Recommended) | Only NEXT_PUBLIC_* vars baked into client bundle at build. All other secrets injected at runtime. | ✓ |
| Minimal build-time + runtime for everything else | Build needs some non-PUBLIC vars. Runtime injects the rest. | |
| You decide | Let the planner determine the minimal build-time vars based on what Next.js needs at build. | |

**User's choice:** Build-time: NEXT_PUBLIC_* only (Recommended)

### How should the staging deployment workflow work?

| Option | Description | Selected |
|--------|-------------|----------|
| Git push to staging branch (Recommended) | Push to `staging` branch triggers Coolify auto-deploy. Production from `main`. | |
| Git push to main = staging | Every push to main goes to staging first. Manual promote to production. | ✓ |
| You decide | Let the planner design the branch/deploy strategy. | |

**User's choice:** Git push to main = staging

### What SSL/domain setup for staging?

| Option | Description | Selected |
|--------|-------------|----------|
| Coolify managed SSL + staging subdomain (Recommended) | Coolify auto-provisions SSL via Let's Encrypt. Staging at staging.anydiscussion.com. | ✓ |
| Custom SSL cert upload | Upload a cert manually. More control but more maintenance. | |
| You decide | Let the planner choose based on Coolify capabilities. | |

**User's choice:** Coolify managed SSL + staging subdomain (Recommended)

---

## Revalidation audit approach

### How should the revalidation audit be structured?

| Option | Description | Selected |
|--------|-------------|----------|
| Systematic action-by-action audit (Recommended) | Map every mutating action, verify each calls revalidatePath/revalidateTag for correct paths/tags. | ✓ |
| Automated test + manual verification | Write a test that asserts revalidatePath/revalidateTag are called on every action. | |
| You decide | Let the planner design the audit approach. | |

**User's choice:** Systematic action-by-action audit (Recommended)

### How should publish→visible be verified on the real Coolify stack?

| Option | Description | Selected |
|--------|-------------|----------|
| Manual test script + visual check (Recommended) | A script that publishes a post, then checks the public URL. Manual visual confirmation. | ✓ |
| Automated E2E test | A Playwright/Cypress test that publishes and asserts the post appears. | |
| You decide | Let the planner choose the verification method. | |

**User's choice:** Manual test script + visual check (Recommended)

### Which actions need revalidation audit?

| Option | Description | Selected |
|--------|-------------|----------|
| All mutating actions (Recommended) | Every Server Action that writes to the DB. Complete coverage. | ✓ |
| Publish-related actions only | Focus on the publish flow since that's the critical path. | |
| You decide | Let the planner determine the audit scope. | |

**User's choice:** All mutating actions (Recommended)

### What should the revalidation audit produce as output?

| Option | Description | Selected |
|--------|-------------|----------|
| Markdown table + checklist (Recommended) | A table mapping each action to its revalidatePath/revalidateTag calls, with checkboxes. | ✓ |
| Automated test assertions | Tests that assert revalidatePath/revalidateTag calls. Self-documenting but requires test infra. | |
| You decide | Let the planner choose the output format. | |

**User's choice:** Markdown table + checklist (Recommended)

---

## Umami analytics deployment

### How should Umami be deployed on Coolify?

| Option | Description | Selected |
|--------|-------------|----------|
| Coolify Docker service (Recommended) | Deploy Umami as a Coolify-managed Docker service alongside the Next.js app and Postgres. | ✓ |
| Separate VPS for Umami | Dedicated server for analytics. Isolates analytics load from the main app. | |
| You decide | Let the planner choose based on the Coolify setup. | |

**User's choice:** Coolify Docker service (Recommended)

### Should Umami use the same Postgres instance or a separate one?

| Option | Description | Selected |
|--------|-------------|----------|
| Same Postgres instance, separate database (Recommended) | Umami gets its own database within the same Postgres server. Simpler ops. | ✓ |
| Separate Postgres instance | Dedicated Postgres for Umami. Maximum isolation but more Coolify services. | |
| You decide | Let the planner choose based on Coolify's database management. | |

**User's choice:** Same Postgres instance, separate database (Recommended)

### How should the Umami tracking script be injected on the public site?

| Option | Description | Selected |
|--------|-------------|----------|
| Settings-stored script tag (already wired in Phase 6 D-17) (Recommended) | The Phase 6 analytics injection mechanism reads a script URL/ID from settings. | ✓ |
| Hard-coded script tag | Directly add the Umami script to (site)/layout.tsx. Simpler but requires code change to switch. | |
| You decide | Let the planner choose based on the existing injection mechanism. | |

**User's choice:** Settings-stored script tag (already wired in Phase 6 D-17) (Recommended)

### How should the Umami dashboard be accessed?

| Option | Description | Selected |
|--------|-------------|----------|
| Separate subdomain (Recommended) | analytics.anydiscussion.com — Umami's own login. Clean separation from the blog. | ✓ |
| Embedded in the admin dashboard | Embed Umami's dashboard within the (admin) route group. Single login but more integration. | |
| You decide | Let the planner choose based on the setup complexity. | |

**User's choice:** Separate subdomain (Recommended)

---

## ISR scaling documentation

### How should the ISR scaling cliff be documented?

| Option | Description | Selected |
|--------|-------------|----------|
| README section + ADR (Recommended) | A section in the project README explaining the single-instance ISR limitation + an ADR. | ✓ |
| Just a code comment | A comment in next.config.ts or proxy.ts noting the limitation. Lightweight but easy to miss. | |
| You decide | Let the planner choose the documentation approach. | |

**User's choice:** README section + ADR (Recommended)

### What should the ISR scaling documentation cover?

| Option | Description | Selected |
|--------|-------------|----------|
| Problem + solution + v2 path (Recommended) | Explain the problem, the current solution, and the v2 path (Redis-backed shared cache). | ✓ |
| Just the limitation | Document that multi-replica needs shared cache. Don't prescribe a solution. | |
| You decide | Let the planner determine the documentation scope. | |

**User's choice:** Problem + solution + v2 path (Recommended)

### When should the ISR scaling documentation be created?

| Option | Description | Selected |
|--------|-------------|----------|
| During Phase 7 deployment (Recommended) | Document it while setting up the Coolify deployment. Relevant context for the deploy. | ✓ |
| After Phase 7, before v2 | Document it later when it's more relevant. Phase 7 is about shipping. | |
| You decide | Let the planner choose the timing. | |

**User's choice:** During Phase 7 deployment (Recommended)

### Should the documentation also cover other scaling considerations?

| Option | Description | Selected |
|--------|-------------|----------|
| ISR scaling only (Recommended) | Focused documentation. Other scaling concerns are handled by the services themselves. | ✓ |
| Full scaling roadmap | Document ISR, DB pooling, Redis, CDN, and multi-instance considerations. More comprehensive. | |
| You decide | Let the planner determine the documentation scope. | |

**User's choice:** ISR scaling only (Recommended)

---

## Redis instance configuration

### What memory limit should the self-hosted Redis instance have?

| Option | Description | Selected |
|--------|-------------|----------|
| 256MB (Recommended) | Plenty for rate limiting + future caching. Leaves room for growth. | ✓ |
| 128MB | Minimal. Sufficient for rate limiting only. May need upgrade if used for other purposes. | |
| You decide | Let the planner choose based on the expected data volume. | |

**User's choice:** 256MB (Recommended)

### Should Redis data persist across restarts?

| Option | Description | Selected |
|--------|-------------|----------|
| No persistence (Recommended) | Rate limit data is ephemeral — losing it on restart is fine. Simpler config, less disk I/O. | ✓ |
| RDB snapshots | Periodic snapshots to disk. Survives restarts but adds I/O overhead. Unnecessary for rate limiting. | |
| You decide | Let the planner choose based on the use case. | |

**User's choice:** No persistence (Recommended)

### Which Redis version should be deployed?

| Option | Description | Selected |
|--------|-------------|----------|
| Redis 7.x (Recommended) | Latest stable. Good compatibility with Upstash Ratelimit. Well-supported on Coolify. | ✓ |
| Redis 6.x | Older but battle-tested. Sufficient for rate limiting. | |
| You decide | Let the planner choose based on compatibility. | |

**User's choice:** Redis 7.x (Recommended)

### Should Redis be used for anything beyond rate limiting in v1?

| Option | Description | Selected |
|--------|-------------|----------|
| Rate limiting only (Recommended) | Keep v1 scope tight. Redis is provisioned for rate limiting. Other uses are v2 concerns. | ✓ |
| Rate limiting + ISR cache | Use Redis as a shared ISR cache handler. Solves the scaling cliff earlier but adds complexity. | |
| You decide | Let the planner determine the Redis usage scope. | |

**User's choice:** Rate limiting only (Recommended)

---

## Claude's Discretion

- Exact Lighthouse CI configuration (CI runner, thresholds, trigger mechanism)
- Revalidation audit table format (columns, granularity)
- Dockerfile specifics (base image, pnpm version, Node.js version, layer ordering)
- Coolify project configuration (resource limits, health checks, restart policy)
- Umami configuration (website registration, data retention, sharing settings)
- ADR format and README section placement for ISR scaling docs
- Test script details for publish→visible verification

## Deferred Ideas

- Multi-replica ISR scaling (Redis-backed shared cache handler) → v2 (SCALE-01)
- Automated E2E testing for publish→visible → future fast-follow
- Cloudflare Image Resizing → not needed
- Custom bundle analyzer → not needed
- Full scaling roadmap → premature

---

# Revision — 2026-07-28

**Date:** 2026-07-28
**Type:** Context update (existing CONTEXT.md was "Ready for planning" from 2026-07-14)
**Areas revisited:** Rate-limit driver (implementation detail), CI host, Staging deploy readiness, Email deliverability debt
**Codebase re-scouted:** confirmed `middleware.ts` (not `proxy.ts` — resolved in code), `next.config.ts` already production-shaped, `docker-compose.yml` is dev-only (Postgres 17 + MinIO, no Redis), no Dockerfile, no `.github/workflows`, no ratelimit/redis deps installed.

> The original 2026-07-14 decisions (above) were reviewed; most still hold. The four areas below are where reality or the founder's posture moved since the original discussion. Each refined/superseded decision is mirrored in CONTEXT.md with a **(refined/superseded 2026-07-28)** marker.

## Rate-limit driver (refines D-01)

| Option | Description | Selected |
|--------|-------------|----------|
| @upstash/ratelimit + ioredis (Recommended) | MIT-licensed lib + ioredis client against self-hosted Redis. No Upstash cloud account, no paid API. Confirms what D-01 intended. | ✓ |
| Hand-rolled INCR+EXPIRE | No rate-limit dependency. Lua/INCR+EXPIRE fixed window via ioredis. Minimal deps, more code to own. | |
| @upstash/ratelimit + Upstash REST | Use Upstash's hosted REST store. Free tier but IS a cloud dependency — tensions with ethos. | |

**User's choice:** @upstash/ratelimit + ioredis (Recommended)
**Notes:** Claude corrected an earlier framing — `@upstash/ratelimit` is MIT and works with self-hosted Redis via ioredis; "Upstash" is just the company name. The 3-attempts/15-min window (D-02), all-endpoints coverage (D-03), and self-hosted Redis on Coolify (D-04) carry over unchanged. Rate limiting does NOT go in `middleware.ts` (UX-only, no persistent state).

## CI host (refines D-12 / D-13; adds D-31)

| Option | Description | Selected |
|--------|-------------|----------|
| GitHub Actions (Recommended at ask time) | Free for public repos; standard place for lint + bundle gates. | |
| Coolify build step | Run `pnpm lint` + bundle-size inside the Docker build stage; fail aborts deploy. Keeps everything self-hosted. | ✓ |
| Local pre-push hook only | Git hook runs eslint + bundle-size before push. Bypassable, no enforcement. | |

**User's choice:** "self deploy so right now no CI/CD pipeline" → mapped to **Coolify build step**
**Notes:** Founder rejected a separate CI/CD pipeline entirely — deploy model is git-push → Coolify, no GitHub Actions. PERF-02 bundle/lint gate therefore runs as a Coolify build-stage step (the only automated pre-production safety net, since there is also no staging). Planner must NOT create `.github/workflows/*.yml`. Refines D-12/D-13 from "CI lint step" to "Coolify build-stage step"; new D-31 records the no-CI decision.

## Staging deploy readiness (supersedes D-22; refines D-23; adds D-32)

| Option | Description | Selected |
|--------|-------------|----------|
| Infra is ready | VPS + Coolify + DNS + R2 + SMTP all provisioned; Phase 7 = pure verify. | |
| Partially — needs setup | Some pieces exist; Phase 7 includes infra-setup tasks first. | |
| Not started — full setup | Nothing provisioned; Phase 7 begins with provisioning. | |

**Deploy flow follow-up (after "no staging"):**

| Option | Description | Selected |
|--------|-------------|----------|
| Push main → prod (Recommended) | Every push to `main` → Coolify builds + deploys to production directly. Build-step gate is the safety net. | ✓ |
| Manual prod promotion | `production` branch / manual button promotes; `main` non-deploying. Safer for a live blog. | |
| Keep staging after all | Revert D-22/D-23; two environments. | |

**User's choice:** "no need for staging" → then **Push main → prod**
**Notes:** Founder rejected a staging environment entirely — single production env, push-to-main deploys to production (`anydiscussion.com`). D-22 SUPERSEDED by new D-32; D-23 refined (Coolify SSL on production domain, not staging subdomain). Planner flag: ROADMAP SC#5 + REQUIREMENT PERF-06 say "Staging deployment" — reframe to "Coolify git-push deploy + managed SSL to production"; do not drop the requirement. Lighthouse/CWV + publish→visible now verified against production.

## Email deliverability debt (adds D-33; closes AUTH-06/07 verification debt)

| Option | Description | Selected |
|--------|-------------|----------|
| Yes — close in Phase 7 (Recommended) | Set DKIM/SPF/DMARC DNS + one real inbox test. STATE.md parked this on "Phase 7 / D-04". | ✓ |
| Split: DNS now, test later | Phase 7 sets DNS records; inbox-delivery test deferred to UAT/operator. | |
| No — defer entirely | Keep as verification debt; operator closes later. | |

**User's choice:** "confused, so do prefered" → **Yes — close in Phase 7 (Recommended)**
**Notes:** Founder deferred to the recommended option after flagging confusion. Claude explained in plain terms: the automated tests prove the send-hook fires, but real inbox delivery + DNS anti-spam records are unverified; with no staging safety net, auth email must work at first launch. New D-33 makes it explicitly in-scope. The "DNS-only, test later" split was rejected (inbox test is cheap once DNS is set).

## Items confirmed unchanged (not re-asked — locked 2026-07-14)

- Lighthouse 90+ / Google 'Good' CWV / all `(site)` routes (D-05..D-11)
- ESLint `no-restricted-imports` + 100KB gzipped public bundle threshold (D-14/D-15)
- Action-by-action revalidation audit + manual publish→visible script (D-16..D-19)
- Multi-stage Dockerfile, build-time NEXT_PUBLIC_* only (D-20/D-21)
- Umami on Coolify, same Postgres/separate DB, `analytics.anydiscussion.com` (D-24..D-27)
- ISR single-replica scaling cliff ADR (D-28..D-30)
- **`middleware.ts` is correct, NOT `proxy.ts`** — resolved in code (cited comment: proxy.ts never registers in middleware-manifest on Next 16.2.9 + Turbopack). Not re-litigated.

## Deferred Ideas (added 2026-07-28)

- Staging environment → rejected (D-32); revisit via `production`-branch promotion flow if a safety net is ever needed.
- GitHub Actions / separate CI layer → rejected (D-31); add as fast-follow if the team grows or pre-merge checks become necessary.
