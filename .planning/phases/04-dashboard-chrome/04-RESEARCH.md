# Phase 4: Dashboard Chrome - Research

**Researched:** 2026-07-05
**Domain:** Dashboard UI over existing Server Actions + storage-provider extension + app-level credential encryption
**Confidence:** HIGH (stack verified, codebase integration points read directly; one MEDIUM area = Cloudinary v2 SDK specifics)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Dashboard shell, navigation & demo cleanup (DASH-07, DASH-08 + folded route-restructure todo)**
- **D-01:** Move every `(admin)` sub-page under a real `dashboard` URL segment folder — `src/app/(admin)/dashboard/{posts,categories,tags,media,users,pages,settings,…}/`. Keep `(admin)/layout.tsx` + `AdminShell`/sidebar at the group root. Simplify the auth gate matcher to a single `/dashboard/*` matcher; update sidebar `href`s, the "+ New Post" button, per-row edit links, and any `router.push`/redirect targeting admin paths; update the Phase 2 auth-gate test (`scripts/test-auth-gate.mjs`) to target `/dashboard/*`.
- **D-02:** Sidebar = focused CMS nav (Posts, Categories, Tags, Media, Pages, Users, Settings + Profile + Calendar) **plus a collapsed "Components" reference group** preserving the `(ui-elements)` showcase — NOT deleted.
- **D-03:** **Delete** `(others-pages)` chart/form/table demo routes AND their now-unused component files. **Keep** Calendar + Profile (wire Profile to real data per D-09). **Keep** the `(ui-elements)` showcase (per D-02). The `ecommerce/` folder was already removed in Phase 1.
- **D-04:** Overview `/dashboard` = lean real stats, server-rendered, no charts. Posts-by-status counts, pending-review list, media count, "New post" CTA. Richer analytics deferred to Phase 7.
- **D-05:** Sidebar items filter by viewer's role (authors don't see Users/Settings; editors don't see Users/Storage Settings). **UX layer only** — authoritative RBAC still happens server-side in every action.
- **D-06:** Dark mode = verify, don't rebuild. `ThemeContext` already provides it.

**Users & roles management (DASH-04) — surfaces Phase 2 primitives in UI**
- **D-07:** Create/edit = table + side drawer/modal at `/dashboard/users`. Mirrors small-team UX.
- **D-08:** Disable-only (ban via Phase 2 D-16 `banUser`), no destructive delete. Preserves post authorship integrity.
- **D-09:** Self-service profile at `/dashboard/profile` (any role); admins can edit anyone. Avatars upload through the existing storage pipeline (Phase 2 D-25).
- **D-10:** Sessions = revoke only (Phase 2 D-17 primitive), no per-device list/IP/last-active UI in v1.
- **D-11:** Role assignment via dropdown in create/edit drawer; underlying action re-checks `requireCan('user.*')` server-side.

**Media library & reusable picker (DASH-03 + folded picker todo)**
- **D-12:** `/dashboard/media` = grid (dominant) + list toggle. Click → details drawer (alt text, dimensions, provider, used-by where known). Consumes existing `actions/media.ts`.
- **D-13:** One reusable `<MediaPicker>` modal — browse + upload-in-place + select — consumed by (a) post feature-image field, (b) editor body-image button (replaces Phase 3's `window.prompt` in `Toolbar.tsx`), (c) avatar field. Includes a **"paste external URL" tab**.
- **D-14:** Upload UX = drag-drop + multi-file + per-file progress + alt prompt. 10MB cap (Phase 3 D-08) enforced both client- and server-side.
- **D-15:** Delete = soft-delete + warn (don't block) if URL appears referenced in a post body or feature-image. Best-effort reference scan.

**Taxonomy management (DASH-02)**
- **D-16:** Standalone `/dashboard/categories` and `/dashboard/tags` management pages — TailAdmin-quality tables over the existing Phase 3 actions. **No new server actions needed**.

**Pages management (DASH-05) — uses existing `pages` table**
- **D-17:** Seed T&C + Privacy + Contact `pages` rows (title + slug + empty body, `draft` status) at migration. About stays hard-coded TSX/MDX.
- **D-18:** Page editor = trimmed post editor (same Tiptap body + title + slug + SEO fields + status). Drop post-only fields.
- **D-19:** Contact page = content-only here; form (SMTP/honeypot/rate-limit) is Phase 6 SITE-10.
- **D-20:** Page status = simple draft/published, no review.

**Storage Settings + new providers (DASH-09) — most technically nuanced**
- **D-21:** "push-CDN" = **generic S3-compatible / origin-pull CDN `StorageProvider`** — accepts configurable CDN base URL (and optional purge/invalidate credentials). No vendor lock-in. Distinct from the R2 provider.
- **D-22:** Cloudinary = full `StorageProvider` — upload via Cloudinary API + deliver via Cloudinary URLs with on-the-fly transforms. **When Cloudinary is active, it owns transforms** (sharp bypassed for that path).
- **D-23:** `/dashboard/settings/storage` (admin-only) — pick active image destination (local / R2 / Cloudinary / push-CDN) + enter per-provider credentials. Save re-checks admin permission server-side.
- **D-24:** "Test connection" button per-provider — runs a no-op probe (list bucket / upload 1px / ping CDN) before Save persists.
- **D-25:** Credentials **encrypted at rest** in `settings.value` via app-level encryption (key from env); **never exposed to the client** (redact on read).

**Form & mutation pattern (DASH-06)**
- **D-26:** RHF + Zod (shared server-side) + TanStack Query applied to **all new Phase 4 pages AND retrofitted onto the Phase 3 posts editor**.
- **D-27:** Selective optimistic UI — optimistic on high-frequency small mutations (media delete, taxonomy CRUD, user ban/role-change, page save). **NOT** optimistic on post publish (high-stakes + revalidation) or media upload (progress indicator already communicates state).
- **D-28:** `QueryClientProvider` wraps the `(admin)` layout **only** — never `(site)`. React Query devtools dev-only.

**Schema/seed deltas (one migration via `drizzle-kit generate`)**
- **D-29:** Mostly seed/config, minimal structural change. (a) seed T&C/Privacy/Contact `pages` (D-17); (b) seed new `settings` keys for per-provider credential blobs + the encryption-key reference (D-25); (c) confirm `settings.value` text column accommodates encrypted blobs. No new tables expected.

### Claude's Discretion
- Dark mode coverage (D-06) — verify, don't rebuild.
- Exact drawer/modal component (reuse TailAdmin's vs. new one), `<MediaPicker>` internal layout, "Test connection" probe shape per provider (D-13/D-24).
- Encryption approach (Node `crypto` helper vs. small library) + exact `settings` key names for credential blobs + key reference (D-25).
- Generic push-CDN provider's exact credential field set (base URL, region, purge API key, etc.) + whether purge-on-upload is wired (D-21).
- Cloudinary SDK choice (`cloudinary` npm vs. signed-URL fetch) + exact transform params (D-22).
- Whether media used-by reference scan (D-15) is real reference-count or simple body-substring best-effort.
- Internal structure of Storage Settings form + users drawer fields/layout.

### Deferred Ideas (OUT OF SCOPE)
- Contact form behavior (SMTP/honeypot/rate-limit) → Phase 6 (SITE-10). This phase edits Contact **page content only** (D-19).
- Per-device session list / IP / last-active → v2 (D-10).
- Named-vendor push-CDN (Bunny CDN specifically) → v2 fast-follow if generic provider proves too abstract (D-21).
- Full media reference-count tracking → v2 if best-effort used-by warning (D-15) proves insufficient.
- Dashboard analytics/charts on overview → Phase 7 (D-04).
- Revision history / stricter editorial control → v2 (CONTv2-01).
- `settings`-stored analytics script injection → Phase 6 (ANAL-01/02).
- Bundle-budget enforcement + production revalidation audit → Phase 7 (PERF-02/03).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DASH-01 | TailAdmin posts list / new / edit pages wired to real data | Largely satisfied by Phase 3 D-24 — this phase narrows to the **other** pages + retrofitting posts onto the shared RHF+Zod+TanStack Query pattern (D-26). Post routes relocate under `/dashboard/posts/*` (D-01). |
| DASH-02 | Categories + tags management UI | TailAdmin tables over existing `actions/categories.ts` + `actions/tags.ts` (read in codebase — `listCategories`/`createCategory`/`updateCategory`/`softDeleteCategory` already shipped). **No new server actions**. Standalone pages at `/dashboard/categories`, `/dashboard/tags`. |
| DASH-03 | Media library browser UI | `/dashboard/media` grid+list consuming `actions/media.ts` (`listMedia`/`uploadMedia`/`deleteMedia`). Plus reusable `<MediaPicker>` modal (D-13). |
| DASH-04 | Users + roles management UI (admin only) | Users table + drawer extending `actions/users.ts` (already has `createUser`/`banUser`/`unbanUser`/`revokeSessions`). Needs `updateUser` + `listUsers` additions. Re-check `requireCan({ user: [...] })` server-side. |
| DASH-05 | Pages management UI (T&C, Privacy, Contact) using the same Tiptap editor | Slimmed Tiptap editor against existing `pages` table (schema.ts L129-142 — has its own SEO columns). Needs new `actions/pages.ts` + `pages-schema.ts`. Seed 3 rows at migration (D-17/D-29). |
| DASH-06 | Forms via React Hook Form + Zod (shared server-side) + TanStack Query mutations/optimistic UI | Established pattern — Phase 3 `PostForm.tsx` already wires RHF + Zod via `zodResolver`. Retrofit adds TanStack `useMutation`. `QueryClientProvider` scoped to `(admin)` only (D-28). |
| DASH-07 | Remove `ecommerce/` demo + unused chart/table demos; keep initial dashboard load lean (lazy-load editor/charts) | `ecommerce/` already removed Phase 1. This phase deletes `(others-pages)/(chart)`, `(forms)`, `(tables)` routes + their now-unused component files (D-03). Keeps Calendar + Profile + `(ui-elements)`. |
| DASH-08 | Dark mode applied to the dashboard | No-op by design — existing `ThemeContext` provides dark mode (D-06). Verify coverage on new pages only. |
| DASH-09 | Storage Settings page (admin-only) — choose active image destination (local/Cloudinary/R2/push-CDN) + enter per-provider credentials, persisted to `settings`; action re-checks admin permission server-side. Adds Cloudinary + push-CDN providers (extends `lib/storage/`). | Highest-nuance area. Extends `lib/storage/` interface + registry (D-09 Phase 3). New providers: `cloudinary.ts` + `push-cdn.ts`. Encrypted credential storage via Node `crypto` AES-256-GCM (D-25). "Test connection" probes (D-24). |
</phase_requirements>

## Summary

Phase 4 is predominantly **UI over existing Server Actions** — the action layer shipped in Phases 2–3 (`actions/{posts,categories,tags,media,settings,users}.ts`). The bulk of the work is wiring TailAdmin component surfaces to those actions, formalizing one dashboard-wide form/mutation pattern (RHF + Zod + TanStack Query), and landing two folded UAT todos (route restructure + media picker). The genuinely novel technical work is concentrated in **DASH-09 (Storage Settings + new providers)** and **D-25 (encrypted credential storage)**.

**Three findings dominate the planning picture:**

1. **The auth gate is `middleware.ts` at the repo root, NOT `proxy.ts`.** This contradicts the CLAUDE.md "verified 2026" note. The team documented a real Next.js 16.2.9 + Turbopack defect: `proxy.ts` compiles into the middleware bundle but Next.js never registers it in `middleware-manifest.json` (manifest stays empty `{}`), so zero requests route through it. Renaming to `middleware.ts` (the deprecated-but-battle-tested filename) fixed registration. The matcher **already targets `/dashboard/:path*`** — so D-01 is about moving the post pages (currently root `/posts`) under `/dashboard/*`, NOT about changing the matcher. The planner MUST NOT rename `middleware.ts` → `proxy.ts`.

2. **The storage abstraction is purpose-built for this extension.** The Phase 3 `StorageProvider` interface (`types.ts`), settings-driven registry (`registry.ts`), and `registerStorageProvider(name, provider)` hook were all designed with a Phase-4 DASH-09 comment in the code. The Cloudinary + push-CDN providers slot in cleanly. The existing tests (`registry.test.ts`) already cover the "unknown provider falls back to local" default-safe behavior and the `registerStorageProvider` hook.

3. **Encryption is the lowest-risk novel piece.** Node's built-in `crypto` module provides AES-256-GCM authenticated encryption with no new dependencies. The canonical pattern (32-byte key from `process.env.SETTINGS_ENCRYPTION_KEY`, random 12-byte IV per encryption, `iv:authTag:ciphertext` envelope stored as base64 text) fits the existing `settings.value` text column with no schema change. A redact-on-read wrapper in the settings action keeps secrets out of client-visible state.

**Primary recommendation:** Build DASH-09's `lib/storage/cloudinary.ts` + `lib/storage/push-cdn.ts` against the existing `StorageProvider` interface; add a small `lib/crypto` helper (encrypt/decrypt/redact) for D-25; scope TanStack `QueryClientProvider` to the `(admin)` group via a new client component inside the existing `AdminShell.tsx`; and treat the route restructure (D-01) as a pure folder-move + sidebar-href update — the auth gate matcher is already correct.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Dashboard route serving (posts/categories/tags/media/users/pages/settings) | Frontend Server (Next 16 App Router `(admin)` group) | API / Backend (Server Actions) | `(admin)` route group renders the TailAdmin shell; mutations go through Server Actions in `actions/`. |
| Storage provider selection (active provider read) | API / Backend (`lib/storage/registry.ts`) | Database (`settings` table) | Server-side only; the client cannot influence which provider handles an upload (security). |
| Credential encryption at rest | API / Backend (`lib/crypto`) | Database (`settings.value`) | AES-256-GCM encrypt/decrypt happens server-side; key from env, never shipped to client or build bundle. |
| Media upload pipeline (sharp variants + provider upload) | API / Backend (`actions/media.ts` + `lib/storage/*`) | Storage (local fs / R2 / Cloudinary / push-CDN) | Server-mediated upload (Phase 3 D-06); permission check FIRST, then provider.upload. |
| Form validation (Zod schemas) | Shared (client + server) | — | Same schema file imported by RHF (client) and the Server Action (server). CLAUDE.md convention. |
| Mutation state (TanStack Query) | Browser / Client (`(admin)` only) | API / Backend (Server Actions) | `QueryClientProvider` scoped to `(admin)` — never reaches `(site)` (ESLint-enforced isolation). |
| Auth gate (UX layer) | Frontend Server (`middleware.ts` at repo root) | Frontend Server (`(admin)/layout.tsx` authoritative `getSession`) | `middleware.ts` = UX cookie-existence check; layout = authoritative RBAC via `getSessionOrThrow`. Both target `/dashboard/*`. |
| Image delivery (next/image) | CDN / Static (`next/image` + custom loader) | Storage (provider's `getPublicUrl`) | All content images through `next/image`; loader resolves to active provider's public URL. `remotePatterns` in `next.config.ts` must include new CDN hostnames. |
| Profile / avatar upload | API / Backend (`actions/users.ts` + storage pipeline) | Storage (provider) | Reuses Phase 2 D-25 pattern (avatar stores R2/local object key, not binary). |

## Standard Stack

### Core (all VERIFIED installed in `package.json` — no new installs for most of this phase)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| react-hook-form | 7.80.0 (installed) | Dashboard forms | Already used in Phase 3 `PostForm.tsx`. Peers `react ^19`. `[VERIFIED: package.json L55]` |
| @hookform/resolvers | 5.4.0 (installed) | RHF ↔ Zod v4 bridge | v5 supports Zod 4. Already imported in `src/app/(admin)/posts/schema-client.ts`. `[VERIFIED: package.json L25]` |
| zod | 4.4.3 (installed) | Schema validation (shared client+server) | v4 (4.0.0 shipped 2025-07-09). Used in all `actions/*-schema.ts` files. `[VERIFIED: package.json L60]` |
| @tanstack/react-query | 5.101.2 (installed) | Dashboard mutations / optimistic UI | Peers `react ^18 \|\| ^19`. Installed but **not yet wired** — this phase adds the `(admin)`-scoped `QueryClientProvider`. `[VERIFIED: package.json L30]` |
| @tiptap/* (core/react/starter-kit/html/etc.) | 3.27.1 (installed) | Rich text editor | Reused (slimmed) for the Pages editor (D-18). Already lazy-loaded via `EditorProvider`. `[VERIFIED: package.json L31-39]` |
| better-auth | ^1.6.23 (installed) | Auth + admin/RBAC plugin | Phase 2 primitives (`createUser`/`banUser`/`revokeSessions`) surface in the users UI. `[VERIFIED: package.json L42]` |
| drizzle-orm | ^0.45.2 (installed) | ORM | No schema changes expected in this phase (D-29 — seed-only migration). `[VERIFIED: package.json L43]` |
| sharp | ^0.35.2 (installed) | Image resize at upload | Runs inside `local`/`r2`/`push-cdn` providers; **bypassed for Cloudinary** (D-22 — Cloudinary owns transforms when active). `[VERIFIED: package.json L57]` |
| @aws-sdk/client-s3 | ^3.1077.0 (installed) | S3-compatible uploads | Reused for the generic push-CDN provider (D-21). The existing `S3Client` already accepts arbitrary `endpoint`/`region`/`credentials`/`forcePathStyle`. `[VERIFIED: package.json L18]` |

### Supporting (one new install)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| cloudinary | 2.10.0 (`[VERIFIED: npm registry]` — latest, published 2026-04-25, 831K weekly downloads, official repo `cloudinary/cloudinary_npm`) | Cloudinary upload + delivery URL SDK | D-22 only — the Cloudinary `StorageProvider`. v2 API: `cloudinary.v2.uploader.upload_stream()` for buffer upload; `cloudinary.v2.url(publicId, { transformation })` for on-the-fly transform URLs. `[VERIFIED: npm view cloudinary]` |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `cloudinary` npm SDK (D-22) | Signed-URL fetch (no SDK) | SDK chosen (D-22 locked "full provider") — fetch would keep paying origin egress; SDK upload owns transforms. `[CITED: 04-CONTEXT.md D-22]` |
| Node `crypto` AES-256-GCM (D-25) | A small library (e.g. `@node-rs/argon2` for hashing — not encryption) | Node `crypto` is built-in, zero deps, canonical for symmetric authenticated encryption at rest. `[ASSUMED]` — no popular tiny encryption wrapper library is more standard than the built-in. |
| Generic S3-compatible push-CDN provider (D-21) | Named-vendor (Bunny CDN) SDK | Generic chosen (D-21 locked) — no vendor lock-in; Bunny/KeyCDN/Cloudflare-in-front-of-origin all fit by config. Named vendor deferred to v2. |

**Installation (pnpm only — CLAUDE.md hard rule):**
```bash
pnpm add cloudinary@2.10.0
```

All other stack members are already in `package.json`. No other installs needed.

**Version verification:** `cloudinary` verified via `npm view cloudinary version` → `2.10.0` (published 2026-04-25). The `@aws-sdk/client-s3` is already installed at `^3.1077.0` and proven in Phase 1/3 — no re-verification needed.

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| cloudinary | npm | ~9 yrs (v2 lineage) | 831K/wk | github.com/cloudinary/cloudinary_npm | OK | Approved — install with `pnpm add cloudinary` |
| @aws-sdk/client-s3 | npm | ~6 yrs (v3 lineage) | 31M/wk | github.com/aws/aws-sdk-js-v3 | OK (SUS "too-new" flag is a false positive — already installed at `^3.1077.0`, proven in Phases 1/3) | No action — already in package.json |
| react-hook-form | npm | — | — | — | OK (already installed) | No action |
| @hookform/resolvers | npm | — | — | — | OK (already installed) | No action |
| @tanstack/react-query | npm | — | — | — | OK (already installed) | No action |
| zod | npm | — | — | — | OK (already installed) | No action |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none requiring action. (`@aws-sdk/client-s3` flagged "too-new" by the seam because of its 2026-07-02 publish date, but it is the official AWS SDK at 31M weekly downloads, already installed, and proven in this codebase — the flag is a false positive of the recency heuristic.)

*The only new package this phase introduces is `cloudinary`, which is `[VERIFIED: npm registry]` with the official repo, long history, and high download volume. The planner may install it directly without a `checkpoint:human-verify` task.*

## Architecture Patterns

### System Architecture Diagram

```
                         ┌─────────────────────────────────────────┐
                         │         Next.js 16 App Router            │
                         │                                         │
    Unauthenticated ───► │  middleware.ts (repo root)              │
    visitor hitting      │    matcher: /dashboard/:path*           │
    /dashboard/*         │    UX-only cookie-existence gate        │
                         │    │                                    │
                         │    ▼ redirect to /signin (if no cookie) │
                         │                                       │
                         │  (admin)/layout.tsx                     │
                         │    <Suspense> → AuthGate → getSession() │
                         │    AUTHORITATIVE RBAC boundary          │
                         │    │                                    │
                         │    ▼ <AdminShell>                       │
                         │      ├─ AppSidebar (role-filtered)      │
                         │      ├─ AppHeader                       │
                         │      └─ <QueryClientProvider> (NEW)     │
                         │            scoping TanStack Query to    │
                         │            (admin) only — never (site)  │
                         │                                         │
                         │  (admin)/dashboard/* route pages        │
    Authenticated  ─────►│    ├─ /dashboard        (overview)      │
    editor/admin/author  │    ├─ /dashboard/posts   (D-01 move)    │
                         │    ├─ /dashboard/categories (D-16)      │
                         │    ├─ /dashboard/tags      (D-16)       │
                         │    ├─ /dashboard/media     (D-12)       │
                         │    ├─ /dashboard/users     (D-07)       │
                         │    ├─ /dashboard/pages     (D-18)       │
                         │    ├─ /dashboard/profile   (D-09)       │
                         │    └─ /dashboard/settings/storage (D-23)│
                         └─────────────┬───────────────────────────┘
                                       │ Server Actions (mutations)
                                       ▼
                         ┌─────────────────────────────────────────┐
                         │       actions/ (server-only)            │
                         │  posts.ts · categories.ts · tags.ts     │
                         │  media.ts · users.ts (extend) · pages.ts│
                         │  settings.ts (extend: save/redact)      │
                         │  Each starts: requireCan(...) /         │
                         │              requireRole('admin')       │
                         └─────────────┬───────────────────────────┘
                                       │
           ┌───────────────────────────┼───────────────────────────┐
           ▼                           ▼                           ▼
  ┌─────────────────┐     ┌──────────────────────┐    ┌──────────────────────┐
  │  lib/storage/   │     │  lib/crypto (NEW)    │    │  lib/permissions/    │
  │  registry.ts    │     │  AES-256-GCM         │    │  requireRole/        │
  │  reads settings │     │  encrypt/decrypt     │    │  requireCan/         │
  │  → provider     │     │  key from env        │    │  assertOwnsPost      │
  │  ┌───────────┐  │     │  redact-on-read      │    │  (Phase 2)           │
  │  │ local     │  │     └──────────────────────┘    └──────────────────────┘
  │  │ r2        │  │
  │  │ cloudinary│◄─┼─ NEW (D-22) — upload via SDK, deliver via transform URLs
  │  │ push-cdn  │◄─┼─ NEW (D-21) — S3Client + cdnBaseUrl overlay
  │  └───────────┘  │
  └─────────────────┘
           │
           ▼
  ┌──────────────────────────────────────────────────────────────┐
  │  Storage backends                                            │
  │  local fs · Cloudflare R2 · Cloudinary · S3-compat origin    │
  │  (provider choice persisted in settings.storage.active_provider)│
  │  (credentials encrypted in settings.storage.<provider>_creds)│
  └──────────────────────────────────────────────────────────────┘
```

**Reader trace (DASH-09 save flow):** Admin opens `/dashboard/settings/storage` → fills credentials → clicks "Test connection" (probe per provider — list bucket / upload 1px / ping CDN) → on success, Save → `saveStorageSettings` Server Action re-checks `requireRole('admin')` → encrypts credentials via `lib/crypto` → writes `settings.storage.<provider>_creds` (encrypted blob) + `settings.storage.active_provider` (plaintext) → registry's `getActiveProvider()` reads the new value on next upload → routes through the new provider.

### Recommended Project Structure (Phase 4 deltas)

```
src/
├── app/(admin)/
│   ├── layout.tsx                      ← add <QueryClientProvider> inside AdminShell
│   ├── AdminShell.tsx                  ← wrap children with QueryClientProvider (D-28)
│   ├── dashboard/
│   │   ├── page.tsx                    ← REPLACE placeholder with real stats (D-04)
│   │   ├── posts/                      ← MOVED from (admin)/posts/* (D-01)
│   │   │   ├── page.tsx · new/page.tsx · [id]/edit/page.tsx
│   │   │   ├── PostForm.tsx            ← retrofit TanStack useMutation (D-26)
│   │   │   └── schema-client.ts
│   │   ├── categories/                 ← NEW (D-16) — table over actions/categories.ts
│   │   ├── tags/                       ← NEW (D-16) — table over actions/tags.ts
│   │   ├── media/                      ← NEW (D-12) — grid/list browser
│   │   │   └── page.tsx
│   │   ├── users/                      ← NEW (D-07) — admin-only table + drawer
│   │   │   └── page.tsx
│   │   ├── pages/                      ← NEW (D-18) — slimmed Tiptap editor
│   │   │   ├── page.tsx · [id]/edit/page.tsx
│   │   │   └── PageForm.tsx
│   │   ├── profile/                    ← MOVED from (others-pages)/profile (D-09)
│   │   └── settings/
│   │       └── storage/                ← NEW (D-23) — admin-only Storage Settings
│   │           └── page.tsx
│   ├── (others-pages)/
│   │   ├── calendar/                   ← KEPT (D-03)
│   │   └── ❌ (chart)/(forms)/(tables)/blank ← DELETE (D-03)
│   └── (ui-elements)/                  ← KEPT as "Components" reference (D-02)
│
├── actions/
│   ├── users.ts                        ← EXTEND: add listUsers + updateUser
│   ├── pages.ts                        ← NEW (D-18) — pages CRUD
│   ├── pages-schema.ts                 ← NEW — Zod schema (shared client+server)
│   ├── storage-settings.ts             ← NEW (D-23) — admin-gated save + test-connection
│   └── (existing: posts/categories/tags/media/settings unchanged)
│
├── lib/
│   ├── storage/
│   │   ├── types.ts                    ← EXTEND name union: "cloudinary" | "push-cdn"
│   │   ├── registry.ts                 ← register cloudinary + push-cdn at boot
│   │   ├── cloudinary.ts               ← NEW (D-22)
│   │   ├── push-cdn.ts                 ← NEW (D-21)
│   │   └── (local.ts · r2.ts · seed.ts unchanged)
│   ├── crypto/                         ← NEW (D-25)
│   │   ├── index.ts                    ← encrypt/decrypt + redactCredentials helper
│   │   └── __tests__/crypto.test.ts    ← round-trip + tamper-detection test
│   └── (permissions, db, auth, r2, etc. unchanged)
│
├── components/
│   ├── dashboard/
│   │   └── media/
│   │       └── MediaPicker.tsx         ← NEW (D-13) — reusable modal
│   └── (editor unchanged except Toolbar.tsx image-button wiring)
│
├── db/
│   └── migrations/                     ← ONE new migration (D-29): seed pages + settings keys
│
└── instrumentation.ts                  ← registerStorageProvider calls for new providers
```

### Pattern 1: StorageProvider extension (the extension point for DASH-09)

**What:** Every storage backend implements the same `StorageProvider` interface. The registry reads `settings.storage.active_provider` and returns the matching singleton. New providers register via `registerStorageProvider(name, provider)` at boot.
**When to use:** Adding Cloudinary (D-22) or push-CDN (D-21) — implement the interface, register at boot, no other code changes.

**The existing contract (`src/lib/storage/types.ts`):**
```typescript
// Source: src/lib/storage/types.ts (read directly)
export interface StorageProvider {
  readonly name: "local" | "r2"; // Phase-4 DASH-09 adds "cloudinary" | "push-cdn"
  upload(buffer: Buffer, baseKey: string, mimeType: string): Promise<{
    variants: UploadedVariant[];      // empty for non-images / Cloudinary (transforms at delivery)
    primary: { key: string; width?: number; height?: number; sizeBytes?: number; };
  }>;
  getPublicUrl(key: string, variant?: "sm" | "md" | "lg"): string;
  delete(key: string): Promise<void>;
}
```

**Extension for Phase 4:** widen the `name` union (`"cloudinary" | "push-cdn"`), implement the two providers, and register them in `instrumentation.ts`:
```typescript
// Source: pattern from src/lib/storage/registry.ts registerStorageProvider (read directly)
export function registerStorageProvider(name: string, provider: StorageProvider): void {
  providers[name] = provider;  // already designed for Phase-4 extension
}
```

### Pattern 2: Encrypted credential storage (D-25)

**What:** Provider credentials (R2 keys, Cloudinary secret, push-CDN API key) stored as AES-256-GCM encrypted blobs in the `settings` value column. Encrypt on write, decrypt on read inside Server Actions, **redact on read for client-bound payloads**.
**When to use:** Every credential the Storage Settings page (D-23) persists or surfaces.

**Canonical Node `crypto` AES-256-GCM pattern:**
```typescript
// Source: Node.js crypto stable API (AES-256-GCM authenticated encryption).
// [CITED: Node.js docs — crypto.createCipheriv with 'aes-256-gcm']
// Format: iv(12B):authTag(16B):ciphertext — all base64. Fits settings.value text column.
import crypto from "node:crypto";

const KEY_B64 = process.env.SETTINGS_ENCRYPTION_KEY; // 32-byte key, base64-encoded
if (!KEY_B64) throw new Error("SETTINGS_ENCRYPTION_KEY missing");
const KEY = Buffer.from(KEY_B64, "base64");
if (KEY.length !== 32) throw new Error("SETTINGS_ENCRYPTION_KEY must be 32 bytes");

export function encrypt(plaintext: string): string {
  const iv = crypto.randomBytes(12); // 96-bit IV — fresh per encryption (CRITICAL for GCM)
  const cipher = crypto.createCipheriv("aes-256-gcm", KEY, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag(); // 16 bytes — guarantees integrity
  return [iv, authTag, ciphertext].map((b) => b.toString("base64")).join(":");
}

export function decrypt(envelope: string): string {
  const [ivB64, authTagB64, ciphertextB64] = envelope.split(":");
  const decipher = crypto.createDecipheriv("aes-256-gcm", KEY, Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(authTagB64, "base64")); // throws on tamper
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextB64, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

/** Redact credentials before sending to the client. Returns "" for each secret field. */
export function redactCredentials<T extends Record<string, unknown>>(creds: T): T {
  return Object.fromEntries(
    Object.entries(creds).map(([k, v]) => [k, isSecretField(k) ? "" : v]),
  ) as T;
}
function isSecretField(name: string): boolean {
  return /secret|key|token|password|api[-_]?key/i.test(name);
}
```

### Pattern 3: TanStack Query scoped to `(admin)` only (D-28)

**What:** `QueryClientProvider` wraps the `(admin)` layout — never `(site)` — so TanStack Query adds zero client JS to the public bundle. Reinforces PERF-02 (audited in Phase 7).
**When to use:** One provider instance for the whole dashboard.

```typescript
// Source: TanStack Query 5.x + Next.js 16 App Router pattern.
// [CITED: .claude/CLAUDE.md — @tanstack/react-query 5.101.2 verified]
// New file: src/app/(admin)/QueryProvider.tsx
"use client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";

export default function QueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 30_000, refetchOnWindowFocus: false },
        },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      {children}
      {process.env.NODE_ENV === "development" && <ReactQueryDevtools />}
    </QueryClientProvider>
  );
}
// Wire inside AdminShell.tsx: wrap {children} with <QueryProvider>.
// The (admin)/(site) ESLint no-restricted-imports rule keeps this from leaking.
```

> **Note:** `@tanstack/react-query-devtools` is a separate package — the planner should add it as a devDependency (`pnpm add -D @tanstack/react-query-devtools`) OR skip devtools if avoiding the extra dep. Discretionary per D-28.

### Pattern 4: RHF + Zod retrofit onto Phase 3 PostForm (D-26)

**What:** The Phase 3 `PostForm.tsx` already wires RHF + Zod via `zodResolver` but calls `savePost(values)` directly. The retrofit wraps the save in a TanStack `useMutation` for consistent loading/error/optimistic state dashboard-wide.
**When to use:** Every form in Phase 4 — and retrofitting the posts editor.

```typescript
// Source: established Phase 3 pattern in PostForm.tsx + TanStack Query 5.x useMutation.
// [CITED: src/app/(admin)/posts/PostForm.tsx (read directly)]
const mutation = useMutation({
  mutationFn: (values: PostSchemaInput) => savePost(values as Parameters<typeof savePost>[0]),
  // D-27: NOT optimistic on post save (high-stakes + revalidation) — server confirms.
  onSuccess: () => queryClient.invalidateQueries({ queryKey: ["posts"] }),
});
const onValid = (values: PostSchemaInput) => mutation.mutate(values);
// isSubmitting → mutation.isPending; submitError → mutation.error
```

### Anti-Patterns to Avoid

- **Renaming `middleware.ts` → `proxy.ts`:** Next.js 16.2.9 + Turbopack compiles `proxy.ts` but NEVER registers it in `middleware-manifest.json`. The team documented and survived this bug in Phase 2. `middleware.ts` is the working filename. CLAUDE.md's "proxy.ts" note is stale for this exact Turbopack version. `[VERIFIED: middleware.ts L11-18 comment + Phase 2 plan 02-05]`
- **Putting `QueryClientProvider` in the root layout:** Would ship TanStack Query JS to the `(site)` public bundle, violating PERF-02. Scope it to `(admin)/AdminShell.tsx` only. `[CITED: 04-CONTEXT.md D-28]`
- **Optimistic UI on post publish (D-27):** High-stakes mutation with `revalidatePath`/`revalidateTag` — needs server confirmation, not optimistic guessing. `[CITED: 04-CONTEXT.md D-27]`
- **Running sharp when Cloudinary is active (D-22):** Cloudinary's value proposition is on-the-fly transforms at delivery time. Running sharp at upload would double-transform and waste CPU. The Cloudinary provider's `upload()` should skip sharp and return `variants: []`. `[CITED: 04-CONTEXT.md D-22]`
- **Exposing decrypted credentials to the client (D-25):** Every settings read that crosses the client boundary must run through `redactCredentials`. The Storage Settings form should show empty secret fields on edit (user re-types to change), never pre-filled secrets. `[CITED: 04-CONTEXT.md D-25]`
- **Trusting the sidebar role-filter (D-05):** Sidebar hiding is UX-only. Every mutating action still re-checks `requireCan`/`requireRole` server-side (Phase 2 Pitfall #1 — already enforced in all existing actions; the new `actions/storage-settings.ts` and `actions/pages.ts` MUST follow the same pattern). `[CITED: 04-CONTEXT.md D-05 + CLAUDE.md "Roles & permissions"]`

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Authenticated symmetric encryption (D-25) | A custom cipher / HMAC scheme | Node `crypto` AES-256-GCM | Standard, audited, built-in. GCM gives confidentiality + integrity in one op. Custom crypto is the #1 way to introduce silent vulnerabilities. `[CITED: Node.js crypto docs]` |
| Image transforms when Cloudinary is active (D-22) | Running sharp then handing to Cloudinary | Cloudinary delivery-URL transform params | Cloudinary's value prop is on-the-fly transforms; sharp would double-transform. `[CITED: 04-CONTEXT.md D-22]` |
| S3-compatible client config (D-21) | A custom HTTP client for push-CDN | `@aws-sdk/client-s3` `S3Client` with custom `endpoint` | Already proven for R2/MinIO in `lib/r2/index.ts`. Bunny/KeyCDN/any S3-compat origin works the same way. `[VERIFIED: src/lib/r2/index.ts L26-31]` |
| Form state + validation | Manual form state | React Hook Form + Zod (`zodResolver`) | Already established in Phase 3 PostForm.tsx. Same schema reused server-side. `[VERIFIED: src/app/(admin)/posts/PostForm.tsx]` |
| Mutation/cache state | Manual useState loading flags | TanStack Query `useMutation` | Already installed (5.101.2). Standard for optimistic UI + cache invalidation. `[VERIFIED: package.json L30]` |
| Drag-drop upload zone (D-14) | A custom drop handler | `react-dropzone` (already installed at `^14.3.8`) | Already a dependency. Handles drag events, file-type filtering, multi-file. `[VERIFIED: package.json L54]` |
| Cloudinary upload | Raw fetch to their REST API | `cloudinary` npm SDK (`upload_stream`) | SDK handles签名, multipart, error handling. `[VERIFIED: cloudinary package — OK verdict]` |

**Key insight:** Phase 4 introduces **one** genuinely new external dependency (`cloudinary`). Everything else is composition of already-installed, already-proven libraries. The planner should resist any "let me also add X" temptation — the stack is locked.

## Runtime State Inventory

> Phase 4 includes a route restructure (D-01) — moving `(admin)/posts/*` → `(admin)/dashboard/posts/*`. Treat this as a refactor phase for that sub-task.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `settings.storage.active_provider` already seeded (`"local"` default — `lib/storage/seed.ts`). Phase 4 adds new `settings.storage.<provider>_creds` keys (encrypted blobs, D-25) + `settings.storage.encryption_key_version` (key-rotation reference). The `media.provider` column already accepts arbitrary text (`"local" \| "r2"`; Phase 4 widens the value set to include `"cloudinary" \| "push-cdn"` — no schema change, the column is plain text). The `pages` table exists with empty body — Phase 4 seeds T&C/Privacy/Contact rows. | New settings keys + page seeds via one `drizzle-kit generate` migration (D-29). **Code edit, not data migration** — greenfield DB, no existing rows to transform. |
| Live service config | The active storage provider is read at runtime from `settings.storage.active_provider` by `registry.ts`. Switching providers via the new Storage Settings UI takes effect on the next `getActiveProvider()` call — no restart needed. The new Cloudinary/push-CDN providers register via `registerStorageProvider()` at boot in `instrumentation.ts`. | Code edit (instrumentation.ts + new provider files). No external service reconfiguration. |
| OS-registered state | None — the `node-cron` scheduler (Phase 3 D-11) reads `posts.publishedAt` and is unaffected by route changes. No Task Scheduler / launchd / pm2 registrations embed admin route paths. | None — verified by reading `src/instrumentation.ts` + `src/lib/schedule` references (scheduler works on the posts table, not URLs). |
| Secrets/env vars | Existing: `S3_*` (R2/MinIO), `NEXT_PUBLIC_CDN_URL`, `STORAGE_LOCAL_ROOT`, `SETTINGS_ENCRYPTION_KEY` (NEW for D-25 — must be added to `.env.example` and Coolify runtime env). Cloudinary provider needs `CLOUDINARY_*` env bootstrap OR encrypted settings values (D-25 design: credentials live encrypted in `settings`, not env — env only holds the encryption key itself). | New env var: `SETTINGS_ENCRYPTION_KEY` (32-byte base64). Document in `.env.example`. **The credentials themselves go in the DB (encrypted), not env** — env only holds the single master key. |
| Build artifacts | Next.js `output: "standalone"` (next.config.ts) — the build copies `public/` at build time only. The local storage provider writes to `storage/local/` (outside `public/`) — unaffected by route restructure. `node_modules/.cache` may cache old route paths — `pnpm build` regenerates. | `rm -rf .next` before first Phase-4 build to clear stale route cache. No persistent build artifact stores admin paths. |

**The canonical question — "After every file in the repo is updated, what runtime systems still have the old string cached, stored, or registered?":**
- The middleware-manifest.json rebuilds on every `pnpm build` — no stale matchers persist.
- The prerender-manifest.json (`/dashboard` static shell) rebuilds on every build.
- Browser-cached JS chunks from Phase 3 may reference old `/posts` paths — users will get a fresh chunk on next load (content-hash filenames).
- No external service (CDN, R2, Cloudinary) stores admin route paths.
- **Conclusion: a clean `pnpm build` + redeploy is sufficient. No data migration, no external reconfiguration.**

## Common Pitfalls

### Pitfall 1: Renaming `middleware.ts` → `proxy.ts` (the CLAUDE.md staleness trap)
**What goes wrong:** Following CLAUDE.md's "proxy.ts (renamed)" guidance literally, the planner renames `middleware.ts` → `src/proxy.ts`. Next.js 16.2.9 + Turbopack compiles it but never registers it in `middleware-manifest.json` (manifest stays empty `{}`). The auth gate silently disappears — unauthenticated users hit `/dashboard` without redirect.
**Why it happens:** CLAUDE.md documents the rename as a done deal, but the team hit a real Turbopack defect in Phase 2 (plan 02-05) and reverted. The middleware.ts file has an 18-line comment explaining this exact issue.
**How to avoid:** Leave the file at `middleware.ts` (repo root). Update the matcher paths if needed (already `/dashboard/:path*`), never the filename. The planner should cite this research if the CLAUDE.md staleness comes up.
**Warning signs:** `middleware-manifest.json` shows `"middleware": {}` after a build.

### Pitfall 2: Encryption key rotation breaks existing encrypted credentials
**What goes wrong:** The admin rotates `SETTINGS_ENCRYPTION_KEY`. Existing encrypted credential blobs in `settings` become undecryptable (AES-GCM `final()` throws on bad auth tag — by design). The Storage Settings page errors out.
**Why it happens:** AES-256-GCM auth tag verification fails on any key mismatch. No rotation strategy was planned.
**How to avoid:** Store a `settings.storage.encryption_key_version` integer alongside the credentials. The decrypt function tries the current key, and on failure, surfaces a "re-enter credentials" prompt rather than crashing. For v1, a simpler approach: document that key rotation requires re-entering all credentials (acceptable for a 2–5 person team). `[ASSUMED]` — rotation strategy is at planner discretion (D-25).
**Warning signs:** `decipher.final()` throws "Unsupported state or unable to authenticate data" after a deploy.

### Pitfall 3: Cloudinary `upload_stream` buffer handling
**What goes wrong:** The Cloudinary SDK's `uploader.upload_stream()` expects a stream, but the existing `StorageProvider.upload()` contract passes a `Buffer`. Naive wrapping causes double-encoding or stream-not-consumed errors.
**Why it happens:** Cloudinary v2 SDK has two upload paths — `upload()` (file path) and `upload_stream()` (stream/buffer). The buffer-to-stream conversion must use `stream.Readable.from(buffer)`.
**How to avoid:** Use `cloudinary.v2.uploader.upload_stream({ resource_type: "auto", folder: "media", public_id: baseKey }, callback)` and pipe the buffer through `Readable.from(buffer)`. Return `variants: []` (Cloudinary owns transforms) and `primary.key = publicId`. `[ASSUMED]` — exact v2 SDK call signature should be verified against `npm view cloudinary` readme during implementation.
**Warning signs:** Upload succeeds but the returned `public_id` doesn't match the `baseKey`, or `getPublicUrl` returns a broken URL.

### Pitfall 4: `next/image` remotePatterns missing new CDN hostnames
**What goes wrong:** After switching to Cloudinary or a push-CDN, all images 400/break because the CDN hostname isn't in `next.config.ts` `images.remotePatterns`.
**Why it happens:** `next/image` with `loader: "custom"` still validates against `remotePatterns` for unknown hostnames. The current config only allows `cdn.anydiscussion.com` + `localhost:9000`.
**How to avoid:** When implementing D-21/D-22, add the Cloudinary hostname (`res.cloudinary.com`) and the push-CDN base URL hostname to `images.remotePatterns`. Alternatively (cleaner): the providers return absolute URLs and `cdnImageLoader` passes them through verbatim — but the hostnames still need allowlisting. `[VERIFIED: next.config.ts images config read directly]`
**Warning signs:** Images upload successfully but render as broken in the dashboard.

### Pitfall 5: Route restructure breaks the auth-gate test
**What goes wrong:** D-01 moves posts under `/dashboard/posts/*`. The Phase 2 `scripts/test-auth-gate.mjs` structural check looks for the prerendered `/dashboard` shell and specific "Dashboard content will be wired" / "AdminShell" markers. Moving routes changes which paths have static shells.
**Why it happens:** The test asserts the `/dashboard` route's prerendered HTML doesn't leak dashboard content. Restructuring may add new prerendered routes (`/dashboard/posts`, etc.) that need the same check.
**How to avoid:** After the route move, run `pnpm test:auth-gate`. The test's `structuralCheck()` may need its dashboard-markers list or route-keys updated to cover the new `/dashboard/*` paths. The test already handles the case where `/dashboard` is fully dynamic (no shell) — PPR. `[VERIFIED: scripts/test-auth-gate.mjs read directly]`
**Warning signs:** Test fails on "Static shell for /dashboard contains dashboard content" after the move.

### Pitfall 6: Optimistic UI on the wrong mutation (D-27)
**What goes wrong:** Planner applies optimistic updates uniformly to all mutations. Post publish gets optimistic treatment → user sees "published" before the server's `revalidatePath`/`revalidateTag` finishes → cache out of sync → post appears published in the list but public page still 404s.
**Why it happens:** TanStack Query's `onMutate` optimistic pattern is addictive to apply everywhere.
**How to avoid:** D-27 is explicit: optimistic ONLY on `media delete`, `taxonomy CRUD`, `user ban/role-change`, `page save`. NOT on `post publish` or `media upload`. The planner should add a per-mutation comment citing D-27. `[CITED: 04-CONTEXT.md D-27]`
**Warning signs:** Published post appears in dashboard list but public page is stale.

### Pitfall 7: Credentials pre-filled in the Storage Settings form (D-25 leak)
**What goes wrong:** The Storage Settings page reads existing credentials and pre-fills the secret fields → secrets cross the network to the client → violate D-25 ("never exposed to the client").
**Why it happens:** Standard form-edit UX is to pre-fill. For credentials this is wrong.
**How to avoid:** The settings-read action returns `redactCredentials(creds)` — secret fields come back as empty strings. The form shows a placeholder like "•••••••• (enter new value to change)". Only non-secret fields (e.g. bucket name, cloud name) pre-fill. `[CITED: 04-CONTEXT.md D-25]`
**Warning signs:** Network response from `getStorageSettings` contains `secretAccessKey` or `apiKey` values.

## Code Examples

### Example 1: Cloudinary provider (D-22) — illustrative shape
```typescript
// Source: cloudinary v2 SDK API + the existing StorageProvider contract.
// [ASSUMED] — exact v2 SDK signatures should be verified against the installed package
// readme during implementation. The structural shape is correct against the interface.
import { v2 as cloudinary } from "cloudinary";
import type { StorageProvider, UploadedVariant } from "./types";

// Configure once at module load from encrypted settings (read in registry.ts boot).
// cloudinary.v2.config({ cloud_name, api_key, api_secret });

export const cloudinaryProvider: StorageProvider = {
  name: "cloudinary", // widens the union in types.ts

  async upload(buffer, baseKey, mimeType) {
    // D-22: Cloudinary owns transforms — sharp is BYPASSED for this provider.
    // upload_stream returns { public_id, secure_url, width, height, bytes }.
    const { Readable } = await import("node:stream");
    const result = await new Promise<CloudinaryUploadResult>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { resource_type: "auto", folder: "media", public_id: baseKey },
        (err, res) => (err ? reject(err) : resolve(res!)),
      );
      Readable.from(buffer).pipe(stream);
    });
    return {
      variants: [], // Cloudinary transforms at delivery URL time, not at upload
      primary: {
        key: result.public_id,
        width: result.width,
        height: result.height,
        sizeBytes: result.bytes,
      },
    };
  },

  getPublicUrl(key, variant) {
    // On-the-fly transform via URL params — Cloudinary's value proposition.
    // e.g. f_auto,q_auto,w_1024 → format auto, quality auto, width 1024.
    const transforms = variant === "sm" ? "w_640" : variant === "lg" ? "w_1920" : "w_1024";
    return cloudinary.url(key, { transformation: [{ fetch_format: "auto", quality: "auto", raw_transformation: transforms }] });
  },

  async delete(key) {
    await cloudinary.uploader.destroy(key).catch(() => {}); // idempotent
  },
};
```

### Example 2: Generic push-CDN provider (D-21)
```typescript
// Source: @aws-sdk/client-s3 (already installed) + the existing lib/r2 pattern.
// [VERIFIED: src/lib/r2/index.ts — S3Client with custom endpoint is the proven pattern]
import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import sharp from "sharp";
import type { StorageProvider, UploadedVariant } from "./types";

// Config from encrypted settings (populated by registry.ts at boot).
let s3Client: S3Client | null = null;
let cdnBaseUrl = "";

export function configurePushCdn(creds: {
  endpoint: string; region: string; accessKeyId: string; secretAccessKey: string;
  bucket: string; cdnBaseUrl: string; forcePathStyle?: boolean;
}) {
  s3Client = new S3Client({
    region: creds.region, endpoint: creds.endpoint,
    credentials: { accessKeyId: creds.accessKeyId, secretAccessKey: creds.secretAccessKey },
    forcePathStyle: creds.forcePathStyle ?? false,
  });
  cdnBaseUrl = creds.cdnBaseUrl.replace(/\/$/, "");
}
// Registry reads encrypted creds from settings at boot, decrypts, calls configurePushCdn().
// The S3 origin upload is identical to r2Provider; getPublicUrl overlays cdnBaseUrl.

export const pushCdnProvider: StorageProvider = {
  name: "push-cdn",
  async upload(buffer, baseKey, mimeType) {
    if (!s3Client) throw new Error("PUSH_CDN_NOT_CONFIGURED");
    if (mimeType.startsWith("image/")) {
      // Same 3-variant sharp pipeline as local/r2 — push-CDN origin is S3-compatible.
      const variants: UploadedVariant[] = [];
      for (const size of [{ width: 640, suffix: "sm" }, { width: 1024, suffix: "md" }, { width: 1920, suffix: "lg" }]) {
        const { data, info } = await sharp(buffer).resize(size.width, undefined, { fit: "inside", withoutEnlargement: true }).webp({ quality: 80 }).toBuffer({ resolveWithObject: true });
        const key = `${baseKey}-${size.suffix}.webp`;
        await s3Client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: data, ContentType: "image/webp" }));
        variants.push({ key, width: info.width, height: info.height, format: "webp", sizeBytes: info.size });
      }
      return { variants, primary: { key: variants[1].key, width: variants[1].width, height: variants[1].height, sizeBytes: variants[1].sizeBytes } };
    }
    await s3Client.send(new PutObjectCommand({ Bucket: bucket, Key: baseKey, Body: buffer, ContentType: mimeType }));
    return { variants: [], primary: { key: baseKey, sizeBytes: buffer.length } };
  },
  getPublicUrl(key) { return `${cdnBaseUrl}/${key}`; }, // CDN base URL overlay
  async delete(key) { if (s3Client) await s3Client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key })).catch(() => {}); },
};
```

### Example 3: "Test connection" probe (D-24) — per provider
```typescript
// Source: provider-correctness pattern — each provider type gets a no-op probe.
// [ASSUMED] — exact probe shape is discretionary per D-24.
export async function testStorageConnection(provider: string, creds: Record<string, string>): Promise<{ ok: boolean; error?: string }> {
  switch (provider) {
    case "local":
      // Probe: verify STORAGE_LOCAL_ROOT exists + is writable.
      try { await fs.access(process.env.STORAGE_LOCAL_ROOT ?? "storage/local"); return { ok: true }; }
      catch { return { ok: false, error: "Local storage root not accessible" }; }
    case "r2":
    case "push-cdn":
      // Probe: list objects (limit 1) — cheapest S3 no-op.
      try { await makeS3Client(creds).send(new ListObjectsV2Command({ Bucket: creds.bucket, MaxKeys: 1 })); return { ok: true }; }
      catch (e) { return { ok: false, error: String(e) }; }
    case "cloudinary":
      // Probe: Cloudinary ping endpoint (or a usage API call).
      try { await cloudinary.v2.api.ping(); return { ok: true }; }
      catch (e) { return { ok: false, error: String(e) }; }
  }
}
```

### Example 4: Established Server Action pattern (carry-forward — DO NOT deviate)
```typescript
// Source: src/actions/categories.ts (read directly) — the permission-check-first template.
// [VERIFIED: every existing mutating action in actions/ follows this shape]
"use server";
import { requireCan } from "@/lib/permissions";
import { db, schema } from "@/lib/db";

export async function createPage(input: PageInput) {
  await requireCan({ page: ["create"] }); // FIRST — always (Pitfall #1, Phase 2)
  // ... validate, write
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `middleware.ts` (Next 12-15) | `proxy.ts` (Next 16 rename) | Next 16.0 canary | **REVERTED in this project** — Turbopack defect means `proxy.ts` is never registered. Use `middleware.ts`. |
| Cloudinary v1 API | Cloudinary v2 API | v2.0 (2024) | v2 uses `cloudinary.v2.uploader.*` and `cloudinary.v2.url()`. The `cloudinary` package latest is 2.10.0 (2026-04-25). |
| Tiptap v2 (ProseMirror) | Tiptap v3 | v3.0.0 (2024-07-14) | Already on v3 (Phase 3). v2 is maintenance-only. The slimmed page editor reuses this. |
| Zod v3 | Zod v4 | 4.0.0 (2025-07-09) | Already on v4 (Phase 3). `@hookform/resolvers@5` is the Zod-4-compatible bridge. |
| React Query v4 (old) | TanStack Query v5 | 5.x | Already installed (5.101.2). v5 uses `useMutation({ mutationFn, onMutate, onSuccess })`. |
| DOMPurify client-only | isomorphic-dompurify | 3.18.0 | Already installed. Page content (Tiptap JSON → HTML) goes through the same `lib/sanitize` config as posts. |

**Deprecated/outdated:**
- `proxy.ts` for this specific Next.js 16.2.9 + Turbopack combination — see Pitfall 1.
- `@dnd-kit/react` (0.5.0) — pre-1.0, beta. Use legacy `@dnd-kit/core@6.3.1` + `@dnd-kit/sortable@10.0.0` if any reordering is needed (the `(ui-elements)` showcase or future menu builder). Not needed for Phase 4 unless a table-row reorder surface appears.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Cloudinary v2 SDK uses `cloudinary.v2.uploader.upload_stream()` for buffer uploads and `cloudinary.v2.url(publicId, { transformation })` for delivery URLs. | Code Examples (Example 1) | Implementation detail — verify against `cloudinary` package readme during implementation. The structural shape (interface implementation) is correct regardless. |
| A2 | The Cloudinary `upload_stream` callback signature is `(err, res)` where `res` has `public_id`, `secure_url`, `width`, `height`, `bytes`. | Code Examples (Example 1) | Same as A1 — verify exact field names. Low risk (SDK is stable). |
| A3 | Encryption key rotation requires re-entering all credentials (acceptable for v1 / 2–5 person team). | Pitfall 2 | If the team needs zero-downtime rotation, a key-version envelope scheme is needed. Discretionary per D-25. |
| A4 | The push-CDN probe should be `ListObjectsV2Command({ MaxKeys: 1 })` — the cheapest S3 no-op. | Code Examples (Example 3) | Discretionary per D-24. Alternative: `HeadBucketCommand`. Both are cheap. |
| A5 | The Cloudinary probe should be `cloudinary.v2.api.ping()`. | Code Examples (Example 3) | Verify the exact ping/usage API method in the SDK. Discretionary per D-24. |
| A6 | `@tanstack/react-query-devtools` is a separate package that needs `pnpm add -D`. | Pattern 3 | If it's a subpath export of the main package, no extra install. The planner should check. Discretionary — devtools can be skipped entirely if avoiding the extra dep. |
| A7 | No existing OS-registered state (Task Scheduler / pm2 / launchd) embeds admin route paths. | Runtime State Inventory | Verified by reading `instrumentation.ts` (only the node-cron scheduler, which works on the posts table, not URLs). Low risk. |
| A8 | The existing ESLint `no-restricted-imports` rule covers the new `/dashboard/*` sub-paths automatically (it's based on `(admin)` group membership, not specific paths). | Architecture Patterns | Verify by running `pnpm lint` after the route move. The rule pattern is `src/app/(admin)/**/*` — path-agnostic. Low risk. |

**Note:** All `[VERIFIED: ...]` claims in this research were confirmed by reading the codebase directly or checking the npm registry in this session. The `[ASSUMED]` items above are implementation details the planner should verify during implementation, not architectural risks that block planning.

## Open Questions

1. **Should the Cloudinary provider support the `resource_type: "video"` path?**
   - What we know: Phase 3 D-08 caps uploads at 10MB (images + small PDFs). Video hosting was explicitly deferred.
   - What's unclear: Whether Cloudinary video delivery is a useful fast-follow.
   - Recommendation: Ship `resource_type: "auto"` (handles images only for now). Video is a v2 concern. `[CITED: 03-CONTEXT.md D-08]`

2. **Does the push-CDN provider wire purge-on-upload (D-21 discretion)?**
   - What we know: D-21 says "optional purge/invalidate credentials". A push-CDN serves cached content — after a re-upload at the same key, the CDN may serve stale content until TTL expires.
   - What's unclear: Whether the founder's CDN-of-choice has a purge API worth wiring.
   - Recommendation: Ship v1 with no purge-on-upload (document the TTL-staleness tradeoff). Add a manual "Purge CDN" button in Storage Settings as a fast-follow if needed. `[CITED: 04-CONTEXT.md D-21]`

3. **Should the users drawer surface the ban-reason + ban-expiry fields (Phase 2 D-16 primitive supports both)?**
   - What we know: `banUser(userId, { banReason, banExpiresIn })` is the primitive. D-08 says "disable (ban)".
   - What's unclear: Whether the UI should expose reason/expiry or just a simple toggle.
   - Recommendation: Ship a simple ban toggle first (no reason/expiry in the form). The primitive supports adding them later. Discretionary per D-07.

4. **Does `actions/users.ts` need a new `listUsers` action (none exists)?**
   - What we know: `users.ts` has `createFirstAdmin`, `createUser`, `banUser`, `unbanUser`, `revokeSessions` — no list/update.
   - What's unclear: Whether the users table page reads directly from `db.user` or via an action.
   - Recommendation: Add `listUsers()` + `updateUser()` to `actions/users.ts` following the existing template (permission check first). The users table page calls `listUsers()` from a Server Component; the drawer calls `createUser`/`updateUser`/`banUser`/`revokeSessions` via TanStack mutations.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js 20.19+ LTS | Project runtime (Next 16 + sharp + isomorphic-dompurify) | ✓ (project targets 20.19 LTS base image per CLAUDE.md) | 20.19+ | — |
| PostgreSQL | Drizzle ORM (settings, pages, users reads/writes) | ✓ (self-hosted via Coolify, Phase 1) | 16/17 | — |
| pnpm | All package operations (CLAUDE.md hard rule) | ✓ | latest | — |
| Cloudflare R2 / MinIO | R2 storage provider (already configured) | ✓ (existing `S3_*` env) | — | Local provider is the default fallback |
| `SETTINGS_ENCRYPTION_KEY` env var | D-25 credential encryption (NEW) | ✗ (not yet in `.env.example`) | — | **Must be generated + added before D-25 works.** `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` |
| Cloudinary account (for D-22 testing) | Cloudinary provider test-connection probe | Unknown — operator-provisioned | — | Provider ships unconfigured; admin enters creds in Storage Settings. Local/R2 unaffected. |
| Push-CDN origin (for D-21 testing) | Generic S3-compatible provider test-connection probe | Unknown — operator-provisioned | — | Same — admin configures in Storage Settings. |

**Missing dependencies with no fallback:**
- `SETTINGS_ENCRYPTION_KEY` — the planner MUST add this to `.env.example` (and the Coolify runtime env) as a Wave-0 task. Without it, the Storage Settings save action crashes on encrypt. No code fallback — encryption is the security boundary.

**Missing dependencies with fallback:**
- Cloudinary account + push-CDN origin — the providers ship unconfigured. The default `local` provider keeps uploads working. The new providers only activate when an admin enters credentials.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.9 (`[VERIFIED: package.json L80]`) |
| Config file | `vitest.config.ts` (repo root — environment: node, `@/*` alias) |
| Quick run command | `pnpm test` |
| Full suite command | `pnpm test` (vitest run — no watch per VALIDATION.md sign-off) |
| Migration test | `pnpm test:migrations` (clean-room: empty PG ← all migrations) |
| Auth-gate test | `pnpm test:auth-gate` (structural + HTTP check) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| DASH-01 | Posts list/new/edit under `/dashboard/posts/*` (D-01 move) | smoke | `pnpm test:auth-gate` (covers route reachability) | ✅ scripts/test-auth-gate.mjs |
| DASH-02 | Categories + Tags CRUD tables consume existing actions | unit | `pnpm test src/actions/__tests__/taxonomy.test.ts -x` | ✅ exists (Phase 3) — confirm coverage still passes |
| DASH-03 | Media library browser + reusable `<MediaPicker>` | unit | `pnpm test src/actions/__tests__/media.test.ts -x` | ✅ exists (Phase 3) — actions covered; UI component test ❌ Wave 0 |
| DASH-04 | Users + roles management (admin-only); action re-checks admin | unit | `pnpm test src/actions/__tests__/users.test.ts -x` | ✅ exists — EXTEND for `listUsers`/`updateUser` |
| DASH-05 | Pages CRUD via slimmed Tiptap editor | unit | `pnpm test src/actions/__tests__/pages.test.ts -x` | ❌ Wave 0 — new `actions/pages.ts` |
| DASH-06 | RHF + Zod + TanStack Query applied dashboard-wide | unit | `pnpm test` (existing PostForm + new forms) | Partial — PostForm works; new form tests ❌ Wave 0 |
| DASH-07 | Demo cleanup (chart/form/table demos deleted) | manual | `pnpm build` + verify no broken imports | — |
| DASH-08 | Dark mode coverage on new pages | manual | Manual browser check (ThemeContext exists) | — |
| DASH-09 | Storage Settings: provider selection + encrypted creds + 2 new providers | unit + integration | `pnpm test src/lib/storage/__tests__/registry.test.ts -x` + new provider tests | Partial — registry test exists; cloudinary/push-cdn/crypto tests ❌ Wave 0 |

### Key Technical Risks → Test Map (the genuinely novel work)

| Risk | Behavior to verify | Test Type | Command | File Exists? |
|------|-------------------|-----------|---------|-------------|
| Storage provider correctness (D-21/D-22) | New providers implement `StorageProvider` interface; `upload`/`getPublicUrl`/`delete` round-trip | unit | `pnpm test src/lib/storage/__tests__/*.test.ts -x` | ❌ Wave 0 — `cloudinary.test.ts`, `push-cdn.test.ts` |
| Encryption round-trip (D-25) | `encrypt(decrypt(x)) === x`; tamper detection throws | unit | `pnpm test src/lib/crypto/__tests__/crypto.test.ts -x` | ❌ Wave 0 |
| Credential redaction (D-25) | `redactCredentials` zeroes secret fields; client never sees secrets | unit | (same as above) | ❌ Wave 0 |
| Permission re-check on Storage Settings save (D-23) | Non-admin calling `saveStorageSettings` throws FORBIDDEN | unit | `pnpm test src/actions/__tests__/storage-settings.test.ts -x` | ❌ Wave 0 |
| Permission re-check on user management (D-07/D-08/D-11) | Non-admin calling `createUser`/`banUser`/`updateUser` throws FORBIDDEN | unit | `pnpm test src/actions/__tests__/users.test.ts -x` | ✅ exists (Phase 2) — extend for `updateUser` |
| Route restructure does not break auth gate (D-01) | `/dashboard/*` paths still redirect unauthenticated users | integration | `pnpm test:auth-gate` | ✅ exists — may need marker updates |
| `(admin)`-scoped QueryClient (D-28) | TanStack Query not in `(site)` bundle | manual → automated in Phase 7 | `pnpm build` + bundle inspection | Phase 7 (PERF-02) |
| Encryption key missing → graceful failure (D-25) | Missing `SETTINGS_ENCRYPTION_KEY` → clear error, not silent | unit | (in crypto.test.ts) | ❌ Wave 0 |
| next/image remotePatterns allowlist (Pitfall 4) | New CDN hostnames don't 400 | manual | Browser check after provider switch | — |

### Sampling Rate
- **Per task commit:** `pnpm test` (vitest run — full suite is fast, ~seconds)
- **Per wave merge:** `pnpm test && pnpm test:migrations && pnpm test:auth-gate`
- **Phase gate:** Full suite green before `/gsd-verify-work`. Manual UI checks for DASH-07/DASH-08.

### Wave 0 Gaps
- [ ] `src/lib/storage/__tests__/cloudinary.test.ts` — covers DASH-09/D-22 (mock the SDK, verify upload returns `variants: []` + correct `primary.key`; verify `getPublicUrl` produces transform URLs)
- [ ] `src/lib/storage/__tests__/push-cdn.test.ts` — covers DASH-09/D-21 (mock S3Client, verify `cdnBaseUrl` overlay on `getPublicUrl`; verify sharp variants for image mime)
- [ ] `src/lib/crypto/__tests__/crypto.test.ts` — covers D-25 (round-trip, tamper detection on flipped authTag, redactCredentials zeroes secret fields)
- [ ] `src/actions/__tests__/storage-settings.test.ts` — covers D-23 (admin save persists encrypted blob; non-admin throws FORBIDDEN; redact-on-read returns empty secrets)
- [ ] `src/actions/__tests__/pages.test.ts` — covers DASH-05/D-17/D-20 (createPage/updatePage/listPages/softDeletePage; draft/published only — no pending_review)
- [ ] `src/actions/__tests__/users.test.ts` — EXTEND for `listUsers`/`updateUser` (D-07/D-11)
- [ ] `.env.example` — add `SETTINGS_ENCRYPTION_KEY` placeholder + generation instructions
- [ ] Framework install: `pnpm add cloudinary@2.10.0` (and optionally `pnpm add -D @tanstack/react-query-devtools`)

*(If no gaps: "None — existing test infrastructure covers all phase requirements")*

## Security Domain

> `security_enforcement: true` in config.json — this section is required. ASVS Level 1.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes | Better Auth (Phase 2) — `getSessionOrThrow` in every mutating action. `(admin)/layout.tsx` authoritative gate. `middleware.ts` UX-only cookie check. |
| V3 Session Management | yes | Better Auth sessions; `revokeSessions` action (Phase 2 D-17) surfaced in users UI (D-10). Cookie-based, httpOnly, SameSite. |
| V4 Access Control | yes | `requireRole('admin')` / `requireCan({ ... })` at the top of EVERY mutating action — especially the new `saveStorageSettings` (D-23) and `createPage`/`updatePage`/`createUser`/`updateUser`. Sidebar role-filtering (D-05) is UX-only. `[CITED: CLAUDE.md "Roles & permissions"]` |
| V5 Input Validation | yes | Zod v4 schemas shared client+server. `postSchema`, `mediaUploadSchema`, `mediaListSchema` established; new `pageSchema`, `storageSettingsSchema`, `userSchema` follow the same pattern. |
| V6 Cryptography | yes | **D-25 is the cryptographic centerpiece.** AES-256-GCM authenticated encryption via Node `crypto` (never hand-roll). 32-byte key from `process.env.SETTINGS_ENCRYPTION_KEY`. Fresh 12-byte IV per encryption. Auth tag verified on decrypt. `[CITED: Node.js crypto docs — aes-256-gcm]` |
| V7 Error Handling & Logging | yes | `lib/log` (established Phase 2). Errors throw sentinels (`FORBIDDEN`, `UNAUTHORIZED`, `FILE_TOO_LARGE`) — never leak stack traces to the client. |
| V8 Data Protection | yes | **D-25 redact-on-read** — credentials never cross to the client. `redactCredentials()` zeroes secret fields in any settings read payload. The Storage Settings form shows empty secret fields on edit. |
| V9 Communications | yes | HTTPS via Coolify managed SSL (production). `middleware.ts` redirect to `/signin` uses `NextResponse.redirect`. |
| V13 API & Web Service | yes | Server Actions are the default mutation path (CLAUDE.md). No new API routes except the existing `/api/media/[...path]` local-provider streamer (Phase 3). |

### Known Threat Patterns for this phase's stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Privilege escalation via Storage Settings save | Elevation of privilege | `requireRole('admin')` FIRST in `saveStorageSettings` action — before any DB write or encryption call. `[CITED: 04-CONTEXT.md D-23]` |
| Credential exfiltration via settings read | Information disclosure | `redactCredentials()` on every settings-read that crosses the client boundary. The Storage Settings form shows empty secret fields. `[CITED: 04-CONTEXT.md D-25]` |
| Encryption key leakage into build bundle | Information disclosure | `SETTINGS_ENCRYPTION_KEY` is a **runtime** env var (Coolify), NOT `NEXT_PUBLIC_*`. Next.js never inlines non-public env vars into the client bundle. Verify with bundle inspection (Phase 7 PERF-02). |
| Tampered ciphertext at rest | Tampering | AES-256-GCM auth tag — `decipher.final()` throws on any modification. The decrypt function never returns partial/garbage plaintext. |
| Path traversal via provider key | Tampering | `baseKey` is ALWAYS server-generated (`crypto.randomUUID()` in `actions/media.ts`); the local provider rejects `..` sequences as defense-in-depth (Phase 3 T-03-13, proven by test). The new providers inherit the same server-generated key contract. |
| XSS via pages body (Tiptap JSON → HTML) | Tampering / XSS | Pages content goes through the SAME `lib/sanitize` config as posts (Phase 3 D-02 — double-sanitize at storage AND render). The slimmed page editor reuses the established render pipeline. `[CITED: CLAUDE.md "sanitize any field that allows raw HTML"]` |
| Broken auth gate after route move | Bypass | `middleware.ts` matcher already targets `/dashboard/:path*`; `(admin)/layout.tsx` `getSession()` authoritative check is path-agnostic. `pnpm test:auth-gate` verifies post-move. |
| Forged role in client-side mutation | Elevation of privilege | Sidebar role-filter (D-05) is UX-only. Every mutating action re-checks via `requireCan`/`requireRole` server-side (Phase 2 Pitfall #1 — proven by existing tests). |

## Project Constraints (from CLAUDE.md)

**Hard rules the planner MUST honor (compliance-check these against the plan):**

1. **pnpm only** — every install, script, README, and CI config uses `pnpm`. Never `npm` or `yarn`. `[CITED: CLAUDE.md "Package manager"]`
2. **`(admin)` route group naming** — consistent everywhere (middleware matchers, imports, docs). NOT `(dashboard)`. `[CITED: CLAUDE.md "Folder structure"]`
3. **Never raw `<img>`** — all content images through `next/image`. The `<MediaPicker>` (D-13) returns URLs consumed by `next/image`, never by raw `<img>`. `[CITED: CLAUDE.md "Performance requirements"]`
4. **Sanitize raw HTML before storage AND render** — pages body (D-18) goes through the same `lib/sanitize` config as posts. No exception for "trusted admin content". `[CITED: CLAUDE.md "Code conventions"]`
5. **Server-side permission checks never optional** — every new mutating action (`saveStorageSettings`, `createPage`, `updateUser`, etc.) starts with `requireCan`/`requireRole`. UI hiding (D-05 sidebar) is supplementary, not authoritative. `[CITED: CLAUDE.md "Roles & permissions"]`
6. **No paid third-party APIs** — Cloudinary's free tier covers the project scale; the SDK itself adds no paid dependency. Self-hosted VPS via Coolify. `[CITED: CLAUDE.md "Constraints"]`
7. **Zod schemas live alongside their feature** — e.g. `src/app/(admin)/dashboard/pages/schema.ts`, `src/app/(admin)/dashboard/settings/storage/schema.ts`. Reused client+server. `[CITED: CLAUDE.md "Code conventions"]`
8. **Server Actions are the default mutation path** — only use API routes for externally-hit endpoints. No new API routes in this phase. `[CITED: CLAUDE.md "Code conventions"]`
9. **`drizzle-kit generate` for migrations** — never hand-write SQL. The Phase 4 seed migration (D-29) flows through `pnpm db:generate`. `[CITED: CLAUDE.md "Tech stack"]`
10. **Never assume Latin character limits** — Bangla page content (T&C/Privacy/Contact) validates by byte/reasonable char count, not Latin limits. `[CITED: CLAUDE.md "SEO requirements"]`

## Sources

### Primary (HIGH confidence)
- `src/lib/storage/types.ts` — the `StorageProvider` interface (read directly)
- `src/lib/storage/registry.ts` — `getActiveProvider` + `registerStorageProvider` extension hook (read directly)
- `src/lib/storage/local.ts` + `src/lib/storage/r2.ts` — existing provider implementations (read directly)
- `src/lib/storage/seed.ts` — settings keys already seeded (read directly)
- `src/db/schema.ts` — 12-table schema including `pages` (with SEO columns), `settings` (key-value), `media` (provider column), `user` (role/bio/avatar) (read directly)
- `src/actions/{users,categories,tags,media,settings,posts-schema,media-schema}.ts` — established Server Action patterns (read directly)
- `src/lib/permissions/index.ts` — `requireRole`/`requireCan`/`assertOwnsPost`/`getSessionOrThrow` (read directly)
- `src/app/(admin)/layout.tsx` + `AdminShell.tsx` — authoritative auth gate + shell structure (read directly)
- `middleware.ts` (repo root) — UX-only cookie gate, documented Turbopack/proxy.ts defect (read directly)
- `src/app/(admin)/posts/PostForm.tsx` + `schema-client.ts` — established RHF + Zod wiring (read directly)
- `src/components/editor/toolbar/Toolbar.tsx` — the `window.prompt` image button to replace (read directly)
- `scripts/test-auth-gate.mjs` — Phase 2 auth-gate regression test (read directly)
- `next.config.ts` — `images.remotePatterns` + `output: "standalone"` + custom loader (read directly)
- `eslint.config.*` — `no-restricted-imports` for `(admin)`/`(site)` isolation (read directly)
- `package.json` — all installed versions verified (read directly)
- `npm view cloudinary` — v2.10.0 latest, published 2026-04-25, official repo confirmed
- `04-CONTEXT.md` — D-01..D-29 locked decisions (read directly)

### Secondary (MEDIUM confidence)
- `CLAUDE.md` (repo root) + `.claude/CLAUDE.md` — verified 2026 version table + code shapes (carry-forward from prior phases; the one stale point is `proxy.ts` which this research flags)
- Node.js `crypto` documentation — AES-256-GCM is a stable API; the WebSearch result (captured before rate-limiting) provided the canonical pattern
- `.planning/phases/03-content-engine/03-CONTEXT.md` — D-09 (storage abstraction), D-10 (library-or-external), D-22 (taxonomy), D-24 (post editor) carry-forward

### Tertiary (LOW confidence)
- Cloudinary v2 SDK exact API signatures — marked `[ASSUMED]` in Code Examples. The structural shape (interface implementation) is correct; the exact method signatures (`upload_stream` callback, `cloudinary.url` transform params) should be verified against the installed `cloudinary@2.10.0` readme during implementation.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all packages verified installed in package.json; one new package (`cloudinary`) verified on npm registry with OK legitimacy verdict.
- Architecture: HIGH — all integration points read directly from the codebase; the storage abstraction was purpose-built for this extension (documented in code comments).
- Pitfalls: HIGH — Pitfall 1 (middleware.ts) is verified in-codebase with an 18-line explanatory comment; Pitfalls 2–7 are derived from the locked decisions + standard patterns.
- Encryption: HIGH — AES-256-GCM is the canonical Node crypto pattern, captured from WebSearch before rate-limiting.
- Cloudinary specifics: MEDIUM — package legitimacy verified, but exact v2 SDK API signatures are `[ASSUMED]` pending implementation-time verification.

**Research date:** 2026-07-05
**Valid until:** 2026-08-05 (30 days — stable stack; Cloudinary SDK is the only fast-moving piece, and its v2 API is stable)
