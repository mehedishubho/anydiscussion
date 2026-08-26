---
phase: 07-performance-deploy
verified: 2026-08-26T20:45:00Z
status: gaps_found
score: 8/16 must-haves verified
behavior_unverified: 1 # truths present + wired whose runtime behavior no test exercises
overrides_applied: 0
# NOTE: two operator-approved deviations (fc3286d) are suggested as overrides below —
# they are NOT applied because no prior VERIFICATION.md recorded them. Accept or reject
# at the escalation gate; see "Override Suggestions" in the report body.
gaps:
  - truth: "The app deploys to staging/production on Coolify via git-push with managed SSL (SC#5 / PERF-06)"
    status: partial
    reason: "Owner decision 2026-07-29 (project memory: deploy-approach-manual-no-docker-prod) — production deploy is MANUAL, Docker is local-dev only, deploy system reviewed post-app-completion. No live deployment exists. Not repo-fixable; awaits the owner's deploy review. Runbooks (docs/operations/) were authored against the Coolify flow and await revision for the manual flow."
    artifacts:
      - path: "docs/operations/coolify-deploy.md"
        issue: "Authored for the Coolify git-push Docker flow; the owner has since switched to a manual deploy model — revision pending"
    missing:
      - "Revise coolify-deploy.md (+ umami-deploy.md service sections) for the manual VPS flow when deploy is revisited"
      - "Execute the deploy: runtime env injection, Redis service, smoke test, PROD_URL publish-visible run"
  - truth: "Rate limits key correctly per client IP behind the production proxy (IP-trust model sound)"
    status: failed
    reason: "07-REVIEW CR-01, independently re-verified against installed @better-auth/core@1.6.23 dist/utils/ip.mjs: with only ipAddressHeaders=[x-forwarded-for] and NO trustedProxies, getIPFromHeader returns null for any multi-value XFF (`if (forwardedIps.length !== 1) return null;`) — behind an appending proxy (Traefik default) ALL auth traffic shares ONE 3/15min bucket (trivial unauthenticated auth DoS). contact.ts takes the FIRST XFF hop (attacker-controllable under an appending proxy) — limiter bypass via header rotation. Not biting today (no deploy; local test sends single-value XFF), but it defeats the brute-force intent in exactly the production-like conditions the phase goal demands."
    artifacts:
      - path: "src/lib/auth/index.ts"
        issue: "advanced.ipAddress lacks trustedProxies — multi-value XFF collapses to NO_TRUSTED_IP_KEY shared bucket"
      - path: "src/actions/contact.ts"
        issue: "line 77 keys on first XFF hop (split(\",\")[0]) — spoofable under an appending proxy"
    missing:
      - "Configure advanced.ipAddress.trustedProxies with the Coolify proxy network CIDR (supported in installed 1.6.23: ip.mjs strips the chain from the right)"
      - "contact.ts (+ newsletter consumer): take the LAST XFF hop or a proxy-set real-IP header instead of the first"
      - "Add the through-the-proxy curl -H 'X-Forwarded-For: ...' verification to test-auth-ratelimit.mjs manual-run instructions"
  - truth: "A bundle-budget check proves no TailAdmin or Tiptap/editor JS leaks into the public chunk (SC#2, D-14 100KB)"
    status: partial
    reason: "Operator-approved deviation (fc3286d): gate 2 budget raised 100KB→1000KB TOTAL across all ~48 chunks (Next.js flattens chunks — no route-group separation possible; baseline ~749KB includes admin/editor). At 1000KB the budget catches only catastrophic regressions and CANNOT prove per-chunk leak-freedom by itself; GATE 1 (no-restricted-imports, behaviorally verified exit-1) is the precise leak guard. Script mechanics verified behaviorally (exit 0 under / exit 1 over threshold). Suggested override below."
    artifacts:
      - path: "Dockerfile"
        issue: "GATE 2 invokes --max-gz-kb=1000 (plan literal: 100)"
      - path: "package.json"
        issue: "check-bundle script uses --max-gz-kb=1000 (plan literal: 100)"
    missing:
      - "Accept the deviation via the suggested override, OR restore a public-chunk-scoped budget (per-route chunk filtering) at 100KB"
  - truth: "No runtime secret appears in any ARG or ENV line of the Dockerfile — only NEXT_PUBLIC_* build-time ARGs (07-01 D-21 literal)"
    status: partial
    reason: "Operator-approved deviation (fc3286d): ARG/ENV DATABASE_URL added to the BUILDER stage only — cacheComponents prerender needs Postgres at build. Security intent preserved: runner stage is a fresh FROM node:20-alpine whose only ENV lines are NODE_ENV, NEXT_TELEMETRY_DISABLED, PORT, HOSTNAME (verified — shipped image is secret-free); runtime DATABASE_URL comes from platform env. The plan's negative-grep criterion now matches (ARG/ENV DATABASE_URL present). Suggested override below."
    artifacts:
      - path: "Dockerfile"
        issue: "lines 71/74: ARG DATABASE_URL + ENV DATABASE_URL=$DATABASE_URL (builder stage only)"
    missing:
      - "Accept via the suggested override (runner-image secret-freedom is the load-bearing property and holds), or remove the build-time DB dependency (e.g. prerender-time stubbing)"
  - truth: "Public-site pages pass the Lighthouse / Core Web Vitals bar on the real Coolify + Cloudflare stack (SC#1 live leg)"
    status: partial
    reason: "Unfulfillable today — no live production URL exists (deploy owner-deferred). Config + tooling are complete and verified in-repo (lighthouserc.json with INP-correct thresholds, @lhci/cli installed, pnpm lighthouse wired). 07-05 Task 2 recorded status: partial for the same reason."
    missing:
      - "Run `pnpm lighthouse` + the manual DevTools per-route audit (D-08) once the production URL is live"
  - truth: "A published post is visible to readers within 30s on the real stack — publish→visible verified end-to-end (SC#3 live leg)"
    status: partial
    reason: "Unfulfillable today — no live production URL. The verification instrument exists and is verified in-repo (scripts/test-publish-visible.mjs, 30s deadline, pnpm test:publish-visible). The audit leg of SC#3 IS verified (see truths table)."
    missing:
      - "Run PROD_URL=<url> TEST_SLUG=<slug> pnpm test:publish-visible after the operator publishes a test post, at the deploy review"
  - truth: "Umami deployed on Coolify + DKIM/SPF/DMARC DNS records published + DMARC tightened p=none→p=quarantine + documented real-inbox capture (07-04 Tasks 2-3)"
    status: partial
    reason: "Owner-deferred with the deploy (2026-07-29). Substantive deliverability already proven: 02-UAT.md (2026-08-24) records AUTH-06 and AUTH-07 real-inbox round-trips PASS (both email types landed in a real inbox, browser-verified end-to-end). What remains deferred rides with the production mail-domain setup at the deploy review."
    missing:
      - "Publish DKIM CNAME + SPF TXT + DMARC TXT (templates ready in docs/operations/dns-email-deliverability.md)"
      - "Deploy Umami, force the default-password change, wire the script URL in /dashboard/settings/seo"
deferred: # Step 9b — items addressed by a LATER milestone phase
  - truth: "PERF-05: Postgres backups scheduled"
    addressed_in: "Phase 8 (Backup & Disaster Recovery)"
    evidence: "REQUIREMENTS.md: PERF-05 SUPERSEDED — replaced by BACKUP-01..05 (Phase 8); Phase 8 verification passed 2026-07-30 (22/22)"
behavior_unverified_items:
  - truth: "The 4th sign-in attempt within 15 minutes returns HTTP 429 with X-Retry-After; the 4th attempt after the window succeeds"
    test: "docker compose up -d redis && pnpm test:auth-ratelimit (spawns next start, 4 POSTs from synthetic IP, asserts 4th = 429 + X-Retry-After)"
    expected: "Attempts 1-3 non-429; attempt 4 HTTP 429 with X-Retry-After (or Retry-After) header; window reset succeeds after 15 min"
    why_human: "Requires a running server + live Redis; the graceful-SKIP integration script has never been executed end-to-end (no recorded run); Better Auth's limiter is library-internal so no unit test exercises the HTTP path"
---

# Phase 7: Performance & Deploy — Verification Report

**Phase Goal:** The blog ships on the real self-hosted stack (Coolify + Postgres + Cloudflare) meeting the non-negotiable performance/SEO bar, with the publish→visible loop, bundle isolation, and auth rate limiting verified in production-like conditions. (Backups moved to Phase 8.)
**Verified:** 2026-08-26T20:45:00Z
**Status:** gaps_found
**Re-verification:** No — initial verification (no prior VERIFICATION.md existed)

**Mode note:** ROADMAP marks this phase `mode: mvp` (milestone-wide default on all 8 phases), but the goal is not in user-story format, so the MVP user-flow framing does not fire — consistent with the precedent of phases 01–06 and 08, standard goal-backward verification was applied.

## Goal Achievement

The phase goal is **partially achieved**. Everything repo-anchored exists, is substantive, and is wired — build gates (behaviorally proven), rate-limiting config + Redis storage, the complete revalidation audit with matching code fixes, Lighthouse config with INP-correct thresholds, the ISR ADR, and three operator runbooks. Everything live-stack-anchored is **not done**: there is no deployment, so the "ships on the real self-hosted stack ... verified in production-like conditions" legs of the goal are unmet — deferred by an explicit owner decision (2026-07-29: manual deploy, post-app-completion review), not by executor omission. One verified code defect (CR-01 rate-limit IP-trust model) is repo-fixable now and should be fixed before any deploy.

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | lighthouserc.json + @lhci/cli + `pnpm lighthouse` with INP-correct thresholds (SC#1 config leg) | ✓ VERIFIED | lighthouserc.json:16-21 — perf≥0.9, LCP≤2500, `interaction-to-next-paint`≤200 (no `max-potential-fid` anywhere), CLS≤0.1 error-level; package.json:19,77; .gitignore:53 |
| 2 | Public-site pages pass Lighthouse/CWV bar on the real Coolify+Cloudflare stack (SC#1 live leg) | ? UNCERTAIN | No production URL exists (owner-deferred deploy). Unfulfillable today — gap #5 |
| 3 | A deliberate cross-group import fails the pre-production gate (SC#2) | ✓ VERIFIED | Behavioral: `(site)`→`@/app/(admin)/...` import via eslint --stdin → `no-restricted-imports` ERROR, exit 1 (probe run this verification); rule at eslint.config.mjs:20-54 (bidirectional); wired as Dockerfile GATE 1 `pnpm lint --max-warnings 0` (line 82) BEFORE `pnpm build` |
| 4 | Bundle-budget check proves no TailAdmin/Tiptap leak into the public chunk (SC#2, D-14 100KB literal) | ✗ FAILED | Budget is 1000KB TOTAL (fc3286d, operator-approved; Dockerfile:95, package.json:18) — cannot prove per-chunk leak-freedom; script mechanics themselves verified behaviorally (195.4KB synthetic chunks: exit 0 @1000KB, exit 1 @100KB). Gap #3 + override suggestion |
| 5 | Every mutating action classified HAS/MISSING/N/A in the audit — zero blank rows (SC#3 audit leg) | ✓ VERIFIED | 07-REVALIDATION-AUDIT.md — 34 rows covering every action in posts/settings/storage/categories/tags/pages/users/media/contact + cache-strategy matrix per public route; no blank classifications |
| 6 | categories/tags/pages/users actions revalidate public routes — mechanism-matched, concrete literals, 2-arg tag, after gate + DB write (SC#3 fix leg) | ✓ VERIFIED | Source-verified: categories.ts:51-57/106-115/138-144, tags.ts:46-51/105-113/134-139, pages.ts:124-126/174-179/240-242, users.ts:357-363 — all `revalidateTag(tag, "max")`, concrete template-literal paths, fires after `requireCan` + write; posts.ts:357-373 canonical template HAS assertion coverage (posts.test.ts:475-504). Note WR-04: no call assertions for the 4 fixed files |
| 7 | Published post visible within 30s on the real stack (SC#3 live leg) | ? UNCERTAIN | No production URL. Instrument verified: scripts/test-publish-visible.mjs (30s deadline, poller, SKIP on unreachable) + package.json `test:publish-visible` — gap #6 |
| 8 | Auth endpoints rate-limited — Better Auth 3/900s on all 4 endpoints + Redis customStorage + Contact limiter (SC#4 config leg) | ✓ VERIFIED | src/lib/auth/index.ts:102-139 (`customRules` ×4 at `{window:900,max:3}`, customStorage via redisClient with `ratelimit:` prefix + EX TTL, ipAddressHeaders) + contact.ts:78 (`contactFormLimiter.limit(ip)`) + upstash-ioredis-adapter.ts:98-104; rate-limit.test.ts 4/4 pass (run this verification); docker-compose.yml:52-66 D-04 redis; .env.example REDIS_URL |
| 9 | 4th sign-in within 15 min → HTTP 429 + X-Retry-After; window reset succeeds (SC#4 behavior leg) | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | Config + storage wired; HTTP path never exercised (test-auth-ratelimit.mjs graceful-SKIPs without server+Redis; no recorded run) — see behavior_unverified_items + human verification |
| 10 | Rate limits key per-client-IP behind the production proxy (IP-trust soundness) | ✗ FAILED | CR-01 re-verified against installed @better-auth/core@1.6.23 dist/utils/ip.mjs — `if (forwardedIps.length !== 1) return null;` without trustedProxies → multi-value XFF collapses all auth traffic into ONE 3/15min bucket (auth DoS); contact.ts:77 first-hop XFF is spoofable under an appending proxy — gap #2 |
| 11 | App deploys to staging/production on Coolify via git-push with managed SSL (SC#5 / PERF-06) | ✗ FAILED | No deployment exists. Owner decision 2026-07-29 (manual deploy, Docker local-dev only, review post-app-completion; project memory deploy-approach-manual-no-docker-prod) — gap #1 |
| 12 | Build-vs-runtime env secrets correctly separated (SC#5) | ✓ VERIFIED | Runner stage fresh `FROM node:20-alpine` with only NODE_ENV/NEXT_TELEMETRY_DISABLED/PORT/HOSTNAME (Dockerfile:99-135) — shipped image secret-free; separation rationale documented in Dockerfile header + coolify-deploy.md:264 non-leakage check |
| 13 | No runtime secret in ANY ARG/ENV line — only NEXT_PUBLIC_* baked (07-01 D-21 literal) | ✗ FAILED | Builder stage carries `ARG DATABASE_URL` + `ENV DATABASE_URL` (Dockerfile:71,74 — fc3286d, operator-approved; intent preserved, see truth 12) — gap #4 + override suggestion |
| 14 | Single-instance ISR scaling cliff documented for v2 (SC#5 doc leg) | ✓ VERIFIED | docs/adr/0001-isr-single-instance-scaling.md — full ADR (cliff, single-instance decision, v2 Redis-backed `cacheHandler` singular form, SCALE-01 cross-ref) + README.md:86-96 ISR Scaling section linking the ADR |
| 15 | Operator runbooks (coolify/umami/dns) with Prerequisites/Steps/Verification/Rollback | ✓ VERIFIED | docs/operations/ 3 files (359/209/247 lines), 4/4 sections each; content spot-checked (env-injection list + NEVER-as-ARG callout + non-leakage env-grep + gates doc; Umami image/password-change/script-wiring; DKIM/SPF/DMARC templates + p=none→p=quarantine progression) |
| 16 | Umami deployed + DKIM/SPF/DMARC published + real-inbox test (07-04 Tasks 2-3) | ✗ FAILED | Owner-deferred with the deploy. Substantive inbox proof exists: 02-UAT.md (2026-08-24) AUTH-06 + AUTH-07 real-inbox round-trips PASS — gap #7 |

**Score:** 8/16 truths verified (2 uncertain — owner-deferred live legs; 1 present, behavior-unverified; 5 failed, of which 3 are owner-deferred/deviation items and 1 is a repo-fixable defect)

### Override Suggestions (NOT applied — no prior VERIFICATION.md recorded these)

Both deviations were operator-approved at commit fc3286d (documented in 07-04-SUMMARY.md decisions). To accept them formally, add to this file's frontmatter:

```yaml
overrides:
  - must_have: "No runtime secret appears in any ARG or ENV line of the Dockerfile — only NEXT_PUBLIC_* build-time ARGs are baked (D-21)"
    reason: "Build-time DATABASE_URL ARG in builder stage ONLY (cacheComponents prerender needs Postgres at build); runner stage is a fresh node:20-alpine and ships secret-free — runtime DB creds still platform-env-injected"
    accepted_by: "{owner}"
    accepted_at: "2026-07-29 (fc3286d approval; record formal acceptance now)"
  - must_have: "Bundle-budget gate at 100KB gzipped (D-14)"
    reason: "Next.js flattens .next/static/chunks — no public/admin separation is possible at the chunk level; 1000KB total budget (~33% headroom over the ~749KB baseline) catches catastrophic regressions while GATE 1 (no-restricted-imports, verified exit-1) is the precise (site)→(admin) leak guard"
    accepted_by: "{owner}"
    accepted_at: "2026-07-29 (fc3286d approval; record formal acceptance now)"
```

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `Dockerfile` | 3-stage, two gates, non-root runner | ✓ VERIFIED | deps→builder(GATE 1 lint → build → GATE 2 bundle)→runner; node:20-alpine; USER nextjs; CMD ["node","server.js"]; deviations noted (truths 4,13) |
| `.dockerignore` | excludes dev/planning/test artifacts | ✓ VERIFIED | all 8 plan-required entries present |
| `scripts/check-bundle-size.mjs` | gzipped-chunk gate, exit 1 over threshold | ✓ VERIFIED | Node built-ins only; unchanged since 4ae54d6; behavioral regimes pass |
| `src/lib/redis/index.ts` | ioredis singleton (globalThis) | ✓ VERIFIED | `globalThis.__redisClient ??=` + maxRetriesPerRequest:3 + lazyConnect; consumed by auth + adapter |
| `src/lib/rate-limit/upstash-ioredis-adapter.ts` | Ratelimit over ioredis | ✓ VERIFIED | evalsha/eval/get/set + pipeline passthrough; slidingWindow 5/1h, prefix `ratelimit:contact`; also newsletterLimiter |
| `src/lib/rate-limit/index.ts` | re-export, tryConsume removed | ✓ VERIFIED | re-export only; no in-memory Map remains |
| `src/lib/auth/index.ts` | rateLimit + advanced.ipAddress blocks | ✓ VERIFIED | truths 8, 10 |
| `src/actions/contact.ts` | `contactFormLimiter.limit(ip)` + RATE_LIMITED throw | ✓ VERIFIED | line 78-81; first-hop XFF defect noted (truth 10) |
| `docker-compose.yml` redis | redis:7-alpine, 256mb, allkeys-lru, no persistence | ✓ VERIFIED | lines 52-66, healthcheck redis-cli ping |
| `.env.example` | REDIS_URL dev default | ✓ VERIFIED | line 14 (via git show) |
| `scripts/test-auth-ratelimit.mjs` | 4-POST 429 integration harness | ✓ VERIFIED | substantive; graceful SKIP contract; never run live (truth 9) |
| `07-REVALIDATION-AUDIT.md` | full HAS/MISSING/N/A classification | ✓ VERIFIED | truth 5 |
| `src/actions/{categories,tags,pages,users}.ts` | revalidation calls added | ✓ VERIFIED | truth 6 |
| `scripts/test-publish-visible.mjs` | 30s publish→visible poller | ✓ VERIFIED | truth 7 |
| `lighthouserc.json` | INP-correct thresholds | ✓ VERIFIED | truth 1 |
| `docs/adr/0001-isr-single-instance-scaling.md` | ISR cliff ADR | ✓ VERIFIED | truth 14 |
| `README.md` | ISR Scaling section → ADR | ✓ VERIFIED | lines 86-96 |
| `docs/operations/{coolify,umami,dns-email-deliverability}.md` | operator runbooks | ✓ VERIFIED | truth 15 |
| Production deployment on Coolify | the deployed runtime | ✗ MISSING | owner-deferred (gap #1) |
| Umami deployment | running analytics service | ✗ MISSING | owner-deferred (gap #7) |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| Dockerfile GATE 1 | eslint.config.mjs no-restricted-imports | `pnpm lint --max-warnings 0` before build | ✓ WIRED | behavioral exit-1 proof |
| Dockerfile GATE 2 | scripts/check-bundle-size.mjs | `--max-gz-kb=1000` after build, before runner copy | ✓ WIRED (deviation) | 1000 vs plan's 100 — gap #3 |
| src/lib/auth/index.ts customStorage | src/lib/redis/index.ts redisClient | get/set with `ratelimit:` prefix + EX | ✓ WIRED | |
| src/actions/contact.ts | contactFormLimiter | `await contactFormLimiter.limit(ip)` | ✓ WIRED | |
| upstash-ioredis-adapter | redisClient | IoredisAdapter wraps singleton | ✓ WIRED | |
| docker-compose redis | REDIS_URL | process.env.REDIS_URL ?? localhost:6379 | ✓ WIRED | |
| package.json check-bundle | check-bundle-size.mjs | same invocation as Dockerfile | ✓ WIRED (deviation) | 1000 vs 100 |
| test-publish-visible PROD_URL | deployed production URL | operator run after deploy | ✗ PENDING | no deploy exists |
| README ISR section | ADR 0001 | markdown link | ✓ WIRED | |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Deliberate (site)→(admin) import fails the gate | `echo 'import X from "@/app/(admin)/dashboard/page"' \| pnpm exec eslint --stdin --stdin-filename "src/app/(site)/probe.tsx"` | no-restricted-imports ERROR, exit 1 | ✓ PASS |
| Bundle gate exits 0 under / 1 over threshold | `node scripts/check-bundle-size.mjs` vs synthetic 195.4KB-gz chunks | exit 0 + PASS @1000KB; exit 1 + FAIL @100KB | ✓ PASS |
| Contact limiter unit behavior (5 ok / 6th denied / per-IP isolation) | `pnpm exec vitest run src/lib/rate-limit/__tests__/rate-limit.test.ts` | 4/4 pass | ✓ PASS |
| CR-01 claim against installed lib | read `@better-auth/core@1.6.23/dist/utils/ip.mjs` | `if (forwardedIps.length !== 1) return null;` confirmed — shared-bucket collapse real | ✗ DEFECT CONFIRMED |
| Full `pnpm build` completes (gates' precondition) | not run | needs DATABASE_URL + minutes; executor evidence (fc3286d "deploy blockers resolved", 07-04 "Docker build gates pass") + later build-dependent work corroborate | ? SKIP |

### Probe Execution

Step 7c: SKIPPED — no `scripts/*/tests/probe-*.sh` declared by any Phase 7 plan and none conventional for this repo.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|---------------------|----------|
| PERF-01 | 07-05 | Lighthouse / CWV meets the bar | ? PARTIAL — live run owner-deferred | config/tooling VERIFIED (truth 1); no production URL to audit |
| PERF-02 | 07-01 | Bundle-budget check, no editor JS in public chunk | ✓ SATISFIED (documented deviation) | both gates wired + behaviorally proven (truths 3, 4); 100KB→1000KB operator-approved |
| PERF-03 | 07-03 | revalidation audit + publish→visible | ✓ SATISFIED (repo leg); live leg deferred | audit complete + code fixes verified (truths 5, 6); live run gap #6 |
| PERF-04 | 07-02 | Rate limiting on auth endpoints | ✓ SATISFIED (repo leg) / ✗ IP-trust defect open | config + storage + unit tests VERIFIED (truth 8); CR-01 gap #2; live 429 truth 9 |
| PERF-06 | 07-04 | Staging deployment on Coolify | ✗ PARTIAL — deploy owner-deferred | runbooks + Dockerfile ready (truths 11-15); no deployment (gap #1) |
| ~~PERF-05~~ | — | superseded → Phase 8 | ✓ N/A (deferred) | BACKUP-01..05; Phase 8 verification passed 22/22 |
| ANAL-02 (claimed by 07-04) | 07-04 | Umami as analytics platform | ? PARTIAL — service deploy owner-deferred | REQUIREMENTS maps ANAL-02 to Phase 6 (Complete — injection mechanism); the Umami service itself rides gap #7 |

Orphaned requirements: none — all five Phase 7 IDs (PERF-01..04, 06) are claimed by plans; PERF-05's supersession is explicit in REQUIREMENTS.md.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| src/lib/auth/index.ts | 141-148 | CR-01: no trustedProxies — shared-bucket collapse behind appending proxy | 🛑 Blocker (pre-deploy) | auth DoS / brute-force protection inverted in production-like conditions — gap #2 |
| src/actions/contact.ts | 77 | CR-01 leg 2: first-hop XFF spoofable | 🛑 Blocker (pre-deploy) | limiter bypass via header rotation — gap #2 |
| src/actions/contact.ts | 78-81 | WR-01: unhandled limiter rejection on Redis outage (raw error, not RATE_LIMITED) | ⚠️ Warning | public contact form hard-fails with opaque error during Redis outage |
| src/lib/rate-limit/__tests__/rate-limit.test.ts | 113-118, 156-164 | WR-02/03: resetEphemeralCache is a no-op; "does NOT throw" test never simulates failure | ⚠️ Warning | false assurance; future tests may fail mysteriously |
| src/actions/__tests__/{taxonomy,pages,users}.test.ts | mocks only | WR-04: zero call assertions on the new revalidation wiring | ⚠️ Warning | silent regressions (dropped "max", wrong slug) would pass green |
| src/actions/pages.ts | 139-142 | WR-05: Partial<PageInput> contract broken (pageSchema requires title/slug) | ⚠️ Warning | latent — current caller always sends full payload |
| scripts/test-auth-ratelimit.mjs | 150-156 | WR-06: POSIX process-group kill ESRCH — orphan server poisons reruns | ⚠️ Warning | integration script unreliable on Linux/macOS |

Debt markers (TBD/FIXME/XXX/TODO/HACK/PLACEHOLDER) in all Phase 7 code surfaces: **zero**. All 13 documented commits verified present (4ae54d6, 9027cbd, 5d1f1f5, 02d9e68, 83fa175, f7fdf35, b45a468, f2623b5, 86f681c, 563667e, fc3286d, 0d01648, bcc59b9). Full suite 621/621 (62 files) reported green today by the orchestrator; this verifier independently re-ran only the rate-limit file (4/4).

### Human Verification Required

1. **Live Lighthouse / CWV audit (PERF-01)** — after the owner deploys, run `pnpm lighthouse` against the production URL, then the manual DevTools per-route audit (D-08: home, /blog, /blog/[slug], /archive, /category/[slug], /tag/[slug], /author/[slug], /search, /about, /contact, /terms, /privacy, 404).
   **Expected:** Performance ≥ 0.9, LCP ≤ 2500ms, INP ≤ 200ms, CLS ≤ 0.1 on every audited route.
   **Why human:** requires a live production URL; none exists.
2. **Publish→visible on the real stack (PERF-03)** — publish a test post via the dashboard, run `PROD_URL=<url> TEST_SLUG=<slug> pnpm test:publish-visible`.
   **Expected:** post visible at `/blog/<slug>` within 30s.
   **Why human:** requires the deployed stack.
3. **Auth rate-limit 429 behavior (PERF-04)** — `docker compose up -d redis && pnpm test:auth-ratelimit`.
   **Expected:** attempts 1-3 pass, attempt 4 → HTTP 429 + X-Retry-After; after 15 min, succeeds again.
   **Why human:** needs a running server + Redis; never executed end-to-end (behavior_unverified_items).
4. **Proxy IP-trust verification (after CR-01 fix)** — through the real deployed proxy, `curl -H "X-Forwarded-For: 1.2.3.4"` the app and log the resolved client IP.
   **Expected:** resolved IP is the proxy-derived value, not the injected one; rate buckets stay per-client.
   **Why human:** proxy behavior is environment-specific and unobservable from the repo.
5. **Docker local build dry-run + secret non-leakage (07-04 deferred)** — `docker build -t anydiscussion-test .` then `docker run --rm anydiscussion-test env | grep -E "(DATABASE_URL\|RESEND_API_KEY\|SECRET)"` (must return empty).
   **Expected:** build passes both gates; runner image env-grep empty.
   **Why human:** requires Docker daemon + build-time DATABASE_URL.

### Gaps Summary

The phase's repo-side contract is delivered and mostly proven: bundle gates exist and behave correctly (the deliberate-import gate fails lint — behaviorally verified this run), rate limiting is fully wired to self-hosted Redis with passing unit tests, the revalidation audit is complete and its code fixes are source-verified against every constraint (mechanism-match, concrete literals, 2-arg form, post-gate ordering), Lighthouse config is INP-correct, and the ISR cliff is documented in ADR + README.

What is NOT achieved is the goal's head — "ships on the real self-hosted stack ... verified in production-like conditions": there is no deployment (owner-deferred 2026-07-29 to a post-app-completion manual-deploy review), hence no live CWV numbers, no live publish→visible run, no Umami, and no formal DKIM/SPF/DMARC publication (though real-inbox deliverability was substantively proven by 02-UAT on 2026-08-24). These are reported as owner-deferred gaps, not executor failures.

Two operator-approved fc3286d deviations (builder-stage DATABASE_URL ARG; 1000KB total bundle budget) fail their plan-literal must-haves while preserving intent (runner image secret-free; catastrophic-leak guard + precise lint guard) — override suggestions provided above for formal acceptance.

One repo-fixable defect must be fixed before any deploy: CR-01 (independently confirmed against the installed better-auth dist) — without `trustedProxies`, an appending proxy collapses all auth rate limiting into one shared 3/15-minute bucket, and the contact limiter keys on a spoofable first hop. Advisory warnings WR-01..WR-06 (contact-form outage contract, test-quality issues, missing revalidation assertions) are documented in 07-REVIEW.md and summarized above.

---

_Verified: 2026-08-26T20:45:00Z_
_Verifier: Claude (gsd-verifier)_
