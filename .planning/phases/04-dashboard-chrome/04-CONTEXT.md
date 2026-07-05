# Phase 4: Dashboard Chrome - Context

**Gathered:** 2026-07-05
**Status:** Ready for planning

<domain>
## Phase Boundary

The editorial team manages the full content lifecycle through a polished TailAdmin dashboard **wired to real data** — every page that Phase 3 shipped *actions* for but no *UI* gets its TailAdmin-quality surface here, plus the shared form/mutation pattern is established dashboard-wide and two carry-over items from Phase 3 UAT land. Concretely this phase delivers:

- **Dashboard shell restructure** — move every `(admin)` sub-page under a real `/dashboard/*` URL segment (folded UAT todo); role-filtered sidebar; lean real-stats overview; demo cleanup.
- **Taxonomy management (DASH-02)** — standalone Categories + Tags CRUD tables over the Phase 3 `actions/categories.ts` + `actions/tags.ts`.
- **Media library + reusable picker (DASH-03 + folded UAT todo)** — grid/list browser page consuming Phase 3 `actions/media.ts` + one reusable `<MediaPicker>` modal wired into the post feature-image field, the editor image button, and (later) avatar — replacing Phase 3's URL-only input.
- **Users & roles management (DASH-04)** — admin-only users table + drawer for create/edit/disable/role-assign, plus self-service profile editing; surfaces the Phase 2 ban/revoke primitives in the UI.
- **Pages management (DASH-05)** — T&C / Privacy / Contact edited through a trimmed Tiptap editor against the existing `pages` table.
- **Form/mutation pattern (DASH-06)** — React Hook Form + Zod (shared server-side) + TanStack Query applied to **all** dashboard pages and **retrofitted onto the Phase 3 posts editor**.
- **Demo cleanup + dark mode + lean load (DASH-07, DASH-08)** — delete unused TailAdmin demos, lazy-load heavy bits, dark mode already works via `ThemeContext`.
- **Storage Settings + new providers (DASH-09)** — admin-only Storage Settings page choosing the active image destination (local / R2 / Cloudinary / push-CDN), implementing the **Cloudinary** + **push-CDN** providers that extend the Phase 3 `lib/storage/` abstraction, with validated encrypted credential storage.

**Out of scope:** the post *editor* itself (already TailAdmin-quality from Phase 3 D-24 — do NOT re-plan it; DASH-01 narrows to the *other* pages); SEO metadata/JSON-LD/sitemap-content (Phase 5); the public frontend surfaces (Phase 6); the Contact *form* behavior — SMTP/honeypot/rate-limit (Phase 6 SITE-10; this phase edits Contact *content only*); performance/bundle-budget audit + production revalidation audit (Phase 7); backups (Phase 8). Revision history remains v2 (CONTv2-01).

**Boundary notes for the planner:**
- Phase 3 D-24 already built posts list/new/edit at TailAdmin-quality. **DASH-01 is largely satisfied.** This phase wires the *other* dashboard pages and retrofits the posts editor onto the shared RHF+Zod+TanStack Query pattern (D-26).
- All Phase 3 Server Actions exist (`actions/{posts,posts-schema,categories,tags,media,media-schema,settings}.ts`). Most Phase 4 pages are UI over existing actions — the planner should NOT re-plan the action layer except for: a Cloudinary/push-CDN provider extension to `lib/storage/`, a Storage Settings save action (admin-gated), user create/edit/disable/revoke actions (extending Phase 2's `actions/users.ts`), and pages CRUD actions.

</domain>

<decisions>
## Implementation Decisions

### Dashboard shell, navigation & demo cleanup (DASH-07, DASH-08 + folded route-restructure todo)
- **D-01 (Route restructure → `/dashboard/*`):** Move every `(admin)` sub-page under a real `dashboard` URL segment folder — `src/app/(admin)/dashboard/{posts,categories,tags,media,users,pages,settings,…}/`. Keep `(admin)/layout.tsx` + `AdminShell`/sidebar at the group root so the shell still wraps everything. Then: simplify `src/proxy.ts` to a single `/dashboard/*` matcher; update sidebar `href`s, the "+ New Post" button, per-row edit links, and any `router.push`/redirect targeting admin paths; update the Phase 2 auth-gate test (`scripts/test-auth-gate.mjs`) to target `/dashboard/*`. (Folded from `.planning/todos/pending/2026-07-04-dashboard-route-prefix-restructure.md`.)
- **D-02 (Sidebar = focused CMS nav + collapsed Components reference):** Top nav = Posts, Categories, Tags, Media, Pages, Users, Settings + Profile + Calendar (real tools). **Plus a collapsed "Components" reference group** preserving the `(ui-elements)` showcase (buttons/alerts/modals/badges/avatars/images/videos) as an in-app kit reference — NOT deleted (the founder is not yet confident enough in the kit to drop it; CLAUDE.md allows deletion "once confident").
- **D-03 (Demo cleanup scope):** **Delete** the `(others-pages)` chart/form/table demo routes AND their now-unused component files. **Keep** Calendar + Profile as real features (wire Profile to real data per D-09). **Keep** the `(ui-elements)` showcase (per D-02). The `ecommerce/` folder was already removed in Phase 1.
- **D-04 (Overview `/dashboard` = lean real stats):** Server-rendered, no charts. Posts-by-status counts (draft / pending_review / published), a short list of pending-review drafts needing action, media count, and a quick "New post" CTA. Swap-in of richer analytics deferred to Phase 7.
- **D-05 (Role-filtered sidebar):** Sidebar items filter by the viewer's role — authors don't see Users/Settings; editors don't see Users/Storage Settings. **UX layer only** — authoritative RBAC still happens server-side in every action (Phase 2 Pitfall #1/#4; never rely on UI hiding).
- **D-06 (Dark mode = verify, don't rebuild):** DASH-08 is a no-op-by-design — the existing `ThemeContext` (Phase 1) already provides dark mode. This phase only verifies coverage on the new pages. No new theming work expected.

### Users & roles management (DASH-04) — surfaces Phase 2 primitives in UI
- **D-07 (Create/edit = table + side drawer/modal):** A users table page at `/dashboard/users` + a side drawer/modal for create & edit (credentials, role, bio, avatar) without leaving the page. Mirrors the small-team UX; faster than dedicated pages.
- **D-08 (Disable-only, no destructive delete):** An admin can **disable (ban)** a user (cannot sign in; re-enable possible) but **cannot destructively delete**. Reuses the Phase 2 D-16 `banUser` primitive. Preserves post authorship integrity (a soft-deleted author would orphan their posts).
- **D-09 (Self-service profile):** Any role edits their own name/bio/avatar at `/dashboard/profile`; admins can edit anyone. The existing Profile page (`(others-pages)/profile`) is kept (D-03) and wired to real data here. AUTH-08 fields feed Phase 6 byline/author pages (SITE-06); avatars upload through the existing storage pipeline (Phase 2 D-25).
- **D-10 (Sessions = revoke only, no per-device list):** Admin can revoke another user's sessions from the users table (Phase 2 D-17 primitive); each user can revoke their own at `/profile`. **No** per-device session list / IP / last-active UI in v1 (overkill for a 2–5 person team).
- **D-11 (Role assignment surface):** Role (admin/editor/author) is assigned in the create/edit drawer via a dropdown; the underlying user action re-checks `requireCan('user.*')` server-side (Phase 2 D-10/D-12).

### Media library & reusable picker (DASH-03 + folded picker todo)
- **D-12 (Library browser = grid + list toggle):** `/dashboard/media` shows a grid of image thumbnails (the dominant case) with a list toggle. Click → a details drawer (alt text, dimensions, provider, used-by where known). Consumes the existing `actions/media.ts` (`listMedia`/`uploadMedia`/`deleteMedia`).
- **D-13 (One reusable `<MediaPicker>` modal):** A single modal component — browse + upload-in-place + select — consumed by (a) the post feature-image field, (b) the editor body-image button (replaces Phase 3's `window.prompt` URL input in `Toolbar.tsx`), and (c) the avatar field (Phase 4 users/profile). Includes a **"paste external URL" tab** so Phase 3 D-10's external-URL option is preserved. (Folded from `.planning/todos/pending/2026-07-04-media-library-picker-ui.md`.)
- **D-14 (Upload UX = drag-drop + multi-file + progress + alt prompt):** Drag-drop zone + file picker, multi-file, per-file progress indicators, alt-text prompt on upload (and editable after). The 10MB cap (Phase 3 D-08) is enforced both client- and server-side.
- **D-15 (Delete safety = soft-delete + warn, don't block):** Media deletion is a soft-delete (Phase 1 D-08 `deletedAt`). If the media's URL appears referenced in a post body or feature-image, **warn** the admin but do not block — references are URL strings, so deleting may orphan a CDN URL (404) without breaking the post structurally. Best-effort reference scan (Claude's discretion on whether to make it reference-counted or simple substring).

### Taxonomy management (DASH-02)
- **D-16 (Categories + Tags pages = TailAdmin tables over Phase 3 actions):** Standalone `/dashboard/categories` and `/dashboard/tags` management pages — TailAdmin-quality tables with create/edit/soft-delete. They consume the existing Phase 3 `actions/categories.ts` + `actions/tags.ts` (built per Phase 3 D-22); **no new server actions needed** for taxonomy.

### Pages management (DASH-05) — uses existing `pages` table (Phase 1 D-06)
- **D-17 (Seed T&C + Privacy + Contact at migration):** Seed three `pages` rows (title + slug + empty body, `draft` status) at migration so the admin just edits content. **About stays hard-coded** TSX/MDX (PROJECT.md) — not a `pages` row. New pages can be added later via a "New page" affordance.
- **D-18 (Page editor = trimmed post editor):** Same lazy-loaded Tiptap body + title + slug + SEO fields (`meta_title`/`meta_description`/`canonical` — already on the `pages` table) + status. **Drop post-only fields:** category, tags, excerpt, feature-image, schedule, preview token. Reuses the Phase 3 editor component, slimmed.
- **D-19 (Contact page = content-only here; form is Phase 6):** The Contact **page** is body content only (intro text, address, hours, etc.) edited in this phase. The Contact **form** — SMTP delivery, honeypot, rate-limit, field config — is **Phase 6 (SITE-10)**. No form-builder UI is built in this phase (would pull Phase 6 work forward).
- **D-20 (Page status = simple draft/published, no review):** Pages use `draft`/`published` only — legal/contact content does not need editorial review. Editor/admin publishes directly. (No `pending_review` for pages.)

### Storage Settings + new providers (DASH-09) — most technically nuanced
- **D-21 ("push-CDN" = generic S3-compatible / origin-pull provider):** The undefined "push-CDN" is implemented as a **generic S3-compatible / origin-pull CDN `StorageProvider`** — accepts a configurable CDN base URL (and optional purge/invalidate credentials). No vendor lock-in: Bunny CDN, Cloudflare CDN-in-front-of-origin, KeyCDN, etc. all fit by configuration. **Distinct from the R2 provider** (origin object storage). Chosen over naming a single vendor (Bunny) and over deferring to v2.
- **D-22 (Cloudinary = full provider):** Implement Cloudinary as a full `StorageProvider` — upload via the Cloudinary API + deliver via Cloudinary URLs with on-the-fly transforms. **When Cloudinary is the active provider, it owns transforms** (Cloudinary's value proposition); `sharp` still runs at upload for the local/R2 path. Chosen over "delivery-only/fetch" (which would keep paying origin egress).
- **D-23 (Storage Settings page = admin-only, single active provider):** `/dashboard/settings/storage` (admin-only) lets an admin pick the active image destination (local / R2 / Cloudinary / push-CDN) and enter per-provider credentials. The save action persists the choice + credentials to `settings` and **re-checks admin permission server-side** (`requireRole('admin')` / `requireCan`). Extends the Phase 3 `lib/storage/` registry (Phase 3 D-09).
- **D-24 (Credential validation = "Test connection" before save):** Per-provider credential fields include a **"Test connection"** button that runs a no-op probe (list a bucket / upload a 1px file / ping the CDN) and must pass before Save persists. Inline success/failure feedback. Catches bad credentials before they break uploads.
- **D-25 (Credential storage = encrypted at rest):** Provider credentials (R2 keys, Cloudinary secret, push-CDN API key) are **encrypted at rest** in the `settings` value via app-level encryption (key from env), and **never exposed to the client** (settings reads for the dashboard return redacted/absent secrets). Aligns with the Phase 8 BACKUP secret-handling story and the CLAUDE.md security bar. Chosen over plain `settings` values.

### Form & mutation pattern (DASH-06)
- **D-26 (RHF + Zod + TanStack Query everywhere + retrofit posts):** The shared pattern — React Hook Form + a Zod schema (the same file reused server-side for Server Action input parsing) + TanStack Query mutations — is applied to **all new Phase 4 pages AND retrofitted onto the Phase 3 posts editor**, giving one consistent dashboard-wide form/mutation story. Existing schemas (`posts-schema.ts`, `media-schema.ts`) are reused/extended; new feature schemas (users, pages, categories, tags, settings) live alongside their feature per CLAUDE.md.
- **D-27 (Selective optimistic UI):** Optimistic updates on **high-frequency small mutations** — media delete, taxonomy CRUD, user ban/role-change, page save. **NOT** optimistic on **post publish** (high-stakes — needs server confirmation, especially with revalidation) or **media upload** (progress indicator already communicates state).
- **D-28 (QueryClient scoped to `(admin)` only):** `QueryClientProvider` wraps the `(admin)` layout **only** — never `(site)` — so TanStack Query adds zero client JS to the public bundle (reinforces PERF-02 bundle isolation, audited in Phase 7). React Query devtools enabled in **dev only**.

### Schema/seed deltas for Phase 4 (one migration via `drizzle-kit generate`)
- **D-29 (Mostly seed/config, minimal structural change):** All underlying tables (`posts`, `pages`, `users`, `media`, `settings`) already exist. This phase's migration is mainly: (a) **seed** the T&C/Privacy/Contact `pages` rows (D-17); (b) **seed** any new `settings` keys for per-provider credential blobs + the encryption-key reference (D-25); (c) **confirm** the `settings.value` text column accommodates encrypted credential blobs (it should — key-value text). No new tables expected; the Cloudinary/push-CDN providers extend the existing `media.provider` value set (Phase 3 made it provider-agnostic). Researcher/planner confirms against the current `schema.ts`.

### Claude's Discretion
Areas the user explicitly delegated ("you decide" or builder-discretion by nature) — researcher/planner has flexibility:
- **Dark mode coverage** (D-06) — verify, don't rebuild.
- Exact **drawer/modal** component (reuse TailAdmin's Modal/drawer components vs. a new one), the `<MediaPicker>` internal layout, and the "Test connection" probe shape per provider (D-13/D-24).
- The **encryption approach** (Node `crypto` helper vs. a small library) and the exact `settings` key names for credential blobs + key reference (D-25).
- The **generic push-CDN provider's** exact credential field set (base URL, region, purge API key, etc.) and whether purge-on-upload is wired (D-21).
- **Cloudinary SDK choice** (`cloudinary` npm vs. signed-URL fetch) and exact transform params (D-22).
- Whether the media **used-by reference scan** (D-15) is a real reference-count or a simple body-substring best-effort.
- Internal structure of the Storage Settings form (per-provider credential field schemas) and the users drawer fields/layout.

### Folded Todos
1. **Move admin routes under `/dashboard/*`** → D-01. Source: `.planning/todos/pending/2026-07-04-dashboard-route-prefix-restructure.md` (captured during Phase 3 UAT test 2; `resolves_phase: 4`). The post pages currently sit at root `/posts` following the Phase 1 convention; this phase relocates all admin sub-pages under `/dashboard/*`.
2. **Media-library picker UI** → D-12/D-13. Source: `.planning/todos/pending/2026-07-04-media-library-picker-ui.md` (captured during Phase 3 UAT test 3; `resolves_phase: 4`). Phase 3 shipped the upload pipeline + URL-only input intentionally; this phase ships the browser page + reusable picker modal.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project-level (stack + scope — authoritative)
- `CLAUDE.md` (repo root) — locked stack, folder structure (`(admin)` route group naming), "Roles & permissions" (admin/editor/author matrix), "Performance requirements" (dashboard can be JS-heavier but keep initial load lean; lazy-load heavy editor/charts), and "What NOT to do" (never rely on UI hiding alone; pnpm only; never raw `<img>`; sanitize raw HTML before storage AND render; no paid third-party APIs without approval).
- `.claude/CLAUDE.md` — **verified 2026 version table + code shapes**: TailAdmin is a **UI kit (not a scaffolding framework)** — pull individual components; **TanStack Query 5.101.2** (peers react ^18||^19); **React Hook Form 7.80.0** + **@hookform/resolvers 5.4.0** (Zod v4 bridge); **Zod v4.4.3** (shared client/server); **@aws-sdk/client-s3 3.1076.0** (R2 config); **sharp 0.35.2**; **dnd-kit legacy stable** (`@dnd-kit/core@6.3.1` + `@dnd-kit/sortable@10.0.0`) if any table-row reordering is needed. Read before any dependency install/config.
- `.planning/PROJECT.md` — v1 scope (Dashboard chrome bullets), Key Decisions (pages table for legal/contact; About hard-coded; contact form → SMTP no-paid-API), Context (existing TailAdmin scaffold; small fixed team 2–5; keep calendar/profile, drop unused chart/table demos).

### Phase-4-specific (requirements + roadmap)
- `.planning/REQUIREMENTS.md` — **DASH-01..09** (the 9 requirements this phase must satisfy), plus Out-of-Scope rows (no comments, no i18n routing, no paid APIs, no Vercel tooling, no reader auth, freeform custom-code injection deferred).
- `.planning/ROADMAP.md` §"Phase 4: Dashboard Chrome" — goal, **6 success criteria**, **pitfalls owned** (cross-group import leakage continues — bundle-budget check enforced in Phase 7; dashboard bloat avoided via lazy-loading), research flag (none — TailAdmin wiring + RHF/Zod + TanStack Query are standard).

### Prior-phase context (carries forward — DO NOT re-plan)
- `.planning/phases/03-content-engine/03-CONTEXT.md` — **D-09** (`lib/storage/` `StorageProvider` interface + registry reading `settings.storage.active_provider`; local + R2 providers shipped — **DASH-09 extends this with Cloudinary + push-CDN**), **D-10** (feature image = library OR external — Phase 3 shipped URL-only, **picker lands here**), **D-22** (taxonomy actions + editor pickers done; **DASH-02 = standalone mgmt pages only**), **D-24** (post editor already TailAdmin-quality — **DASH-01 narrows to other pages; do NOT re-plan the posts editor**), **D-08** (10MB upload cap), Phase-1 **D-08** (soft-delete `deletedAt` on content/media).
- `.planning/phases/02-auth-rbac/02-CONTEXT.md` — **D-10/D-11/D-12** (3 fixed roles via admin plugin; `requireRole`/`requireCan`/`assertOwnsPost` helpers — call these in every new action), **D-16** (`banUser` primitive — surfaces in DASH-04 UI here), **D-17** (revoke-all-sessions primitive — surfaces in DASH-04 UI here), **D-24/D-25** (user.bio + user.avatar via the storage pipeline — Profile editing D-09 uses this).
- `.planning/phases/01-foundation/01-CONTEXT.md` — **D-06** (`pages` table shape with its own SEO columns — DASH-05 edits against this), **D-08** (soft-delete pattern), **D-16** (`@/*` → `src/*`), **D-18** (keep calendar/profile + chart/table demos as reference until Phase 4 — **now resolved by D-02/D-03**).

### Folded todos (full problem statements + file lists)
- `.planning/todos/pending/2026-07-04-dashboard-route-prefix-restructure.md` — D-01. Lists the exact files (`src/proxy.ts`, `src/layout/AppSidebar.tsx`, the post route moves, the Phase 2 auth-gate test).
- `.planning/todos/pending/2026-07-04-media-library-picker-ui.md` — D-12/D-13. Lists the exact files (`src/components/editor/toolbar/Toolbar.tsx`, `src/app/(admin)/posts/PostForm.tsx`, new `(admin)/media/` page).

### Code (current state — scout-verified)
- `src/app/(admin)/` — current routes: `dashboard/page.tsx` (overview, already at `/dashboard`) + `posts/{page,new,[id]/edit}.tsx` at **root `/posts`** (Phase 3 D-24) + `(others-pages)/`{blank, calendar, profile, charts, forms, tables} + `(ui-elements)/`{alerts, avatars, badge, buttons, images, modals, videos}. **D-01 relocates these under `/dashboard/*`; D-03 deletes chart/form/table demos.**
- `src/actions/` — `users.ts`, `posts.ts`, `posts-schema.ts`, `categories.ts`, `tags.ts`, `media.ts`, `media-schema.ts`, `settings.ts` all exist from Phase 3. **Most Phase 4 pages are UI over these; new actions limited to users (extend), pages CRUD, and a Storage Settings save.**
- `src/lib/storage/` — the Phase 3 `StorageProvider` abstraction + local + R2 providers (D-09 of Phase 3). **DASH-09 adds Cloudinary + push-CDN providers here.**
- `src/lib/permissions/` — `requireRole`/`requireCan`/`assertOwnsPost` (Phase 2). Call at the top of every new mutating action.
- `src/components/editor/` — the lazy-loaded Tiptap v3 editor (Phase 3). Reused (slimmed) for pages (D-18); its `Toolbar.tsx` image button gets the picker modal (D-13).
- `src/layout/` — `AppSidebar.tsx`, `AppHeader.tsx`, `SidebarWidget.tsx`, `Backdrop` + `SidebarContext`/`ThemeContext`. Sidebar `href`s updated by D-01; `ThemeContext` already provides dark mode (D-06).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **Phase 3 Server Actions** (`src/actions/{posts,categories,tags,media,settings}.ts`) — consumed directly by the new dashboard pages; no re-implementation.
- **`src/lib/storage/` provider abstraction** — the extension point for the Cloudinary + push-CDN providers (DASH-09); local + R2 already implement the interface.
- **`src/components/editor/`** — the Tiptap v3 editor; reused (slimmed) for the Pages editor (D-18); its toolbar image button is the wiring point for the picker (D-13).
- **TailAdmin component kits** (`src/components/{form,tables,ui,header,common}`) — pull individual Table/Form/Modal/Drawer/Toast components for the dashboard pages. **Do NOT** adopt TailAdmin's page structure wholesale (CLAUDE.md: it is a UI kit, not a scaffolding framework).
- **`src/layout/AppSidebar.tsx`** — the nav surface; D-01/D-02/D-05 update its `href`s, group structure, and role-filtering.
- **`src/lib/permissions/`** + **`src/actions/users.ts`** — the permission helpers and the established user-action pattern; extend users.ts for create/edit/disable/revoke (DASH-04).
- **`ThemeContext`** — already provides dark mode (D-06); no new theme work.

### Established Patterns
- **Server Actions as the default mutation path** + Zod schemas shared client/server (Phase 3 established it for posts; **D-26 formalizes RHF+Zod+TanStack Query dashboard-wide and retrofits posts**). Each schema lives alongside its feature (e.g. `src/app/(admin)/dashboard/posts/schema.ts`).
- **pnpm-only**; migrations via `drizzle-kit generate` (never hand-write SQL); clean-room migration test (`pnpm test:migrations`) catches drift — the page seed + settings keys (D-29) flow through the same pipeline.
- **ESLint `no-restricted-imports`** keeps `(site)`/`(admin)` isolated. The TanStack `QueryClientProvider` is **`(admin)`-scoped only** (D-28) so Query stays out of the public bundle; the Storage Settings page, users drawer, pages editor etc. all live under `(admin)` and never import into `(site)`.
- **Permission-check-first** — every new mutating action starts with `requireCan(...)` / `requireRole(...)` (Phase 2 Pitfall #1). The Storage Settings save (D-23) and any user-management action (D-07/D-08/D-11) re-check admin server-side.

### Integration Points
- **Route restructure (D-01):** new segment folder `src/app/(admin)/dashboard/`; move `posts/`, the kept demo pages (calendar, profile), and add `categories/`, `tags/`, `media/`, `users/`, `pages/`, `settings/storage/` underneath. `src/proxy.ts` matcher → `/dashboard/*`.
- **New `actions/`:** extend `src/actions/users.ts` (create/edit/disable/revoke); add `src/actions/pages.ts` (+ `pages-schema.ts`) for page CRUD; add a Storage Settings save action (admin-gated) writing to `settings`.
- **New `lib/storage/` providers:** `cloudinary.ts` + `push-cdn.ts` (generic S3-compatible/origin-pull) implementing `StorageProvider`; extend the registry to read the active provider from `settings`.
- **New components:** `src/components/dashboard/media/MediaPicker.tsx` (the reusable modal, D-13); media library page; users drawer; pages editor (slimmed Tiptap).
- **Provider for TanStack Query:** wrap `src/app/(admin)/layout.tsx` (or `AdminShell`) with `QueryClientProvider` (D-28); devtools dev-only.
- **Schema migration (one):** seed T&C/Privacy/Contact `pages` (D-17) + new `settings` keys for encrypted credential blobs (D-25). No new tables expected.

</code_context>

<specifics>
## Specific Ideas

- **Lean-dashboard principle** — the founder wants the dashboard's *initial* load to stay lean (lazy-load the Tiptap editor, charts if any) even though the dashboard is allowed to be JS-heavier than the public site. Keep the overview stat-light and code-split heavy feature surfaces.
- **"Components" reference group retained** — the founder chose to keep the `(ui-elements)` showcase as a collapsed in-app reference rather than delete it; they are not yet confident enough in the TailAdmin kit to drop the living reference (CLAUDE.md allows deletion "once confident"). Chart/form/table demos, by contrast, are deleted (D-03).
- **Flexible/permissive stance carries from Phase 3** — consistent with the founder's Phase-3 posture (Rich editor, external URLs allowed, library-OR-external feature image), the media picker keeps a "paste external URL" path (D-13) rather than forcing library-only.
- **No aesthetic/branding references** — branding remains deferred to a UI phase per PROJECT.md. The founder's preferences here are UX/behavior/security/scope choices (D-01..D-29), not look-and-feel.

</specifics>

<deferred>
## Deferred Ideas

- **Contact form behavior (SMTP/honeypot/rate-limit) → Phase 6 (SITE-10).** This phase edits the Contact *page content* only (D-19); a form-builder UI would pull Phase 6 work forward.
- **Per-device session list / IP / last-active → v2.** v1 ships revoke-sessions only (D-10).
- **Named-vendor push-CDN (Bunny CDN specifically) → v2 fast-follow** if the generic provider proves too abstract. D-21 ships a generic S3-compatible/origin-pull abstraction instead.
- **Full media reference-count tracking → v2** if the best-effort used-by warning (D-15) proves insufficient.
- **Dashboard analytics/charts on the overview → Phase 7** (Performance & Deploy can layer richer analytics if needed). D-04 ships lean stat tiles.
- **Revision history / stricter editorial control → v2** (CONTv2-01) — already deferred in prior phases.
- **`settings`-stored analytics script injection → Phase 6** (ANAL-01/02).
- **Bundle-budget enforcement + production revalidation audit → Phase 7** (PERF-02/03). This phase keeps `(admin)`-scoped QueryClient (D-28) and lazy-loads heavy bits; Phase 7 verifies no leakage.

### Reviewed Todos (not folded)
- **"Configurable multi-destination backup system"** (pending todo, area: database, matched Phase 4 with score 0.6) — **reviewed, NOT folded.** False-positive keyword overlap ("destination, planning, requirements, group, phase"). This todo was already mutated into **Phase 8 — Backup & Disaster Recovery** (BACKUP-01..05) via the 2026-07-02 roadmap update; it is unrelated to Dashboard Chrome and remains Phase 8's concern. Reviewed-and-not-folded in Phases 1, 2, 3, and 4. See `.planning/todos/pending/2026-06-30-configurable-multi-destination-backup-system.md`.

</deferred>

---

*Phase: 4-Dashboard Chrome*
*Context gathered: 2026-07-05*
