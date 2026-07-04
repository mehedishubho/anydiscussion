---
phase: 3
slug: content-engine
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-07-04
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Sourced from `03-RESEARCH.md` § Validation Architecture. The per-task map is
> requirement-level until the planner emits task IDs; the executor refines the
> Task ID column as it implements each plan.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.9 (already configured — `vitest.config.ts`) |
| **Config file** | `vitest.config.ts` (Node env default; `// @vitest-environment jsdom` pragma for component tests) |
| **Quick run command** | `pnpm test` |
| **Full suite command** | `pnpm test && pnpm test:migrations` |
| **Estimated runtime** | ~15–30 seconds (unit suite); migrations add ~5–10s |

---

## Sampling Rate

- **After every task commit:** Run `pnpm test`
- **After every plan wave:** Run `pnpm test && pnpm test:migrations`
- **Before `/gsd-verify-work`:** Full suite must be green AND the round-trip test (`src/components/editor/__tests__/round-trip.test.ts`) must pass
- **Max feedback latency:** ~30 seconds

---

## Per-Task Verification Map

> Requirement-level until planner emits task IDs. Each requirement maps to at
> least one automated test (all are ❌ Wave 0 — none exist yet, except the
> migration harness which is extended).

| Req ID | Behavior | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|--------|----------|------------|-----------------|-----------|-------------------|-------------|--------|
| CONT-01 | Post CRUD + status transitions via `transitionPost` | — / T-03-privilege | `requireCan`/`assertOwnsPost` first; author cannot publish | unit + integration | `pnpm test src/actions/__tests__/posts.test.ts` | ❌ W0 | ⬜ pending |
| CONT-02/03 | Tiptap JSON → `generateHTML` SSR round-trip (SAME extensions array) | T-03-xss | Round-trip is lossless; primary research-flag gate | unit | `pnpm test src/components/editor/__tests__/round-trip.test.ts` | ❌ W0 (PRIMARY) | ⬜ pending |
| CONT-04 | Double sanitization (before storage AND before render) | T-03-xss / T-03-iframe | `<img src=x onerror=...>` stripped; iframe domain allowlist; `target`/`rel` preserved; `<video>`/`<audio>`/`<source>` survive | unit | `pnpm test src/lib/sanitize/__tests__/sanitize.test.ts` | ❌ W0 | ⬜ pending |
| CONT-05/06 | Category/tag CRUD + `post_tags` cap (~8, server-enforced) | — | Tag cap enforced server-side in save action | unit | `pnpm test src/actions/__tests__/taxonomy.test.ts` | ❌ W0 | ⬜ pending |
| CONT-07 | Slug validator (URL-safe Latin + hyphens, unique) | — | Rejects non-Latin / unsafe chars (D-20 manual slugs) | unit | `pnpm test src/lib/slug/__tests__/slug.test.ts` | ❌ W0 | ⬜ pending |
| CONT-08 | Revalidation: concrete paths + 2-arg `revalidateTag(tag,'max')` | — | No template strings; no whole-site `revalidatePath('/', 'layout')` | unit (mock `next/cache`) | `pnpm test src/actions/__tests__/posts.test.ts` | ❌ W0 | ⬜ pending |
| CONT-09 | System-publish worker flips due posts (`publishedAt <= now()`) | T-03-privilege | Scheduler has NO session → D-12 system path (auditable, logged); not `transitionPost` | integration (mock db) | `pnpm test src/lib/schedule/__tests__/system-publish.test.ts` | ❌ W0 | ⬜ pending |
| CONT-10 | Preview token rotate on publish; `/preview/[token]` token-gated | T-03-enumeration | `crypto.randomUUID()` (122 bits); rotates on publish (old link 404s) | unit | `pnpm test src/actions/__tests__/posts.test.ts` | ❌ W0 | ⬜ pending |
| CONT-11 | Autosave drafts-only; disabled for published posts | — | Edits to live post require explicit Save (D-17) | unit | `pnpm test src/actions/__tests__/posts.test.ts` | ❌ W0 | ⬜ pending |
| MEDIA-01/04 | Storage provider registry resolves active provider from `settings` | — | Provider selection server-side from `settings` key | unit | `pnpm test src/lib/storage/__tests__/registry.test.ts` | ❌ W0 | ⬜ pending |
| MEDIA-02 | Media upload writes `provider` + `providerKey` + alt + dimensions | T-03-upload | Server-mediated (D-06); 10MB cap; sharp re-encodes images | integration | `pnpm test src/actions/__tests__/media.test.ts` | ❌ W0 | ⬜ pending |
| Schema | Migration clean-room (media type/provider + `previewToken`) | — | `drizzle-kit generate`; applies cleanly to empty DB | integration | `pnpm test:migrations` | ✅ (existing — extend) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/components/editor/__tests__/round-trip.test.ts` — **PRIMARY**: validates `generateHTML(json, editorExtensions)` for headings, lists, links, tables, images, code blocks, AND a raw-HTML iframe embed sample. Closes the Medium research flag. Covers CONT-02/03.
- [ ] `src/lib/sanitize/__tests__/sanitize.test.ts` — iframe allowlist enforcement, `target`/`rel` preservation, malicious-payload stripping (`<img src=x onerror=...>`), `<video>`/`<audio>`/`<source>` survival. Covers CONT-04.
- [ ] `src/actions/__tests__/posts.test.ts` — save/publish/autosave/preview-token actions (mock `next/cache`, `db`, `requireCan`). Covers CONT-01/08/10/11.
- [ ] `src/actions/__tests__/taxonomy.test.ts` — category/tag CRUD + tag cap (~8). Covers CONT-05/06.
- [ ] `src/lib/slug/__tests__/slug.test.ts` — URL-safety + uniqueness. Covers CONT-07.
- [ ] `src/lib/schedule/__tests__/system-publish.test.ts` — due-post query + status flip. Covers CONT-09.
- [ ] `src/lib/storage/__tests__/registry.test.ts` — provider selection from `settings`. Covers MEDIA-01/04.
- [ ] `src/actions/__tests__/media.test.ts` — upload writes correct `media` record. Covers MEDIA-02.
- [ ] Extend `scripts/test-migrations.mjs` (existing) — the new migration (media provider/key rename + `previewToken`) must apply cleanly to an empty DB.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Tiptap editor loads lazily in browser, no `(site)` bundle leak | PERF-02 (Phase 7 audit) | Requires built bundle + browser; Phase 7 automates | Build, open dashboard editor, confirm chunk loads on demand; verify `(site)` JS unchanged |
| Scheduled post goes live at `publishedAt` on a running Coolify process | CONT-09 / D-11 | Requires long-running process + clock wait | Set `publishedAt` ~2min ahead on staging, confirm worker flips status + revalidates |
| `next/image` renders external + CDN body images via `cdnImageLoader` | CONT-02 / D-03 | Visual + network confirmation in browser | Paste external image URL in editor, publish, confirm `<img>` resolves through loader |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
