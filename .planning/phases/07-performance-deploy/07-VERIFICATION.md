---
phase: 07-performance-deploy
verified: 2026-08-26T17:55:00Z
status: gaps_found
score: 12/16 must-haves verified
behavior_unverified: 0 # truths present + wired whose runtime behavior no test exercises
overrides_applied: 2
# Both fc3286d operator-approved deviations were ACCEPTED by the owner at the
# escalation gate on 2026-08-26 (formalizing the 2026-07-29 fc3286d approval) —
# recorded in the overrides list below, copied verbatim from the report body's
# "Override Suggestions" section. Carried forward unchanged on re-verification
# 2026-08-26 (both deviations still present in the repo: Dockerfile builder-stage
# ARG DATABASE_URL; --max-gz-kb=1000 in Dockerfile:95 + package.json:18).
overrides:
  - must_have: "No runtime secret appears in any ARG or ENV line of the Dockerfile — only NEXT_PUBLIC_* build-time ARGs are baked (D-21)"
    reason: "Build-time DATABASE_URL ARG in builder stage ONLY (cacheComponents prerender needs Postgres at build); runner stage is a fresh node:20-alpine and ships secret-free — runtime DB creds still platform-env-injected"
    accepted_by: "owner (mehedishubho)"
    accepted_at: "2026-08-26"
  - must_have: "Bundle-budget gate at 100KB gzipped (D-14)"
    reason: "Next.js flattens .next/static/chunks — no public/admin separation is possible at the chunk level; 1000KB total budget (~33% headroom over the ~749KB baseline) catches catastrophic regressions while GATE 1 (no-restricted-imports, verified exit-1) is the precise (site)→(admin) leak guard"
    accepted_by: "owner (mehedishubho)"
    accepted_at: "2026-08-26"
gaps:
  # --- Owner-deferred live-stack gaps (unchanged; not repo-fixable) ---
  - truth: "The app deploys to staging/production on Coolify via git-push with managed SSL (SC#5 / PERF-06)"
    status: partial
    reason: "Owner decision 2026-07-29 (project memory: deploy-approach-manual-no-docker-prod) — production deploy is MANUAL, Docker is local-dev only, deploy system reviewed post-app-completion. No live deployment exists (re-confirmed this run: https://anydiscussion.com/ returns a Cloudflare managed-challenge page, not the app). Not repo-fixable; awaits the owner's deploy review. Runbooks (docs/operations/) were authored against the Coolify flow and await revision for the manual flow."
    artifacts:
      - path: "docs/operations/coolify-deploy.md"
        issue: "Authored for the Coolify git-push Docker flow; the owner has since switched to a manual deploy model — revision pending (see 07-REVIEW WR-07)"
    missing:
      - "Revise coolify-deploy.md (+ umami-deploy.md service sections) for the manual VPS flow when deploy is revisited"
      - "Execute the deploy: runtime env injection, Redis service, smoke test, PROD_URL publish-visible run"
  - truth: "Public-site pages pass the Lighthouse / Core Web Vitals bar on the real Coolify + Cloudflare stack (SC#1 live leg)"
    status: partial
    reason: "Unfulfillable today — no live production URL exists (deploy owner-deferred). Config + tooling are complete and verified in-repo (lighthouserc.json with INP-correct thresholds re-read this run; @lhci/cli installed; pnpm lighthouse wired). 07-05 Task 2 recorded status: partial for the same reason."
    missing:
      - "Run `pnpm lighthouse` + the manual DevTools per-route audit (D-08) once the production URL is live"
  - truth: "A published post is visible to readers within 30s on the real stack — publish→visible verified end-to-end (SC#3 live leg)"
    status: partial
    reason: "Unfulfillable today — no live production URL. The verification instrument exists and is verified in-repo (scripts/test-publish-visible.mjs, DEADLINE_MS = 30_000 at line 25, pnpm test:publish-visible). The audit leg of SC#3 IS verified (see truths table)."
    missing:
      - "Run PROD_URL=<url> TEST_SLUG=<slug> pnpm test:publish-visible after the operator publishes a test post, at the deploy review"
  - truth: "Umami deployed on Coolify + DKIM/SPF/DMARC DNS records published + DMARC tightened p=none→p=quarantine + documented real-inbox capture (07-04 Tasks 2-3)"
    status: partial
    reason: "Owner-deferred with the deploy (2026-07-29). Substantive deliverability already proven: 02-UAT.md (2026-08-24) records AUTH-06 and AUTH-07 real-inbox round-trips PASS (both email types landed in a real inbox, browser-verified end-to-end). What remains deferred rides with the production mail-domain setup at the deploy review."
    missing:
      - "Publish DKIM CNAME + SPF TXT + DMARC TXT (templates ready in docs/operations/dns-email-deliverability.md)"
      - "Deploy Umami, force the default-password change, wire the script URL in /dashboard/settings/seo"
  # --- NEW repo-fixable gaps from 07-REVIEW.md (committed 1c9197c after the
  #     previous verification; both independently re-confirmed against code and
  #     the installed dist during THIS verification run) ---
  - truth: "A by-the-runbook production deploy activates the 07-06 IP-trust mitigation — TRUSTED_PROXY_CIDR is documented in the deploy runbook's runtime env table (07-06 key_link: '.env.example TRUSTED_PROXY_CIDR -> advanced.ipAddress.trustedProxies — the deployment-topology trust anchor')"
    status: failed
    reason: "07-REVIEW CR-01, re-confirmed this run: grep for TRUSTED_PROXY_CIDR under docs/ returns ZERO matches; docs/operations/coolify-deploy.md section 5 runtime env table lists 14 vars (DATABASE_URL..SETTINGS_ENCRYPTION_KEY) without it. The code fix (src/lib/auth/index.ts:163-175, env-driven trustedProxies) is wired and unit-tested, but with the env var unset behind an appending proxy, Better Auth 1.6.23 resolves a null client IP for every multi-value XFF request — ALL auth traffic collapses into one shared 3/15-minute bucket (trivial unauthenticated site-wide sign-in/reset lockout). An operator following the runbook verbatim ships the vulnerable configuration."
    artifacts:
      - path: "docs/operations/coolify-deploy.md"
        issue: "Section 5 runtime env table omits TRUSTED_PROXY_CIDR (required-for-production behind the appending proxy); the 'Auth fails closed' troubleshooting entry also only mentions Redis, not the shared-bucket lockout"
    missing:
      - "Add TRUSTED_PROXY_CIDR (proxy internal-network CIDR, e.g. 172.16.0.0/12, comma-separated) to the section 5 runtime table with the unset/mis-set failure modes and the post-deploy through-the-proxy curl verification (already in the harness's SKIP instructions)"
      - "Extend the 'Auth fails closed' troubleshooting entry to cover the shared-bucket lockout symptom"
  - truth: "The defined RATE_LIMITED public contract actually reaches the client in production builds — contact.ts's thrown Error(\"RATE_LIMITED\") maps to the friendly 'Too many messages' message (07-06 WR-01 contract; contact.ts:49-55 docblock)"
    status: failed
    reason: "07-REVIEW CR-02, re-confirmed this run against the installed dist: React's production flight serializer emits error chunks carrying ONLY a digest (node_modules/next/dist/compiled/react-server-dom-webpack/cjs/react-server-dom-webpack-server.node.production.js:1925-1928, emitErrorChunk stringifies {digest} only). The client therefore never sees err.message === \"RATE_LIMITED\" in production — src/components/site/ContactForm.tsx:98-101 mapping is dead code in prod; rate-limited and Redis-outage users see 'Something went wrong. Please try again.' (which invites hammering the limiter). Same mechanism breaks the five readable guard messages thrown by users.ts deleteUser (lines 430-487). Works in dev (dev flight forwards message), so local testing cannot catch it. subscribeNewsletter is unaffected (returns error states, the correct shape)."
    artifacts:
      - path: "src/actions/contact.ts"
        issue: "Public contract is thrown-error-message based (lines 96/99) — redacted by production flight serialization"
      - path: "src/components/site/ContactForm.tsx"
        issue: "Branches on err.message === \"RATE_LIMITED\" (lines 98-101) — unreachable in production builds"
      - path: "src/actions/users.ts"
        issue: "deleteUser guard messages (lines 430-487) rely on the same redacted message mechanism"
    missing:
      - "Convert submitContact to returned states ({ ok: false, error: \"RATE_LIMITED\" | \"INVALID_INPUT\" }), mirroring subscribeNewsletter, and switch ContactForm on the returned state"
      - "For users.ts deleteUser/updateUser guard failures: return { error } states or attach a stable digest and branch on err.digest — stop branching on err.message"
deferred: # Step 9b — items addressed by a LATER milestone phase
  - truth: "PERF-05: Postgres backups scheduled"
    addressed_in: "Phase 8 (Backup & Disaster Recovery)"
    evidence: "REQUIREMENTS.md: PERF-05 SUPERSEDED — replaced by BACKUP-01..05 (Phase 8); Phase 8 verification passed 2026-07-30 (22/22)"
behavior_unverified_items: [] # the auth 429 item was closed 2026-08-26 by the recorded live harness run (07-06 Task 3 — truth 9); no truth is currently present+wired-but-unexercised
re_verification:
  previous_status: gaps_found
  previous_score: 12/16
  gaps_closed: [] # none of the four owner-deferred live-stack gaps closed — no deploy has occurred (production URL still serves a Cloudflare challenge page, not the app)
  gaps_remaining:
    - "Deploy on Coolify (SC#5 / PERF-06) — owner-deferred"
    - "Lighthouse live run (SC#1 live leg) — owner-deferred"
    - "Publish→visible live run (SC#3 live leg) — owner-deferred"
    - "Umami + DKIM/SPF/DMARC publication (07-04 Tasks 2-3) — owner-deferred"
  new_gaps:
    - "07-REVIEW CR-01 (repo-fixable): coolify-deploy.md runtime env table omits TRUSTED_PROXY_CIDR"
    - "07-REVIEW CR-02 (repo-fixable): RATE_LIMITED thrown-error contract dead in production (React flight redaction)"
  regressions: [] # all 12 previously-verified truths re-confirmed; lint gate re-probed behaviorally (exit 1); rate-limit + client-ip unit tests 9/9 today; all 20 documented commits present
---

# Phase 7: Performance & Deploy — Verification Report

**Phase Goal:** The blog ships on the real self-hosted stack (Coolify + Postgres + Cloudflare) meeting the non-negotiable performance/SEO bar, with the publish→visible loop, bundle isolation, and auth rate limiting verified in production-like conditions. (Backups moved to Phase 8.)
**Verified:** 2026-08-26T17:55:00Z
**Status:** gaps_found
**Re-verification:** Yes — post-review pass over the 2026-08-26T20:45:00Z report (12/16). The four owner-deferred live-stack gaps remain open; the 12 verified truths were regression-checked and all hold; two NEW repo-fixable criticals from 07-REVIEW.md (committed 1c9197c after the previous report) were independently confirmed against code and the installed dist and are now structured gaps.

**Mode note:** ROADMAP marks this phase `mode: mvp` (milestone-wide default on all 8 phases), but the goal is not in user-story format, so the MVP user-flow framing does not fire — consistent with the precedent of phases 01–06 and 08, standard goal-backward verification was applied.

## Goal Achievement

The phase goal is **partially achieved**. Everything repo-anchored exists, is substantive, and is wired — build gates (behaviorally re-proven this run), rate-limiting config + Redis storage + the CR-01 IP-trust fix, the complete revalidation audit with matching code fixes, Lighthouse config with INP-correct thresholds, the ISR ADR, and three operator runbooks. Everything live-stack-anchored is **not done**: there is no deployment, so the "ships on the real self-hosted stack ... verified in production-like conditions" legs of the goal are unmet — deferred by an explicit owner decision (2026-07-29: manual deploy, post-app-completion review), not by executor omission. Additionally, the phase's own code review (07-REVIEW.md, committed after the previous report) surfaced two repo-fixable criticals — both confirmed by this verifier — that keep the deploy-time contract from functioning as documented (gaps #5 and #6 below).

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | lighthouserc.json + @lhci/cli + `pnpm lighthouse` with INP-correct thresholds (SC#1 config leg) | ✓ VERIFIED | Re-read this run: lighthouserc.json — perf≥0.9, LCP≤2500, `interaction-to-next-paint`≤200, CLS≤0.1 all error-level (no `max-potential-fid` anywhere); package.json:19,77; .gitignore excludes .lighthouseci |
| 2 | Public-site pages pass Lighthouse/CWV bar on the real Coolify+Cloudflare stack (SC#1 live leg) | ? UNCERTAIN | No production URL exists (owner-deferred deploy). Unfulfillable today — gap #2 |
| 3 | A deliberate cross-group import fails the pre-production gate (SC#2) | ✓ VERIFIED | Re-probed behaviorally this run: `(site)`→`@/app/(admin)/dashboard/page` stdin import via eslint → `no-restricted-imports` ERROR, **exit code 1**; rule at eslint.config.mjs:20-54 (bidirectional); wired as Dockerfile GATE 1 `pnpm lint --max-warnings 0` (line 82) BEFORE `pnpm build` |
| 4 | Bundle-budget check proves no TailAdmin/Tiptap leak into the public chunk (SC#2, D-14 100KB literal) | ✓ VERIFIED (override) | Override ACCEPTED 2026-08-26 by owner (frontmatter, carried forward) — 1000KB total budget catches catastrophic regressions while GATE 1 is the precise leak guard; script mechanics behaviorally verified in the prior run (exit 0 @1000KB / exit 1 @100KB against synthetic 195.4KB chunks). Dockerfile:95 + package.json:18 both run `--max-gz-kb=1000`. Note: Dockerfile:16 header comment still says 100 (stale — 07-REVIEW WR-03) |
| 5 | Every mutating action classified HAS/MISSING/N/A in the audit — zero blank rows (SC#3 audit leg) | ✓ VERIFIED | 07-REVALIDATION-AUDIT.md — table rows covering every action in posts/settings/storage/categories/tags/pages/users/media/contact + cache-strategy matrix per public route; no blank classifications |
| 6 | categories/tags/pages/users actions revalidate public routes — mechanism-matched, concrete literals, 2-arg tag, after gate + DB write (SC#3 fix leg) | ✓ VERIFIED | Re-counted this run: 65 revalidatePath/revalidateTag calls across the 4 files; 2-arg `revalidateTag(tag, "max")` form confirmed (categories.ts:56-57 etc.); fires after `requireCan` + write; posts.ts canonical template has assertion coverage (posts.test.ts) plus the WR-04 literal assertions added by 07-06 (taxonomy/pages/users tests) |
| 7 | Published post visible within 30s on the real stack (SC#3 live leg) | ? UNCERTAIN | No production URL. Instrument verified this run: scripts/test-publish-visible.mjs (129 lines, `DEADLINE_MS = 30_000` at line 25, poller, SKIP on unreachable) + package.json `test:publish-visible` — gap #3 |
| 8 | Auth endpoints rate-limited — Better Auth 3/900s on all 4 endpoints + Redis customStorage + Contact limiter (SC#4 config leg) | ✓ VERIFIED | Re-read this run: src/lib/auth/index.ts:102-139 (`customRules` ×4 at `{window:900,max:3}`, customStorage via redisClient with `ratelimit:` prefix + EX TTL, ipAddressHeaders) + contact.ts:93 (`contactFormLimiter.limit(ip)`) + upstash-ioredis-adapter.ts (contactFormLimiter + newsletterLimiter, prefixes `ratelimit:contact`/`ratelimit:newsletter`, exported contactFormEphemeralCache:99 wired as ephemeralCache:117); rate-limit.test.ts + client-ip.test.ts re-run today: 9/9 pass; docker-compose.yml:52-66 D-04 redis; .env.example REDIS_URL |
| 9 | 4th sign-in within 15 min → HTTP 429 + X-Retry-After; window reset succeeds (SC#4 behavior leg) | ✓ VERIFIED | Live harness run 2026-08-26 (07-06 Task 3, recorded verbatim in 07-06-SUMMARY.md): `pnpm test:auth-ratelimit` against a throwaway docker redis — Structural PASS (incl. trustedProxies token), HTTP PASS: attempts 1-3 non-429 (403 invalid credentials), attempt 4 HTTP 429 with X-Retry-After=900; exit 0. (Not re-executed this run — requires docker + fresh build; corroborated by today's 9/9 unit tests and the harness's structural tokens.) The 15-minute window-reset leg remains covered by documented Redis TTL semantics |
| 10 | Rate limits key per-client-IP behind the production proxy (IP-trust soundness) | ✓ VERIFIED | Re-read this run: advanced.ipAddress.trustedProxies sourced from TRUSTED_PROXY_CIDR (auth/index.ts:170, comma-split/trim/filter; unset preserves single-value XFF behavior) + shared last-hop helper getClientIpFromXff (rate-limit/index.ts:61-64) keys contact.ts:90 + newsletter.ts:195 (never the spoofable first hop) + trustedProxies structural token pinned in the harness + unit/action tests (client-ip.test.ts, newsletter.test.ts multi-hop spy). Deploy-time activation leg is gap #5 (runbook omission) |
| 11 | App deploys to staging/production on Coolify via git-push with managed SSL (SC#5 / PERF-06) | ✗ FAILED | No deployment exists. Re-confirmed this run: https://anydiscussion.com/ (+www) returns a Cloudflare managed-challenge page ("Just a moment..."), not the app — the domain is Cloudflare-fronted but no deployed blog is verifiable. Owner decision 2026-07-29 (manual deploy, Docker local-dev only, review post-app-completion) — gap #1 |
| 12 | Build-vs-runtime env secrets correctly separated (SC#5) | ✓ VERIFIED | Re-read this run: runner stage is a fresh `FROM node:20-alpine` (Dockerfile:99) with only NODE_ENV/NEXT_TELEMETRY_DISABLED/PORT/HOSTNAME ENV lines (102-132) — shipped image secret-free; separation rationale in Dockerfile header + coolify-deploy.md non-leakage check |
| 13 | No runtime secret in ANY ARG/ENV line — only NEXT_PUBLIC_* baked (07-01 D-21 literal) | ✓ VERIFIED (override) | Override ACCEPTED 2026-08-26 by owner (frontmatter, carried forward) — builder-stage-only ARG/ENV DATABASE_URL (Dockerfile:71-74); runner image secret-free (truth 12) |
| 14 | Single-instance ISR scaling cliff documented for v2 (SC#5 doc leg) | ✓ VERIFIED | Re-confirmed this run: docs/adr/0001-isr-single-instance-scaling.md (113 lines — cliff, single-instance decision, v2 Redis-backed `cacheHandler` singular form, SCALE-01 cross-ref) + README.md:92-95 ISR Scaling section linking the ADR |
| 15 | Operator runbooks (coolify/umami/dns) with Prerequisites/Steps/Verification/Rollback | ✓ VERIFIED | Re-confirmed this run: docs/operations/ 3 files (359/209/247 lines), 5/5/8 matching sections; content spot-checked. Caveat: the coolify runbook's runtime env table is now incomplete relative to the code (missing TRUSTED_PROXY_CIDR — 07-REVIEW CR-01, gap #5) and its git-push-auto-deploy premise is stale vs the owner's manual-deploy decision (07-REVIEW WR-07, folded into gap #1) |
| 16 | Umami deployed + DKIM/SPF/DMARC published + real-inbox test (07-04 Tasks 2-3) | ✗ FAILED | Owner-deferred with the deploy. Substantive inbox proof exists: 02-UAT.md (2026-08-24) AUTH-06 + AUTH-07 real-inbox round-trips PASS — gap #4 |

**Score:** 12/16 truths verified (2 uncertain — owner-deferred live legs; 2 failed — owner-deferred deploy items; 2 of the 12 verified are owner-accepted overrides). Unchanged from the previous report: no truth regressed, no deferred gap closed.

### Review Findings Folded In (07-REVIEW.md — new since the previous verification)

The phase code review (committed 1c9197c after the previous report; `status: issues_found`, 2 critical / 7 warning / 5 info) is phase evidence. Both criticals were independently re-confirmed by this verifier and are structured as gaps #5/#6 in the frontmatter:

| Finding | This verifier's evidence | Status |
|---|---|---|
| CR-01: coolify-deploy.md runtime env table omits TRUSTED_PROXY_CIDR | grep docs/ → 0 matches; §5 table re-read (14 vars listed, none is TRUSTED_PROXY_CIDR); auth/index.ts:163-175 comment documents the null-IP shared-bucket failure mode the omission would ship | ✗ CONFIRMED → gap #5 (repo-fixable) |
| CR-02: RATE_LIMITED thrown-message contract dead in production | contact.ts:96/99 throws; ContactForm.tsx:98-101 branches on err.message; installed dist `react-server-dom-webpack-server.node.production.js:1925-1928` — `emitErrorChunk` stringifies `{digest}` only; users.ts:430-487 same mechanism | ✗ CONFIRMED → gap #6 (repo-fixable) |
| WR-02: dns runbook points at /forget-password (page route is /forgot-password) | 3 occurrences confirmed (dns-email-deliverability.md:119,191,245) | ⚠️ confirmed warning |
| WR-03: Dockerfile:16 header says --max-gz-kb=100 while line 95 runs 1000 | Both lines re-read this run | ⚠️ confirmed warning |
| WR-04: harness prints FAIL but exits 0 when only the HTTP check fails | scripts/test-auth-ratelimit.mjs "failed" branch re-read — exitCode=1 only when structural ALSO failed | ⚠️ confirmed warning |
| WR-01, WR-05..07, IN-01..05 | Not independently re-verified this run (advisory; recorded in 07-REVIEW.md) | ℹ️ recorded |

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `Dockerfile` | 3-stage, two gates, non-root runner | ✓ VERIFIED | deps→builder(GATE 1 lint → build → GATE 2 bundle @1000KB override)→runner; node:20-alpine; USER nextjs; CMD ["node","server.js"]; deviations override-accepted (truths 4, 13); stale :16 header noted |
| `.dockerignore` | excludes dev/planning/test artifacts | ✓ VERIFIED | all 8 plan-required entries present |
| `scripts/check-bundle-size.mjs` | gzipped-chunk gate, exit 1 over threshold | ✓ VERIFIED | 148 lines, Node built-ins only; behavioral regimes proven in prior run |
| `src/lib/redis/index.ts` | ioredis singleton (globalThis) | ✓ VERIFIED | `globalThis.__redisClient ??=` (:31) + maxRetriesPerRequest:3 + fail-closed comment; consumed by auth + adapter |
| `src/lib/rate-limit/upstash-ioredis-adapter.ts` | Ratelimit over ioredis | ✓ VERIFIED | contactFormLimiter + newsletterLimiter; prefixes; exported contactFormEphemeralCache (:99) wired as ephemeralCache (:117) |
| `src/lib/rate-limit/index.ts` | re-exports + getClientIpFromXff | ✓ VERIFIED | 65-line module; last-hop helper with full trust rationale |
| `src/lib/auth/index.ts` | rateLimit + advanced.ipAddress blocks | ✓ VERIFIED | truths 8, 10 |
| `src/actions/contact.ts` | limiter + RATE_LIMITED | ✓ VERIFIED (caveat) | :90 last-hop keying, :93 limit(), :94-100 fail-closed catch+throw — but the thrown-message client contract is dead in prod (gap #6) |
| `src/actions/newsletter.ts` | returned-state RATE_LIMITED | ✓ VERIFIED | :195 getClientIpFromXff, :198-200 catch → returned error state (the correct shape — unaffected by flight redaction) |
| `docker-compose.yml` redis | redis:7-alpine, 256mb, allkeys-lru, no persistence | ✓ VERIFIED | :52-66 re-read incl. healthcheck redis-cli ping |
| `.env.example` | REDIS_URL + TRUSTED_PROXY_CIDR | ✓ VERIFIED | REDIS_URL dev default; TRUSTED_PROXY_CIDR documented block with both fail-closed modes (via git show) |
| `scripts/test-auth-ratelimit.mjs` | 4-POST 429 integration harness | ✓ VERIFIED (caveat) | 336 lines; structural tokens incl. trustedProxies; recorded live PASS; WR-04 false-green exit branch open |
| `src/lib/rate-limit/__tests__/client-ip.test.ts` | last-hop extraction tests | ✓ VERIFIED | re-run today: 4/4 pass |
| `src/lib/rate-limit/__tests__/rate-limit.test.ts` | truthful adapter tests | ✓ VERIFIED | re-run today (with client-ip file): 9/9 pass |
| `src/actions/pages-schema.ts` | pageUpdateSchema (partial + id) | ✓ VERIFIED | :57 `pageSchema.partial().extend({id: z.number().int().positive()})`; consumed by pages.ts:149 |
| `src/lib/post-render.ts` | NULL-body guard | ✓ VERIFIED | :50 `if (postBodyJson == null) return "";` + post-render.test.ts |
| `07-REVALIDATION-AUDIT.md` | full HAS/MISSING/N/A classification | ✓ VERIFIED | truth 5 |
| `src/actions/{categories,tags,pages,users}.ts` | revalidation calls added | ✓ VERIFIED | truth 6 |
| `scripts/test-publish-visible.mjs` | 30s publish→visible poller | ✓ VERIFIED | truth 7 |
| `lighthouserc.json` | INP-correct thresholds | ✓ VERIFIED | truth 1 |
| `docs/adr/0001-isr-single-instance-scaling.md` | ISR cliff ADR | ✓ VERIFIED | truth 14 |
| `README.md` | ISR Scaling section → ADR | ✓ VERIFIED | :92-95 |
| `docs/operations/{coolify,umami,dns-email-deliverability}.md` | operator runbooks | ✓ VERIFIED (caveat) | truth 15 — CR-01 omission + WR-02 wrong URL + WR-07 stale premise recorded as gaps/warnings |
| Production deployment on Coolify | the deployed runtime | ✗ MISSING | owner-deferred (gap #1) |
| Umami deployment | running analytics service | ✗ MISSING | owner-deferred (gap #7/gap #4) |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| Dockerfile GATE 1 | eslint.config.mjs no-restricted-imports | `pnpm lint --max-warnings 0` before build | ✓ WIRED | behavioral exit-1 proof re-run this verification |
| Dockerfile GATE 2 | scripts/check-bundle-size.mjs | `--max-gz-kb=1000` after build, before runner copy | ✓ WIRED (override) | 1000 vs plan's 100 — override-accepted |
| src/lib/auth/index.ts customStorage | src/lib/redis/index.ts redisClient | get/set with `ratelimit:` prefix + EX | ✓ WIRED | re-read this run |
| .env.example TRUSTED_PROXY_CIDR | auth/index.ts trustedProxies | env parse (comma-split/trim/filter) | ✓ WIRED | code leg wired; **runbook leg NOT wired** (gap #5) |
| src/actions/contact.ts + newsletter.ts | getClientIpFromXff | shared last-hop extraction | ✓ WIRED | contact.ts:90, newsletter.ts:195 |
| rate-limit.test.ts | contactFormEphemeralCache | exported Map reset surface | ✓ WIRED | :99 export, :117 config, test clears it |
| pages.ts updatePage | pageUpdateSchema | parse({ ...input, id }) | ✓ WIRED | pages.ts:149 |
| docker-compose redis | REDIS_URL | process.env.REDIS_URL ?? localhost:6379 | ✓ WIRED | |
| package.json check-bundle | check-bundle-size.mjs | same invocation as Dockerfile | ✓ WIRED (override) | 1000 vs 100 |
| test-publish-visible PROD_URL | deployed production URL | operator run after deploy | ✗ PENDING | no deploy exists |
| README ISR section | ADR 0001 | markdown link | ✓ WIRED | |
| contact.ts RATE_LIMITED | ContactForm.tsx friendly message | thrown err.message branch | ⚠️ WIRED-BUT-BROKEN-IN-PROD | React flight redaction — gap #6 |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Deliberate (site)→(admin) import fails the gate | `echo 'import X from "@/app/(admin)/dashboard/page"' \| pnpm exec eslint --stdin --stdin-filename "src/app/(site)/probe-verif.tsx"` | no-restricted-imports ERROR, exit code 1 (re-measured this run) | ✓ PASS |
| Rate-limit + client-ip unit suites | `pnpm exec vitest run src/lib/rate-limit/__tests__/rate-limit.test.ts src/lib/rate-limit/__tests__/client-ip.test.ts` | 2 files / 9 tests passed (this run) | ✓ PASS |
| React flight production redaction (CR-02 mechanism) | grep installed dist for emitErrorChunk | `digest = { digest: digest }` — digest-only error chunk, production build | ✓ MECHANISM CONFIRMED (defect) |
| Runbook env-table completeness (CR-01) | `grep -rn "TRUSTED_PROXY_CIDR" docs/` | 0 matches | ✗ DEFECT CONFIRMED |
| 429 live behavior | not re-run | recorded live PASS 2026-08-26 in 07-06-SUMMARY (needs docker + fresh build); corroborated by unit tests + structural tokens | ? SKIP (recorded evidence stands) |
| Production URL reachable as the app | `curl -s https://anydiscussion.com/` | Cloudflare managed-challenge HTML ("Just a moment..."), not the Next.js app | consistent with gap #1 (no deploy) |

### Probe Execution

Step 7c: SKIPPED — no `scripts/*/tests/probe-*.sh` declared by any Phase 7 plan and none conventional for this repo.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|---------------------|----------|----------|
| PERF-01 | 07-05 | Lighthouse / CWV meets the bar | ? PARTIAL — live run owner-deferred | config/tooling VERIFIED (truth 1); no production URL to audit |
| PERF-02 | 07-01 | Bundle-budget check, no editor JS in public chunk | ✓ SATISFIED (documented deviation) | both gates wired + behaviorally proven (truths 3, 4); 100KB→1000KB operator-approved override |
| PERF-03 | 07-03 | revalidation audit + publish→visible | ✓ SATISFIED (repo leg); live leg deferred | audit complete + code fixes verified incl. WR-04 literal assertions (truths 5, 6); live run gap #3 |
| PERF-04 | 07-02, 07-06 | Rate limiting on auth endpoints | ✓ SATISFIED | config + storage + unit tests VERIFIED (truth 8); CR-01 IP-trust fixed in code (truth 10); live 429 PASS (truth 9). Adjacent advisory: contact-form client UX contract broken in prod (gap #6 — contact is not an auth endpoint, PERF-04's literal scope holds) |
| PERF-06 | 07-04, 07-06 | Staging deployment on Coolify | ✗ PARTIAL — deploy owner-deferred | runbooks + Dockerfile ready (truths 11-15); no deployment (gap #1); runbook env-table gap #5 is repo-fixable NOW |
| ~~PERF-05~~ | — | superseded → Phase 8 | ✓ N/A (deferred) | BACKUP-01..05; Phase 8 verification passed 22/22 |
| ANAL-02 (claimed by 07-04) | 07-04 | Umami as analytics platform | ? PARTIAL — service deploy owner-deferred | REQUIREMENTS maps ANAL-02 to Phase 6 (Complete — injection mechanism); the Umami service itself rides gap #4 |

Orphaned requirements: none — all five Phase 7 IDs (PERF-01..04, 06) are claimed by plans; PERF-05's supersession is explicit in REQUIREMENTS.md.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| docs/operations/coolify-deploy.md | §5 env table | 07-REVIEW CR-01: TRUSTED_PROXY_CIDR absent — by-the-runbook deploy ships the shared-bucket auth lockout | 🛑 Blocker (pre-deploy, repo-fixable) | gap #5 |
| src/actions/contact.ts + src/components/site/ContactForm.tsx + src/actions/users.ts | 96/99; 98-101; 430-487 | 07-REVIEW CR-02: thrown-message contracts redacted in production — mapping dead code, guard messages unreachable | 🛑 Blocker (pre-deploy, repo-fixable) | gap #6 |
| docs/operations/dns-email-deliverability.md | 119, 191, 245 | WR-02: /forget-password 404s (route is /forgot-password) | ⚠️ Warning | verification steps unexecutable as written |
| Dockerfile | 16 | WR-03: header comment says 100KB, RUN uses 1000KB | ⚠️ Warning | operator confusion |
| scripts/test-auth-ratelimit.mjs | 316-323 | WR-04: HTTP-fail branch exits 0 when structural passed — false green | ⚠️ Warning | automation consuming exit code certifies broken limiter |
| src/lib/redis/index.ts | 47-54 | WR-01(review): error listener no-op in production; runbook V5 vacuous | ⚠️ Warning | Redis outages invisible in prod logs |
| 07-REVIEW WR-05..WR-07, IN-01..IN-05 | various | advisory (validation gaps, single-proxy assumption, stale runbook premise, etc.) | ℹ️ Info | recorded in 07-REVIEW.md |

Debt markers (TBD/FIXME/XXX/TODO/HACK/PLACEHOLDER) in all Phase 7 code surfaces: **zero**. All 20 documented commits verified present this run (4ae54d6, 9027cbd, 5d1f1f5, 02d9e68, 83fa175, f7fdf35, b45a468, f2623b5, 86f681c, 563667e, fc3286d, 0d01648, bcc59b9, 0879004, 52951cd, d5758b4, 25aaac0, a8c9cb5, 94591e8, 1c9197c).

### Human Verification Required

(Status is gaps_found, so these are recorded for the eventual close-out / UAT rather than gating a `passed` verdict.)

1. **Live Lighthouse / CWV audit (PERF-01)** — after the owner deploys, run `pnpm lighthouse` against the production URL, then the manual DevTools per-route audit (D-08: home, /blog, /blog/[slug], /archive, /category/[slug], /tag/[slug], /author/[slug], /search, /about, /contact, /terms, /privacy, 404).
   **Expected:** Performance ≥ 0.9, LCP ≤ 2500ms, INP ≤ 200ms, CLS ≤ 0.1 on every audited route.
   **Why human:** requires a live production URL; none exists.
2. **Publish→visible on the real stack (PERF-03)** — publish a test post via the dashboard, run `PROD_URL=<url> TEST_SLUG=<slug> pnpm test:publish-visible`.
   **Expected:** post visible at `/blog/<slug>` within 30s.
   **Why human:** requires the deployed stack.
3. **Proxy IP-trust verification through the real proxy** — after setting TRUSTED_PROXY_CIDR at deploy (gap #5 fix), `curl -H "X-Forwarded-For: 1.2.3.4"` the app and confirm the resolved client IP is the proxy-derived value (the harness's SKIP instructions carry the exact procedure).
   **Expected:** rate buckets stay per-client; auth does not collapse into one shared 3/15-min bucket.
   **Why human:** proxy behavior is environment-specific and unobservable from the repo.
4. **Docker local build dry-run + secret non-leakage (07-04 deferred)** — `docker build -t anydiscussion-test .` then `docker run --rm anydiscussion-test env | grep -E "(DATABASE_URL|RESEND_API_KEY|SECRET)"` (must return empty).
   **Expected:** build passes both gates; runner image env-grep empty.
   **Why human:** requires Docker daemon + build-time DATABASE_URL.

### Gaps Summary

The phase's repo-side contract is delivered and re-proven: bundle gates exist and behave correctly (the deliberate-import gate failed lint with exit 1 — re-verified this run), rate limiting is fully wired to self-hosted Redis with the CR-01 IP-trust fix in place (trustedProxies from TRUSTED_PROXY_CIDR + shared last-hop XFF keying; 9/9 unit tests today; recorded live 429 PASS), the revalidation audit is complete and its code fixes are source-verified, Lighthouse config is INP-correct, and the ISR cliff is documented in ADR + README.

What is NOT achieved is the goal's head — "ships on the real self-hosted stack ... verified in production-like conditions": there is no deployment (owner-deferred 2026-07-29 to a post-app-completion manual-deploy review; re-confirmed this run — the production domain serves a Cloudflare challenge page, not the app), hence no live CWV numbers, no live publish→visible run, no Umami, and no formal DKIM/SPF/DMARC publication (though real-inbox deliverability was substantively proven by 02-UAT on 2026-08-24). These four remain owner-deferred gaps, not executor failures.

New since the previous verification: the phase code review (07-REVIEW.md, committed as 1c9197c) found two repo-fixable criticals, both independently confirmed by this verifier — (5) the production runbook's runtime env table omits TRUSTED_PROXY_CIDR, so a by-the-runbook deploy would reintroduce the exact global auth-lockout regression 07-06 fixed (grep docs/: zero matches); (6) the RATE_LIMITED thrown-error contract (contact form) and the users.ts guard messages cannot reach the client in production — React's flight serializer emits digest-only error chunks (verified in the installed dist) — so ContactForm's friendly mapping is dead code in prod. Both are small, repo-fixable, and structured in the frontmatter for `/gsd-plan-phase --gaps`; advisory warnings (wrong /forget-password URL in the DNS runbook, stale Dockerfile:16 header, harness false-green exit branch, prod-invisible Redis error listener, etc.) are recorded in 07-REVIEW.md and the table above.

Two operator-approved fc3286d deviations (builder-stage DATABASE_URL ARG; 1000KB total bundle budget) fail their plan-literal must-haves while preserving intent — formally accepted as overrides on 2026-08-26 and carried forward unchanged (frontmatter).

---

_Verified: 2026-08-26T17:55:00Z_
_Verifier: Claude (gsd-verifier)_
