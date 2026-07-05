---
phase: 4
slug: dashboard-chrome
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-07-05
---

# Phase 4 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.1.9 + @testing-library/react 16.3.2 |
| **Config file** | `vitest.config.ts` (repo root, existing) |
| **Quick run command** | `pnpm test` |
| **Full suite command** | `pnpm test && pnpm test:migrations && pnpm test:auth-gate` |
| **Estimated runtime** | ~45 seconds |

---

## Sampling Rate

- **After every task commit:** Run `pnpm test`
- **After every plan wave:** Run `pnpm test && pnpm test:migrations && pnpm test:auth-gate`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 45 seconds

---

## Per-Task Verification Map

> Populated by the planner with concrete task IDs. Seed validation points (from RESEARCH.md `## Validation Architecture`) that MUST land on at least one task each:

| Validation Point | Requirement | Threat Ref | Secure Behavior | Test Type | Seed Command |
|------------------|-------------|------------|-----------------|-----------|--------------|
| Auth gate still blocks `/dashboard/*` after folder move | DASH-07 | T-4-route | Unauth → signin, role-filtered access | integration | `pnpm test:auth-gate` |
| Permission re-check on Storage Settings save | DASH-09 | T-4-rbac | Non-admin save rejected server-side | unit | `pnpm test` |
| Permission re-check on user create/disable/role | DASH-04 | T-4-rbac | Non-admin user mutation rejected | unit | `pnpm test` |
| Encryption round-trip (encrypt → decrypt → original) | DASH-09 | T-4-cred | AES-256-GCM envelope reversible | unit | `pnpm test` |
| Credentials redacted on read (never client-bound) | DASH-09 | T-4-cred | `redactCredentials()` strips secrets | unit | `pnpm test` |
| Unknown provider falls back to local (default-safe) | DASH-09 | T-4-prov | Bad `active_provider` → local | unit | `pnpm test` |
| Cloudinary/push-CDN providers implement StorageProvider | DASH-09 | T-4-prov | Interface conformance | unit | `pnpm test` |
| Pages seed (T&C / Privacy / Contact) at migration | DASH-05 | — | Three rows exist post-migrate | integration | `pnpm test:migrations` |
| RHF + Zod schema shared client/server (parse equivalence) | DASH-06 | — | Same schema rejects/accepts identically | unit | `pnpm test` |
| QueryClient scoped to `(admin)` only — no `(site)` import | DASH-06/PERF-02 | T-4-bundle | ESLint `no-restricted-imports` holds | lint | `pnpm lint` |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

*Existing infrastructure covers the phase requirements.* vitest + @testing-library/react are installed and configured from prior phases. No new test framework install needed in Wave 0. If the Cloudinary provider introduces SDK-mock needs, the relevant task adds the mock inline (no global Wave 0 stub required).

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Dark mode coverage on new pages | DASH-08 | Visual coverage across many new surfaces | Toggle dark mode on each new dashboard page; confirm no light-only fragments |
| Media picker drag-drop + progress UX | DASH-03 | Perceptual upload-progress + drag-drop feel | Upload 3 files via drag-drop; observe per-file progress + alt-text prompt |
| `<MediaPicker>` "paste external URL" tab | DASH-03 | Cross-component interaction (post feature-image, editor image, avatar) | Open picker in each of the 3 consumers; paste an external URL; confirm selection lands |
| "Test connection" inline feedback per provider | DASH-09 | Live external probe against user-entered creds | Enter bad creds → failure feedback; good creds → success before Save |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 45s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
