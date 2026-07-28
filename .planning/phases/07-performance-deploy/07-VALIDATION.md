---
phase: 07
slug: performance-deploy
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-07-28
---

# Phase 07 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution. Lifted from `07-RESEARCH.md` § Validation Architecture. Task IDs / Plan / Wave columns are finalized once PLAN.md files exist.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.9 (existing) + Node scripts (`scripts/*.mjs`) for end-to-end checks |
| **Config file** | `vitest.config.ts` (existing); new scripts under `scripts/` |
| **Quick run command** | `pnpm test` |
| **Full suite command** | `pnpm test && pnpm test:migrations && pnpm test:auth-gate && node scripts/check-bundle-size.mjs` |
| **Estimated runtime** | ~30s quick; ~2min full suite; Docker build + Lighthouse = phase gate only |

---

## Sampling Rate

- **After every task commit:** Run `pnpm test` (Vitest unit tests; < 30s)
- **After every plan wave:** Run `pnpm test && pnpm test:migrations && node scripts/check-bundle-size.mjs` (< 2 min)
- **Before `/gsd-verify-work`:** Full local Docker build + Lighthouse CI run + publish→visible script against the deployed prod URL — full suite must be green
- **Max feedback latency:** 30 seconds (per-task); 2 minutes (per-wave)

---

## Per-Task Verification Map

> Task ID / Plan / Wave filled when PLAN.md files exist. The secure-behavior + automated-command cells are the binding contract.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| TBD | TBD | 1 | PERF-02 (gate 1) | T-rate-bypass / — | A deliberate cross-group import `(site)→(admin)` fails `pnpm lint --max-warnings 0` | unit (planted import, mirrors `scripts/verify.mjs`) | `pnpm lint` after temporarily adding `import "@/app/(admin)/x"` to a `(site)` file | ✅ pattern in `scripts/verify.mjs` | ⬜ pending |
| TBD | TBD | 1 | PERF-02 (gate 2) | — | Public gzipped chunk < 100KB; gate fails build when exceeded | unit (planted oversized chunk) | `node scripts/check-bundle-size.mjs --max-gz-kb 100` | ❌ W0 (`scripts/check-bundle-size.mjs`) | ⬜ pending |
| TBD | TBD | 2 | PERF-04 (enforce) | T-bruteforce / T-enumeration | 4th sign-in attempt within 15 min returns HTTP 429 + `X-Retry-After`; 4th after 15 min succeeds | integration (auth route + Redis) | `pnpm test -- src/lib/auth/__tests__/rate-limit.test.ts` (or `node scripts/test-auth-ratelimit.mjs`) | ❌ W0 | ⬜ pending |
| TBD | TBD | 2 | PERF-04 (failover) | — | Redis DOWN → chosen behavior (fail-open OR fail-closed) holds; documented | integration (Redis stopped mid-test) | same as above with Redis stopped | ❌ W0 | ⬜ pending |
| TBD | TBD | 3 | PERF-03 (publish→visible) | — | After `publishPost`, public URL reflects new content within 30s on real stack | scripted | `node scripts/test-publish-visible.mjs` | ❌ W0 (`scripts/test-publish-visible.mjs`) | ⬜ pending |
| TBD | TBD | 4 | PERF-06 (build) | — | Multi-stage Docker build succeeds; standalone runtime serves a request | integration | `docker build -t anydiscussion-test . && docker run -p 3000:3000 anydiscussion-test` | ❌ W0 (`Dockerfile`) | ⬜ pending |
| TBD | TBD | 4 | PERF-06 (secret non-leakage) | T-secret-leak | `docker run --rm <image> env \| grep -E "(DATABASE_URL\|RESEND_API_KEY\|SECRET)"` returns empty (only `NEXT_PUBLIC_*` present) | integration | command above | ❌ W0 | ⬜ pending |
| TBD | TBD | 2 | ANAL-02 | T-default-creds | Umami container boots, accepts login (default admin/umami changed immediately), script URL configurable in settings | integration | `docker compose up -d umami && curl http://localhost:3001/api/health` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `lighthouserc.json` — covers PERF-01 thresholds (Lighthouse 90+; CWV 'Good': LCP≤2.5s, **INP≤200ms**, CLS≤0.1)
- [ ] `scripts/check-bundle-size.mjs` — covers PERF-02 gate 2 (public gzipped chunk < 100KB)
- [ ] `scripts/test-publish-visible.mjs` — covers PERF-03 publish→visible (within 30s on real stack)
- [ ] `src/lib/auth/__tests__/rate-limit.test.ts` (or `scripts/test-auth-ratelimit.mjs`) — covers PERF-04 enforcement + fail-open/closed behavior
- [ ] `Dockerfile` + `.dockerignore` — covers PERF-06 (standalone multi-stage build)
- [ ] `docker-compose.yml` Redis service extension — covers PERF-04 backing store (dev/prod parity)
- [ ] Revalidation audit markdown deliverable — covers PERF-03 audit (every mutating action classified HAS / MISSING / N/A)
- [ ] ISR scaling ADR + README section — covers D-28/D-29 (single-instance cliff + v2 `cacheHandler` path)

*No framework install gap — Vitest 4.1.9 is already configured.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Public pages pass Lighthouse / CWV on real Coolify + Cloudflare stack | PERF-01 | Requires the deployed prod URL + real CDN/server latency; synthetic LHCI is automated but the *real-stack* bar is a manual DevTools audit | Open each `(site)` route (home, /blog, /blog/[slug], archive, category, tag, author, search, about, contact, terms, privacy, 404) in Chrome DevTools Lighthouse; confirm Performance ≥ 90 and 'Good' CWV (LCP≤2.5s, INP≤200ms, CLS≤0.1) |
| Every mutating action's revalidation is documented + classified | PERF-03 (audit) | Human audit of each `src/actions/*.ts` file — judgment required to classify MISSING vs correctly-not-cached | Produce markdown table: action → revalidatePath/revalidateTag calls → Status (HAS / MISSING+fix / N/A+justification); no blank rows |
| Password-reset + email-verification emails land in a real inbox (not spam) | D-33 (AUTH-06/07) | Real-world deliverability depends on DNS propagation + inbox classifier; no automation | After publishing DKIM/SPF/DMARC, trigger password-reset and email-verification; confirm arrival in Gmail/Outlook primary inbox |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s (quick) / 120s (full)
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
