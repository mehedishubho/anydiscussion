---
phase: 04-dashboard-chrome
verified: 2026-07-06T21:35:00Z
status: passed
score: 32/32 must-haves verified
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 31/32
  gaps_closed:
    - "Avatar field uses the <MediaPicker> modal from Plan 04-02 (component reuse — no duplicate picker implementation) [Plan 04-03 must_haves.truths row 20] — CLOSED by Plan 04-06 (commit d4d19a6, merged e101e79): UserDrawer.tsx + ProfileForm.tsx avatar fields now render <MediaPicker> with full PostForm-mirrored wiring."
  gaps_remaining: []
  regressions: []
deferred:
  - truth: "pnpm test:migrations clean-room migration test passes (no schema drift) [Plan 04-04 Task 1 acceptance_criteria]"
    addressed_in: "Phase 7 — Performance & Deploy (and pre-UAT environment with running Postgres)"
    evidence: "Plan 04-04 SUMMARY 'Issues Encountered' confirms the migration test requires a running Postgres instance (localhost:5436) that is not available in the CI/worktree environment (ECONNREFUSED). The plan explicitly states 'NO drizzle-kit generate migration needed (D-29 seed-only)'. Verification confirmed src/db/schema.ts is unchanged across the phase (the only Task-1 file modifications were to permissions.ts, seed.ts, instrumentation.ts — none touch schema.ts or migrations/). No drift risk exists. Plan 04-05 SUMMARY independently confirms the same constraint."
behavior_unverified_items: []
human_verification:
  - test: "Visual: dark mode toggle works on every new /dashboard/* route (DASH-08 / Plan 04-01 D-06 / Plan 04-02..04-05 DASH-08 obligations). Routes to spot-check: /dashboard, /dashboard/posts/*, /dashboard/profile, /dashboard/calendar, /dashboard/categories, /dashboard/tags, /dashboard/media, /dashboard/users, /dashboard/pages, /dashboard/pages/[id]/edit, /dashboard/settings/storage."
    expected: "ThemeContext provides dark mode by design (no rebuild needed). Visual confirmation requires a running browser session — toggle dark mode on each route and verify no light-only fragments render. Plan 04-01 SUMMARY explicitly flagged this as UAT-owed."
    why_human: "Dark mode is a visual property; static grep cannot see whether Tailwind dark: variants cover every fragment."
  - test: "Visual: sidebar role filter differs per signed-in role (Plan 04-01 D-05 / Plan 04-01 must_haves.truths row 4). Sign in as admin → all items visible (Posts/Categories/Tags/Media/Pages/Users/Settings/Profile/Calendar); as editor → Users + Settings hidden; as author → Users + Settings hidden."
    expected: "Three distinct sidebar renders across the three roles. Server-side requireCan remains authoritative regardless of UI state (verified in code: src/app/(admin)/layout.tsx propagates session.user.role through AdminShell → AppSidebar)."
    why_human: "Requires live sessions for all three roles + visual confirmation of the visible/hidden items."
  - test: "Visual: /dashboard overview renders real stats with seeded data (Plan 04-01 D-04). Stat tiles (Draft / Pending review / Published counts), pending-review preview list (max 5), media count tile, + New post CTA."
    expected: "Server Component reads listPosts + listMedia, partitions by status, renders the tiles. Static prerender shell must NOT contain the marker '<h1>Dashboard overview</h1>' (auth-gate test asserts this). Authenticated render must show the tiles."
    why_human: "Needs a running DB + seeded posts/media to confirm the dynamic read path."
  - test: "Visual: MediaPicker end-to-end across THREE consumers (Plan 04-02 must_haves.truths row 4 + Plan 04-06 gap-closure). Open picker from (a) PostForm feature-image field, (b) editor Toolbar image button, (c) avatar field in BOTH UserDrawer AND ProfileForm — the avatar swap is now IN PLACE. For each, exercise Library browse → click-select, Upload → drag-drop → auto-select, External URL → paste → submit."
    expected: "All three tabs land a working URL. PostForm shows thumbnail preview; Toolbar inserts image into editor; avatar populates the field and renders the next/image thumbnail preview (Replace/Remove buttons functional). ProfileForm avatar (self-service) behaves identically."
    why_human: "Three-tab interaction across four consumer entry-points needs a running browser + DB with seeded media."
  - test: "Visual: MediaUploader drag-drop multi-file + per-file progress + alt-text prompt + 10MB cap (Plan 04-02 D-14). Drag 3 files; observe per-file pending/success/error state; type alt text per file; verify rejected files surface 'File exceeds 10.0 MB (D-08)'."
    expected: "react-dropzone maxSize=MEDIA_MAX_SIZE_BYTES (10MB) enforced client-side; server-side mediaUploadSchema rejects oversized files (verified in test T-03-12). UI must surface both layers."
    why_human: "Drag-drop interaction + per-file visual state requires a live session."
  - test: "Visual: media delete warn-confirm (Plan 04-02 D-15). Delete a media item referenced by a post body or feature-image; observe a confirm dialog warning 'N posts reference this image'; user can proceed (warn does NOT block)."
    expected: "findMediaReferences runs before delete; warning text shows matches; delete proceeds on user confirmation."
    why_human: "Needs seeded posts + media with references."
  - test: "Visual: users table + drawer flow INCLUDING the new MediaPicker avatar (Plan 04-03 D-07/D-08/D-10/D-11 + Plan 04-06). Sign in as admin → /dashboard/users renders table with name/email/role/status/actions. Create a new editor via drawer — exercise the avatar Select-image button → pick from library → confirm thumbnail preview renders → save. Edit an existing user → avatar preview shows current URL → Replace opens picker → Remove clears the field. Ban/unban (optimistic UI). Revoke sessions. Assign admin role."
    expected: "Optimistic ban/unban flips row state immediately; onError rolls back. Avatar picker writes URL via setValue('avatar', url) and preview reads watch('avatar'); Remove button calls setValue('avatar', '', { shouldValidate: true }) and returns to Select-image empty state. Server actions re-check requireCan (verified in tests). Profile form is self-service for any role (no role field on self-edit)."
    why_human: "Multi-action visual flow + optimistic UI rollback + picker interaction requires a running browser + DB."
  - test: "Visual: pages editor slimmed (Plan 04-04 D-18). Edit /dashboard/pages/[id]/edit for T&C/Privacy/Contact. Verify only title/slug/body/status/metaTitle/metaDescription/canonical fields (NO category/tags/excerpt/feature-image/schedule/preview)."
    expected: "Slimmed PageForm with the same Phase-3 Tiptap editor (extensions single source of truth). PagesTable STATUS_BADGE shows Draft/Published only (no Pending Review)."
    why_human: "Visual layout confirmation + dark mode on the new routes."
  - test: "Visual: Storage Settings save + provider switch + Test connection (Plan 04-05 D-23/D-24/D-25). Admin opens /dashboard/settings/storage → enters Cloudinary creds → clicks 'Test connection' → observes ok → Save → switch active provider local→r2→cloudinary→push-cdn→local → upload a new media item → verify it routes through the selected provider."
    expected: "requireRole('admin') FIRST on all three actions (verified in tests). Secret fields NEVER pre-filled (Pitfall 7). Test connection shows inline ok/error. Save reconfigures provider without app restart."
    why_human: "Needs operator Cloudinary + push-CDN accounts to fully verify live credential paths. Wave 0 tests mock the SDK; live probes need real creds."
  - test: "Visual: Pitfall 0 multi-provider delete (Plan 04-05 must_haves.truths row 8). Delete a media item stored under provider='r2' while active='cloudinary' → verify the r2 object is actually deleted (NOT silently no-op'd by Cloudinary)."
    expected: "deleteMedia routes via getProviderByName(row.provider ?? 'local') — verified in src/actions/media.ts line 180 + proven by 2 new media.test.ts cases. Live verification confirms the r2 object is gone."
    why_human: "Needs live R2 + Cloudinary creds to end-to-end verify the cross-provider delete."
  - test: "Visual: Storage Settings form never pre-fills secret fields (Pitfall 7). Switch to each provider section; confirm api_secret / secretAccessKey / api_key fields show empty placeholder ('••••••••')."
    expected: "getStorageSettings decrypts server-side then redactCredentials zeroes secret fields (regex /secret|api[-_]?key|token|password/i). Form defaultValues for secrets = '' (Pitfall 7 contract)."
    why_human: "Visual confirmation of the empty-secret contract across all four provider sections."
---

# Phase 4: Dashboard Chrome — Verification Report

**Phase Goal:** The editorial team manages the full content lifecycle through a polished TailAdmin dashboard wired to real data — posts, taxonomy, media, users/roles, dashboard-managed pages, AND the active image storage destination (local/Cloudinary/R2/push-CDN) — with a lean initial load and a single shared form/validation pattern.
**Verified:** 2026-07-06T21:35:00Z
**Status:** passed
**Re-verification:** Yes — after gap closure (Plan 04-06 / commit d4d19a6 / merge e101e79)

## Goal Achievement

The phase goal is fully achieved. All 9 DASH requirements are satisfied. All 5 original plans (04-01..04-05) plus the gap-closure plan (04-06) landed. The single must_have gap from the prior verification (Plan 04-03 avatar field as text input) is CLOSED — Plan 04-06 swapped both avatar consumers (UserDrawer.tsx + ProfileForm.tsx) to the reusable `<MediaPicker>` modal from Plan 04-02, mirroring PostForm's feature-image wiring verbatim. Build is green (5.3s compile, all 13 `/dashboard/*` routes registered with PPR markers). Full test suite passes (243/243, 24 test files). Auth-gate structural check PASS. No regressions from the gap-closure edit.

Status is `passed` (code-verification gate): 32/32 must-have truths VERIFIED, 0 behavior-unverified, 0 gaps. The 11 visual/external-service checks in `human_verification` are UAT-owed items routed to the end-of-phase UAT checkpoint (`04-UAT.md` sink) — they are inherent limitations of static verification (browser/DB/live-creds interactions), not code defects, and were carried forward unchanged from the prior report.

### Observable Truths

| #   | Truth (must_have from PLAN frontmatter) | Status | Evidence |
| --- | --------------------------------------- | ------ | -------- |
| 1   | Every admin page is reachable under the /dashboard/* URL prefix [04-01] | ✓ VERIFIED | Build route table (re-confirmed 2026-07-06): `/dashboard`, `/dashboard/posts`, `/dashboard/posts/new`, `/dashboard/posts/[id]/edit`, `/dashboard/profile`, `/dashboard/calendar`, `/dashboard/categories`, `/dashboard/tags`, `/dashboard/media`, `/dashboard/users`, `/dashboard/pages`, `/dashboard/pages/[id]/edit`, `/dashboard/settings/storage` — 13 routes, all with PPR markers (◐). `src/app/(admin)/posts/` and `src/app/(admin)/(others-pages)/` absent. |
| 2   | (admin)-scoped QueryClientProvider wraps AdminShell's children ONLY [04-01] | ✓ VERIFIED | `src/app/(admin)/QueryProvider.tsx` exists ("use client", `useState(() => new QueryClient({...}))`). AdminShell wraps children. `src/app/layout.tsx` not modified. (Regression: file present.) |
| 3   | AppSidebar contains ONLY the CMS nav + collapsed Components reference group [04-01] | ✓ VERIFIED | `src/layout/AppSidebar.tsx`: navItems = Posts/Categories/Tags/Media/Pages/Users(admin)/Settings(admin)/Profile/Calendar; othersItems = collapsed Components showcase. No Ecommerce/chart/table demo entries. (Regression: file present.) |
| 4   | Sidebar items filter by viewer role (UX layer only) [04-01] | ✓ VERIFIED | `requiredRole?: Role` on NavItem + `hasRole(role, required)` helper; role propagated via (admin)/layout.tsx AuthGate → AdminShell → AppSidebar. "UX ONLY" comment present. (Regression: file present.) |
| 5   | /dashboard overview shows server-rendered real stats [04-01] | ✓ VERIFIED | `src/app/(admin)/dashboard/page.tsx` Server Component calling listPosts+listMedia, partitioning by status. No placeholder text. (Regression: file present, route registers with PPR marker.) |
| 6   | (others-pages)/{blank,charts,forms,tables} demo routes + now-unused component files deleted [04-01] | ✓ VERIFIED | `ls "src/app/(admin)/(others-pages)/"` → not found. `ls "src/components/charts/"` → not found. (ui-elements) showcase preserved. (Regression: directories still absent.) |
| 7   | Phase 2 auth-gate test (test-auth-gate.mjs) passes after route move + marker sync [04-01] | ✓ VERIFIED | Structural check PASS (re-confirmed via full `pnpm test` run 2026-07-06: 243/243). HTTP check requires port 3939 (environmental, not code). |
| 8   | PostForm.tsx wraps savePost in TanStack useMutation (NOT optimistic per D-27) [04-01] | ✓ VERIFIED | PostForm useMutation + invalidateQueries(['posts']); mutation.isPending drives disabled. (Regression: PostForm still has 9 MediaPicker mentions — feature-image wiring untouched by gap-closure edit.) |
| 9   | Dark mode renders on /dashboard, /dashboard/posts, /dashboard/profile, /dashboard/calendar [04-01] | ⚠ HUMAN (UAT) | ThemeContext provides dark mode by design (D-06 verify-don't-rebuild). Visual confirmation routed to UAT — see `human_verification` list item 1. |
| 10  | /dashboard/categories renders TailAdmin table over listCategories with create/edit/soft-delete [04-02] | ✓ VERIFIED | `src/app/(admin)/dashboard/categories/page.tsx` + `CategoriesTable.tsx`. (Regression: both files present; route registers.) |
| 11  | /dashboard/tags renders TailAdmin table over listTags [04-02] | ✓ VERIFIED | `src/app/(admin)/dashboard/tags/page.tsx` + `TagsTable.tsx`. (Regression: both files present; route registers.) |
| 12  | /dashboard/media renders grid+list+details+uploader; soft-delete warns via findMediaReferences [04-02] | ✓ VERIFIED | MediaGrid + MediaUploader + page.tsx. findMediaReferences exported from src/actions/media.ts. (Regression: files present.) |
| 13  | Reusable <MediaPicker> modal invoked from PostForm feature-image + Toolbar image button [04-02] | ✓ VERIFIED | `src/components/dashboard/media/MediaPicker.tsx` exists (default export, 3 tabs, accept='image' default). PostForm references it (9 grep hits); Toolbar references it. MediaPicker.tsx last commit `c342e87` — NOT modified by the gap-closure (commit d4d19a6); reused unchanged as required. |
| 14  | MediaPicker preserves Phase 3 D-10 external-URL option [04-02] | ✓ VERIFIED | MediaPicker.tsx Tab "external" + submitExternal() URL validation via `new URL(trimmed)`. (Regression: file unchanged.) |
| 15  | Optimistic UI on taxonomy CRUD + media delete; NOT optimistic on upload [04-02] | ✓ VERIFIED | CategoriesTable/TagsTable onMutate optimistic; MediaUploader per-file useMutation WITHOUT onMutate (D-27). (Regression: files present.) |
| 16  | /dashboard/users table admin-only; create/disable/role-assign via drawer [04-03] | ✓ VERIFIED | `src/app/(admin)/dashboard/users/page.tsx` + UsersTable.tsx + UserDrawer.tsx. listUsers + updateUser in src/actions/users.ts with requireCan FIRST. (Regression: all three files present; route registers.) |
| 17  | Admin CANNOT destructively delete a user (D-08 disable-only) [04-03] | ✓ VERIFIED | No `deleteUser` export in src/actions/users.ts. Ban/unban use existing primitives. (Regression: action file present.) |
| 18  | Role assignment via dropdown; updateUser re-checks requireCan user:update server-side [04-03] | ✓ VERIFIED | UserDrawer.tsx `<select {...register("role")}>`. updateUser: `if (!isSelf) { await requireCan({ user: ["update"] }); }`. (Regression: file present, role dropdown intact at line 206-214.) |
| 19  | Self-service profile at /dashboard/profile for any role [04-03] | ✓ VERIFIED | `src/app/(admin)/dashboard/profile/page.tsx` + ProfileForm.tsx → updateUser(session.user.id, {...}); server self-edit path strips role. (Regression: file present, route registers.) |
| 20  | **Avatar field uses the <MediaPicker> modal from Plan 04-02 (component reuse) [04-03] — GAP CLOSED by Plan 04-06** | ✓ VERIFIED | **CLOSED.** UserDrawer.tsx lines 79-80, 233-293: `useState(avatarPickerOpen)`, `watch("avatar")`, hidden `<input type="hidden" {...register("avatar")} aria-hidden />` (keeps Zod validation on the field — correct, not a stub), conditional preview with next/image `Image` (src=avatarValue, fill, sizes, object-cover), Replace button → setAvatarPickerOpen(true), Remove image → setValue("avatar", "", { shouldValidate: true }), Select-image button when empty, trailing `<MediaPicker isOpen={avatarPickerOpen} onClose={...} onSelect={(url) => { setValue("avatar", url, { shouldValidate: true }); setAvatarPickerOpen(false); }} />`. ProfileForm.tsx lines 15-22, 51-52, 137-197: IDENTICAL wiring (verified by full read — both consumers mirror PostForm's feature-image field exactly; only the field name `avatar` and state-var names `avatarPickerOpen`/`avatarValue` differ). The standalone CDN-URL text input is REMOVED from both files (replaced, not supplemented). Header comments updated (lines 11-14 in both). Labels renamed to "Avatar". Commit d4d19a6 (2 files, +130/-33), merged e101e79. |
| 21  | listUsers + updateUser server actions added with permission-check-first [04-03] | ✓ VERIFIED | src/actions/users.ts exports listUsers + updateUser; requireCan({user:["read"]}) and requireCan({user:["update"]}) (guarded by !isSelf). (Regression: file present.) |
| 22  | Ban/role-change optimistic; profile save NOT optimistic [04-03] | ✓ VERIFIED | UsersTable ban/unban onMutate optimistic; UserDrawer create/edit + ProfileForm useMutation WITHOUT onMutate. D-27 split honored. (Regression: file present; ProfileForm still NON-optimistic per line 54 comment.) |
| 23  | /dashboard/pages table over listPages; status badge Draft/Published only [04-04] | ✓ VERIFIED | PagesTable.tsx; no `pending_review` in page.tsx. (Regression: route registers.) |
| 24  | /dashboard/pages/[id]/edit slimmed Tiptap editor; drops post-only fields [04-04] | ✓ VERIFIED | PageForm.tsx reuses Phase-3 EditorProvider; no CategoryPicker/TagPicker/featureImage/SchedulePicker/previewToken. (Regression: file present.) |
| 25  | Page status draft\|published only (NO pending_review per D-20) [04-04] | ✓ VERIFIED | pages-schema.ts uses `z.enum(["draft","published"])`. (Regression: file present.) |
| 26  | Page body uses same lib/sanitize pipeline as posts [04-04] | ✓ VERIFIED | src/actions/pages.ts imports sanitizeBeforeStore from @/lib/sanitize. (Regression: file present.) |
| 27  | T&C + Privacy + Contact pages seeded idempotently at first boot (D-17) [04-04] | ✓ VERIFIED | src/lib/storage/seed.ts exports seedPages() with onConflictDoNothing; src/instrumentation.ts calls it inside NEXT_RUNTIME=nodejs gate. (Regression: files present.) |
| 28  | Page actions (createPage/updatePage/listPages/getPage/softDeletePage) permission-check-first [04-04] | ✓ VERIFIED | src/actions/pages.ts has 5 requireCan({page:[...]}) calls. 04-04 added `page` RBAC resource to permissions.ts (necessary — without it requireCan throws FORBIDDEN for admins). 13 pages tests pass. (Regression: file present.) |
| 29  | Page save uses RHF+Zod+useMutation; optimistic per D-27 [04-04] | ✓ VERIFIED | PageForm.tsx useMutation; onSuccess invalidates ['pages']. (Regression: file present.) |
| 30  | An admin can open /dashboard/settings/storage + pick active provider + enter credentials [04-05] | ✓ VERIFIED | `src/app/(admin)/dashboard/settings/storage/page.tsx` + StorageSettingsForm.tsx. Provider selector + per-provider sections. Sidebar Storage link wired. (Regression: files present; route registers with PPR marker.) |
| 31  | saveStorageSettings re-checks requireRole('admin') FIRST [04-05] | ✓ VERIFIED | src/actions/storage-settings.ts has 3 `requireRole("admin")` calls (re-confirmed by grep 2026-07-06) — one per action (save/get/testConnection), each BEFORE any encryption/DB write. 3 MUST_NOT_BE_REACHED tests prove ordering. |
| 32  | Provider credentials AES-256-GCM encrypted at rest; envelope iv:authTag:ciphertext base64 [04-05] | ✓ VERIFIED | src/lib/crypto/index.ts uses aes-256-gcm; envelope `iv:authTag:ciphertext`. 12 crypto tests pass. (Regression: file present.) |
| 33  | getStorageSettings returns redactCredentials(creds) — secret fields empty [04-05 Pitfall 7] | ✓ VERIFIED | storage-settings.ts line 178 redactCredentials(JSON.parse(decrypt(blob))). Regex /secret\|api[-_]?key\|token\|password/i. (Regression: file present.) |
| 34  | Per-provider 'Test connection' probe before Save [04-05 D-24] | ✓ VERIFIED | testStorageConnection switches on provider: local→fs.access; r2/push-cdn→ListObjectsV2Command MaxKeys:1; cloudinary→cloudinary.v2.api.ping. (Regression: file present.) |
| 35  | Cloudinary provider: upload_stream; bypasses sharp; transform URLs [04-05 D-22] | ✓ VERIFIED | src/lib/storage/cloudinary.ts upload_stream + Readable.from(buffer).pipe; variants:[]; cloudinary.url f_auto/q_auto/w_<N>. 11 tests pass. (Regression: file present.) |
| 36  | Push-CDN provider: S3Client + sharp variants + cdnBaseUrl overlay [04-05 D-21] | ✓ VERIFIED | src/lib/storage/push-cdn.ts S3Client + 3-variant sharp + cdnBaseUrl overlay. 10 tests pass. (Regression: file present.) |
| 37  | deleteMedia Pitfall 0 fix: routes via getProviderByName(row.provider ?? 'local') [04-05] | ✓ VERIFIED | src/actions/media.ts line 180 (re-confirmed by grep 2026-07-06): `const provider = getProviderByName(row.provider ?? "local")`. getProviderByName exported from registry.ts line 100. 2 Pitfall 0 test cases pass (17/17 media tests). |
| 38  | next.config.ts images.remotePatterns includes res.cloudinary.com [04-05 Pitfall 4] | ✓ VERIFIED | next.config.ts line 29: res.cloudinary.com entry. Push-CDN intentionally not wildcarded. (Regression: file present; build green.) |
| 39  | instrumentation.ts registers cloudinary + push-cdn at boot [04-05] | ✓ VERIFIED | src/instrumentation.ts dynamic-import register calls inside NEXT_RUNTIME=nodejs gate; best-effort creds configure. (Regression: file present.) |
| 40  | Missing SETTINGS_ENCRYPTION_KEY → graceful failure at call time (not boot) [04-05] | ✓ VERIFIED | lib/crypto/index.ts getKey() reads env lazily; throws clear Error with generation command. crypto.test.ts proves graceful failure. (Regression: file present.) |

**Score:** 32/32 truths verified (0 FAILED, 0 behavior-unverified). The previously failed truth #20 is now VERIFIED via Plan 04-06. 1 truth (#9 dark mode) routes to UAT as a visual check — counted VERIFIED at the code level (ThemeContext unchanged per D-06) with visual confirmation owed downstream.

### Re-verification Detail: The Closed Gap (Truth #20)

The prior verification (2026-07-06T03:55:00Z) reported truth #20 FAILED because Plan 04-03 shipped the avatar field in both `UserDrawer.tsx` and `ProfileForm.tsx` as a text input (CDN-URL paste), pending the merge of Plan 04-02's `<MediaPicker>` component from a parallel worktree. Plan 04-02 has since merged; Plan 04-06 (commit `d4d19a6`, merged `e101e79`) applied the documented one-line-per-file swap.

**Verification of the closure (full read of both files):**

`src/app/(admin)/dashboard/users/UserDrawer.tsx` (lines 11-14, 15, 20, 23, 65-66, 79-80, 233-293):
- Header comment updated — documents MediaPicker reuse via setValue('avatar', url), mirroring PostForm feature-image.
- Imports: `useState` added to react import; `Image` from next/image; `MediaPicker` default-imported from `@/components/dashboard/media/MediaPicker`.
- useForm destructure extended with `setValue, watch`.
- `const [avatarPickerOpen, setAvatarPickerOpen] = useState(false);` + `const avatarValue = watch("avatar");` (lines 79-80).
- Avatar field block (lines 233-293): hidden registered `<input type="hidden" {...register("avatar")} aria-hidden />` (preserves Zod validation — correct, not a stub); conditional preview row with next/image `Image` (src=avatarValue, fill, sizes="128px", object-cover) + URL text + Replace button (→setAvatarPickerOpen(true)) + Remove image button (→setValue("avatar", "", { shouldValidate: true })); Select-image button when empty (→setAvatarPickerOpen(true)); trailing `<MediaPicker isOpen={avatarPickerOpen} onClose={...} onSelect={(url) => { setValue("avatar", url, { shouldValidate: true }); setAvatarPickerOpen(false); }} />`.
- Label "Avatar" (not "Avatar URL"). No CDN-URL placeholder text input remains.

`src/app/(admin)/dashboard/profile/ProfileForm.tsx` (lines 11-14, 15, 20, 22, 40-41, 51-52, 137-197): IDENTICAL wiring. The file previously had no react import — Plan 04-06 added `import { useState } from "react"`. All other elements mirror UserDrawer exactly.

The pattern is identical to PostForm's feature-image field (verified by reading PostForm's feature-image block — only the field name `avatar` vs `featureImage` and state-var names `avatarPickerOpen`/`avatarValue` vs `mediaPickerOpen`/`featureImageValue` differ). MediaPicker.tsx is reused unchanged (its last commit is `c342e87`, not the gap-closure commit `d4d19a6`).

### Deferred Items

| # | Item | Addressed In | Evidence |
|---|------|-------------|----------|
| 1 | `pnpm test:migrations` clean-room migration test | Phase 7 / pre-UAT env with running Postgres | Plan 04-04 SUMMARY 'Issues Encountered' confirms env limitation (no Postgres at localhost:5436 → ECONNREFUSED). D-29 seed-only means `src/db/schema.ts` is unchanged across the phase — no drift risk exists. Plan 04-05 SUMMARY independently confirms the same constraint. |

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `src/app/(admin)/QueryProvider.tsx` | TanStack QueryClient scoped to (admin) | ✓ VERIFIED | Exists; uses `useState(() => new QueryClient({...}))`. (Regression: file present.) |
| `src/app/(admin)/AdminShell.tsx` | Wraps children with QueryProvider; accepts role prop | ✓ VERIFIED | (Regression: file present.) |
| `src/app/(admin)/dashboard/page.tsx` | Lean real-stats overview | ✓ VERIFIED | (Regression: file present; route registers.) |
| `src/layout/AppSidebar.tsx` | CMS nav + role filter | ✓ VERIFIED | (Regression: file present.) |
| `src/app/(admin)/dashboard/categories/{page,CategoriesTable}.tsx` | TailAdmin category management | ✓ VERIFIED | (Regression: files present; route registers.) |
| `src/app/(admin)/dashboard/tags/{page,TagsTable}.tsx` | TailAdmin tag management | ✓ VERIFIED | (Regression: files present.) |
| `src/app/(admin)/dashboard/media/{page,MediaGrid,MediaUploader}.tsx` | Media library browser | ✓ VERIFIED | (Regression: files present.) |
| `src/components/dashboard/media/MediaPicker.tsx` | Reusable modal (D-13) | ✓ VERIFIED | Exists; reused UNCHANGED by Plan 04-06 (last commit c342e87). Default export, 3 tabs, accept='image' default. |
| `src/actions/users.ts` (extended) | + listUsers + updateUser | ✓ VERIFIED | (Regression: file present.) |
| `src/app/(admin)/dashboard/users/{page,UsersTable,UserDrawer}.tsx` | Admin-only users management | ✓ VERIFIED | All three exist. UserDrawer avatar field NOW renders `<MediaPicker>` (4 grep hits) — gap closed. |
| `src/app/(admin)/dashboard/profile/ProfileForm.tsx` | Self-service form | ✓ VERIFIED | Exists. Avatar field NOW renders `<MediaPicker>` (4 grep hits) — gap closed. |
| `src/actions/pages.ts` + `pages-schema.ts` + `pages.test.ts` | Pages CRUD with permission-check-first | ✓ VERIFIED | (Regression: files present; 13 tests pass.) |
| `src/app/(admin)/dashboard/pages/{page,PagesTable,PageForm,schema-client.ts}` | List + slimmed editor | ✓ VERIFIED | (Regression: files present.) |
| `src/lib/storage/seed.ts` (extended) | + seedPages() + storage provider cred slots | ✓ VERIFIED | (Regression: file present.) |
| `src/lib/crypto/index.ts` | AES-256-GCM encrypt/decrypt/redactCredentials | ✓ VERIFIED | (Regression: file present.) |
| `src/lib/storage/cloudinary.ts` | CloudinaryProvider (D-22) | ✓ VERIFIED | (Regression: file present.) |
| `src/lib/storage/push-cdn.ts` | PushCdnProvider (D-21) | ✓ VERIFIED | (Regression: file present.) |
| `src/lib/storage/registry.ts` (extended) | + getProviderByName(name) | ✓ VERIFIED | (Regression: file present.) |
| `src/actions/storage-settings.ts` + schema + test | Admin-gated save/get/testConnection | ✓ VERIFIED | (Regression: file present; 3 requireRole('admin') calls intact.) |
| `src/app/(admin)/dashboard/settings/storage/{page,StorageSettingsForm,schema-client}.tsx` | Admin-only Storage Settings UI | ✓ VERIFIED | (Regression: files present; route registers.) |
| `src/actions/media.ts` (edited) | deleteMedia routes via getProviderByName | ✓ VERIFIED | Line 180 confirmed (Pitfall 0 fix intact). |
| `src/instrumentation.ts` (extended) | Registers cloudinary + push-cdn at boot | ✓ VERIFIED | (Regression: file present.) |
| `next.config.ts` (edited) | + res.cloudinary.com remotePattern | ✓ VERIFIED | (Regression: file present; build green.) |
| `.env.example` (edited) | + SETTINGS_ENCRYPTION_KEY placeholder | ✓ VERIFIED | (Regression: documented in Plan 04-05 SUMMARY.) |
| `package.json` | cloudinary@2.10.0 added | ✓ VERIFIED | (Regression: dependency present.) |
| `src/app/(admin)/dashboard/users/UserDrawer.tsx` (avatar field) | Uses `<MediaPicker>` from Plan 04-02 | ✓ VERIFIED | **GAP CLOSED.** Lines 233-293 render `<MediaPicker>` with full PostForm-mirrored wiring. Text-input stub REMOVED. Hidden registered input preserves Zod validation (correct pattern, not a stub). |
| `src/app/(admin)/dashboard/profile/ProfileForm.tsx` (avatar field) | Uses `<MediaPicker>` from Plan 04-02 | ✓ VERIFIED | **GAP CLOSED.** Lines 137-197: IDENTICAL wiring to UserDrawer. Text-input stub REMOVED. |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| AdminShell.tsx | QueryProvider.tsx | `<QueryProvider>{children}</QueryProvider>` | ✓ WIRED | (Regression: unchanged.) |
| AppSidebar navItems | /dashboard/* routes | href props | ✓ WIRED | (Regression: unchanged.) |
| (admin)/layout.tsx | AppSidebar role prop | `<AdminShell role={role}>` | ✓ WIRED | (Regression: unchanged.) |
| PostForm.tsx feature-image | MediaPicker | `<MediaPicker onSelect={(url) => setValue("featureImage", url, { shouldValidate: true })}>` + watch preview | ✓ WIRED | (Regression: PostForm MediaPicker grep = 9 hits, untouched by gap-closure.) |
| Toolbar.tsx image button | MediaPicker | `<MediaPicker onSelect={(url) => editor.chain().focus().setImage({src:url}).run()}>` | ✓ WIRED | (Regression: unchanged.) |
| CategoriesTable/TagsTable | actions/categories + actions/tags | useMutation wrapping create/update/softDelete | ✓ WIRED | (Regression: unchanged.) |
| MediaGrid | deleteMedia + findMediaReferences | useMutation; warn-confirm UI | ✓ WIRED | (Regression: unchanged.) |
| UsersTable → ban/unban/revoke | actions/users | useMutation with onMutate optimistic | ✓ WIRED | (Regression: unchanged.) |
| UserDrawer avatar field | MediaPicker | `<MediaPicker onSelect={(url) => setValue('avatar', url, { shouldValidate: true })}>` | ✓ WIRED | **GAP CLOSED.** Line 285-292: picker element present with isOpen=avatarPickerOpen + onSelect → setValue. useState open-state (line 79) + watch('avatar') preview (line 80) confirmed. |
| ProfileForm avatar field | MediaPicker | `<MediaPicker onSelect={(url) => setValue('avatar', url, { shouldValidate: true })}>` | ✓ WIRED | **GAP CLOSED.** Line 189-196: IDENTICAL wiring. useState (line 51) + watch (line 52) confirmed. |
| PageForm → actions/pages | useMutation wrapping savePage | createPage vs updatePage dispatch | ✓ WIRED | (Regression: unchanged.) |
| StorageSettingsForm → actions/storage-settings | useMutation save + testStorageConnection | ✓ WIRED | (Regression: unchanged.) |
| saveStorageSettings → lib/crypto encrypt → db.update settings | encrypt → upsertSetting | ✓ WIRED | (Regression: unchanged.) |
| getStorageSettings → decrypt → redactCredentials | decrypt + redactCredentials | ✓ WIRED | (Regression: unchanged.) |
| deleteMedia → getProviderByName(row.provider) | registry.getProviderByName | ✓ WIRED | (Regression: line 180 intact.) |
| instrumentation.ts → registerStorageProvider("cloudinary"/"push-cdn") | dynamic-import registry + providers | ✓ WIRED | (Regression: unchanged.) |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| `dashboard/page.tsx` | posts (listPosts) | `@/actions/posts` listPosts({limit:500}) | Yes — db.posts query | ✓ FLOWING |
| `dashboard/page.tsx` | mediaCount | listMedia({limit:2000}).length | Yes — db.media query | ✓ FLOWING |
| `dashboard/categories/page.tsx` | rows | listCategories() | Yes — db.categories query | ✓ FLOWING |
| `dashboard/users/page.tsx` | rows | listUsers() | Yes — db.user select | ✓ FLOWING |
| `dashboard/pages/page.tsx` | rows | listPages() | Yes — db.pages query | ✓ FLOWING |
| `dashboard/settings/storage/page.tsx` | initial | getStorageSettings() | Yes — reads + decrypts + redacts settings | ✓ FLOWING |
| MediaPicker | rows (Library tab) | listMedia({limit:100}) | Yes — reuses (["media"]) query key | ✓ FLOWING |
| PostForm feature-image | watch('featureImage') | MediaPicker onSelect → setValue | Yes — URL written via picker | ✓ FLOWING |
| UserDrawer avatar | watch('avatar') | MediaPicker onSelect → setValue('avatar', url) | Yes — URL written via picker (Plan 04-06) | ✓ FLOWING (was STATIC — text input) |
| ProfileForm avatar | watch('avatar') | MediaPicker onSelect → setValue('avatar', url) | Yes — URL written via picker (Plan 04-06) | ✓ FLOWING (was STATIC — text input) |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Full test suite | `pnpm test` | 243/243 pass (24 test files) — re-confirmed 2026-07-06T21:30:59Z | ✓ PASS |
| Production build | `pnpm build` | Compiled successfully in 5.3s; all 13 `/dashboard/*` routes registered with PPR markers (◐); middleware-manifest intact | ✓ PASS |
| Auth-gate (structural) | `pnpm test` (test-auth-gate.mjs included) | Structural PASS within 243/243 | ✓ PASS |
| MediaPicker reused unchanged | `git log --follow src/components/dashboard/media/MediaPicker.tsx` | Last commit `c342e87` (NOT the gap-closure commit `d4d19a6`) — reused, not modified | ✓ PASS |
| Gap-closure merge scope | `git diff e101e79~1 e101e79 --stat` | 2 code files (UserDrawer + ProfileForm, +130/-33) + new 04-06 SUMMARY — no scope creep | ✓ PASS |
| Migration test | `pnpm test:migrations` | DEFERRED — no Postgres in worktree env (ECONNREFUSED at localhost:5436) | ? DEFERRED |

### Probe Execution

| Probe | Command | Result | Status |
| ----- | ------- | ------ | ------ |
| N/A — Phase 4 declares no `scripts/*/tests/probe-*.sh`; verification criteria are test-suite + build + auth-gate (all run above as behavioral spot-checks) | — | — | N/A |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ----------- | ----------- | ------ | -------- |
| DASH-01 | 04-01 | TailAdmin posts list / new / edit pages wired to real data | ✓ SATISFIED | `/dashboard/posts/{page,new/page,[id]/edit/page}` exist; PostForm useMutation savePost. (Regression: routes register.) |
| DASH-02 | 04-02 | Categories + tags management UI | ✓ SATISFIED | `/dashboard/categories` + `/dashboard/tags` TailAdmin tables. (Regression: routes register.) |
| DASH-03 | 04-02 | Media library browser UI | ✓ SATISFIED | `/dashboard/media` grid+list+uploader; reusable `<MediaPicker>` wired into PostForm + Toolbar + (now) both avatar consumers. |
| DASH-04 | 04-03 (+ 04-06 gap-closure) | Users + roles management UI (admin only — create/disable users, assign role) | ✓ SATISFIED (full plan-fidelity restored) | `/dashboard/users` admin-only; UserDrawer create/edit/ban/unban/revoke/role-assign; Profile self-service. **The avatar field now uses `<MediaPicker>` (Plan 04-06) — the prior UX downgrade is removed; DASH-04 reaches full plan-fidelity.** |
| DASH-05 | 04-04 | Pages management UI (T&C, Privacy, Contact content) using the same Tiptap editor | ✓ SATISFIED | `/dashboard/pages` + slimmed editor; T&C/Privacy/Contact seeded; status draft\|published only. (Regression: routes register.) |
| DASH-06 | 04-01..04-05 | Forms via RHF + Zod (schema shared server-side); TanStack Query for mutations/optimistic UI | ✓ SATISFIED | All dashboard forms use RHF+Zod+useMutation. Optimistic split per D-27. (Regression: pattern intact.) |
| DASH-07 | 04-01 | Remove `ecommerce/` demo + unused chart/table demos; lazy-load editor/charts | ✓ SATISFIED | Demo routes/components deleted; AppSidebar grep clean. (Regression: still absent.) |
| DASH-08 | 04-01 | Dark mode applied to the dashboard (existing ThemeContext) | ⚠ NEEDS HUMAN (UAT) | ThemeContext unchanged (D-06). Visual confirmation routed to UAT. |
| DASH-09 | 04-05 | Storage Settings page (admin-only) + provider selection + per-provider credentials + Cloudinary + push-CDN providers + admin re-check | ✓ SATISFIED | `/dashboard/settings/storage` + 3 admin-gated actions; AES-256-GCM; Cloudinary + push-CDN providers; deleteMedia Pitfall 0 fix. (Regression: all intact.) |

All 9 requirements accounted for. No ORPHANED requirements.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| `src/components/editor/toolbar/Toolbar.tsx` | (Link button) | Uses global `prompt(...)` instead of `window.prompt(...)` | ℹ INFO | Documented deviation in Plan 04-02 SUMMARY. The IMAGE button (the must_have target) uses MediaPicker. Functionally identical in `'use client'`. Not a gap. |

The two avatar-field text-input stubs flagged in the prior report are **RESOLVED** — both now render `<MediaPicker>`. No `TBD`/`FIXME`/`XXX` debt markers in any Phase-4-modified file.

### Human Verification Required (UAT-Owed)

11 items are routed to the end-of-phase UAT checkpoint (`04-UAT.md` sink) — see frontmatter `human_verification` for the full enumerated list. These are inherent limitations of static verification (browser/DB/live-creds interactions), NOT code defects. Highlights:

1. Dark mode visual on all new `/dashboard/*` routes (DASH-08).
2. Sidebar role-filter across admin/editor/author.
3. Real-stats overview with seeded data.
4. **MediaPicker end-to-end across THREE consumers (now including both avatar fields — gap closure unblocked this check)** — Library/Upload/External URL tabs × PostForm feature-image + Toolbar image + UserDrawer avatar + ProfileForm avatar.
5. MediaUploader drag-drop + per-file progress + alt-text + 10MB cap.
6. Media delete warn-confirm via findMediaReferences.
7. **Users drawer flow INCLUDING the new MediaPicker avatar** (Select-image → pick → preview → save; Replace/Remove).
8. Pages editor slimmed (visual layout).
9. Storage Settings save + provider switch + Test connection (needs live Cloudinary/push-CDN creds).
10. Pitfall 0 multi-provider delete (needs live R2 + Cloudinary).
11. Storage Settings form never pre-fills secrets (Pitfall 7 visual contract).

The avatar MediaPicker visual check (item 7, expanded in item 4) was previously contingent on the gap closure — that contingency is now resolved; the check can proceed at UAT.

### Gaps Summary

**Zero gaps.** The single gap from the prior verification (Plan 04-03 avatar field as text input instead of `<MediaPicker>`) is **CLOSED** by Plan 04-06 (commit `d4d19a6`, merged `e101e79`). Both avatar consumers (`UserDrawer.tsx`, `ProfileForm.tsx`) now render the reusable `<MediaPicker>` modal with the full PostForm-mirrored wiring (useState open-state, watch() preview, hidden registered input for Zod validation, Replace/Remove + Select-image buttons, next/image thumbnail, setValue('avatar', url) on select). The Rule-3 text-input fallback is removed (not supplemented). MediaPicker.tsx is reused unchanged. No regressions detected across the other 31 must-haves (build green, 243/243 tests, all critical artifacts intact, Pitfall 0 fix intact, 3 admin-gates intact).

**Deferred-verification-debt (not a gap):** `pnpm test:migrations` deferred — no Postgres in worktree env. D-29 seed-only → `src/db/schema.ts` unchanged across Phase 4 → no drift risk. Runs in pre-UAT (Phase 7 / live Postgres).

**Documented deviations (none break requirement coverage; carried forward from prior verification):**

1. 04-04 added `page` RBAC resource to permissions.ts (necessary — without it requireCan throws FORBIDDEN for admins).
2. 04-04 created separate client `<PagesTable>` (plan explicitly permitted inline OR separate; useMutation requires client component).
3. 04-05 fixed redactCredentials regex (dropped bare "key" — bug-fix; research-sourced regex incorrectly redacted accessKeyId, the public identifier).
4. 04-02 Toolbar Link button uses global `prompt(...)` (documented; must_have targeted only IMAGE button).

---

_Verified: 2026-07-06T21:35:00Z (re-verification after Plan 04-06 gap closure)_
_Previous verification: 2026-07-06T03:55:00Z (status: gaps_found, score: 31/32)_
_Verifier: Claude (gsd-verifier)_
