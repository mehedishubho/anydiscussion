---
phase: 07-performance-deploy
verified: 2026-08-27T04:55:00Z
status: gaps_found
score: 14/18 must-haves verified
behavior_unverified: 0 # truths present + wired whose runtime behavior no test exercises
overrides_applied: 2
# Both fc3286d operator-approved deviations were ACCEPTED by the owner at the
# escalation gate on 2026-08-26 — carried forward unchanged through the
# 2026-08-26 re-verification and THIS round. Both deviations still present in
# the repo (re-confirmed this run: Dockerfile:71 ARG DATABASE_URL builder
# stage; --max-gz-kb=1000 at Dockerfile:95 + Dockerfile:16 header now aligned).
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
  # Owner's binding note (2026-07-29, project memory: deploy-approach-manual-no-docker-prod):
  # "for deployment, do not make any docker system now, milestone 1 does not need this currently"
  - truth: "The app deploys to staging/production on Coolify via git-push with managed SSL (SC#5 / PERF-06)"
    status: partial
    reason: "Owner decision 2026-07-29 (project memory: deploy-approach-manual-no-docker-prod): 'for deployment, do not make any docker system now, milestone 1 does not need this currently' — production deploy is MANUAL, Docker is local-dev only, deploy system reviewed post-app-completion. No live deployment exists (re-confirmed this run: https://anydiscussion.com/ returns HTTP 403 with a Cloudflare managed-challenge page, not the app). Not repo-fixable; awaits the owner's deploy review. The runbook now carries a SUPERSEDED banner stating this explicitly (coolify-deploy.md:3-9, WR-07 fix landed)."
    artifacts:
      - path: "docs/operations/coolify-deploy.md"
        issue: "SUPERSEDED banner marks the git-push flow as local-dev dry-run material pending the owner's manual-flow revision at the deploy review"
    missing:
      - "Revise coolify-deploy.md (+ umami-deploy.md service sections) for the manual VPS flow when deploy is revisited"
      - "Execute the deploy: runtime env injection (incl. TRUSTED_PROXY_CIDR — now documented at section 5 row 208), Redis service, smoke test, PROD_URL publish-visible run"
  - truth: "Public-site pages pass the Lighthouse / Core Web Vitals bar on the real Coolify + Cloudflare stack (SC#1 live leg)"
    status: partial
    reason: "Unfulfillable today — no live production URL exists (deploy owner-deferred). Config + tooling are complete and verified in-repo (re-confirmed this run: lighthouserc.json has interaction-to-next-paint=1 occurrence, max-potential-fid=0 occurrences; @lhci/cli installed; pnpm lighthouse wired). 07-05 Task 2 recorded status: partial for the same reason."
    missing:
      - "Run `pnpm lighthouse` + the manual DevTools per-route audit (D-08) once the production URL is live"
  - truth: "A published post is visible to readers within 30s on the real stack — publish→visible verified end-to-end (SC#3 live leg)"
    status: partial
    reason: "Unfulfillable today — no live production URL. The verification instrument exists and is verified in-repo (scripts/test-publish-visible.mjs, 129 lines, DEADLINE_MS = 30_000 at line 25, poller, SKIP on unreachable + pnpm test:publish-visible). The audit leg of SC#3 IS verified (see truths table)."
    missing:
      - "Run PROD_URL=<url> TEST_SLUG=<slug> pnpm test:publish-visible after the operator publishes a test post, at the deploy review"
  - truth: "Umami deployed on Coolify + DKIM/SPF/DMARC DNS records published + DMARC tightened p=none→p=quarantine + documented real-inbox capture (07-04 Tasks 2-3)"
    status: partial
    reason: "Owner-deferred with the deploy (2026-07-29). Substantive deliverability already proven: 02-UAT.md (2026-08-24) records AUTH-06 and AUTH-07 real-inbox round-trips PASS (both email types landed in a real inbox, browser-verified end-to-end). What remains deferred rides with the production mail-domain setup at the deploy review."
    missing:
      - "Publish DKIM CNAME + SPF TXT + DMARC TXT (templates ready in docs/operations/dns-email-deliverability.md — /forgot-password URLs corrected this round)"
      - "Deploy Umami, force the default-password change, wire the script URL in /dashboard/settings/seo"
deferred: # Step 9b — items addressed by a LATER milestone phase
  - truth: "PERF-05: Postgres backups scheduled"
    addressed_in: "Phase 8 (Backup & Disaster Recovery)"
    evidence: "REQUIREMENTS.md: PERF-05 SUPERSEDED — replaced by BACKUP-01..05 (Phase 8); Phase 8 verification passed 2026-07-30 (22/22)"
behavior_unverified_items: [] # all behavior-dependent truths have passing behavioral evidence (lint gate exit-1 re-probed this run; 21/21 rate-limit/client-ip/contact unit tests today; 429 live harness PASS recorded 2026-08-26)
re_verification:
  previous_status: gaps_found
  previous_score: 12/16
  gaps_closed:
    - "Gap #5 (07-REVIEW CR-01, repo-fixable): coolify-deploy.md now documents TRUSTED_PROXY_CIDR (section 5 row, line 208) + TRUSTED_XFF_HOP_COUNT (line 209) with both failure modes and the post-deploy through-the-proxy curl verification, plus the shared-bucket-lockout troubleshooting entry (lines 392-399) — fixed by 07-07 Task 4 (commit f5db63c)"
    - "Gap #6 (07-REVIEW CR-02, repo-fixable): submitContact returns { ok: true } | { ok: false, error: RATE_LIMITED | INVALID_INPUT } (contact.ts:72-141, returned at :80/:113/:116); ContactForm branches on the returned state (:93-112) with a transport-only catch (:113-122, zero err.message inspection); deleteUser attaches stable digests to all five guards (users.ts:478/:489/:501/:515/:535 via deleteUserGuardError :423-427) mapped client-side by USER_DELETE_ERROR_MESSAGES (users-schema.ts) through deleteErrorCopy (UsersTable.tsx:107-115, wired :380) — fixed by 07-07 Task 1 (commits 6211be6 RED / 22c5b57 GREEN)"
  gaps_remaining:
    - "Deploy on Coolify (SC#5 / PERF-06) — owner-deferred"
    - "Lighthouse live run (SC#1 live leg) — owner-deferred"
    - "Publish→visible live run (SC#3 live leg) — owner-deferred"
    - "Umami + DKIM/SPF/DMARC publication (07-04 Tasks 2-3) — owner-deferred"
  new_gaps: [] # the fresh 07-REVIEW.md re-review (commit e13ee12) surfaced 1 new critical + 2 warnings — all three classified OUTSIDE Phase 7's must-haves/requirement IDs (adjacent debt / remediation-residual warning); see "New Review Findings Classification" — none is a Phase 7 truth failure
  regressions: [] # all previously-verified truths re-confirmed this run (lint gate behaviorally re-probed exit 1; 21/21 unit tests; 65 revalidation calls re-counted; lighthouserc INP re-grepped; Dockerfile/ADR/README/runbooks re-read); all 8 documented 07-07 commits + e13ee12 present on main
---

# Phase 7: Performance & Deploy — Verification Report

**Phase Goal:** The blog ships on the real self-hosted stack (Coolify + Postgres + Cloudflare) meeting the non-negotiable performance/SEO bar, with the publish→visible loop, bundle isolation, and auth rate limiting verified in production-like conditions. (Backups moved to Phase 8.)
**Verified:** 2026-08-27T04:55:00Z
**Status:** gaps_found
**Re-verification:** Yes — second gap-closure round (prior report 2026-08-26T17:55:00Z, 12/16). Both repo-fixable gaps (#5 CR-01 runbook, #6 CR-02 error contracts) are now CLOSED and verified against code, tests, and commits. The four owner-deferred live-stack gaps remain open (production URL re-confirmed this run: HTTP 403 Cloudflare managed-challenge page — no deployment exists).

**Mode note:** ROADMAP marks this phase `mode: mvp`, but the goal is not in user-story format, so the MVP user-flow framing does not fire — consistent with phases 01–06 and 08; standard goal-backward verification applied.

## Goal Achievement

The phase's **repo-side contract is now fully delivered, including the round-2 gap closures**: both 07-REVIEW criticals fixed with tests (returned-state contact contract + digest-mapped deleteUser guards; runbook IP-trust activation), all seven warning legs landed (WR-01..07 — re-verified this run in code: unconditional `log.error` at redis/index.ts:49-59, unconditional harness `exitCode = 1` at test-auth-ratelimit.mjs:322-335, corrected `hops[len − hopCount]` selection with last-entry fallback at rate-limit/index.ts:91-107, Zod gates in taxonomy/users, SUPERSEDED banner, /forgot-password URLs, Dockerfile header aligned to 1000). What remains unmet is exclusively the goal's **live-stack head** — "ships on the real self-hosted stack … verified in production-like conditions" — which is owner-deferred by the binding 2026-07-29 decision ("for deployment, do not make any docker system now, milestone 1 does not need this currently"), not by executor omission.

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | lighthouserc.json + @lhci/cli + `pnpm lighthouse` with INP-correct thresholds (SC#1 config leg) | ✓ VERIFIED | Re-grepped this run: `interaction-to-next-paint` present, `max-potential-fid` 0 occurrences; package.json scripts wired; .gitignore excludes .lighthouseci |
| 2 | Public-site pages pass Lighthouse/CWV bar on the real Coolify+Cloudflare stack (SC#1 live leg) | ? UNCERTAIN | No production URL exists (owner-deferred deploy; URL re-confirmed serving Cloudflare challenge, 403). Unfulfillable today — gap #1 in frontmatter |
| 3 | A deliberate cross-group import fails the pre-production gate (SC#2) | ✓ VERIFIED | Re-probed behaviorally this run: `(site)`→`@/app/(admin)/dashboard/page` stdin import via eslint → `no-restricted-imports` ERROR, **exit code 1** (measured without pipe masking); rule at eslint.config.mjs; wired as Dockerfile GATE 1 before `pnpm build` |
| 4 | Bundle-budget check proves no TailAdmin/Tiptap leak into the public chunk (SC#2, D-14 100KB literal) | ✓ VERIFIED (override) | Override ACCEPTED 2026-08-26 by owner (carried forward) — 1000KB total budget; GATE 1 is the precise leak guard. Dockerfile:95 RUN + Dockerfile:16 header + package.json all say 1000 (header now aligned — WR-03 fixed) |
| 5 | Every mutating action classified HAS/MISSING/N/A in the audit — zero blank rows (SC#3 audit leg) | ✓ VERIFIED | 07-REVALIDATION-AUDIT.md re-checked: 41 classification markers, full action coverage across posts/settings/storage/categories/tags/pages/users/media/contact + per-route cache-strategy matrix |
| 6 | categories/tags/pages/users actions revalidate public routes — mechanism-matched, concrete literals, 2-arg tag, after gate + DB write (SC#3 fix leg) | ✓ VERIFIED | Re-counted this run: 65 revalidatePath/revalidateTag calls (categories 25, tags 21, pages 12, users 7); 2-arg `revalidateTag(tag, "max")` form confirmed; literal-path assertions pinned by the WR-04 tests (07-06) |
| 7 | Published post visible within 30s on the real stack (SC#3 live leg) | ? UNCERTAIN | No production URL. Instrument re-verified: scripts/test-publish-visible.mjs (129 lines, `DEADLINE_MS = 30_000` at line 25) + `pnpm test:publish-visible` — gap #3 in frontmatter |
| 8 | Auth endpoints rate-limited — Better Auth 3/900s on all 4 endpoints + Redis customStorage + Contact limiter (SC#4 config leg) | ✓ VERIFIED | Re-read this run: auth/index.ts:108-112 `customRules` ×4 at `{window:900, max:3}`; customStorage via redisClient with `ratelimit:` prefix; contact limiter wired; docker-compose redis service; .env.example REDIS_URL |
| 9 | 4th sign-in within 15 min → HTTP 429 + X-Retry-After; window reset succeeds (SC#4 behavior leg) | ✓ VERIFIED | Recorded live harness run 2026-08-26 (07-06 Task 3, verbatim in 07-06-SUMMARY.md): attempts 1-3 non-429, attempt 4 HTTP 429 with X-Retry-After=900, exit 0. Not re-executed this run (requires docker + fresh build); corroborated today by 21/21 unit tests incl. the harness-pinned structural tokens. Window-reset leg covered by documented Redis TTL semantics |
| 10 | Rate limits key per-client-IP behind the production proxy (IP-trust soundness) | ✓ VERIFIED | Re-read this run: trustedProxies from TRUSTED_PROXY_CIDR (auth/index.ts:170) + getClientIpFromXff with corrected `hops[len − hopCount]` selection, min-clamp 1, last-entry fallback for short chains (rate-limit/index.ts:91-107) — 10 client-ip tests re-run today, passing. **The runbook activation leg (former gap #5) is now closed**: coolify-deploy.md:208-209 documents both env vars with failure modes + post-deploy verification |
| 11 | App deploys to staging/production on Coolify via git-push with managed SSL (SC#5 / PERF-06) | ✗ FAILED | No deployment exists. Re-confirmed this run: https://anydiscussion.com/ returns HTTP 403 Cloudflare managed-challenge page. Owner decision 2026-07-29 — gap #1 in frontmatter |
| 12 | Build-vs-runtime env secrets correctly separated (SC#5) | ✓ VERIFIED | Re-read this run: runner stage fresh `FROM node:20-alpine` (Dockerfile:99), only non-secret ENV lines; builder-only ARG DATABASE_URL (Dockerfile:71) covered by the carried override |
| 13 | No runtime secret in ANY ARG/ENV line — only NEXT_PUBLIC_* baked (07-01 D-21 literal) | ✓ VERIFIED (override) | Override ACCEPTED 2026-08-26 by owner (carried forward) — builder-stage-only ARG DATABASE_URL; runner image secret-free (truth 12) |
| 14 | Single-instance ISR scaling cliff documented for v2 (SC#5 doc leg) | ✓ VERIFIED | Re-confirmed: docs/adr/0001-isr-single-instance-scaling.md (113 lines) + README.md:95 ISR Scaling section linking the ADR |
| 15 | Operator runbooks (coolify/umami/dns) with Prerequisites/Steps/Verification/Rollback | ✓ VERIFIED | Re-confirmed: 3 files (403/250/209 lines). **The CR-01 caveat is REMOVED** — the env table now includes TRUSTED_PROXY_CIDR + TRUSTED_XFF_HOP_COUNT, the shared-bucket troubleshooting entry exists (392-399), the SUPERSEDED banner states the owner's manual-deploy decision (3-9), and all page-route URLs read /forgot-password (only the legitimate /api/auth/forget-password endpoint distinction remains, dns runbook:246) |
| 16 | Umami deployed + DKIM/SPF/DMARC published + real-inbox test (07-04 Tasks 2-3) | ✗ FAILED | Owner-deferred with the deploy. Substantive inbox proof: 02-UAT.md (2026-08-24) AUTH-06 + AUTH-07 real-inbox round-trips PASS — gap #4 in frontmatter |
| 17 | The defined RATE_LIMITED public contract actually reaches the client in production builds (former gap #6) | ✓ VERIFIED | Fixed by 07-07 Task 1: submitContact RETURNS `{ ok: false, error: "RATE_LIMITED" \| "INVALID_INPUT" }` (contact.ts:80, :113, :116 — returned values always survive flight serialization, unlike thrown .message); ContactForm branches on the returned state (:109) with zero err.message inspection; 6-test contact suite re-run today passing (INVALID_INPUT, honeypot, limiter-rejection, Redis-outage fail-closed, success, fallback recipient) |
| 18 | A by-the-runbook production deploy activates the 07-06 IP-trust mitigation — TRUSTED_PROXY_CIDR documented in the deploy runbook's runtime env table (former gap #5) | ✓ VERIFIED | Fixed by 07-07 Task 4 (commit f5db63c): coolify-deploy.md:208 TRUSTED_PROXY_CIDR row (REQUIRED-for-production, both failure modes, through-the-proxy curl verification pointer) + :209 TRUSTED_XFF_HOP_COUNT row + :392-399 shared-bucket-lockout troubleshooting entry cross-referenced from the Redis auth-fails-closed entry |

**Score:** 14/18 truths verified (2 uncertain + 2 failed — all four owner-deferred live-stack legs; 2 of the 14 verified are owner-accepted overrides). Gaps #5 and #6 from the prior report both closed this round; no truth regressed.

### New Review Findings Classification (fresh 07-REVIEW.md, commit e13ee12)

The re-review verified all nine prior findings landed correctly (this verifier independently re-confirmed CR-01, CR-02, WR-01..07 fixes in code — see truths 17, 18 and the warning table) and surfaced 1 new critical + 2 new warnings. Requested classification — do they fall inside Phase 7's must-haves/requirement IDs?

| Finding | This verifier's independent evidence | Phase 7 scope? | Classification |
|---|---|---|---|
| **CR (new): `upsertSetting` insert fallback provably dead — `saveNewsletterSettings` silently persists nothing on unseeded envs** (newsletter.ts:66-77) | Mechanism independently confirmed this run: (a) installed drizzle-orm node-postgres `NodePgPreparedQuery.execute()` returns the **raw pg QueryResult** when `!fields && !customResultMapper` (node-postgres/session.js:104-117) and update.js `_prepare()` passes `config.returning` (undefined, no `.returning()` call) as fields — a QueryResult is always truthy and never an array, so `Array.isArray(updated) && updated.length === 0` never fires; (b) grep across `src/lib/storage/seed.ts`, `scripts/`, `db/` finds ZERO inserts for any `newsletter.*` settings key; (c) identical dead condition at settings.ts:73 and storage-settings.ts:90 (masked there only by seed pre-creation); (d) the correct `onConflictDoUpdate` idiom already exists in the same file (subscribeNewsletter, :215). Introduced by commit **9d057f7, 2026-08-24, workflow `260824-3l2` (D-02)** — BEFORE Phase 7's round-2 work; no Phase 7 plan created or touched this function | **NO** — no Phase 7 truth or requirement (PERF-01..04, 06) concerns newsletter settings persistence; Phase 7 touched newsletter.ts only for subscribe rate-limit keying (52951cd), which is unaffected | **Adjacent debt — CONFIRMED CRITICAL data-integrity defect, needs a follow-up fix (all three copies), but NOT a Phase 7 gap.** Prominently flagged below and in Anti-Patterns; recommend `/gsd-quick` or a small fix plan |
| **WR-01 (new): CR-02 remediation stops at deleteUser — ban/unban/revoke (+ UserDrawer edit path) still render React's redaction boilerplate in production** | Confirmed in code: UsersTable.tsx:374-382 alert falls through `banMutation.error?.message \|\| unbanMutation.error?.message \|\| revokeMutation.error?.message` before the digest-mapped delete leg; UserDrawer.tsx:128 `createMutation.error?.message \|\| editMutation.error?.message`; banUser/unbanUser/revokeSessions throw plain errors with no digest (users.ts:161-221); updateUser's INVALID_INPUT throw is likewise displayed via `.message` | **Borderline-NO** — the gap #6 TRUTH (RATE_LIMITED contract) is fully verified; the deleteUser leg is fully verified. The residual is the incomplete tail of gap #6's *fix prescription* ("stop branching on err.message" for updateUser guard failures), made as a documented executor boundary decision (shared getSessionOrThrow/requireCan sentinels), re-flagged warning-level by the re-review ("quality/UX degradation … not a correctness break" — optimistic rollback still correct) | **Warning — remediation-family residual, tracked for follow-up; does not reopen gap #6** |
| **WR-02 (new): `listSubscribers` never validates `page` — NaN propagates to a pg SQL error** | Confirmed in code: newsletter.ts:250-251 `Math.max(1, page)` with no `Number.isFinite` guard; only in-repo caller parses safely (subscribers page.tsx:44-46) | **NO** — function introduced by `260824-3l2` (a0f0e22); not a Phase 7 surface | **Adjacent debt — warning** |

**Honest bottom line on the new critical:** it does not fail any Phase 7 must-have, but it is a real, confirmed, repo-fixable data-loss bug (admin saves silently no-op on unseeded envs while reporting success, and the unit tests mask it via an array-shaped mock the real driver never produces — newsletter.test.ts:180). It should be scheduled for a fix alongside the two sibling copies (settings.ts, storage-settings.ts) using the single-statement `onConflictDoUpdate` upsert. Recorded here so it cannot be silently lost; also flagged for the owner under the follow-up recommendation below.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `Dockerfile` | 3-stage, two gates, non-root runner | ✓ VERIFIED | Gates re-confirmed; header comment now aligned to 1000 (WR-03 fixed); deviations override-accepted (truths 4, 13) |
| `.dockerignore` | excludes dev/planning/test artifacts | ✓ VERIFIED | unchanged from prior verification |
| `scripts/check-bundle-size.mjs` | gzipped-chunk gate, exit 1 over threshold | ✓ VERIFIED | unchanged; runs at 1000KB per override |
| `src/lib/redis/index.ts` | ioredis singleton + production-visible error logging | ✓ VERIFIED | `globalThis.__redisClient ??=`; **WR-01 fixed**: unconditional structured `log.error("redis connection error", …)` (:49-59) |
| `src/lib/rate-limit/upstash-ioredis-adapter.ts` | Ratelimit over ioredis | ✓ VERIFIED | limiters + prefixes + ephemeralCache export (unchanged) |
| `src/lib/rate-limit/index.ts` | re-exports + getClientIpFromXff | ✓ VERIFIED | **WR-06 fixed**: TRUSTED_XFF_HOP_COUNT selection `hops[len − hopCount]`, min-clamp 1, last-entry fallback (:91-107); 10 tests passing |
| `src/lib/auth/index.ts` | rateLimit + advanced.ipAddress blocks | ✓ VERIFIED | truths 8, 10 |
| `src/actions/contact.ts` | returned-state public contract | ✓ VERIFIED | **gap #6 fixed**: `{ ok: true } \| { ok: false, error }` (:72-141); no thrown public-contract errors |
| `src/components/site/ContactForm.tsx` | branches on returned state | ✓ VERIFIED | **gap #6 fixed**: :93-112 returned-state branch; :113-122 transport-only catch, zero message inspection |
| `src/actions/users-schema.ts` | USER_DELETE_DIGESTS + message map (pure sibling) | ✓ VERIFIED | 88 lines; digests + verbatim guard copy keyed by digest |
| `src/actions/users.ts` | deleteUser digest-carrying guards | ✓ VERIFIED | deleteUserGuardError (:423-427); all 5 guards throw digested errors (:478-:535); tests assert digest attachment (users.test.ts:803-959) |
| `src/app/(admin)/dashboard/users/UsersTable.tsx` | digest→copy mapping | ✓ VERIFIED (caveat) | deleteErrorCopy (:107-115) wired at :380; ban/unban/revoke legs still `.message`-branched (WR-01 residual, warning) |
| `src/actions/taxonomy-schema.ts` + `userUpdateSchema` | Zod input gates (WR-05) | ✓ VERIFIED | 76 + 88 lines; safeParse wired in categories.ts/tags.ts/users.ts after gates |
| `scripts/test-auth-ratelimit.mjs` | 4-POST 429 harness, honest exit codes | ✓ VERIFIED | **WR-04 fixed**: unconditional `process.exitCode = 1` on HTTP failure (:322-335) + pid-guarded cleanup |
| `src/lib/rate-limit/__tests__/client-ip.test.ts` | hop-count extraction tests | ✓ VERIFIED | re-run today: passing (10 tests incl. vi.stubEnv hop-count cases) |
| `src/lib/rate-limit/__tests__/rate-limit.test.ts` | truthful adapter tests | ✓ VERIFIED | re-run today: passing |
| `src/actions/__tests__/contact.test.ts` | returned-state contract tests | ✓ VERIFIED | re-run today: 6/6 passing; asserts limiter/sendEmail NEVER called on failure paths |
| `src/actions/pages-schema.ts` / `src/lib/post-render.ts` / `07-REVALIDATION-AUDIT.md` / `src/actions/{categories,tags,pages,users}.ts` / `scripts/test-publish-visible.mjs` / `lighthouserc.json` / ADR / README | prior-round artifacts | ✓ VERIFIED | regression-checked this run (truths 1, 5-7, 14) |
| `docs/operations/{coolify,umami,dns-email-deliverability}.md` | operator runbooks | ✓ VERIFIED | **caveat-free this round**: gap #5 rows + troubleshooting landed, WR-02/07 fixed; the only open item is the owner's manual-flow revision at the deploy review (gap #1) |
| Production deployment on Coolify | the deployed runtime | ✗ MISSING | owner-deferred (gap #1) |
| Umami deployment | running analytics service | ✗ MISSING | owner-deferred (gap #4) |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| Dockerfile GATE 1 | eslint no-restricted-imports | `pnpm lint --max-warnings 0` before build | ✓ WIRED | behavioral exit-1 proof re-run this verification |
| Dockerfile GATE 2 | check-bundle-size.mjs | `--max-gz-kb=1000` | ✓ WIRED (override) | header + RUN aligned at 1000 |
| auth/index.ts customStorage | redis/index.ts redisClient | `ratelimit:` prefix + EX TTL | ✓ WIRED | re-read this run |
| .env.example / runbook TRUSTED_PROXY_CIDR | auth/index.ts trustedProxies | env parse | ✓ WIRED | code leg wired (prior round); **runbook leg NOW WIRED** (coolify-deploy.md:208 — former gap #5 closed) |
| contact.ts + newsletter.ts | getClientIpFromXff | shared last-hop extraction | ✓ WIRED | hop-count selection corrected + tested (10/10) |
| contact.ts returned RATE_LIMITED | ContactForm friendly message | returned-state branch | ✓ WIRED | **former gap #6 closed** — returned values survive production flight serialization; 6-test suite green |
| users.ts guard digests | UsersTable friendly copy | err.digest → USER_DELETE_ERROR_MESSAGES | ✓ WIRED | digest forwarded by production flight serializer; delete leg mapped |
| ban/unban/revoke errors → UsersTable alert | err.message fallback chain | `.message` display | ⚠️ WIRED-BUT-BROKEN-IN-PROD | new WR-01 residual (warning — not a Phase 7 must-have) |
| test-publish-visible PROD_URL | deployed production URL | operator run after deploy | ✗ PENDING | no deploy exists (gap #3) |
| README ISR section | ADR 0001 | markdown link | ✓ WIRED | README.md:95 |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Deliberate (site)→(admin) import fails the gate | eslint stdin probe (exit re-measured without pipe) | no-restricted-imports ERROR, **exit code 1** | ✓ PASS |
| Gap #6 contract tests | `pnpm exec vitest run src/actions/__tests__/contact.test.ts src/lib/rate-limit/__tests__/client-ip.test.ts src/lib/rate-limit/__tests__/rate-limit.test.ts` | 3 files / **21 tests passed** | ✓ PASS |
| Gap #5 runbook rows | `grep -rn "TRUSTED_PROXY_CIDR" docs/` | 2 matches (coolify-deploy.md:208 row + :393 troubleshooting) | ✓ PASS (was 0 — defect closed) |
| Drizzle update return shape (new-CR mechanism) | read installed `node-postgres/session.js:104-117` + `pg-core/query-builders/update.js:190-197` | no-`.returning()` update returns raw pg `QueryResult` (truthy, never an array) — insert fallback unreachable | ✓ MECHANISM CONFIRMED (defect, adjacent debt) |
| Newsletter settings seed existence | `grep -rn "newsletter\." src/lib/storage/seed.ts scripts/ db/` | 0 matches | ✓ CONFIRMS unseeded-env impact |
| 429 live behavior | not re-run (needs docker + fresh build) | recorded live PASS 2026-08-26 (07-06-SUMMARY); corroborated by unit tests | ? SKIP (recorded evidence stands) |
| Production URL reachable as the app | `curl -s https://anydiscussion.com/` | HTTP 403, Cloudflare managed-challenge HTML | consistent with gap #1 (no deploy) |

### Probe Execution

Step 7c: SKIPPED — no `scripts/*/tests/probe-*.sh` declared by any Phase 7 plan and none conventional for this repo.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|---------------------|----------|----------|
| PERF-01 | 07-05 | Lighthouse / CWV meets the bar | ? PARTIAL — live run owner-deferred | config/tooling VERIFIED (truth 1); no production URL to audit (gap #2) |
| PERF-02 | 07-01 | Bundle-budget check, no editor JS in public chunk | ✓ SATISFIED (documented deviation) | both gates wired + behaviorally proven (truths 3, 4); 1000KB operator-approved override |
| PERF-03 | 07-03 | revalidation audit + publish→visible | ✓ SATISFIED (repo leg); live leg deferred | audit complete + code fixes verified (truths 5, 6); live run gap #3 |
| PERF-04 | 07-02, 07-06, 07-07 | Rate limiting on auth endpoints | ✓ SATISFIED | config + storage + unit tests VERIFIED (truth 8); IP-trust fully wired incl. runbook activation (truths 10, 18 — gap #5 closed); live 429 PASS (truth 9); production-safe contact error contract (truth 17 — gap #6 closed). WR-01 residual is dashboard-UX warning-level, outside PERF-04's auth-endpoint scope |
| PERF-06 | 07-04, 07-06, 07-07 | Staging deployment on Coolify | ✗ PARTIAL — deploy owner-deferred | Dockerfile + runbooks complete and reconciled (truths 11-15, 18); no deployment (gap #1) |
| ~~PERF-05~~ | — | superseded → Phase 8 | ✓ N/A (deferred) | BACKUP-01..05; Phase 8 verification passed 22/22 |
| ANAL-02 (claimed by 07-04) | 07-04 | Umami as analytics platform | ? PARTIAL — service deploy owner-deferred | injection mechanism done (Phase 6); the Umami service rides gap #4 |

Orphaned requirements: none — all five Phase 7 IDs (PERF-01..04, 06) are claimed by plans (07-01 through 07-07); PERF-05's supersession is explicit in REQUIREMENTS.md.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| src/actions/newsletter.ts ( + identical copies: src/actions/settings.ts:73, src/actions/storage-settings.ts:90) | 66-77 | **New review CR (adjacent debt)**: dead insert fallback — drizzle node-postgres returns raw pg QueryResult from bare `.update()`, so the `Array.isArray(updated) && updated.length === 0` insert condition never fires; no seed creates `newsletter.*` keys; saveNewsletterSettings silently no-ops on unseeded envs while returning `{ ok: true }`; tests masked by an array-shaped mock (newsletter.test.ts:180) | 🛑 Critical (out-of-phase-scope — introduced by 260824-3l2 commit 9d057f7, 2026-08-24) | needs follow-up fix (all three copies) via `onConflictDoUpdate`; NOT a Phase 7 gap — no PERF-ID/truth covers it |
| src/app/(admin)/dashboard/users/UsersTable.tsx; UserDrawer.tsx | 374-382; 128 | **New review WR-01**: ban/unban/revoke + create/edit error display branches on `.message` — React redaction boilerplate in production alerts (rollback still correct; deleteUser leg fixed) | ⚠️ Warning | gap #6 remediation residual — UX degradation, follow-up |
| src/actions/newsletter.ts | 249-253 | **New review WR-02**: `listSubscribers` page param unvalidated — NaN → pg SQL error (only safe in-repo caller) | ⚠️ Warning | adjacent debt (260824-3l2) |
| 07-REVIEW IN-01..IN-09 | various | advisory (blank contact subject, TOCTOU first-admin, ungated read exports, non-recursive chunk scan, harness port preflight, test-title contradiction, HMR listener re-attach, ungated createUser input, dns runbook sendOnSignUp misattribution) | ℹ️ Info | recorded in 07-REVIEW.md (e13ee12) |
| .env.example | — | TRUSTED_XFF_HOP_COUNT block not added — executor BLOCKED by the owner's Deny Rules (Read `.env.*`); deny also blocks the verifier | ⚠️ Warning (user action) | documented in runbook row :209 + getClientIpFromXff docblock; code defaults to 1 — owner to add the block per 07-07 Deviation 4 |

Debt markers (TBD/FIXME/XXX/TODO/HACK/PLACEHOLDER) across all Phase 7 code/doc surfaces touched this round: **zero**. All 8 documented 07-07 commits (6211be6, 22c5b57, b271420, 2afe0ee, aad4aad, 06bb1de, f5db63c, bd0f3a3) plus the review commit e13ee12 verified present on main.

### Human Verification Required

(Status is gaps_found; these are recorded for the eventual close-out / UAT rather than gating a `passed` verdict.)

1. **Live Lighthouse / CWV audit (PERF-01)** — after the owner deploys, run `pnpm lighthouse` against the production URL, then the manual DevTools per-route audit (D-08).
   **Expected:** Performance ≥ 0.9, LCP ≤ 2500ms, INP ≤ 200ms, CLS ≤ 0.1 on every audited route.
   **Why human:** requires a live production URL; none exists (re-confirmed: 403 challenge page).
2. **Publish→visible on the real stack (PERF-03)** — publish a test post via the dashboard, run `PROD_URL=<url> TEST_SLUG=<slug> pnpm test:publish-visible`.
   **Expected:** post visible at `/blog/<slug>` within 30s.
   **Why human:** requires the deployed stack.
3. **Proxy IP-trust verification through the real proxy** — set TRUSTED_PROXY_CIDR at deploy (runbook row :208), then `curl -H "X-Forwarded-For: 1.2.3.4"` the app and confirm the resolved client IP is the proxy-derived value (exact procedure in the harness's SKIP instructions).
   **Expected:** rate buckets stay per-client; no shared 3/15-min auth bucket.
   **Why human:** proxy behavior is environment-specific and unobservable from the repo.
4. **Owner decision — schedule the adjacent-debt fix** — the confirmed upsertSetting critical (newsletter/settings/storage-settings) is repo-fixable but outside Phase 7's scope; recommend a `/gsd-quick`-level fix converting all three copies to `onConflictDoUpdate` + mock-chain test updates.
   **Expected:** first save of each settings key persists on an unseeded database.
   **Why human:** scope/prioritization is an owner call; the defect predates Phase 7.
5. **Owner action — .env.example TRUSTED_XFF_HOP_COUNT block** (07-07 Deviation 4) — add the documented block after the `TRUSTED_PROXY_CIDR=` line (wording provided in 07-07-SUMMARY).
   **Expected:** example file documents both IP-trust vars.
   **Why human:** the Deny Rules block agent writes to `.env.*` by design.
6. **Docker local build dry-run + secret non-leakage (07-04 deferred)** — `docker build` then env-grep the runner image (must return empty for secrets).
   **Expected:** build passes both gates; runner image secret-free.
   **Why human:** requires Docker daemon + build-time DATABASE_URL.

### Gaps Summary

Both repo-fixable gaps from the prior report are CLOSED and verified against code, tests, and git history: (5) the deploy runbook now documents TRUSTED_PROXY_CIDR/TRUSTED_XFF_HOP_COUNT with failure modes, a post-deploy verification pointer, and a shared-bucket-lockout troubleshooting entry (coolify-deploy.md:208-209, 392-399 — commit f5db63c); (6) the public error contracts are now production-flight-safe — submitContact returns states that ContactForm branches on, and deleteUser's five guards carry stable digests mapped to friendly copy client-side (commits 6211be6/22c5b57), with 21/21 relevant unit tests passing today. All seven warning fixes from the round-2 review were independently re-confirmed in code (WR-01..07).

What remains open is exactly the four owner-deferred live-stack legs (deploy, live Lighthouse, live publish→visible, Umami + DNS publication), held open by the owner's binding 2026-07-29 decision — "for deployment, do not make any docker system now, milestone 1 does not need this currently" — with the production domain re-confirmed this run to still serve a Cloudflare challenge page rather than the app. Their repo-side legs (Dockerfile, runbooks with SUPERSEDED banner, Lighthouse config, 30s publish-visible instrument, DNS templates) are all in place and verified.

New this round: the fresh re-review's one critical (dead upsertSetting insert fallback) and two warnings were independently confirmed by this verifier and classified — honestly — as **adjacent debt outside Phase 7's must-haves** (the critical was introduced by the 260824-3l2 newsletter workflow on 2026-08-24; Phase 7 never touched that function) and a **remediation-family residual warning** (ban/unban/revoke + edit-path error copy still `.message`-branched; rollback unaffected). None reopens a Phase 7 truth, but the upsertSetting critical is a real data-integrity bug that should be scheduled for a follow-up fix covering all three copies — flagged for the owner above rather than silently absorbed.

Two operator-approved fc3286d deviations (builder-stage DATABASE_URL ARG; 1000KB total bundle budget) remain override-accepted and are carried forward unchanged.

---

_Verified: 2026-08-27T04:55:00Z_
_Verifier: Claude (gsd-verifier)_
