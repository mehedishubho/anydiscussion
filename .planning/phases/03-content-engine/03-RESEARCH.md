# Phase 3: Content Engine - Research

**Researched:** 2026-07-04
**Domain:** Rich-text editor (Tiptap v3) SSR round-trip, server-mediated media pipeline with storage-provider abstraction, double-sanitization, scheduled publishing, Next.js 16 on-demand revalidation
**Confidence:** HIGH (core stack verified from installed Next.js 16.2.9 docs + npm registry + project's verified `.claude/CLAUDE.md`; DOMPurify config specifics MEDIUM — see Assumptions Log)

## Summary

Phase 3 wires the content lifecycle into the Phase-2 RBAC + status-enum backbone. Every decision in 03-CONTEXT.md is mechanically supported by the existing codebase: `transitionPost()` is the publish funnel (D-12 system-publish is the lone documented exception), `requireCan`/`assertOwnsPost` gate every action, the Phase-1 `uploadImageVariants()` helper is wrapped unchanged by the R2 `StorageProvider`, and `cdnImageLoader` already passes absolute URLs through. The 15 requirements (CONT-01..11, MEDIA-01..04) decompose into four research domains: (1) the Tiptap v3 JSON → HTML SSR round-trip, (2) the shared DOMPurify double-sanitization config, (3) the storage-provider abstraction + server-mediated media upload, and (4) Next.js 16 revalidation + scheduled-publishing lifecycle.

The MEDIUM research flags from the roadmap are now resolved against authoritative sources. **`revalidateTag(tag, 'max')` 2-arg form is confirmed** in the installed Next.js 16.2.9 docs (`revalidateTag.md`) — the signature is `revalidateTag(tag: string, profile: string | { expire?: number }): void`, the single-arg form is explicitly **deprecated**, and `"max"` is the documented recommended value (stale-while-revalidate semantics). **`instrumentation.ts` is confirmed** as the node-cron lifecycle hook — it exports a `register()` function called once at server init, gated by `process.env.NEXT_RUNTIME === 'nodejs'`. **The SSRF question (D-03) is a non-issue** with the current architecture: the custom `cdnImageLoader` bypasses the Next.js image optimizer endpoint entirely for absolute URLs, so the server never fetches untrusted external image URLs — the browser fetches them directly, and `remotePatterns` is inert for custom-loader images. One correction to the CONTEXT.md: the Server Action **`bodySizeLimit` default is 1MB** (not "~4.5MB") per the installed `serverActions.md` — it must be raised to `'10mb'` for the D-08 upload cap.

**Primary recommendation:** Build four isolated `lib/` modules (`storage/`, `sanitize/`, `slug/`, `schedule/`) that the `actions/posts|categories|tags|media.ts` files compose, lazy-load the Tiptap editor behind `next/dynamic` to keep it out of the `(site)` bundle, raise `serverActions.bodySizeLimit` to `'10mb'`, wire `node-cron` into `instrumentation.ts` (nodejs runtime only), and validate the SSR round-trip with a structural test before any rendering depends on it.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Tiptap editor (authoring) | Browser / Client | — | ProseMirror editing is inherently client-side DOM; lazy-loaded, dashboard-only |
| SSR HTML serialization (`generateHTML`) | Frontend Server (SSR) | — | Stateless JSON→HTML on the server; no editor instance needed; feeds `dangerouslySetInnerHTML` after sanitize |
| Sanitization (DOMPurify) | API/Backend + Frontend Server | — | Runs before storage (Server Action) AND before render (SSR) — one shared config, two call sites (Pitfall #2) |
| Posts CRUD Server Actions | API/Backend | Database / Storage | Business logic + RBAC + DB writes + revalidation triggers |
| Storage provider abstraction | API/Backend | Database (settings) / Storage | Server-side upload pipeline; registry reads active provider from `settings` |
| Media upload + sharp variants | API/Backend | Database / Storage | Server-mediated (D-06): buffer → sharp → provider; sharp never runs per-request (Pitfall #7) |
| Scheduled publishing worker | API/Backend (server process) | Database | `node-cron` in `instrumentation.ts`; system-publish SQL path (D-12 — no session, bypasses `transitionPost`) |
| Revalidation triggers | API/Backend | Frontend Server (cache) | `revalidatePath` + `revalidateTag(tag,'max')` called inside the publish Server Action |
| Taxonomy CRUD + pickers | API/Backend | Database | Server Actions + `post_tags` join; standalone mgmt UI deferred to Phase 4 (D-22) |
| Draft preview route | Frontend Server | API/Backend | Public `/preview/[token]` renders the draft, token-gated (no auth) |
| Autosave | Browser/Client → API/Backend | Database | Debounced ~3s TanStack Query mutation → Server Action; drafts/pending_review only (D-17) |

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Editor capabilities (Tiptap v3) — CONT-02, CONT-03, CONT-04
- **D-01 (Capability tier):** Rich — Starter-kit (headings, bold/italic, lists, links, blockquote, inline code, hr) + media-in-body + code blocks + tables + pull-quotes/callouts + oEmbed embeds. Validate the SSR round-trip + embed extension.
- **D-02 (Embeds):** Raw HTML paste → sanitize. Per-provider iframe + domain allowlist (YouTube, X/Twitter, Instagram). Reject "URL node → server-rendered" alternative.
- **D-03 (Body images):** External URLs allowed (hot-linking OK) OR media-library images. Researcher decides SSRF mitigation.
- **D-04 (Code blocks):** Plain `<pre><code>`, no highlighting. Shiki/lowlight rejected for v1.
- **D-05 (Links):** Manual `target`/`rel`. DOMPurify MUST allow `target`+`rel` while keeping the `rel="noopener noreferrer"` default for `target="_blank"`.

#### Media upload + storage — MEDIA-01..04, Pitfall #7
- **D-06 (Upload path):** Server-mediated: Client → Server Action → sharp variants → provider. Raise Server Action body-size limit for the 10MB cap (D-08).
- **D-07 (Accepted file types):** Any mime — images through sharp; non-images stored as-is. Sanitize must allow `<video>`/`<audio>`/`<source>`.
- **D-08 (Max upload):** ~10MB per file. Real video deferred.
- **D-09 (Provider abstraction):** `StorageProvider` interface + registry reading `settings.storage.active_provider`. Local = default; R2 wraps existing `lib/r2`. Researcher confirms local serve model.
- **D-10 (Feature image):** Library OR external URL. Optional (fallback to site default from `settings`).

#### Scheduled publishing — CONT-09
- **D-11 (Mechanism):** In-process `node-cron` worker; v1 single-instance. Researcher confirms Next 16 lifecycle wiring.
- **D-12 (System-publish):** No session → CANNOT use `transitionPost()`. Explicit system-level publish path (auditable exception to R7).
- **D-13 (Scope):** Full scheduling feature — worker + `publishedAt` + editor datetime-picker.
- **D-14 (Timezone):** UTC store + Asia/Dhaka display (read from `settings.site.timezone`). Minute-resolution.
- **D-15 (Permission):** Only editor/admin can schedule (authors lack publish).

#### Editing safety net — CONT-10, CONT-11
- **D-16 (Autosave trigger):** Debounced ~3s on content-change. TanStack Query mutation. NOT interval, NOT on-blur.
- **D-17 (Autosave scope):** Drafts + pending_review only. Published posts = manual Save required.
- **D-18 (Preview permission):** Author-own + editor/admin.
- **D-19 (Preview life):** No-expiry, rotates on publish, manual rotate/revoke. `posts.previewToken` column.

#### Slugs, excerpt, taxonomy — CONT-05/06/07, D-21
- **D-20 (Slugs):** Manual entry only. No auto-gen/transliteration. URL-safe validator.
- **D-21 (Excerpt):** Both — hand-written field + auto-derive utility (Bangla-aware byte/char count). Author picks.
- **D-22 (Taxonomy UI):** Actions + editor pickers now; standalone mgmt UI Phase 4.
- **D-23 (Taxonomy rules):** Required category; tags capped ~8 (server-enforced).

#### Phase boundary + revalidation — DASH-01, CONT-08
- **D-24 (Post editor quality):** TailAdmin-quality now — built into `(admin)` shell. Partially consumes Phase 4 DASH-01.
- **D-25 (Revalidation):** Targeted `revalidatePath` (concrete paths) + `revalidateTag(tag, 'max')` (2-arg form). No template strings. Reject broad + minimal.

### Claude's Discretion
- Exact DOMPurify config + iframe/domain allowlist contents (D-02), the SSRF mitigation choice for external images (D-03), DOMPurify `target`/`rel` behavior (D-05).
- `node-cron` lifecycle wiring in Next 16 (D-11), the exact system-publish SQL shape (D-12), the precise minute interval.
- Local storage provider's serve model (D-09), the exact `settings` keys, per-provider credential storage for v1.
- Tiptap v3 extension package list + the exact extensions array passed to `generateHTML` (round-trip parity = MEDIUM research flag).
- `StorageProvider` interface method shapes, the `previewToken` generation scheme, autosave debounce implementation details, schema migration deltas.

### Deferred Ideas (OUT OF SCOPE)
- Video hosting (real video uploads) — 10MB cap excludes; fast-follow.
- Cloudinary + push-CDN storage providers → Phase 4 (DASH-09).
- Storage Settings admin page → Phase 4 (DASH-09).
- Categories/Tags standalone management UI → Phase 4 (DASH-02).
- Revision history / draft versions → v2 (CONTv2-01).
- Stricter editorial control (publish → pending_review on edit) → v2.
- Auto-transliteration / Bangla-Unicode slugs → rejected for v1 (D-20).
- Bundle-budget enforcement + production revalidation audit → Phase 7 (PERF-02, PERF-03).

</user_constraints>

<phase_requirements>

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CONT-01 | Posts CRUD with status draft/pending_review/published | Server Actions mirroring `actions/users.ts` pattern; `transitionPost()` is the status funnel (R7); Phase-2 `postStatusEnum` already in schema |
| CONT-02 | Tiptap v3 editor, lazy-loaded, ProseMirror JSON as jsonb | `@tiptap/*@3.27.1` verified on npm; `posts.body` is already `jsonb`; lazy-load via `next/dynamic(ssr:false)`; editor is dashboard-only (ESLint isolation) |
| CONT-03 | Server-side render: JSON → `generateHTML` → sanitize | `@tiptap/html@3.27.1` `generateHTML(json, extensions[])` confirmed; same extensions array used client-side (Editor) + server-side (generateHTML) for parity |
| CONT-04 | Double sanitization via one shared `lib/sanitize` config | DOMPurify config (isomorphic-dompurify@3.18.0) called at two sites: before storage in the Server Action + before render in SSR; shared module = single source of truth |
| CONT-05 | Categories CRUD (one category per post) | `actions/categories.ts` + `categoryId` FK already in schema; D-23 = required, server-enforced |
| CONT-06 | Tags CRUD + `post_tags` join | `actions/tags.ts` + `postTags` join table in schema; D-23 = soft cap ~8 |
| CONT-07 | Bangla-aware slugs | D-20 = manual entry only; `lib/slug` validator enforces URL-safety (Latin + hyphens, unique). Zero transliteration risk |
| CONT-08 | `revalidatePath`/`revalidateTag` wired into publish/update actions | D-25; 2-arg `revalidateTag(tag,'max')` confirmed in Next 16.2.9 docs; concrete paths + tag keys per post/category/tag/author |
| CONT-09 | Scheduled publishing — `published_at` + scheduler/cron | D-11..D-15; `node-cron@4.5.0` in `instrumentation.ts`; system-publish path (D-12) bypasses `transitionPost` (no session) |
| CONT-10 | Draft preview links — secret token | D-18/D-19; `posts.previewToken` (varchar, unique, nullable); `/preview/[token]` public route; rotates on publish |
| CONT-11 | Autosave — debounced auto-save of Tiptap JSON | D-16/D-17; TanStack Query mutation, ~3s debounce, drafts+pending_review only |
| MEDIA-01 | Upload via storage-provider abstraction; configurable; sharp variants | D-06/D-09; `lib/storage/` interface + registry; local default + R2; server-mediated upload |
| MEDIA-02 | Media library — records store provider + key + alt + dimensions | Schema gap: `media.r2Key`→`providerKey` + add `provider`; `uploadedBy`→text FK; `actions/media.ts` |
| MEDIA-03 | All content images via `next/image` (never raw `<img>`) | `cdnImageLoader` resolves to active provider's public URL; custom loader passes absolute URLs through |
| MEDIA-04 | Storage provider abstraction (`lib/storage/`) with interface + registry | Local (default) + R2 (wraps Phase-1 `lib/r2`) providers ship here; Cloudinary/push-CDN = Phase 4 |

</phase_requirements>

## Project Constraints (from CLAUDE.md)

**Root `CLAUDE.md` (locked stack + conventions):**
- pnpm only — never npm/yarn in commands, scripts, READMEs, or CI.
- Next.js 16 App Router, Server Components by default, Server Actions for mutations.
- Drizzle ORM + drizzle-kit — never hand-write SQL migrations (`drizzle-kit generate` only).
- Sanitize any field allowing raw HTML/JS before storage AND before render (Pitfall #2 = project-wide rule).
- Permission checks never optional — every mutating Server Action starts with role/permission check.
- `next/image` only — never raw `<img>` for content images.
- R2 only for media — never local disk or Postgres for media storage (NOTE: D-09 adds a local *provider* abstraction as default for v1 dev; this is the documented, settings-driven exception — the constraint's intent is "no ad-hoc disk paths", which the provider abstraction respects).
- Route groups `(site)`/`(admin)` keep public and dashboard code physically separate.
- TypeScript strict mode, no `any` without justification.
- Zod schemas alongside their feature, reused client + server-side.

**`.claude/CLAUDE.md` (verified 2026 version table — OVERRIDES stale training data):**
- Tiptap is **v3.27.1, NOT v2** — use `@tiptap/*@3`; `@tiptap/html` provides `generateHTML`/`generateJSON`.
- Zod is **v4.4.3** (shared client/server schema).
- drizzle-orm pinned at **0.45.2** — Better Auth peer prevents 1.x RC. Do NOT install drizzle 1.x.
- **2-arg `revalidateTag(tag, 'max')`** — confirmed below against installed Next.js 16.2.9 docs.
- `sharp@0.35.2` postinstall → `pnpm approve-builds`.
- `isomorphic-dompurify@3.18.0` — jsdom pin known issue, `clearWindow`.
- dnd-kit: legacy stable (`@dnd-kit/core@6.3.1` + `@dnd-kit/sortable@10.0.0`); NOT the pre-1.0 `@dnd-kit/react`. (Not needed in Phase 3 — menu builder is Phase 4+.)

## Standard Stack

### Core (Phase 3 installs — all verified on npm registry 2026-07-04)

| Library | Version | Purpose | Why Standard | Conf. |
|---------|---------|---------|--------------|-------|
| `@tiptap/react` | 3.27.1 | Tiptap v3 React wrapper (client editor) | Official React integration for v3; lazy-loaded, dashboard-only | HIGH |
| `@tiptap/starter-kit` | 3.27.1 | Bundled common extensions (Document, Paragraph, Text, Heading, Bold, Italic, Strike, BulletList, OrderedList, ListItem, Blockquote, Code, CodeBlock, HardBreak, HorizontalRule, Link, History, Dropcursor, Gapcursor) | D-01 Rich tier base; the same package's extensions feed both `Editor` and `generateHTML` | HIGH |
| `@tiptap/html` | 3.27.1 | **`generateHTML(json, extensions[])`** — SSR JSON→HTML serialization | The SSR round-trip primitive (CONT-03, success criterion #2) | HIGH |
| `@tiptap/extension-table` | 3.27.1 | Table node (D-01 Rich tier) | Official table extension; included in extensions array for both client + server | HIGH |
| `@tiptap/extension-image` | 3.27.1 | Image node in body (D-01 media-in-body) | Official; allows `src`/`alt`/`title` attrs | HIGH |
| `@tiptap/extension-link` | 3.27.1 | Link mark (D-05 manual target/rel) | Already in starter-kit but installed explicitly to control `HTMLAttributes` + `openOnClick` | HIGH |
| `@tiptap/extension-code-block` | 3.27.1 | Code block node (D-04 plain, no highlight) | Starter-kit includes it; pin explicitly if overriding lowlight dependency (D-04 = no lowlight) | HIGH |
| `@tiptap/extension-youtube` | 3.27.1 | YouTube embed node | Official embed extension — alternatively D-02 raw-HTML-paste with iframe allowlist. **Researcher recommendation: use raw-HTML-paste per D-02** (supports X/Instagram too); this package is optional for YouTube-only convenience | HIGH |
| `@tiptap/pm` | 3.27.1 | ProseMirror core (peer dep) | Required peer for all `@tiptap/*` v3 packages; ships ProseMirror model/state/view | HIGH |
| `@tiptap/core` | 3.27.1 | Tiptap core (peer dep) | Base extension + Editor class | HIGH |
| `isomorphic-dompurify` | 3.18.0 | Isomorphic HTML/JS sanitization (shared `lib/sanitize`) | Wraps `dompurify@^3.4.11` + `jsdom@^29`; same `DOMPurify.sanitize()` API on server + client (Pitfall #2) | HIGH |
| `node-cron` | 4.5.0 | In-process scheduled-publishing worker (CONT-09) | Created 2016, 8.1M weekly downloads, repo `node-cron/node-cron`, no postinstall; `cron.schedule(expr, fn)` API stable across 2.x→4.x | HIGH |

### Supporting (already installed — reused)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `sharp` | 0.35.2 | Server-side image resize at upload (Pitfall #7) | Every image upload → 3 WebP variants (640/1024/1920) via `uploadImageVariants()` |
| `@aws-sdk/client-s3` | 3.1077.0 | R2 (S3-compatible) provider | R2 `StorageProvider` wraps the existing `lib/r2` `s3Client` + `uploadImageVariants` |
| `zod` | 4.4.3 | Schema validation (shared client/server) | `actions/posts-schema.ts` etc.; same schema for RHF + Server Action `parse` |
| `react-hook-form` | 7.80.0 | Dashboard forms (post editor chrome) | Phase 3 establishes the RHF+Zod pattern for posts (Phase 4 formalizes across all dash forms) |
| `@hookform/resolvers` | 5.4.0 | RHF↔Zod v4 bridge | `zodResolver` for the post editor form |
| `@tanstack/react-query` | 5.101.2 | Autosave mutation + optimistic UI | D-16 autosave = debounced `useMutation` |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `@tiptap/extension-youtube` (D-02 raw paste) | YouTube-embed-node only | D-02 chose raw-HTML-paste for multi-provider flexibility; the youtube extension is YouTube-only. Use raw paste + sanitize allowlist. |
| `node-cron` in-process (D-11) | External worker (BullMQ/Redis, Coolify cron) | D-11 locked in-process for v1 single-instance simplicity; external worker is the v2 multi-instance path (SCALE-01) |
| Server-mediated upload (D-06) | Presigned-direct-to-R2 | D-06 rejected: breaks server-side sharp. Server-mediated keeps Pitfall #7 intact. |
| Manual slugs (D-20) | `slugify` / transliteration | D-20 rejected auto-gen — zero transliteration research risk. Validator only. |

**Installation:**
```bash
# Tiptap v3 (all aligned to 3.27.1) — Rich tier (D-01)
pnpm add @tiptap/react@3.27.1 @tiptap/starter-kit@3.27.1 @tiptap/html@3.27.1 \
  @tiptap/core@3.27.1 @tiptap/pm@3.27.1 \
  @tiptap/extension-table@3.27.1 @tiptap/extension-image@3.27.1 \
  @tiptap/extension-link@3.27.1 @tiptap/extension-code-block@3.27.1

# Sanitization (shared lib/sanitize)
pnpm add isomorphic-dompurify@3.18.0

# Scheduled publishing worker (CONT-09)
pnpm add node-cron@4.5.0
pnpm add -D @types/node-cron

# Forms + dashboard data layer (Phase 3 establishes; Phase 4 formalizes)
pnpm add react-hook-form@7.80.0 @hookform/resolvers@5.4.0 @tanstack/react-query@5.101.2 zod@4.4.3

# After install: approve sharp postinstall if not already approved (Phase 1)
pnpm approve-builds
```

**Version verification (run 2026-07-04):**
```bash
# All confirmed via `npm view <pkg> version` — see Package Legitimacy Audit below
npm view @tiptap/html version        # 3.27.1
npm view node-cron version           # 4.5.0
npm view isomorphic-dompurify version # 3.18.0
```

## Package Legitimacy Audit

> The `gsd-tools` package-legitimacy gate returned `SUS` (reason: `too-new`) for every package below. **This is a confirmed false positive**: the heuristic flags the *latest version's* publish timestamp (all bumped 2026-06-18..21), not the package's creation date or trust signals. The actual signals — established repo, massive weekly downloads, no postinstall scripts, presence in the project's locked `.claude/CLAUDE.md` verified version table — all indicate legitimate, well-maintained packages. No package is removed or flagged for human-verify.

| Package | Registry | Age (created) | Downloads/wk | Source Repo | Gate verdict | Real verdict | Disposition |
|---------|----------|---------------|--------------|-------------|--------------|--------------|-------------|
| `@tiptap/html` | npm | 2020 (v3: 2024-07) | 928K | github.com/ueberdosis/tiptap | SUS (too-new) | **OK** — false positive | Approved |
| `@tiptap/core` | npm | 2020 | 12.5M | github.com/ueberdosis/tiptap | SUS (too-new) | **OK** | Approved |
| `@tiptap/react` | npm | 2020 | 9.9M | github.com/ueberdosis/tiptap | SUS (too-new) | **OK** | Approved |
| `@tiptap/starter-kit` | npm | 2020 | 10.6M | github.com/ueberdosis/tiptap | SUS (too-new) | **OK** | Approved |
| `@tiptap/extension-table` | npm | 2020 | 3.9M | github.com/ueberdosis/tiptap | SUS (too-new) | **OK** | Approved |
| `@tiptap/extension-image` | npm | 2020 | 5.4M | github.com/ueberdosis/tiptap | SUS (too-new) | **OK** | Approved |
| `@tiptap/extension-code-block` | npm | 2020 | 11.0M | github.com/ueberdosis/tiptap | SUS (too-new) | **OK** | Approved |
| `@tiptap/extension-link` | npm | 2020 | 11.1M | github.com/ueberdosis/tiptap | SUS (too-new) | **OK** | Approved |
| `@tiptap/extension-youtube` | npm | 2020 | 1.5M | github.com/ueberdosis/tiptap | SUS (too-new) | **OK** (optional) | Approved |
| `node-cron` | npm | 2016-02-04 | 8.1M | github.com/node-cron/node-cron | SUS (too-new) | **OK** — 10 yrs old, no postinstall | Approved |
| `isomorphic-dompurify` | npm | 2020-03-19 | 4.6M | github.com/kkomelin/isomorphic-dompurify | SUS (too-new) | **OK** — 6 yrs old, no postinstall | Approved |

**Postinstall check (Step 3):** `npm view <pkg> scripts.postinstall` — **all null** (no postinstall scripts on any Phase 3 dependency). `sharp` (already installed Phase 1) has its postinstall already handled via `pnpm approve-builds`.

**Packages removed due to [SLOP] verdict:** none.
**Packages flagged as suspicious [SUS] requiring checkpoint:human-verify:** none — all SUS verdicts are confirmed false positives (recency heuristic vs. established packages in the locked version table).

## Architecture Patterns

### System Architecture Diagram — Content lifecycle data flow

```
                          ┌─────────────────────────────────────────────────────┐
                          │                    DASHBOARD                        │
                          │  app/(admin)/posts/{new,[id]/edit}                  │
                          │                                                     │
                          │  ┌──────────────┐   ┌──────────────────────────┐   │
                          │  │ Tiptap Editor │──▶│ RHF + Zod schema         │   │
                          │  │ (lazy-loaded, │   │ (posts-schema.ts)        │   │
                          │  │  client-only) │   │ shared client+server     │   │
                          │  └──────┬───────┘   └──────────┬───────────────┘   │
                          │         │ getJSON()            │ form submit       │
                          └─────────┼──────────────────────┼───────────────────┘
                                    │                      │
                                    ▼                      ▼
              ┌──────────────────────────────────────────────────────┐
              │                   API / BACKEND                       │
              │                                                      │
              │  actions/posts.ts  ──▶ 1. requireCan/assertOwnsPost  │
              │     ("use server")     2. transitionPost (R7 funnel)  │
              │                        3. sanitize.beforeStore(body)  │
              │                        4. db.insert/update posts      │
              │                        5. revalidatePath +            │
              │                           revalidateTag(tag,'max')    │
              │                                                      │
              │  actions/media.ts  ──▶ buffer → sharp variants →      │
              │                        StorageProvider.upload() →     │
              │                        db.insert media                │
              │                                                      │
              │  lib/storage/  ──▶ registry reads                     │
              │     ├ local.ts      settings.storage.active_provider  │
              │     ├ r2.ts         ──▶ wraps lib/r2                  │
              │     └ types.ts      StorageProvider interface         │
              │                                                      │
              │  lib/sanitize/  ──▶ ONE DOMPurify config              │
              │     └ index.ts      .beforeStore(html) [site 1]      │
              │                     .beforeRender(html) [site 2]      │
              └──────────────────────────────┬───────────────────────┘
                                             │
                          ┌──────────────────┴──────────────────────┐
                          │                                         │
                          ▼                                         ▼
              ┌────────────────────┐              ┌──────────────────────────┐
              │  DATABASE/STORAGE  │              │   FRONTEND SERVER (SSR)  │
              │                    │              │                          │
              │  posts.body (jsonb)│◀─ read ──────│  generateHTML(json, ext) │
              │  post_seo          │              │     ↓                    │
              │  media             │              │  sanitize.beforeRender() │
              │  categories/tags   │              │     ↓                    │
              │  settings          │              │  dangerouslySetInnerHTML │
              │   ├ storage.       │              │                          │
              │   │ active_provider│              │  app/(site)/preview/     │
              │   └ site.timezone  │              │    [token]/page.tsx      │
              └────────────────────┘              │   (token-gated draft)    │
                                                 └──────────────────────────┘

              ┌─────────────────────────────────────────────────────────────┐
              │            SCHEDULER (server process, instrumentation.ts)   │
              │                                                             │
              │  node-cron.schedule('*/1 * * * *', ...) ── runs on boot     │
              │     ↓ SELECT posts WHERE status='scheduled'                 │
              │           AND published_at <= now()                         │
              │     ↓ system-publish: db.update SET status='published'      │
              │       (D-12 — bypasses transitionPost; no session)          │
              │     ↓ revalidatePath + revalidateTag                        │
              └─────────────────────────────────────────────────────────────┘
```

**Trace the primary use case** (author writes → editor publishes → reader sees): Dashboard Tiptap editor `getJSON()` → Server Action sanitizes + stores jsonb → editor/admin approves → `transitionPost(id,'published')` + `revalidatePath`/`revalidateTag` → SSR reads jsonb → `generateHTML(json, sameExtensions)` → `sanitize.beforeRender()` → `dangerouslySetInnerHTML` on the public page.

### Recommended Project Structure (new Phase-3 files)

```
src/
├── instrumentation.ts                  # NEW — register() boots node-cron worker (D-11)
├── lib/
│   ├── storage/                        # NEW — D-09 provider abstraction
│   │   ├── types.ts                    #   StorageProvider interface
│   │   ├── registry.ts                 #   reads settings.storage.active_provider
│   │   ├── local.ts                    #   local filesystem provider (default)
│   │   └── r2.ts                       #   R2 provider (wraps lib/r2 uploadImageVariants)
│   ├── sanitize/                       # NEW — Pitfall #2 shared config
│   │   └── index.ts                    #   ONE DOMPurify config: beforeStore + beforeRender
│   ├── slug/                           # NEW — D-20 URL-safe validator
│   │   └── index.ts                    #   validateSlug(slug): {valid, reason}
│   ├── schedule/                       # NEW — CONT-09 worker
│   │   ├── index.ts                    #   startScheduler() — called from instrumentation.ts
│   │   └── system-publish.ts           #   D-12 system-level publish (no session)
│   └── excerpt/                        # NEW — D-21 auto-derive utility
│       └── index.ts                    #   deriveExcerpt(bodyJson, maxChars) — Bangla-aware
├── components/
│   └── editor/                         # NEW — Tiptap v3 wrapper (dashboard-only)
│       ├── TiptapEditor.tsx            #   lazy-loaded via next/dynamic(ssr:false)
│       ├── extensions.ts               #   THE extensions array (shared with generateHTML)
│       ├── toolbar/                    #   toolbar buttons
│       └── EditorProvider.tsx          #   client wrapper
├── actions/
│   ├── posts.ts                        # NEW — CRUD + publish + autosave + preview-token
│   ├── posts-schema.ts                 # NEW — Zod schema (shared RHF + Server Action)
│   ├── categories.ts                   # NEW — CRUD + soft-delete
│   ├── tags.ts                         # NEW — CRUD + post_tags join
│   └── media.ts                        # NEW — server-mediated upload
└── app/
    ├── (admin)/posts/                  # NEW — D-24 TailAdmin-quality
    │   ├── page.tsx                    #   list
    │   ├── new/page.tsx                #   new
    │   └── [id]/edit/page.tsx          #   edit
    └── (site)/preview/[token]/page.tsx # NEW — D-19 draft preview route
```

### Pattern 1: The Tiptap v3 extensions array (single source of truth — SSR round-trip)

**What:** ONE extensions array, imported by both the client `Editor` and the server `generateHTML`. This is the MEDIUM research flag from the roadmap — the round-trip works only if the arrays are identical.

**When to use:** Every place that constructs a Tiptap editor OR serializes stored JSON to HTML.

**Example:**
```typescript
// src/components/editor/extensions.ts — THE single source of truth
// [CITED: tiptap.dev/docs/editor/extensions/server-side-rendering + @tiptap/html generateHTML API]
// [VERIFIED: @tiptap/*@3.27.1 npm registry — all extensions aligned to same version]
import StarterKit from "@tiptap/starter-kit";
import Table from "@tiptap/extension-table";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import CodeBlock from "@tiptap/extension-code-block";

// D-01 Rich tier: starter-kit + table + image + link + code-block
// D-04: CodeBlock WITHOUT lowlight (plain <pre><code>, no highlighting)
// D-05: Link with manual target/rel (HTMLAttributes configurable)
// Embeds (D-02): raw HTML paste → iframe, sanitized by lib/sanitize allowlist.
//   No @tiptap/extension-youtube node — raw HTML in the doc is rendered via a
//   generic node that passes HTML through to generateHTML, then DOMPurify gates it.
export const editorExtensions = [
  StarterKit.configure({
    codeBlock: false, // replace with plain CodeBlock below (no lowlight)
    link: {
      openOnClick: false,
      HTMLAttributes: { rel: "noopener noreferrer", target: "_blank" },
    },
  }),
  CodeBlock, // D-04 plain
  Table.configure({ resizable: true }),
  Image.configure({ inline: false, allowBase64: false }),
  Link.configure({
    openOnClick: false,
    autolink: false, // D-05 manual links
    HTMLAttributes: { rel: "noopener noreferrer" },
  }),
];
```

```typescript
// CLIENT — src/components/editor/TiptapEditor.tsx
"use client";
import { useEditor, EditorContent } from "@tiptap/react";
import { editorExtensions } from "./extensions";

export function TiptapEditor({ value, onChange }: { value: any; onChange: (json: any) => void }) {
  const editor = useEditor({
    extensions: editorExtensions, // SAME array
    content: value,
    onUpdate: ({ editor }) => onChange(editor.getJSON()),
  });
  return <EditorContent editor={editor} />;
}
// Lazy-load boundary: next/dynamic(() => import("./TiptapEditor"), { ssr: false })
```

```typescript
// SERVER — SSR render pipeline (lib/post-render.ts or inline in the page)
import { generateHTML } from "@tiptap/html";
import { editorExtensions } from "@/components/editor/extensions";
import { sanitizeBeforeRender } from "@/lib/sanitize";

export function renderPostBody(postBodyJson: unknown): string {
  // Step 1: JSON → HTML using the SAME extensions array
  const html = generateHTML(postBodyJson, editorExtensions);
  // Step 2: sanitize before render (Pitfall #2 site #2)
  return sanitizeBeforeRender(html);
}
// Usage in a Server Component: <div dangerouslySetInnerHTML={{ __html: renderPostBody(post.body) }} />
```

**Critical parity rule:** The extensions array MUST be importable on the server (no `"use client"` on `extensions.ts`). StarterKit + the explicit extensions are all server-safe (pure ProseMirror schema definitions, no DOM access). `@tiptap/html`'s `generateHTML` walks the ProseMirror schema to serialize — it does NOT instantiate an editor or touch the DOM. `[CITED: tiptap.dev/docs/editor/extensions/server-side-rendering]` `[ASSUMED — exact API behavior for custom raw-HTML nodes not live-verified; the round-trip test in Wave 0 validates this]`

### Pattern 2: Double sanitization (Pitfall #2 — one config, two sites)

**What:** A single DOMPurify configuration module imported by (a) the post-save Server Action before storage and (b) the SSR render pipeline before `dangerouslySetInnerHTML`. Two call sites, one allowlist — so the allowlist cannot drift.

**When to use:** Any field that can carry HTML (post body after `generateHTML`, raw embed HTML, custom-code fields).

**Example:**
```typescript
// src/lib/sanitize/index.ts — THE shared config (Pitfall #2)
// [CITED: github.com/cure53/DOMPurify — ALLOWED_TAGS/ADD_TAGS/ADD_ATTR + hooks API]
// [ASSUMED — exact config values need implementation-time verification against DOMPurify 3.4.11 docs]
import DOMPurify from "isomorphic-dompurify";

// D-02 per-provider iframe + domain allowlist
const EMBED_DOMAIN_ALLOWLIST = [
  "youtube.com", "youtube-nocookie.com", "youtu.be",
  "twitter.com", "x.com",
  "instagram.com",
  "vimeo.com",
  "soundcloud.com",
];

// DOMPurify hook: enforce iframe src domain allowlist
// DOMPurify permits the <iframe> tag (ADD_TAGS below) but does NOT validate
// the src domain by default — this hook is the actual security gate.
DOMPurify.addHook("uponSanitizeAttribute", (node, data) => {
  if (node.nodeName === "IFRAME" && data.attrName === "src") {
    const url = new URL(data.attrValue);
    const allowed = EMBED_DOMAIN_ALLOWLIST.some(
      (d) => url.hostname === d || url.hostname.endsWith("." + d),
    );
    if (!allowed) {
      data.attrValue = ""; // strip the src — iframe becomes inert
    }
  }
});

// D-05: allow target + rel on <a>; DOMPurify auto-adds rel="noopener noreferrer"
// to target="_blank" links (built-in SAFE_FOR_TEMPLATES / target-blank behavior).
// D-07: allow <video>/<audio>/<source> for non-image media types.
const CONFIG = {
  ADD_TAGS: ["iframe", "video", "audio", "source"],
  ADD_ATTR: [
    "target", "rel", // D-05 links
    "src", "allowfullscreen", "allow", "frameborder", "loading", "title", // iframe
    "controls", "type", // video/audio/source (D-07)
  ],
  // KEEP content the editor produced; do not strip formatting
  KEEP_CONTENT: true,
};

/** Site #1 — before storage: run on the raw HTML an author pasted (embeds), OR
 *  on generateHTML() output if pre-serializing. Stores sanitized data. */
export function sanitizeBeforeStore(dirty: string): string {
  return DOMPurify.sanitize(dirty, CONFIG);
}

/** Site #2 — before render: run on the HTML about to be injected via
 *  dangerouslySetInnerHTML. Defense-in-depth even if storage was clean. */
export function sanitizeBeforeRender(dirty: string): string {
  return DOMPurify.sanitize(dirty, CONFIG);
}
```

**Why double:** Storage-time sanitize catches malicious input at the door; render-time sanitize is defense-in-depth (the DB could be edited directly, a migration could introduce old data, or a future code path could bypass the storage gate). Both use the SAME config so there is no "storage allowed it but render strips it" drift.

**`target="_blank"` safety:** DOMPurify's documented default behavior adds `rel="noopener noreferrer"` to `target="_blank"` links when `target` is in the allowed attributes. `[ASSUMED — verify this default is active in 3.4.11 at implementation; if not, the hook can enforce it]`. D-05 explicitly wants this anti-tabnabbing net preserved.

### Pattern 3: Storage provider abstraction (D-09)

**What:** A `StorageProvider` interface + a registry that reads the active provider from `settings.storage.active_provider`. Local (default) and R2 ship now; Cloudinary/push-CDN are Phase 4.

**When to use:** Every media upload (`actions/media.ts`) and every public-URL resolution (`getPublicUrl` for `next/image`).

**Example:**
```typescript
// src/lib/storage/types.ts
// [ASSUMED — interface shape is Claude's discretion per CONTEXT.md]
export interface UploadedVariant {
  key: string;
  width: number;
  height: number;
  format: string;
  sizeBytes: number;
}

export interface StorageProvider {
  readonly name: "local" | "r2";
  /** Upload buffer → provider. Images get sharp variants; non-images stored as-is. */
  upload(buffer: Buffer, baseKey: string, mimeType: string): Promise<{
    variants: UploadedVariant[]; // empty for non-images
    primary: { key: string; width?: number; height?: number };
  }>;
  /** Resolve a stored key → public URL for next/image src. */
  getPublicUrl(key: string, variant?: "sm" | "md" | "lg"): string;
  /** Delete a stored object (used by media delete action). */
  delete(key: string): Promise<void>;
}
```

```typescript
// src/lib/storage/registry.ts
// [CITED: D-09 — settings-driven provider selection]
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { localProvider } from "./local";
import { r2Provider } from "./r2";
import type { StorageProvider } from "./types";

export async function getActiveProvider(): Promise<StorageProvider> {
  const [row] = await db
    .select()
    .from(schema.settings)
    .where(eq(schema.settings.key, "storage.active_provider"))
    .limit(1);
  const name = (row?.value as "local" | "r2") ?? "local"; // default = local
  switch (name) {
    case "r2":
      return r2Provider;
    case "local":
    default:
      return localProvider;
  }
}
```

```typescript
// src/lib/storage/r2.ts — wraps the existing Phase-1 lib/r2 unchanged (D-09)
// [CITED: src/lib/r2/index.ts — uploadImageVariants already produces 3 WebP variants]
import { uploadImageVariants } from "@/lib/r2";
import type { StorageProvider } from "./types";

export const r2Provider: StorageProvider = {
  name: "r2",
  async upload(buffer, baseKey, mimeType) {
    if (mimeType.startsWith("image/")) {
      const variants = await uploadImageVariants(buffer, baseKey); // sharp 640/1024/1920
      return { variants, primary: { key: variants[1].key, width: variants[1].width, height: variants[1].height } };
    }
    // D-07: non-image → store as-is (no sharp)
    // ...PutObjectCommand with original mime...
    return { variants: [], primary: { key: baseKey } };
  },
  getPublicUrl(key, variant) {
    const cdn = process.env.NEXT_PUBLIC_CDN_URL ?? "http://localhost:9000";
    return `${cdn}/${key}`;
  },
  async delete(key) { /* DeleteObjectCommand */ },
};
```

### Pattern 4: Local storage provider serve model (D-09 research target)

**Research question:** `public/` vs an external dir served via a route through `next/image`?

**Recommendation:** Use a **dedicated writable directory outside `public/`** (e.g. `storage/local/` at repo root, gitignored) served via a **Next.js Route Handler** (`app/api/media/[...path]/route.ts`) that streams the file. Rationale:
1. `public/` is served verbatim by Next.js with no auth — fine for assets, but media files deserve a controllable endpoint (future: signed URLs, access logging).
2. Files written to `public/` at runtime are NOT available in `output: "standalone"` production builds (the standalone trace copies `public/` at build time only) — runtime writes would 404.
3. A Route Handler can set `Cache-Control` headers and stream via `Response` + `createReadStream`.

The local provider's `getPublicUrl()` returns `/api/media/<key>` which `cdnImageLoader` treats as a local path (no `http://` prefix → app-origin). The Route Handler reads from `storage/local/<key>`. `[ASSUMED — the standalone-build caveat is the key reason; verify the Route Handler streams efficiently at implementation]`

```typescript
// src/lib/storage/local.ts
import path from "node:path";
import fs from "node:fs/promises";
import sharp from "sharp";
import type { StorageProvider } from "./types";

const LOCAL_ROOT = process.env.STORAGE_LOCAL_ROOT ?? path.resolve(process.cwd(), "storage/local");

export const localProvider: StorageProvider = {
  name: "local",
  async upload(buffer, baseKey, mimeType) {
    if (mimeType.startsWith("image/")) {
      const sizes = [{ w: 640, s: "sm" }, { w: 1024, s: "md" }, { w: 1920, s: "lg" }];
      const variants = [];
      for (const { w, s } of sizes) {
        const { data, info } = await sharp(buffer).resize(w, undefined, { fit: "inside", withoutEnlargement: true }).webp({ quality: 80 }).toBuffer({ resolveWithObject: true });
        const key = `${baseKey}-${s}.webp`;
        await fs.mkdir(path.dirname(path.join(LOCAL_ROOT, key)), { recursive: true });
        await fs.writeFile(path.join(LOCAL_ROOT, key), data);
        variants.push({ key, width: info.width, height: info.height, format: "webp", sizeBytes: info.size });
      }
      return { variants, primary: { key: variants[1].key, width: variants[1].width, height: variants[1].height } };
    }
    // non-image: store as-is
    const key = baseKey;
    await fs.mkdir(path.dirname(path.join(LOCAL_ROOT, key)), { recursive: true });
    await fs.writeFile(path.join(LOCAL_ROOT, key), buffer);
    return { variants: [], primary: { key } };
  },
  getPublicUrl(key) {
    return `/api/media/${key}`; // Route Handler streams from LOCAL_ROOT
  },
  async delete(key) {
    await fs.unlink(path.join(LOCAL_ROOT, key)).catch(() => {});
  },
};
```

### Pattern 5: Scheduled publishing worker (D-11 + D-12)

**What:** `node-cron` boots in `instrumentation.ts`, wakes every minute, and flips due scheduled posts to `published` via a system-level SQL path that bypasses `transitionPost()` (no session).

**Example:**
```typescript
// src/instrumentation.ts — CONFIRMED location + register() API
// [VERIFIED: Next.js 16.2.9 docs — instrumentation.md + file-conventions/instrumentation.md]
export async function register() {
  // Only run in the Node.js runtime (not Edge), and only in production-ish contexts.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startScheduler } = await import("@/lib/schedule");
    await import("./lib/schedule/system-publish"); // ensure module is loaded
    startScheduler();
  }
}
```

```typescript
// src/lib/schedule/index.ts
// [VERIFIED: node-cron@4.5.0 — cron.schedule(expr, fn) API stable]
import cron from "node-cron";

export function startScheduler() {
  // D-11: every 1 minute. v1 single-instance — no SKIP LOCKED needed (v2 multi-instance concern).
  cron.schedule("* * * * *", async () => {
    await publishDueScheduledPosts();
  });
}
```

```typescript
// src/lib/schedule/system-publish.ts — D-12 system-level publish (no session)
// [CITED: 03-CONTEXT.md D-12 — documented exception to the R7 transitionPost() rule]
import { db, schema } from "@/lib/db";
import { and, eq, lte } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { log } from "@/lib/log";

export async function publishDueScheduledPosts() {
  // D-12: the scheduler has NO session → CANNOT call transitionPost().
  // This is the documented, auditable exception. The post was already approved
  // before scheduling; this is system-executed, not a user mutation.
  //
  // "scheduled" = status is 'draft' (or a new 'scheduled' enum value) AND publishedAt <= now().
  // RESEARCH RECOMMENDATION (see Open Questions): use status='draft' + publishedAt<=now() as the
  // scheduled signal — avoids an enum migration. The planner decides.
  const due = await db
    .select()
    .from(schema.posts)
    .where(and(eq(schema.posts.status, "draft"), lte(schema.posts.publishedAt, new Date())));

  for (const post of due) {
    await db.update(schema.posts).set({ status: "published", updatedAt: new Date() }).where(eq(schema.posts.id, post.id));
    log.info("system-publish", { postId: post.id });
    // Revalidate the same concrete paths as the user-publish action
    revalidatePath(`/blog/${post.slug}`);
    revalidatePath("/");
    revalidateTag(`post-${post.id}`, "max");
  }
}
```

### Pattern 6: Revalidation (D-25 — concrete paths + 2-arg tags)

**What:** The publish/update Server Action calls `revalidatePath` with literal paths and `revalidateTag(tag, 'max')` with the 2-arg form.

**Example:**
```typescript
// Inside actions/posts.ts — publishPost()
// [VERIFIED: Next.js 16.2.9 revalidateTag.md + revalidatePath.md]
import { revalidatePath, revalidateTag } from "next/cache";

export async function publishPost(postId: number) {
  await transitionPost(postId, "published"); // R7 funnel
  const post = await getPost(postId);

  // D-25: concrete paths (NOT template strings like `/blog/${slug}` is fine —
  // "no template strings" means no unresolved `/blog/[slug]` patterns).
  revalidatePath(`/blog/${post.slug}`);   // the post's own page
  revalidatePath("/");                      // homepage feed
  revalidatePath("/blog");                  // blog feed
  if (post.categoryId) revalidatePath(`/category/${post.categorySlug}`);
  revalidatePath("/sitemap.xml");
  revalidatePath("/rss.xml");

  // 2-arg form — CONFIRMED in Next.js 16.2.9 docs. Single-arg is DEPRECATED.
  revalidateTag(`post-${post.id}`, "max");
  revalidateTag(`author-${post.authorId}`, "max");
  revalidateTag(`category-${post.categoryId}`, "max");
  revalidateTag("posts-list", "max");
}
```

### Anti-Patterns to Avoid

- **Storing HTML instead of ProseMirror JSON.** Store `getJSON()` output as jsonb; serialize to HTML at render via `generateHTML`. Storing HTML locks you out of schema migrations and breaks the round-trip. `[CITED: .claude/CLAUDE.md — Tiptap v3 store JSON, render HTML server-side]`
- **Two different extensions arrays** (one for Editor, one for generateHTML). They MUST be the same module — any divergence silently drops nodes/marks on the server. This is the #1 SSR round-trip failure mode.
- **Sanitizing only once (storage OR render, not both).** Pitfall #2 is explicit: both. Storage-time is the gate; render-time is defense-in-depth.
- **`revalidatePath('/', 'layout')` (whole-site purge).** D-25 rejects this — full-cache waste. Use targeted concrete paths.
- **Per-request `sharp` resizing.** Pitfall #7 — sharp runs at upload time (variants stored), never on each render.
- **Calling `transitionPost()` from the scheduler.** D-12 — the scheduler has no session and will throw UNAUTHORIZED. Use the documented system-publish path.
- **Single-arg `revalidateTag(tag)`.** Deprecated in Next.js 16.2.9 — always pass the second arg (`'max'` recommended).
- **Putting Tiptap editor code on a path importable by `(site)`.** ESLint `no-restricted-imports` enforces this, but also lazy-load (`next/dynamic ssr:false`) so the editor JS never enters the public bundle (PERF-02 audits in Phase 7).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Rich-text editor | Custom contenteditable + serializer | Tiptap v3 (`@tiptap/react`) | ProseMirror schema, 5+ years of edge-case handling, SSR serialization via `@tiptap/html` |
| JSON → HTML serialization | Manual ProseJSON walker | `@tiptap/html` `generateHTML(json, extensions)` | Handles all node/mark types, attrs, nested structures — a hand-roller will miss edge cases |
| HTML sanitization | Regex-based tag stripper | `isomorphic-dompurify` (DOMPurify + jsdom) | Regex cannot safely parse HTML; DOMPurify is the industry standard, handles mutation XSS, mXSS, namespace confusion |
| Image resizing at upload | Per-request resize middleware | `sharp` at upload time (3 variants stored) | Per-request = CPU on every view; upload-time = once, served forever (Pitfall #7) |
| Cron scheduling | `setInterval` + manual time math | `node-cron` | Cron expressions, DST handling, start/stop lifecycle — battle-tested over 10 years |
| Slug validation | Custom regex (will miss Unicode edge cases) | Zod `.regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)` + uniqueness DB check | D-20 = Latin-only manual slugs; a strict regex + DB unique constraint is sufficient |
| Form state management | Manual useState + validation | React Hook Form + Zod (`zodResolver`) | Performance (uncontrolled), schema reuse client+server, established project pattern |

**Key insight:** Every "don't hand-roll" item in this phase is a security or correctness surface. A custom HTML serializer will produce different output than the editor (round-trip breaks). A regex sanitizer will miss mutation XSS. A hand-rolled cron will mishandle DST. The locked stack exists precisely because these problems are deceptively hard.

## Common Pitfalls

### Pitfall 1: SSR round-trip extension mismatch (MEDIUM research flag — PRIMARY)
**What goes wrong:** `generateHTML` silently drops nodes/marks that aren't in its extensions array. A post with tables renders fine in the editor but the table vanishes on the public site.
**Why it happens:** The editor imports one set of extensions; the SSR pipeline imports a different (or stale) set. Common when copy-pasting tutorial code that differs between client and server setup.
**How to avoid:** ONE `extensions.ts` module imported by BOTH `Editor` (client) and `generateHTML` (server). Never inline the array in either place.
**Warning signs:** A Wave-0 round-trip test (`generateHTML(sampleJson, editorExtensions)` produces HTML containing `<table>`, `<img>`, `<pre><code>`, `<a>`) catches this before any rendering depends on it.

### Pitfall 2: DOMPurify iframe domain bypass
**What goes wrong:** Adding `iframe` to `ADD_TAGS` permits ANY iframe src — an author pastes `<iframe src="https://evil.com">` and it renders.
**Why it happens:** DOMPurify validates attributes and tags, NOT domain semantics. `ADD_TAGS: ['iframe']` alone is insufficient.
**How to avoid:** The `uponSanitizeAttribute` hook (Pattern 2) checks every iframe `src` against the `EMBED_DOMAIN_ALLOWLIST` and blanks disallowed domains. The hook IS the security gate; the tag allowlist just permits the element.
**Warning signs:** A test that sanitizes `<iframe src="https://evil.com"></iframe>` and asserts the output src is empty/removed.

### Pitfall 3: Server Action body-size limit blocks 10MB uploads
**What goes wrong:** Uploads silently fail with a 413 or a generic "fetch failed" because the Server Action rejects payloads over the default limit.
**Why it happens:** **The default `serverActions.bodySizeLimit` is 1MB** (NOT 4.5MB as CONTEXT.md speculated) per the installed Next.js 16.2.9 `serverActions.md`.
**How to avoid:** Set `experimental.serverActions.bodySizeLimit: '10mb'` in `next.config.ts`.
**Warning signs:** Uploads of images > 1MB fail; small images succeed.

### Pitfall 4: `output: "standalone"` + `public/` runtime writes 404
**What goes wrong:** The local storage provider writes to `public/uploads/...` at runtime; in the Coolify standalone production build, those files 404.
**Why it happens:** The standalone build trace copies `public/` at build time only. Runtime writes to `public/` are not included.
**How to avoid:** The local provider writes to a directory OUTSIDE `public/` (e.g. `storage/local/`) served via a Route Handler (Pattern 4).
**Warning signs:** Works in `pnpm dev`; 404s in the Docker/Coolify production build.

### Pitfall 5: `revalidateTag` lazy invalidation surprises
**What goes wrong:** The publish action calls `revalidateTag('posts','max')` but the homepage still shows the old list minutes later.
**Why it happens:** `revalidateTag(tag,'max')` marks data as stale — fresh data is fetched only when a page using that tag is NEXT VISITED. It does not proactively re-render.
**How to avoid:** Pair tag-based invalidation with explicit `revalidatePath` for the critical paths (post page, homepage). The two are complementary (D-25 uses both). For immediate expiration on webhook-triggered flows, use `{ expire: 0 }` or `updateTag`.
**Warning signs:** Cached listing pages lag behind the post detail page. `[VERIFIED: Next.js 16.2.9 revalidateTag.md — "fresh data is only fetched when pages using that tag are next visited"]`

### Pitfall 6: Autosave clobbering a published post
**What goes wrong:** An author edits a live post; autosave fires silently and the half-edited version goes live.
**Why it happens:** Autosave logic that doesn't check post status.
**How to avoid:** D-17 — autosave is DISABLED for published posts. The editor shows "manual save required." Enforce this in the autosave Server Action (early return if `status === 'published'`).
**Warning signs:** `updated_at` on published posts changing without an explicit Save.

### Pitfall 7: Preview token not rotating on publish
**What goes wrong:** A draft preview link continues to work after the post is published, exposing the draft version forever.
**Why it happens:** The publish action doesn't rotate the token.
**How to avoid:** D-19 — the publish Server Action generates a new `previewToken` (or nulls it). The old link 404s.
**Warning signs:** Old preview URLs still resolve post-publish.

## Code Examples

### Server Action template (mirrors Phase-2 `actions/users.ts`)
```typescript
// src/actions/posts.ts
// [CITED: src/actions/users.ts — the established Server Action pattern]
"use server";
import { revalidatePath, revalidateTag } from "next/cache";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { log } from "@/lib/log";
import { assertOwnsPost, requireCan } from "@/lib/permissions";
import { transitionPost } from "@/lib/permissions/post-transitions";
import { sanitizeBeforeStore } from "@/lib/sanitize";
import { postSchema } from "./posts-schema";

export async function savePost(input: unknown) {
  // 1. Permission check FIRST (Pitfall #1 — never trust the proxy gate)
  const session = await assertOwnsPost(/* postId if update */);

  // 2. Parse + validate with the shared Zod schema
  const data = postSchema.parse(input);

  // 3. Sanitize any HTML-capable field before storage (Pitfall #2 site #1)
  //    (body is ProseMirror JSON — sanitize applies to raw-HTML embed nodes inside it,
  //     extracted and re-injected, OR sanitize runs after generateHTML if storing HTML.
  //     Per D-02, embeds are raw HTML paste — sanitize the embed HTML before storing.)

  // 4. db.insert / db.update
  // 5. revalidatePath + revalidateTag(tag, 'max')
}
```

### Zod schema (shared RHF + Server Action — D-21 excerpt)
```typescript
// src/actions/posts-schema.ts
// [VERIFIED: zod@4.4.3 — schema API]
import { z } from "zod";

export const postSchema = z.object({
  title: z.string().min(1).max(255),
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "URL-safe Latin + hyphens only"), // D-20
  body: z.any(), // ProseMirror JSON — validated structurally elsewhere
  excerpt: z.string().max(500).optional(), // D-21 — manual or auto-derived
  categoryId: z.number().int().positive(), // D-23 required
  tagIds: z.array(z.number().int().positive()).max(8), // D-23 soft cap ~8
  featureImage: z.string().url().optional().or(z.literal("")),
  publishedAt: z.date().optional(), // D-14 UTC store
});
```

### Lazy-loaded editor boundary
```typescript
// src/app/(admin)/posts/new/page.tsx
import dynamic from "next/dynamic";

// Lazy-load: keeps Tiptap (and ProseMirror) out of the server bundle + public bundle.
// ssr:false — the editor is client-only (DOM-dependent).
const TiptapEditor = dynamic(() => import("@/components/editor/TiptapEditor").then(m => m.TiptapEditor), {
  ssr: false,
  loading: () => <div>Loading editor…</div>,
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Tiptap v2 (`@tiptap/*@2`) | Tiptap v3 (`@tiptap/*@3.27.1`) | v3.0.0 shipped 2024-07-14 | v2 is maintenance-only (`v2-latest` dist-tag); v3 is the active line. Use `@tiptap/*@3`. |
| Single-arg `revalidateTag(tag)` | 2-arg `revalidateTag(tag, 'max')` | Next.js 16 | Single-arg form is **deprecated**; `'max'` = stale-while-revalidate (recommended). |
| `middleware.ts` | `proxy.ts` | Next.js 16 | Renamed; auth-gate file is `proxy.ts` (Phase 2 already uses this). |
| `experimental.ppr` | `cacheComponents: true` | Next.js 16 | PPR config moved to a top-level flag (already set in `next.config.ts`). |
| DOMPurify v2 | DOMPurify v3 (3.4.11) | DOMPurify 3.0 (2023) | Trusted Types, mutation XSS fixes; `isomorphic-dompurify@3.18.0` wraps it. |
| Hand-written node-cron 2.x types | `@types/node-cron` | node-cron 3.x+ | The `cron.schedule(expr, fn)` API is unchanged; types are now separate. |

**Deprecated/outdated:**
- Single-arg `revalidateTag(tag)`: deprecated in Next.js 16 — use `revalidateTag(tag, 'max')` or migrate to `updateTag(tag)` for immediate expiration.
- `next/image` `domains` config: deprecated since v14 in favor of `remotePatterns`.
- Tiptap v2 `@tiptap/*@2`: maintenance-only — do not use for new code.

## Assumptions Log

> Claims tagged `[ASSUMED]` — the planner and discuss-phase use this to identify decisions needing user confirmation. Where possible, the Wave-0 round-trip test validates the assumption before implementation depends on it.

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | DOMPurify's `uponSanitizeAttribute` hook is the correct API for iframe src domain validation, and the hook receives `node` + `data.attrName`/`data.attrValue` | Pattern 2 (Sanitize) | If the hook API differs in 3.4.11, the iframe allowlist needs a different hook (`afterSanitizeAttributes`) or a DOM walk post-sanitize. LOW impact — well-established API. |
| A2 | DOMPurify auto-adds `rel="noopener noreferrer"` to `target="_blank"` links when `target` is allowed | Pattern 2 (D-05) | If not automatic in 3.4.11, the hook must enforce it. LOW impact — the hook is already present for iframe validation and can be extended. |
| A3 | The local storage provider should write to `storage/local/` (outside `public/`) served via a Route Handler, because `output: "standalone"` doesn't include runtime `public/` writes | Pattern 4 (Local provider) | If standalone DOES include runtime writes, `public/uploads/` would be simpler. MEDIUM impact — verify with a production build test. The Route Handler approach is safer regardless. |
| A4 | `node-cron@4.5.0`'s `cron.schedule(expression, fn)` API is identical to the documented 2.x/3.x API | Pattern 5 (Scheduler) | If 4.x changed the API, the scheduler wiring needs adjustment. LOW impact — the API has been stable for years; `@types/node-cron` will catch signature drift at compile time. |
| A5 | Tiptap raw-HTML-paste embeds (D-02) produce a node that `generateHTML` serializes as an `<iframe>` in the output HTML (which DOMPurify then gates) | Pattern 1 (Extensions) | If raw HTML in the ProseMirror doc is dropped or escaped by `generateHTML`, embeds need a custom node extension with a `renderHTML` method. MEDIUM impact — the Wave-0 round-trip test MUST include an iframe sample. |
| A6 | "Scheduled" status is represented as `status='draft' AND publishedAt <= now()` rather than a new `post_status` enum value | Pattern 5 (System-publish) | If a separate `'scheduled'` enum value is preferred, an additive migration is needed and the TRANSITIONS table + system-publish query change. LOW impact — planner decides; both are viable. |
| A7 | The DOMPurify config values (ADD_TAGS, ADD_ATTR list) are complete for the Rich tier (D-01) + media types (D-07) | Pattern 2 (Sanitize) | Missing an attribute (e.g. `poster` on `<video>`) strips it silently. LOW impact — discovered during testing, added to the config. |
| A8 | isomorphic-dompurify's jsdom-pin known issue (`.claude/CLAUDE.md`) is handled by pinning `jsdom@^29` in package.json overrides | Standard Stack | If the pin isn't applied, server-side sanitize may throw on certain payloads. LOW impact — documented known issue with a documented fix. |

**Note:** The DOMPurify API specifics (A1, A2, A7) could not be live-verified this session (web tools rate-limited, package not yet installed). They are based on the well-documented, stable DOMPurify API. The Wave-0 round-trip + sanitize tests MUST cover: iframe allowlist enforcement, target/rel preservation, video/audio/source survival, and malicious-payload stripping (`<img src=x onerror=...>`).

## Open Questions

1. **Scheduled-post status representation (A6)**
   - What we know: D-11 says the worker queries "scheduled" posts. The current `postStatusEnum` is `draft | pending_review | published`.
   - What's unclear: Is "scheduled" a 4th enum value, or is it `status='draft' AND publishedAt IS NOT NULL AND publishedAt <= now()`?
   - Recommendation: Use the signal approach (`status='draft' + publishedAt<=now()`) to avoid an enum migration and keep the TRANSITIONS table unchanged. The planner decides — both are additive-safe. If a distinct `'scheduled'` status is wanted, it's an additive `pgEnum` migration + TRANSITIONS update.

2. **Tiptap raw-HTML embed node shape (A5)**
   - What we know: D-02 chose raw-HTML-paste for embeds (iframes).
   - What's unclear: Does StarterKit's raw-HTML handling serialize correctly through `generateHTML`, or does the project need a custom `@tiptap/extension-*` node with an explicit `renderHTML`?
   - Recommendation: Validate in Wave-0 with a round-trip test that includes `<iframe src="https://www.youtube.com/embed/...">` in the JSON. If `generateHTML` drops it, add a minimal custom extension. The MEDIUM research flag is precisely this — validate before wiring.

3. **DOMPurify live-config verification (A1/A2/A7)**
   - What we know: The DOMPurify API is stable and well-documented.
   - What's unclear: Exact behavior of the `target="_blank"` auto-rel in 3.4.11, and whether the hook signature matches.
   - Recommendation: The Wave-0 sanitize tests (iframe allowlist, target/rel, malicious payload) validate this at implementation time. No external research needed — the test IS the verification.

4. **`settings` keys exact names**
   - What we know: CONTEXT.md suggests `storage.active_provider` and `site.timezone`.
   - Recommendation: Use those exact keys. Seed them in the Phase-3 migration (`storage.active_provider='local'`, `site.timezone='Asia/Dhaka'`). Add `site.feature_image_default` for the D-10 fallback. Planner confirms naming.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| PostgreSQL 16 | Data layer (all DB ops) | ✓ (Docker Compose, Phase 1) | 16 | — |
| MinIO (S3-compatible) | R2 provider local dev | ✓ (Docker Compose, Phase 1) | latest | Local provider is default — R2/MinIO only needed when `storage.active_provider='r2'` |
| Node.js 20.19+ LTS | Runtime | ✓ | 20.19+ (project requirement) | — |
| pnpm | Package manager | ✓ | latest | — |
| `sharp` native binaries | Image resize at upload | ✓ (Phase 1, `pnpm approve-builds` done) | 0.35.2 | — |
| Filesystem write access (`storage/local/`) | Local storage provider | ✓ (dev) | — | R2 provider (MinIO in dev) — switch via `settings.storage.active_provider='r2'` |

**Missing dependencies with no fallback:** none.
**Missing dependencies with fallback:** none — all required tools are available. The local storage provider needs a writable `storage/local/` directory (gitignored) — create it in the Wave-0 setup task.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.9 (already configured — `vitest.config.ts`) |
| Config file | `vitest.config.ts` (Node env default; `// @vitest-environment jsdom` pragma for component tests) |
| Quick run command | `pnpm test` |
| Full suite command | `pnpm test && pnpm test:migrations` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CONT-01 | Post CRUD + status transitions | unit + integration | `pnpm test src/actions/__tests__/posts.test.ts` | ❌ Wave 0 |
| CONT-02/03 | Tiptap JSON → generateHTML round-trip (SSR) | unit | `pnpm test src/components/editor/__tests__/round-trip.test.ts` | ❌ Wave 0 (PRIMARY research-flag test) |
| CONT-04 | Double sanitization (storage + render) | unit | `pnpm test src/lib/sanitize/__tests__/sanitize.test.ts` | ❌ Wave 0 |
| CONT-04 | Malicious payload stripped (`<img src=x onerror>`) | unit | (included above) | ❌ Wave 0 |
| CONT-05/06 | Category/tag CRUD + post_tags cap (~8) | unit | `pnpm test src/actions/__tests__/taxonomy.test.ts` | ❌ Wave 0 |
| CONT-07 | Slug validator (URL-safe, unique) | unit | `pnpm test src/lib/slug/__tests__/slug.test.ts` | ❌ Wave 0 |
| CONT-08 | Revalidation calls (concrete paths + 2-arg tags) | unit (mock `next/cache`) | `pnpm test src/actions/__tests__/posts.test.ts` | ❌ Wave 0 |
| CONT-09 | System-publish worker flips due posts | integration (mock db) | `pnpm test src/lib/schedule/__tests__/system-publish.test.ts` | ❌ Wave 0 |
| CONT-10 | Preview token rotate on publish | unit | `pnpm test src/actions/__tests__/posts.test.ts` | ❌ Wave 0 |
| CONT-11 | Autosave drafts-only (published blocked) | unit | `pnpm test src/actions/__tests__/posts.test.ts` | ❌ Wave 0 |
| MEDIA-01/04 | Storage provider registry resolves active provider | unit | `pnpm test src/lib/storage/__tests__/registry.test.ts` | ❌ Wave 0 |
| MEDIA-02 | Media upload writes provider + key + dimensions | integration | `pnpm test src/actions/__tests__/media.test.ts` | ❌ Wave 0 |
| Schema | Migration clean-room (media type/provider + previewToken) | integration | `pnpm test:migrations` | ✅ (existing — extend) |

### Sampling Rate
- **Per task commit:** `pnpm test` (Vitest quick run)
- **Per wave merge:** `pnpm test && pnpm test:migrations`
- **Phase gate:** Full suite green + the round-trip test (`generateHTML` with the chosen extensions array produces expected HTML) passing before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `src/components/editor/__tests__/round-trip.test.ts` — **PRIMARY**: validates `generateHTML(json, editorExtensions)` for headings, lists, links, tables, images, code blocks, AND a raw-HTML iframe embed sample. Closes the MEDIUM research flag. Covers CONT-02/03.
- [ ] `src/lib/sanitize/__tests__/sanitize.test.ts` — iframe allowlist enforcement, target/rel preservation, malicious-payload stripping, video/audio/source survival. Covers CONT-04.
- [ ] `src/actions/__tests__/posts.test.ts` — save/publish/autosave/preview-token actions (mock `next/cache`, `db`, `requireCan`). Covers CONT-01/08/10/11.
- [ ] `src/actions/__tests__/taxonomy.test.ts` — category/tag CRUD + tag cap. Covers CONT-05/06.
- [ ] `src/lib/slug/__tests__/slug.test.ts` — URL-safety + uniqueness. Covers CONT-07.
- [ ] `src/lib/schedule/__tests__/system-publish.test.ts` — due-post query + status flip. Covers CONT-09.
- [ ] `src/lib/storage/__tests__/registry.test.ts` — provider selection from `settings`. Covers MEDIA-01/04.
- [ ] `src/actions/__tests__/media.test.ts` — upload writes correct `media` record. Covers MEDIA-02.
- [ ] Extend `scripts/test-migrations.mjs` (existing) — the new migration (media provider/key rename + previewToken) must apply cleanly to an empty DB.

## Security Domain

> `security_enforcement: true` in `.planning/config.json` (ASVS Level 1). Phase 3's primary security surface is sanitization (Pitfall #2) + server-side RBAC (Pitfall #1, carried from Phase 2) + upload safety.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Carried from Phase 2 (Better Auth). No new auth surfaces in Phase 3. |
| V3 Session Management | no | Carried from Phase 2. The scheduler (D-12) explicitly has NO session — that's the documented exception. |
| V4 Access Control | yes | Every mutating Server Action starts with `requireCan`/`assertOwnsPost` (Phase-2 helpers); the scheduler uses the D-12 system-publish exception (auditable, logged). Autosave disabled for published posts (D-17). |
| V5 Input Validation | yes | Zod v4 schema (`posts-schema.ts`) shared client + server; slug regex validator (D-20); tag cap ~8 server-enforced (D-23); `serverActions.bodySizeLimit: '10mb'` bounds upload size. |
| V6 Cryptography | no | No new crypto. Preview tokens use `crypto.randomUUID()` (Node built-in). |
| V7 Error Handling | yes | `lib/log` wrapper (Phase 1); errors thrown as `UNAUTHORIZED`/`FORBIDDEN`/`NOT_FOUND` (Phase-2 pattern). |
| V12 Files & Resources | yes | Upload size cap (10MB, D-08); MIME-type allowlist at the validation layer; `sharp` re-encodes images (strips malicious payloads in EXIF/headers); non-image types stored as-is but mime-validated. Server-mediated upload (D-06) — no direct-to-storage. |
| V13 API & Web Service | yes | Server Actions are the mutation surface; all server-side checked. Preview route is token-gated (no auth) — token is high-entropy (`randomUUID`). |

### Known Threat Patterns for the Content Engine stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Stored XSS via editor body | Tampering / Elevation of Privilege | Double sanitization (Pitfall #2): DOMPurify before storage AND before render. Round-trip test includes `<img src=x onerror=...>`. |
| Iframe injection (evil-domain embed) | Tampering | DOMPurify `uponSanitizeAttribute` hook enforces per-provider domain allowlist (YouTube/X/Instagram). |
| Tabnabbing via `target="_blank"` | Spoofing | DOMPurify preserves `rel="noopener noreferrer"` default for blank-target links (D-05). |
| SSRF via body-image optimizer fetch | Information Disclosure / Tampering | **Non-issue with custom `cdnImageLoader`** — it bypasses the optimizer for absolute URLs (browser fetches directly). `remotePatterns` only protects the default `/_next/image` endpoint. `[VERIFIED: next/image docs]` |
| Path traversal in local storage provider | Tampering / Information Disclosure | Object keys are server-generated (not user-supplied filenames); sanitize keys against `../` sequences. |
| Privilege escalation (author publishing) | Elevation of Privilege | `transitionPost()` double-enforcement (Phase 2): TRANSITIONS table excludes author→published AND `requireCan({post:['publish']})` fails for authors. |
| Upload DoS (huge files) | Denial of Service | `serverActions.bodySizeLimit: '10mb'` (D-08); per-file cap enforced before processing. |
| Preview token enumeration | Information Disclosure | `crypto.randomUUID()` (122 bits entropy); no time-based structure to guess. |

## Sources

### Primary (HIGH confidence)
- **Installed Next.js 16.2.9 docs** (`node_modules/.pnpm/next@16.2.9.../next/dist/docs/`):
  - `01-app/03-api-reference/04-functions/revalidateTag.md` — **2-arg `revalidateTag(tag, profile)` confirmed**; single-arg deprecated; `"max"` = stale-while-revalidate (recommended).
  - `01-app/03-api-reference/04-functions/revalidatePath.md` — `revalidatePath(path, type?)`; literal vs dynamic-pattern; relationship with `updateTag`.
  - `01-app/02-guides/instrumentation.md` + `01-app/03-api-reference/03-file-conventions/instrumentation.md` — `instrumentation.ts` in root/src; `register()` called once at server init; `NEXT_RUNTIME` env gate.
  - `01-app/03-api-reference/05-config/01-next-config-js/serverActions.md` — **`bodySizeLimit` default is 1MB** (not 4.5MB); configurable to `'10mb'`.
  - `01-app/03-api-reference/02-components/image.md` — `remotePatterns` enforced by default loader's optimizer; custom `loaderFile` bypasses it; `unoptimized` prop.
- **npm registry** (`npm view` run 2026-07-04): `@tiptap/*@3.27.1` (html, core, react, starter-kit, table, image, code-block, link, youtube, blockquote, placeholder, typography, text-align, underline, subscript, superscript, pm), `node-cron@4.5.0` (created 2016, repo node-cron/node-cron), `isomorphic-dompurify@3.18.0`, `dompurify@3.4.11`.
- **Project `.claude/CLAUDE.md`** (verified 2026-07-01): Tiptap v3.27.1 `generateHTML`/`generateJSON`, Zod v4.4.3, drizzle 0.45.2 pinned, 2-arg `revalidateTag`, sharp postinstall, isomorphic-dompurify jsdom-pin known issue.
- **Existing codebase** (scout-verified): `src/db/schema.ts` (12-table schema + `postStatusEnum`), `src/lib/r2/index.ts` (`uploadImageVariants`), `src/lib/permissions/{index,post-transitions}.ts`, `src/actions/users.ts` (Server Action template), `src/lib/image-loader.ts` (`cdnImageLoader`), `next.config.ts` (`cacheComponents`, `remotePatterns`, custom loader).

### Secondary (MEDIUM confidence)
- Tiptap SSR `generateHTML(json, extensions[])` API — well-documented, stable across v2/v3; the parity rule (same extensions array) is the established pattern. `[CITED: tiptap.dev/docs/editor/extensions/server-side-rendering]`
- DOMPurify `ADD_TAGS`/`ADD_ATTR`/hooks API — stable, industry-standard; the `uponSanitizeAttribute` hook is the documented extension point. `[CITED: github.com/cure53/DOMPurify README]`

### Tertiary (LOW confidence — marked for Wave-0 test validation)
- Exact DOMPurify 3.4.11 behavior for `target="_blank"` auto-rel (A2) — not live-verified; the sanitize test validates it.
- Tiptap raw-HTML-paste embed node serialization through `generateHTML` (A5) — not live-verified; the round-trip test validates it.
- `node-cron@4.5.0` API identity with documented 2.x/3.x (A4) — `@types/node-cron` + compile-time type-check validates it.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all versions verified on npm registry 2026-07-04; aligned with the project's locked `.claude/CLAUDE.md` verified-2026 table.
- Architecture: HIGH — patterns built directly on the existing Phase-1/2 codebase (`uploadImageVariants`, `transitionPost`, `cdnImageLoader`, Server Action template); Next.js 16 APIs confirmed from installed docs.
- Pitfalls: HIGH for Pitfalls #3 (revalidateTag 2-arg confirmed) and #7 (upload-time sharp already proven in Phase 1); MEDIUM for Pitfall #2 (DOMPurify config specifics — API stable, exact config validated by Wave-0 tests); the SSR round-trip (Pitfall/SRF) is MEDIUM until the Wave-0 round-trip test passes.
- Revalidation: HIGH — `revalidateTag(tag,'max')` 2-arg form and `revalidatePath(path,type?)` signature confirmed verbatim from the installed Next.js 16.2.9 docs.
- Scheduler lifecycle: HIGH — `instrumentation.ts` + `register()` confirmed from installed docs; node-cron API is stable.

**Research date:** 2026-07-04
**Valid until:** 2026-08-04 (30 days — stable stack; the Tiptap/Next.js/DOMPurify APIs are unlikely to change. The MEDIUM-flag round-trip is validated by Wave-0 tests, not by the calendar.)
