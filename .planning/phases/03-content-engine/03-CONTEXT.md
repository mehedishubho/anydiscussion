# Phase 3: Content Engine - Context

**Gathered:** 2026-07-04
**Status:** Ready for planning

<domain>
## Phase Boundary

An author/editor can write a post in the lazy-loaded Tiptap v3 editor, attach media through a configurable storage provider (local by default, R2 available), categorize/tag it, and move it through the review/publish workflow (draft → pending_review → published) — with the post body surviving a sanitized JSON → HTML → render round-trip, scheduled publishing working, draft preview links working, autosave working, and publish reliably invalidating cached pages. Concretely this phase delivers:

- **Posts engine** — `actions/posts.ts` CRUD Server Actions over the existing `posts` + `post_seo` tables; every mutating action calls the Phase-2 permission helpers + `transitionPost()` first (R7 funnel).
- **Tiptap v3 editor** (`src/components/editor/`) — lazy-loaded, Rich capability set, storing ProseMirror JSON (`getJSON()`) as jsonb in `posts.body`; the SSR round-trip (`@tiptap/html generateHTML` with the SAME extensions array) is validated here before all rendering depends on it (MEDIUM research flag).
- **Shared sanitization** (`src/lib/sanitize/`) — ONE DOMPurify config used twice: before storage AND before render (Pitfall #2 — double-sanitization). Carries a per-provider iframe allowlist (raw-HTML embeds) + allows `target`/`rel` on `<a>` + `<video>`/`<audio>`/`<source>` for media.
- **Storage provider abstraction** (`src/lib/storage/`) — `StorageProvider` interface + a registry that reads the active provider from the `settings` table; ships **local (default)** + **R2** providers (R2 wraps the existing Phase-1 `src/lib/r2`); Cloudinary + push-CDN providers are Phase 4 (DASH-09). `sharp` resize-at-upload runs server-side regardless of provider (Pitfall #7).
- **Media library** — `actions/media.ts` server-mediated upload (buffer → sharp variants → provider), `media` records store provider + key + alt + dimensions + mime; non-image types stored as-is (skip sharp).
- **Taxonomy** — `actions/categories.ts` + `actions/tags.ts` CRUD + `post_tags` join; category/tag pickers in the post editor. Standalone Categories/Tags management pages are Phase 4 (DASH-02).
- **Revalidation** (Pitfall #3) — targeted `revalidatePath` (concrete paths) + 2-arg `revalidateTag` by post/category/tag/author wired into the publish/update action.
- **Scheduled publishing** (CONT-09) — in-process worker (`node-cron`) flips due `publishedAt` posts to `published`; full editor datetime-picker (UTC store, Asia/Dhaka display).
- **Draft preview links** (CONT-10) — `posts.previewToken` + a public `/preview/[token]` route; author-own + editor/admin can generate; no-expiry, rotates on publish, manual rotate/revoke.
- **Autosave** (CONT-11) — debounced (~3s on content-change) auto-save of Tiptap JSON; **drafts only** (published posts require explicit Save).

**Out of scope:** polished TailAdmin wiring for the *non-post* dashboard pages — users, media browser, pages, settings (Phase 4 DASH-01/03/04/05/09); Cloudinary + push-CDN storage providers (Phase 4 DASH-09); Categories/Tags standalone management UI (Phase 4 DASH-02); Storage Settings admin page (Phase 4 DASH-09); SEO metadata/JSON-LD/sitemap-content (Phase 5, though sitemap/rss revalidation is touched here); the public frontend surfaces (Phase 6); performance/bundle audit + production revalidation audit (Phase 7). Revision history remains v2 (CONTv2-01).

**Boundary decision (recorded for the planner):** Phase 3 ships the post editor at **TailAdmin-quality** (built into the `(admin)` shell with AppSidebar/AppHeader + form/layout chrome), which **partially consumes Phase 4's DASH-01** for the posts new/edit pages. Phase 4's DASH-01 therefore narrows to wiring the *other* dashboard pages (users, media browser, pages, settings) — the posts list/new/edit shell is largely done here. (D-24 below.)

</domain>

<decisions>
## Implementation Decisions

### Editor capabilities (Tiptap v3) — CONT-02, CONT-03, CONT-04
- **D-01 (Capability tier = Rich):** Starter-kit (headings, bold/italic, bullet/ordered lists, links, blockquote, inline code, horizontal rule) **+ media-in-body + code blocks + tables + pull-quotes/callouts + oEmbed embeds.** Highest research-risk option — concentrate verification on the embed extension + the SSR round-trip (the roadmap's MEDIUM flag).
- **D-02 (Embeds = raw HTML paste → sanitize):** Authors paste the provider's full embed HTML (iframe); it is sanitized before storage AND before render via the shared `lib/sanitize` DOMPurify config with a **per-provider iframe + domain allowlist** (YouTube, X/Twitter, Instagram, etc.). Most flexible but largest sanitize surface — the researcher MUST nail the iframe/domain allowlist and confirm DOMPurify permits iframes safely. Reject the "URL node → server-rendered" alternative.
- **D-03 (Body images = external URLs allowed):** Body images may be **external URLs (hot-linking OK)**, OR media-library images. `cdnImageLoader` already passes absolute URLs through, so this is mechanically supported. **Research flag:** arbitrary external URLs through `next/image`'s optimizer are an SSRF vector (server fetches any URL) — the researcher must decide mitigation: a `remotePatterns` domain allowlist OR `unoptimized` passthrough for external images. Allow ad-hoc inline upload + library pick too (consistent with the flexible-editor stance).
- **D-04 (Code blocks = plain, no highlighting):** `<pre><code>` blocks with no tokenization. Zero extra JS, trivial sanitize, leanest for the perf bar. Shiki (server) and lowlight (client) both rejected for v1.
- **D-05 (Links = manual):** Authors set `target`/`rel` themselves — no forced external/nofollow/auto-linkify. DOMPurify config **MUST allow `target` and `rel` attributes** on `<a>`, while keeping DOMPurify's default behavior of adding `rel="noopener noreferrer"` to `target="_blank"` links (anti-tabnabbing safety net stays).

### Media upload + storage — MEDIA-01..04, Pitfall #7
- **D-06 (Upload path = server-mediated):** Client → Server Action → `sharp` variants → provider. Reuses the proven Phase-1 `lib/r2` pipeline and keeps Pitfall #7 (upload-time sharp) intact; the `media` record is written in the same action. **Raise the Next.js Server Action body-size limit** (default ~4.5MB) to accommodate the 10MB cap (D-08). Reject presigned-direct (breaks server-side sharp) and client-side resize (loses sharp quality) for v1.
- **D-07 (Accepted file types = full media model):** The data model accepts any mime type — images + PDF/docs + video/audio. **Images run through sharp** (sm/md/lg WebP variants); **non-image types skip sharp and are stored as-is** with their original mime. Video/audio cannot go through `next/image` (needs `<video>`/`<audio>`/`<source>` or a direct link) — the sanitize config must allow these elements+attributes. Note: the 10MB cap (D-08) de-facto limits v1 to images + small docs.
- **D-08 (Max upload size = 10MB):** Per-file cap ~10MB. De-facto scopes v1 to images + small PDFs/docs; **real video hosting is deferred** (a 10MB cap makes uploading practical video impossible). Future video support = raise the cap AND add a presigned/streaming large-file path (current server-mediated + raised body limit won't scale to hundreds of MB). Captured as a deferred fast-follow. This dissolves the body-limit/timeout tension that server-mediated upload would otherwise create for large files.
- **D-09 (Provider abstraction shape):** `src/lib/storage/` ships a `StorageProvider` interface (`upload`, `getPublicUrl`, `delete`...) + a registry reading the active provider from the `settings` table (key e.g. `storage.active_provider`). **Local provider = default**; **R2 provider wraps the existing `src/lib/r2`** (`uploadImageVariants`). Per-provider credentials: local needs a filesystem path/URL base; R2 reuses the existing env vars for v1 (Cloudinary + push-CDN credentials move to the Phase-4 DASH-09 Storage Settings page). Researcher confirms the local provider's serve model (public/ vs. an external dir served via a route through `next/image`).
- **D-10 (Feature image source = library OR external):** `posts.featureImage` may be a media-library image OR an external URL — consistent with D-03. Feature image is **not required to publish** (optional; cards/OG fall back to a site default from `settings` when absent — researcher defines the fallback key).

### Scheduled publishing — CONT-09
- **D-11 (Mechanism = in-process worker):** A `node-cron`-style task inside the long-running Coolify process wakes periodically (e.g. every 1 min) and flips posts WHERE `status='scheduled' AND published_at <= now()` to `published`, then revalidates. v1 is single-instance so duplicate-fire is not a concern; the multi-instance guard (SKIP LOCKED / atomic UPDATE) is a v2 concern consistent with the documented ISR scaling cliff. Researcher confirms `node-cron` (or equivalent) lifecycle wiring in the Next 16 process (likely `instrumentation.ts` / a boot-time module).
- **D-12 (System-publish path):** The scheduler has **no session** and therefore CANNOT use `transitionPost()` (which calls `getSessionOrThrow` → throws UNAUTHORIZED). The planner adds an explicit **system-level publish path** — a narrow, well-justified exception to the R7 "all status writes via `transitionPost`" rule. Justification: the post was already approved before scheduling, so the flip is system-executed, not a user mutation. Keep it auditable + logged.
- **D-13 (Scope = primitive + editor UI):** Phase 3 ships the **full scheduling feature** — worker + the `publishedAt` field writable from the publish action + a datetime-picker in the post editor. (Not "primitive only" — the editor UI lands here, mirroring the TailAdmin-quality-now stance.)
- **D-14 (Timezone = UTC store + Asia/Dhaka display):** `publishedAt` stored as UTC (timestamp-without-tz, normalized to UTC on write). The editor datetime-picker displays in a **site-configured timezone** = `Asia/Dhaka` (read from a `settings` key, e.g. `site.timezone`), showing the tz explicitly in the picker. **Minute-resolution.** Adds a `site.timezone` `settings` key for the planner.
- **D-15 (Scheduling permission):** Consistent with Phase-2 RBAC — only editor/admin can schedule (scheduling = deferred publish, which authors lack). Authors submit for review; an editor/admin approves + may set a schedule.

### Editing safety net — CONT-10, CONT-11
- **D-16 (Autosave trigger = debounced on change):** Auto-save fires ~3 seconds after the last keystroke, only when content changed. Visible "Saving…/Saved" indicator. Implemented as a TanStack Query mutation (optimistic). NOT interval-based, NOT on-blur.
- **D-17 (Autosave scope = drafts only):** Autosave writes **only affect drafts (and pending_review)**. For a **published** post, autosave is **disabled** — edits to a live post require an explicit Save (so a careless edit never silently goes live). Consistent with v1 having no revision history (CONTv2-01 deferred) + Phase-2 D-13 (live-edits). The editor shows "manual save required" on published posts.
- **D-18 (Preview generation permission = author-own + editor/admin):** Any author can generate a preview link for their **own** draft (ownership-checked via `assertOwnsPost`); editor/admin for any post. Matches the trusting Phase-2 posture (D-14). Reject "editor/admin only" and "admin only" as over-restrictive for a small team.
- **D-19 (Preview life = no-expiry, rotate/revoke):** The token is long-lived until the post is **published** (token rotates on publish so the old link 404s) OR the author/editor explicitly **rotates/revokes** it (a "Regenerate" button in the editor). No time-boxed expiry, no single-use. Adds a `posts.previewToken` column (+ consider `previewTokenAt` for rotation tracking). Public route `/preview/[token]` renders the draft, token-gated (no auth).

### Slugs — CONT-07
- **D-20 (Slugs = manual entry only):** No auto-generation from the title — the author always types the slug manually (Latin, by convention). **Zero transliteration research risk** (rejects auto-transliterate Bangla→Latin and Bangla-Unicode-slug options). A validator/typecheck enforces URL-safety (Latin chars + hyphens, unique). Applies to posts, categories, and tags.

### Excerpt
- **D-21 (Excerpt = both, author picks):** Ship a hand-written `posts.excerpt` field AND an auto-derive utility (first ~160 chars of body plain-text, **Bangla-aware** — byte/reasonable-char count, not Latin-character limit). The author chooses which is used per post (e.g., a "use auto" affordance; if the manual field is filled it takes precedence). Feeds Phase-5 SEO meta + Phase-6 post-card previews.

### Taxonomy — CONT-05, CONT-06
- **D-22 (Taxonomy UI boundary = actions + editor pickers now; mgmt UI in Phase 4):** Phase 3 ships the taxonomy Server Actions (create/list/edit/soft-delete for categories + tags) + the category/tag **pickers inside the post editor**. The standalone Categories/Tags management pages (full CRUD tables) are **Phase 4 (DASH-02)**. For Phase-3 testing/seed, taxonomy is created via the actions directly or a minimal path.
- **D-23 (Taxonomy rules = required category, tags capped ~8):** **One category is required** per post (CONT-05); a post can have **multiple tags** (CONT-06) up to a **soft cap of ~8** (rejects optional-category and uncapped-tags). The cap is enforced server-side in the post save action.

### Phase-3 vs Phase-4 UI boundary — affects DASH-01
- **D-24 (Post editor = TailAdmin-quality now):** The post editor page (Tiptap + title + slug + excerpt + category/tags pickers + schedule picker + feature image + save/submit/publish) is built **into the TailAdmin `(admin)` shell to near-final quality** (AppSidebar/AppHeader + existing form/layout components), not a throwaway minimal page. This **partially consumes Phase 4's DASH-01** for posts new/edit — Phase 4's DASH-01 then narrows to wiring the **other** dashboard pages (users DASH-04, media browser DASH-03, pages DASH-05, settings DASH-09). Recorded so the Phase-4 planner does NOT re-plan the posts editor.

### Revalidation — CONT-08, Pitfall #3
- **D-25 (Revalidation breadth = targeted paths + tags):** On publish/update, the publish Server Action calls `revalidatePath` with **concrete paths** (the post's own page, home, its category archive, its tag archives, author page, `/sitemap.xml`, `/rss.xml`) AND `revalidateTag(tag, 'max')` (the **2-arg form** — MEDIUM research flag, confirm on a real action) keyed by post id / category / tag / author for granular invalidation. **No template strings.** Rejects broad (whole-site `revalidatePath('/', 'layout')`) and minimal (post-page-only) — both have documented failure modes (full-cache waste / under-invalidation leaving stale listings).

### Claude's Discretion
The following are intentionally left open for the researcher/planner (founder-level decisions are exhausted):
- Exact DOMPurify config + iframe/domain allowlist contents (D-02), the SSRF mitigation choice for external images (D-03 — `remotePatterns` allowlist vs `unoptimized` passthrough), and confirming DOMPurify's `target`/`rel` behavior (D-05).
- `node-cron` lifecycle wiring in Next 16 (D-11), the exact system-publish SQL shape (D-12), and the precise minute interval.
- The local storage provider's serve model (D-09 — `public/` vs external-dir-via-route), the exact `settings` keys (`storage.active_provider`, `site.timezone`, feature-image fallback), and per-provider credential storage for v1.
- Tiptap v3 extension package list + the exact extensions array passed to `generateHTML` (the round-trip parity is the MEDIUM research flag).
- `StorageProvider` interface method shapes, the `previewToken` generation scheme, autosave debounce implementation details, and the `posts`/`media` schema migration deltas below.

### Schema gaps Phase 3 must close (one migration, `drizzle-kit generate`)
- `media.uploadedBy` is currently `integer` — **broken** now that `user.id` is `text` UUID (Better Auth). Fix to `text("uploaded_by").references(() => user.id)`.
- `media.r2Key` is provider-specific — **rename/generalize** to `providerKey` + add a `provider` column (text or enum: `local` | `r2`; Cloudinary/push-CDN added Phase 4) per MEDIA-02/MEDIA-04.
- `posts` — add `previewToken` (varchar, nullable, unique) for CONT-10 (D-19).
- `settings` — no schema change (key-value), but seed the `site.timezone` = `Asia/Dhaka` and `storage.active_provider` = `local` keys.
- Consider: a `post_status` value or separate handling for "scheduled" (the worker queries `status='scheduled'` per D-11 — confirm whether `publishedAt IS NOT NULL AND status='draft'` is the "scheduled" signal, or a new status enum value is added). Researcher/planner picks; an enum addition is an additive migration.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project-level (stack + scope — authoritative)
- `CLAUDE.md` (repo root) — locked stack, conventions, folder structure, schema reference, "Roles & permissions" (admin/editor/author matrix), "SEO requirements", "Performance requirements", and "What NOT to do" (never raw `<img>` for content images; never hand-write SQL; pnpm only; R2 only for media; sanitize raw HTML before storage AND render).
- `.claude/CLAUDE.md` — **verified 2026 version table + code shapes**: Tiptap **v3.27.1 (not v2)** — use `@tiptap/*@3`; `@tiptap/html` `generateHTML`/`generateJSON`; **Zod v4.4.3** (shared client/server schema); **drizzle-orm 0.45.2** pinned (do NOT adopt 1.0 RC); **2-arg `revalidateTag(tag, 'max')`**; `sharp@0.35.2` postinstall `pnpm approve-builds`; **isomorphic-dompurify@3.18.0** (jsdom pin known issue, `clearWindow`). Read before any dependency install or config.
- `.planning/PROJECT.md` — v1 scope, Key Decisions, Context (existing TailAdmin scaffold, small fixed team 2–5, greenfield DB, no reader auth, self-hosted/no-paid-API ethos).

### Phase-3-specific (requirements + roadmap)
- `.planning/REQUIREMENTS.md` — **CONT-01..11, MEDIA-01..04** (the 15 requirements this phase must satisfy), plus the Out-of-Scope rows (no comments, no i18n routing, no paid APIs, no Vercel tooling, no reader auth).
- `.planning/ROADMAP.md` §"Phase 3: Content Engine" — goal, **5 success criteria**, **Pitfalls #2** (double-sanitization + Tiptap JSON storage), **#3** (`revalidatePath`/`revalidateTag` wired into the publish action), **#7** (upload-time sharp resize, not per-request), **research flag (MEDIUM)**: validate the Tiptap v3 SSR round-trip (`@tiptap/html generateHTML` with the chosen extensions array) and confirm the `revalidateTag(tag, 'max')` 2-arg form on a real publish action.

### Prior-phase context (carries forward)
- `.planning/phases/01-foundation/01-CONTEXT.md` — **D-05** (hybrid schema depth), **D-08** (soft-delete `deletedAt` on content), **D-11** (forward-only migrations), **D-12** (env-driven `NEXT_PUBLIC_CDN_URL`), **D-14** (Phase-1 = minimal `lib/r2` helper; presigned-URL flow deferred to Phase 3 — **lands here as D-06**), **D-16** (`@/*`→`src/*`), **D-17** (`lib/log` wrapper exists).
- `.planning/phases/02-auth-rbac/02-CONTEXT.md` — **D-10..D-12** (3 fixed roles via `admin` plugin; `requireRole`/`requireCan`/`assertOwnsPost` helpers), **D-13/D-14/D-15** (review-workflow transition rules — `transitionPost()` is the R7 funnel; author cannot publish; live-edits on published posts; trusting edge policy), **D-24/D-25** (user.bio + user.avatar via R2 — avatars upload through this phase's storage pipeline).

### Code (current state — scout-verified)
- `src/db/schema.ts` — the 12-table schema (8 Phase-1 + user/session/account/verification Phase-2). `postStatusEnum` (`draft`/`pending_review`/`published`), `posts` (with `body jsonb`, `excerpt`, `publishedAt`, `featureImage`, soft-delete), `media` (note: `uploadedBy integer` + `r2Key` — **schema gaps to fix**), `categories`/`tags`/`postTags`, `settings` (key-value). Source of truth — every schema delta flows through `drizzle-kit generate`.
- `src/lib/r2/index.ts` — the Phase-1 minimal helper: `uploadImageVariants(buffer, baseKey)` produces 3 sharp WebP variants (640/1024/1920) and writes to S3-compatible storage (MinIO local, R2 prod via env). The R2 provider in `lib/storage/` **wraps this** (D-09).
- `src/lib/permissions/index.ts` — `getSessionOrThrow`, `requireRole`, `requireCan({post:["publish"]})`, `assertOwnsPost(postId)`. **Call these first in every Phase-3 mutating action** (Pitfall #1).
- `src/lib/permissions/post-transitions.ts` — `transitionPost(postId, target)` — the R7 single funnel for status writes; already enforces author-cannot-publish (double). **The publish action calls this; the scheduled-publish worker CANNOT (no session) → D-12 system path.**
- `src/lib/image-loader.ts` — `cdnImageLoader` already passes absolute (CDN/external) URLs through with sizing params and serves local static from app origin. Ready for media (D-03 external body-image URLs work mechanically).
- `src/actions/users.ts` — the established Server Action pattern: `"use server"` + `requireCan(...)` first + `log`/throw. **Phase-3 `actions/posts.ts`, `actions/categories.ts`, `actions/tags.ts`, `actions/media.ts` mirror this pattern.**
- `src/lib/db/index.ts` — exports `db, schema`. `src/lib/log/index.ts` — `log.error` etc. `src/lib/auth/{index,server,client}.ts` — Better Auth instance + session reader.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`src/lib/r2/index.ts`** → `uploadImageVariants()` — wrapped unchanged by the new R2 `StorageProvider` (D-09); the local provider implements the same `StorageProvider` interface against the filesystem.
- **`src/lib/permissions/`** → `requireCan` / `assertOwnsPost` / `transitionPost` — called at the top of every posts/taxonomy/media mutating action (Pitfall #1) and as the publish funnel (R7).
- **`src/lib/image-loader.ts`** → `cdnImageLoader` — already handles absolute CDN/external URLs; no change needed for D-03.
- **`src/actions/users.ts`** → the Server Action template (`"use server"`, permission-check-first, `log`+throw) — clone for `actions/posts.ts` etc.
- **`src/lib/log`, `src/lib/db`, `src/lib/auth`** — reuse directly inside the new actions + the storage registry + the sanitize wrapper.
- **TailAdmin `(admin)` shell** (`AppSidebar`/`AppHeader`/contexts in `src/layout/`, `form`/`tables`/`ui` component kits) — the post editor page builds into this shell per D-24.

### Established Patterns
- **Server Actions as the default mutation path** + Zod schemas shared client/server (Phase 4 formalizes RHF+Zod; Phase 3 establishes it for posts). Each schema lives alongside its feature (e.g. `src/actions/posts-schema.ts` or `src/app/(admin)/posts/schema.ts`).
- **pnpm-only**; migrations via `drizzle-kit generate` (never hand-write SQL); **clean-room migration test** (`pnpm test:migrations`) catches drift — the `media` type/provider + `posts.previewToken` deltas flow through the same pipeline.
- **ESLint `no-restricted-imports`** keeps `(site)`/`(admin)` isolated — the new `actions/` + `lib/storage` + `lib/sanitize` live outside `app/` so both route groups can import them without leakage. The Tiptap editor (`src/components/editor/`) is **dashboard-only** — must NOT leak into the `(site)` bundle (PERF-02 audits this in Phase 7; lazy-load it).
- **Double-sanitization** — one shared `lib/sanitize` config used before storage AND before render (Pitfall #2). The sanitize-on-render must run before any `dangerouslySetInnerHTML` on the public site (reinforced in Phase 6).

### Integration Points
- **New `lib/` modules:** `src/lib/storage/` (interface + registry + local + r2 providers), `src/lib/sanitize/` (shared DOMPurify config), `src/lib/slug/` (URL-safe validator for D-20), `src/lib/schedule/` (the `node-cron` worker + system-publish path).
- **New `actions/` files:** `src/actions/posts.ts` (CRUD + publish + autosave + preview-token rotate), `src/actions/categories.ts`, `src/actions/tags.ts`, `src/actions/media.ts` (server-mediated upload).
- **New `components/editor/`** — the lazy-loaded Tiptap v3 wrapper + extensions + toolbar (Rich set, D-01).
- **New routes:** `src/app/(admin)/posts/{,new,[id]/edit}/` (TailAdmin-quality, D-24); `src/app/(site)/preview/[token]/page.tsx` (draft preview, D-19); a scheduler boot hook (`instrumentation.ts` or similar, D-11).
- **Schema migration (one):** `media.uploadedBy` → text FK; `media.r2Key` → `providerKey` + `provider`; `posts.previewToken` added; seed `site.timezone` + `storage.active_provider` settings.
- **Env additions (`.env.example`):** storage provider selection is `settings`-driven, but the R2 provider still reads the existing `S3_*` env for v1; `node-cron` worker needs no new env (in-process). `next.config.ts` `images.remotePatterns` updated per the SSRF-mitigation choice (D-03).

</code_context>

<specifics>
## Specific Ideas

- **Flexible, permissive editor stance** — the founder consistently chose the most flexible option across editor questions (Rich tier, raw-HTML embeds, external body-image URLs, manual links, feature-image library-OR-external). The implementation should lean toward author freedom; hard safety rails live in the shared sanitizer, not in editor restrictions.
- **TailAdmin-quality post editor now (D-24)** — the founder wants the posts new/edit experience built properly into the dashboard shell this phase, not a throwaway. This is a deliberate quality call that pulls part of Phase 4's DASH-01 forward.
- **No aesthetic/branding references** (branding deferred to the UI phase per PROJECT.md). The founder's preferences here are capability/scope/security choices (D-01..D-25), not look-and-feel.

</specifics>

<deferred>
## Deferred Ideas

- **Video hosting (real video uploads)** — the 10MB cap (D-08) de-facto excludes video in v1. Future support = raise the cap AND add a presigned/streaming large-file path (server-mediated + raised body limit won't scale to hundreds of MB). Fast-follow.
- **Cloudinary + push-CDN storage providers** → Phase 4 (DASH-09), extending the `lib/storage/` abstraction from this phase.
- **Storage Settings admin page** → Phase 4 (DASH-09) — per-provider credentials UI.
- **Categories/Tags standalone management UI** → Phase 4 (DASH-02). Phase 3 ships actions + editor pickers only (D-22).
- **Revision history / draft versions** → v2 (CONTv2-01). Its absence is why autosave is drafts-only (D-17) and edits to published posts are live (Phase-2 D-13).
- **Stricter editorial control (publish → pending_review on edit)** → v2 (needs CONTv2-01).
- **Auto-transliteration / Bangla-Unicode slugs** → rejected for v1 (D-20 = manual slugs); a transliteration fast-follow is possible if manual entry proves painful.
- **Bundle-budget enforcement + production revalidation audit** → Phase 7 (PERF-02, PERF-03). Phase 3 wires revalidation (D-25) + lazy-loads the editor; Phase 7 verifies no editor JS leaks public + publish→visible works on the real stack.

### Reviewed Todos (not folded)
- **"Configurable multi-destination backup system"** (pending todo, area: database, matched Phase 3 with score 0.6) — **reviewed, NOT folded.** False-positive keyword overlap ("configurable, planning, requirements, phase"). This todo was already mutated into **Phase 8 — Backup & Disaster Recovery** (BACKUP-01..05) via the 2026-07-02 roadmap update; it is unrelated to the Content Engine and remains Phase 8's concern. See `.planning/todos/pending/2026-06-30-configurable-multi-destination-backup-system.md`.

</deferred>

---

*Phase: 3-Content Engine*
*Context gathered: 2026-07-04*
