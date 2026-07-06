---
phase: 5
slug: seo-basics
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-07-07
---

# Phase 5 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
>
> **Source:** `05-RESEARCH.md` → `## Validation Architecture` enumerates 15 unit-test
> mappings (all Wave 0 gaps) and a success-criterion-to-validation-trace table.
> The planner lifts those mappings into the Per-Task Verification Map below.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | {planner: fill from project state — likely vitest or jest; confirm against installed deps} |
| **Config file** | {path or "none — Wave 0 installs"} |
| **Quick run command** | `{pnpm test --filter quick / equivalent}` |
| **Full suite command** | `{pnpm test / pnpm test:ci}` |
| **Estimated runtime** | ~{N} seconds |

---

## Sampling Rate

- **After every task commit:** Run `{quick run command}`
- **After every plan wave:** Run `{full suite command}`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** {N} seconds

---

## Per-Task Verification Map

> Lift from `05-RESEARCH.md` → `## Validation Architecture` (15 unit-test mappings + the
> 5-success-criterion trace table). Each plan task must map to one row below.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| {planner: one row per task} | | | SEO-01..SEO-08 | — | | unit | `{command}` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

> Populate from RESEARCH.md Validation Architecture "Wave 0 gaps" list.

- [ ] `{test stubs for SEO-01..SEO-08}` — stubs/assertions for each metadata route
- [ ] `{shared fixtures}` — published-post + post_seo + settings fixtures
- [ ] `{framework install}` — if no framework detected

*If none: "Existing infrastructure covers all phase requirements."*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| {behavior} | REQ-{XX} | {reason} | {steps} |

*If none: "All phase behaviors have automated verification."*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < {N}s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
