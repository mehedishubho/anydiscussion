---
quick_id: 260828-gyt
phase: quick
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  # Task 1 — action layer (RED/GREEN)
  - src/actions/posts.ts
  - src/actions/__tests__/posts.test.ts
  # Task 2 — posts list UI (RED/GREEN)
  - src/app/(admin)/dashboard/posts/page.tsx
  - src/app/(admin)/dashboard/posts/components/PostRowActions.tsx
  - src/app/(admin)/dashboard/posts/__tests__/PostRowActions.test.tsx   # NEW
  - src/app/(admin)/dashboard/posts/__tests__/posts-page.test.tsx      # NEW
  # Task 3 — PostForm + SchedulePicker (RED/GREEN)
  - src/app/(admin)/dashboard/posts/PostForm.tsx
  - src/app/(admin)/dashboard/posts/components/SchedulePicker.tsx
  - src/app/(admin)/dashboard/posts/__tests__/PostForm.test.tsx
  - src/app/(admin)/dashboard/posts/__tests__/SchedulePicker.test.tsx  # NEW
autonomous: true
must_haves:
  truths:
    - The posts list table shows an Author column with the author's display name ("—" when null) — listPosts rows now carry authorName alongside the already-present slug/previewToken/publishedAt fields
    - Every list row has a View action — status=published links to the public /blog/{slug} page, non-published rows with a previewToken link to /preview/{token}, rows with neither render no View link (all target _blank)
    - A post with status=draft AND publishedAt in the future shows a "Scheduled" badge in a distinct blue palette — visually separable from the Draft/Pending review/Published badges (A6: draft + future publishedAt IS the scheduled state; no new enum value)
    - setSchedule(postId, FUTURE date) on a published post writes the date FIRST, then funnels published→draft through transitionPost (R7) and revalidates the same public surfaces as publishPost — the post goes offline until the every-minute publishDueScheduledPosts worker republishes it at due time (CR-02 keeps the future publishedAt through the transition); the action returns { ok: true, unpublished: true } and the SchedulePicker toast says the post was unpublished and scheduled
    - setSchedule(postId, PAST date) on a published post rejects with a readable SCHEDULE_IN_PAST error BEFORE any db write — no silent state churn
    - unpublishPost(postId) funnels published→draft through transitionPost (legal for ALL roles per TRANSITIONS / D-14b; assertOwnsPost FIRST), revalidates with publishPost parity (concrete /blog/{slug} + / + /blog + /category/{slug} + /sitemap.xml + /rss.xml paths, 2-arg revalidateTag(tag,"max") incl. posts-list), sends NO notification (v1), and returns { ok: true }
    - Unpublish is exposed in BOTH UIs — a PostRowActions "Unpublish" button (editor/admin on published rows) AND a PostForm "Unpublish" button (editor/admin when editing a published post; after success the form flips to draft so Publish reappears)
    - PostForm's submit button reads "Save" when the post is published and "Save draft" otherwise (it only saves edits — never was a status action)
    - After creating a NEW post, PostForm router.pushes to /dashboard/posts/{id}/edit so the Schedule + Preview sidebar controls become reachable (edit-saves stay put)
  artifacts:
    - src/actions/posts.ts — listPosts authorName projection; new unpublishPost; setSchedule status-aware semantics (past-date guard, unpublish-on-future-schedule, public revalidation on the unpublish path); module-local revalidatePublicPostSurfaces helper
    - src/app/(admin)/dashboard/posts/page.tsx — Author column, View link per row, Scheduled badge variant, extended local row type
    - src/app/(admin)/dashboard/posts/components/PostRowActions.tsx — Unpublish mutation + button (editor/admin + published gating, D-27 non-optimistic shape)
    - src/app/(admin)/dashboard/posts/PostForm.tsx — status-driven submit label, Unpublish button, create-redirect via useRouter
    - src/app/(admin)/dashboard/posts/components/SchedulePicker.tsx — semantics-aware success toast + helper-text note
    - Four test files (two NEW: PostRowActions.test.tsx, posts-page.test.tsx, SchedulePicker.test.tsx is the third NEW one; PostForm.test.tsx and posts.test.ts extended) pinning all of the above RED→GREEN
  key_links:
    - "listPosts leftJoin(schema.user) → row spread { ...row.posts, authorName } → posts page Author cell + local type extension (dashboard/page.tsx pendingPreview assignment stays type-safe: extra fields on a non-literal are fine in TS)"
    - "setSchedule published→draft path → transitionPost (NEVER a direct db.update status write in posts.ts — R7 funnel; the bare update writes ONLY publishedAt/updatedAt, asserted via updateSetMock payload keys) → revalidatePublicPostSurfaces parity set"
    - "unpublishPost → transitionPost(postId,'draft') → same revalidation parity as publishPost steps 3-5 — no notifyUsers call, no rotatePreviewToken (the token rotated at publish remains valid so the now-draft post is previewable)"
    - "PostRowActions + PostForm → unpublishPost import → toast + setCurrentStatus('draft')/invalidate ['posts'] — server chain (assertOwnsPost + TRANSITIONS) stays the authority; UI gating is UX-only per Pitfall #1"
    - "publishDueScheduledPosts worker UNCHANGED — it already flips draft + publishedAt<=now → published every minute; the schedule semantics work because setSchedule leaves the post in draft with the future date"
---

<objective>
Close three owner-UAT gaps in the posts dashboard, all on live code verified this session:

(1) The posts list lacks an Author column and any View action. listPosts already leftJoins user (for the author filter) and already returns the FULL post row (slug, previewToken, publishedAt included — the "select only id/title/slug/status/updatedAt" impression is just the page's narrow local type). Only authorName must be added; the page then renders Author, a per-row View link (public /blog/{slug} when published, /preview/{token} otherwise), and a "Scheduled" badge for draft + future publishedAt.

(2) Scheduling a published post does nothing today: setSchedule only writes publishedAt while status stays 'published' (public site filters on status; the every-minute worker only flips draft+publishedAt<=now — so the future date is invisible). New semantics per owner expectation: a FUTURE date on a published post also transitions published→draft (legal in TRANSITIONS for editor/admin; setSchedule already gates on requireCan post:publish) so the post goes offline until the worker republishes at due time; the toast must say so. A PAST date on a published post rejects with a clear error before any write. No new "scheduled" status enum (A6 decision stands).

(3) No unpublish anywhere: published→draft is legal for ALL roles (TRANSITIONS / D-14b) but nothing wraps it. Add unpublishPost(postId) — transitionPost funnel, revalidation parity with publishPost, no notify in v1 — exposed as a PostRowActions "Unpublish" button (editor/admin on published rows) AND on PostForm for published posts. Also fix PostForm: rename the always-"Save draft" submit to just "Save" on published posts, and router.push to /dashboard/posts/[id]/edit after creating a NEW post (today the form just sits there — owner experienced "nothing happens").

Purpose: the owner (signed in as admin, working on published posts) cannot see who wrote what, cannot open a post from the list, cannot take a post offline, and cannot reach schedule/preview after creating a post — the four most basic content-lifecycle operations from the list view.

Output: three tasks, each RED/GREEN with atomic commits. No schema/migration changes (previewToken/publishedAt/slug columns already exist). publishPost, transitionPost, and the publishDueScheduledPosts worker are NOT modified.

Executor constraints (from orchestrator): pnpm only; do NOT run `pnpm dev` (the orchestrator's dev server owns :3000); TDD per task (RED commit, then GREEN commit); `pnpm exec tsc --noEmit` exits non-zero at the documented 8-error TailAdmin scaffold baseline (table in .planning/quick/260827-se8-dashboard-functional-gaps-make-dashboard/deferred-items.md) — the gate is NO NEW errors (count ≤ 8), not a zero exit code. Build NOT required: no new route segments, no config, no 'use cache' components touched — vitest + tsc cover the change; the owner's live dev server HMRs it.
</objective>

<execution_context>
@D:/Devsroom-Work/anydiscussion/.claude/gsd-core/workflows/execute-plan.md
@D:/Devsroom-Work/anydiscussion/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@CLAUDE.md
@.claude/CLAUDE.md
@.planning/STATE.md

Key source files (read before editing — all verified this session):

- src/actions/posts.ts — setSchedule (~L551: requireCan post:publish then a bare db.update of publishedAt — no status fetch, no revalidation); publishPost (~L472: the revalidation-parity reference — select {id,title,slug,authorId,categoryId,categorySlug} with categories leftJoin, then revalidatePath /blog/{slug} + / + /blog + /category/{slug} + /sitemap.xml + /rss.xml and 2-arg revalidateTag post-{id}/author-{authorId}/category-{id}/posts-list all "max"); returnForRevision (~L329: the wrapper shape to mirror — assertOwnsPost FIRST, transitionPost, single revalidateTag("posts-list","max") only because pending_review has no public surface — unpublish is different: the post WAS public, so it needs the FULL parity set); listPosts (~L287: full-row select + user leftJoin already present; rows.map(row => row.posts) is the only change site); module-local helpers are the established pattern (upsertPostSeo, sanitizeBodyHtml) — "use server" files can only EXPORT async functions, so revalidatePublicPostSurfaces must be non-exported.
- src/lib/permissions/post-transitions.ts — TRANSITIONS: published→draft legal for author (D-14b own), editor, admin. transitionPost stamps publishedAt only on first publish and PRESERVES it on later transitions (CR-02) — so the future date written by setSchedule survives the published→draft flip, and unpublish-then-republish keeps the old date. setSchedule must call transitionPost (never write status itself — R7).
- src/lib/schedule/system-publish.ts — publishDueScheduledPosts flips status='draft' AND publishedAt<=now() → published with full revalidation, every minute via instrumentation.ts (already running in dev). UNCHANGED by this task — it is why "future publishedAt + draft" works once setSchedule unpublishes.
- src/app/(admin)/dashboard/posts/page.tsx — STATUS_BADGE map L42-46 (gray/amber/success palettes); header row L204-207 (Title/Status/Updated/Actions); row body L211-239; local posts type L89-95 must grow authorName/publishedAt/previewToken. Public route shape VERIFIED: (site)/blog/[slug]/page.tsx is THE public post page (publishPost revalidates /blog/{slug}) and (site)/preview/[token]/page.tsx is the preview route — the View hrefs are /blog/{slug} and /preview/{token}, NOT /{slug}.
- src/app/(admin)/dashboard/posts/components/PostRowActions.tsx — the mutation pattern to mirror: useMutation + toast + invalidate ["posts"], D-27 non-optimistic; UX-only role/status gating; renders null when nothing qualifies (the null-gate condition must grow canUnpublish).
- src/app/(admin)/dashboard/posts/PostForm.tsx — save mutation L147-157 (onSuccess currently takes no args — needs (data) for the redirect); canPublish/canSubmitForReview L249-256; button row L404-443 ("Save draft" submit always; no Publish button when currentStatus==='published'); currentStatus state L192 already drives re-render after transitions.
- src/app/(admin)/dashboard/posts/components/SchedulePicker.tsx — debounced setSchedule call L98-111 (toast.success("Schedule saved") unconditionally, return value ignored — the toast site to make semantics-aware).
- src/app/(admin)/dashboard/page.tsx L81-89 — the OTHER listPosts caller (overview pendingPreview): extra fields on the returned rows are additive and type-safe (non-literal assignment); no change needed there.
- Test patterns (follow exactly): src/actions/__tests__/posts.test.ts — node env, unified lazy Drizzle chain mock where EVERY awaited select resolves selectPostMock() (so one fixture object can serve both setSchedule's status fetch and the revalidation select), updateSetMock captures .set() payloads (assert the schedule update contains NO status key), transitionPost/notifyUsers are vi.fn spies; setSchedule describe at ~L609. PostForm.test.tsx — jsdom pragma, vi.hoisted action spies + vi.mock("@/actions/posts") factory, heavy children nulled; the factory MUST gain unpublishPost when PostForm imports it (a vi.mock factory replaces the whole module) and next/navigation MUST be mocked once useRouter enters (AdminShell.test precedent). edit-page-rsc-boundary.test.ts — the source-scan convention if you need a no-jsdom pin (stripComments first).

Verified facts (do not re-derive):

- listPosts returns the FULL post row today (db.select().from(schema.posts), no projection) — slug/previewToken/publishedAt are already in every row; ONLY authorName is new. Existing listPosts tests assert query-builder args (deepContains on where/orderBy/limit/offset mocks), NOT return shapes — the map change breaks none of them.
- transitionPost is mocked in posts.test.ts, so its internal select never fires in tests; only setSchedule's own fetch + revalidatePublicPostSurfaces' select hit selectPostMock.
- TanStack v5: per-call mutate callbacks fire IN ADDITION to the useMutation-level onSuccess — putting the create-redirect in the save mutation's global onSuccess covers the plain-save, publish-chain, and submit-chain paths uniformly for new posts (initialId == null guard keeps edit-saves in place).
- flatpickr is mockable: vi.mock("flatpickr") with a default factory that captures the config object lets a test invoke config.onChange([date]) directly, then vi.advanceTimersByTimeAsync(700) flushes the debounce AND the awaited mock's microtasks.
- fireEvent.submit(form) is the reliable jsdom submit trigger (a click on the submit button does not reliably fire onSubmit in jsdom); a NEW-post form can pass Zod with just title (slug auto-derives) + initialCategoryId (via useForm defaultValues — TaxonomyPicker is null-mocked and never renders a category input).
- The 8-error tsc baseline and the no-build/no-dev gates are documented above; full-suite baseline is 767/767 green (260828-g2h).
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Action layer — listPosts authorName, setSchedule unpublish-on-schedule semantics, new unpublishPost</name>
  <files>src/actions/posts.ts, src/actions/__tests__/posts.test.ts</files>
  <behavior>
    - listPosts authorName: when the joined user row has a name, the returned row carries authorName equal to it; when user is null (no join match), authorName is null; all existing post fields remain on the row (spread, not projection)
    - setSchedule on a PUBLISHED post with a FUTURE date: resolves { ok: true, unpublished: true }; the db.update .set() payload contains publishedAt (the given date) and updatedAt but NO status key; transitionPost is called with (postId, "draft") AFTER the date write (invocationCallOrder proof); revalidatePath receives the concrete parity paths /blog/{slug}, /, /blog, /category/{categorySlug}, /sitemap.xml, /rss.xml; every revalidateTag call is 2-arg (tag, "max") and includes posts-list
    - setSchedule on a PUBLISHED post with a PAST date: rejects with an error whose message contains SCHEDULE_IN_PAST; db.update and transitionPost are NEVER called (MUST_NOT_BE_REACHED on both)
    - setSchedule on a DRAFT post (any date): resolves { ok: true, unpublished: false }; transitionPost NOT called; revalidatePath/revalidateTag NOT called (existing behavior — no public surface change)
    - setSchedule on a missing post id: rejects NOT_FOUND
    - setSchedule still calls requireCan({ post: ["publish"] }) FIRST (D-15 — authors blocked before any select or write; the two existing D-15 tests keep passing)
    - unpublishPost: calls assertOwnsPost FIRST (FORBIDDEN → transitionPost/db NEVER reached); funnels through transitionPost(postId, "draft"); on success resolves { ok: true } with the SAME revalidation parity as publishPost (paths + 2-arg tags incl. post-{id}, author-{authorId}, category-{id}, posts-list); notifyUsers is NEVER called (no notify v1); if transitionPost throws (e.g. INVALID_TRANSITION), the error propagates and NO revalidation fires
  </behavior>
  <action>
    RED first — extend src/actions/__tests__/posts.test.ts (import unpublishPost alongside the existing imports). Add a new describe for setSchedule semantics and one for unpublishPost, using the file's existing mocks: requireCanMock/assertOwnsPostMock resolve adminSession; transitionPostMock resolves; updateMock resolves; selectPostMock resolves the fixture. Fixture object for the published-post path serves BOTH selects (the status fetch and the revalidation fetch resolve the same value under the unified chain mock): include status "published", slug "hello-world", authorId "u-a1", categoryId 3, categorySlug "news". Prove write-then-transition ordering with mock.invocationCallOrder (the update's order index is less than transitionPost's). Prove the schedule update payload has no status key by inspecting the object captured by updateSetMock. For the past-date and missing-post cases set updateMock/transitionPostMock to throw MUST_NOT_BE_REACHED and selectPostMock to resolve undefined respectively. Mirror the existing publishPost revalidation assertions (paths array contains each literal, every revalidateTag call is length 2 with "max"). For unpublishPost also assert notifyUsersMock was not called and that a transitionPostMock rejection (INVALID_TRANSITION) leaves revalidateTagMock uncalled. Run the targeted vitest command — all new tests MUST fail against current code. Commit test(260828-gyt): actions RED — setSchedule semantics, unpublishPost, listPosts authorName.

    GREEN — in src/actions/posts.ts:

    1. listPosts: change the return mapping from row.posts to a spread that adds authorName: row.user?.name ?? null (keep every post field). Update the doc comment's "mapped back to plain post rows" line to mention the authorName addition (260828-gyt).

    2. Add a module-local (NON-exported) async helper revalidatePublicPostSurfaces(postId): select id, slug, authorId, categoryId, categorySlug from posts leftJoin categories (the publishPost step-3 select shape), then fire the exact publishPost parity set — revalidatePath /blog/{slug}, /, /blog, /category/{categorySlug} (when present), /sitemap.xml, /rss.xml; revalidateTag post-{id}, author-{authorId}, category-{id} (when present), posts-list — ALL 2-arg with "max". If the select returns no row, log and return (best-effort: the transition already succeeded; never fail the action over a revalidation lookup). Do NOT refactor publishPost to use it — publishPost's behavior is pinned by existing tests and stays byte-identical.

    3. unpublishPost(postId), mirroring returnForRevision's shape minus notify: assertOwnsPost FIRST (Pitfall #1 — authors pass for their own posts per D-14b, editor/admin bypass), then transitionPost(postId, "draft") (R7 funnel — TRANSITIONS legalizes published→draft for every role), then revalidatePublicPostSurfaces(postId). Return { ok: true }. NO notifyUsers, NO rotatePreviewToken (the token rotated at publish stays valid so the now-draft post remains previewable). Doc comment: cite D-14b, publishPost revalidation parity, no-notify v1, and that UI gating (editor/admin buttons) is UX-only — this action's authority is assertOwnsPost + TRANSITIONS.

    4. setSchedule(postId, publishedAt) — keep requireCan({ post: ["publish"] }) FIRST (D-15). Then fetch the post's status via a minimal select (status only); throw NOT_FOUND when no row. New guard BEFORE any write: if the post is published AND the given date is not in the future (getTime() <= Date.now()), throw an Error whose message starts SCHEDULE_IN_PAST followed by a short human-readable clause (the SchedulePicker toast shows err.message raw — e.g. "SCHEDULE_IN_PAST — pick a future date for a published post, or unpublish it first"). Then write publishedAt + updatedAt via the existing bare db.update (date FIRST so the worker never sees draft + an old date — ordering proven by the RED test). Then, only when the fetched status was "published": await transitionPost(postId, "draft") (editor/admin only reach here — requireCan already filtered authors; CR-02 preserves the just-written future publishedAt through the flip) and await revalidatePublicPostSurfaces(postId) (the post just left the public site — without this the cached /blog/{slug} page stays live). Return { ok: true, unpublished: boolean } where unpublished is true only on the published→draft path. Update the doc comment to state the new semantics (scheduling a published post takes it offline until the due minute; past dates on published posts are rejected) and keep the D-14 UTC note.

    Do NOT touch: publishPost, transitionPost, system-publish.ts, the posts schema. Run the targeted vitest command, then pnpm test. Commit feat(260828-gyt): setSchedule unpublishes on future schedule, add unpublishPost, listPosts authorName (GREEN).
  </action>
  <verify>
    <automated>pnpm exec vitest run src/actions/__tests__/posts.test.ts && pnpm test && [ "$(pnpm exec tsc --noEmit 2>&1 | grep -c 'error TS')" -le 8 ] && echo T1_GATES_PASS</automated>
  </verify>
  <done>All new action tests green (RED proven at commit time); setSchedule on published+future writes the date then funnels to draft with full public revalidation and returns unpublished:true; published+past rejects SCHEDULE_IN_PAST before any write; draft path unchanged; unpublishPost gated by assertOwnsPost, funneled via transitionPost, full parity revalidation, zero notify calls; listPosts rows carry authorName; full suite green; tsc at the 8-error baseline; no schema, publishPost, or worker changes.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Posts list UI — Author column, View action, Scheduled badge, row Unpublish button</name>
  <files>src/app/(admin)/dashboard/posts/page.tsx, src/app/(admin)/dashboard/posts/components/PostRowActions.tsx, src/app/(admin)/dashboard/posts/__tests__/PostRowActions.test.tsx, src/app/(admin)/dashboard/posts/__tests__/posts-page.test.tsx</files>
  <behavior>
    - PostRowActions renders an "Unpublish" button ONLY for role editor/admin AND status "published" (author+published → absent; editor+draft → absent; it never shows alongside Publish/Submit/Return which are draft/pending-gated); clicking it calls unpublishPost(postId); while pending the label reads "Unpublishing…" and the button is disabled
    - Posts page (rendered as an async Server Component in jsdom with mocked actions): a published fixture row with authorName "Jane Author" renders "Jane Author" in the table, a View link with href /blog/{slug} (target _blank), and the raw status badge text; a draft fixture row with a FUTURE publishedAt renders the badge text "Scheduled"; a non-published row with previewToken renders a View link with href /preview/{token}; a draft row with NO previewToken renders NO View link; the author-null row renders "—" in the Author cell
    - The Scheduled badge uses a blue palette distinct from the three existing STATUS_BADGE styles
  </behavior>
  <action>
    RED first — two NEW test files:

    (a) src/app/(admin)/dashboard/posts/__tests__/PostRowActions.test.tsx — jsdom pragma; follow PostForm.test.tsx conventions: vi.hoisted spies + a vi.mock("@/actions/posts") factory providing publishPost, submitForReview, returnForRevision, AND unpublishPost (the factory replaces the whole module — every named import PostRowActions pulls must exist in it); render inside QueryClientProvider (retry:false). Cases: editor+published shows Unpublish and clicking calls the unpublishPost spy (mockResolvedValue { ok: true }); author+published renders nothing (component returns null); editor+draft shows Publish but no Unpublish; pending label while the mutation is in flight. Run the targeted command — the Unpublish cases MUST fail.

    (b) src/app/(admin)/dashboard/posts/__tests__/posts-page.test.tsx — jsdom pragma. vi.mock("@/actions/posts") with listPosts resolving a three-row fixture (published row with authorName "Jane Author" + slug "live-one" + past publishedAt + previewToken "tok-live"; draft row with FUTURE publishedAt + previewToken "tok-2" + authorName null; draft row with previewToken null + publishedAt null), countPosts resolving 3, plus no-op spies for the PostRowActions imports; vi.mock("@/actions/categories") with listCategories resolving []; vi.mock("@/lib/auth/server") with getSession resolving an admin session; vi.mock("next/navigation") with a useRouter stub (push/replace/back/prefetch vi.fn — ListFilterBar writes URLs through the router and jsdom has no app router). Import the page default, await it with searchParams: Promise.resolve({}), and render the returned element inside QueryClientProvider. Assert via document.querySelector on literal hrefs (/blog/live-one, /preview/tok-2), getByText for "Jane Author" and "Scheduled", exactly one anchor whose href starts with /preview/, and — bonus pin — a button named "Unpublish" exists for the published row under admin role. Run the targeted command — these MUST fail.

    Commit test(260828-gyt): posts list RED — Author column, View action, Scheduled badge, row Unpublish.

    GREEN:

    (1) src/app/(admin)/dashboard/posts/page.tsx — extend the local posts type with authorName: string | null, publishedAt: Date | null, previewToken: string | null. Add a SCHEDULED_BADGE constant (blue palette, e.g. bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 — visually distinct from gray/amber/success). Header row: insert an Author cell between Title and Status. Row body: Author cell rendering post.authorName ?? "—"; badge derivation scheduled = status "draft" AND publishedAt non-null AND new Date(publishedAt).getTime() > Date.now() — badge text "Scheduled" with SCHEDULED_BADGE, else the raw status with the existing STATUS_BADGE fallback; View link inside the existing actions div (before PostRowActions, brand-500 link styling matching Edit, target _blank + rel noopener noreferrer): href /blog/{slug} when status "published", else /preview/{previewToken} when previewToken is non-null, else render no link at all. Update the page header comment to note the 260828-gyt additions.

    (2) src/app/(admin)/dashboard/posts/components/PostRowActions.tsx — add unpublishPost to the actions import; add an unpublishMutation cloning the returnMutation shape (mutationFn unpublishPost, onSuccess toast.success("Unpublished") + invalidate ["posts"], onError toast.error(err.message)); canUnpublish = (role admin or editor) AND status "published"; include it in the null-gate condition and the pending union; render the button in the Return-button muted-gray style (label "Unpublish" / "Unpublishing…" when its own mutation is pending). Header comment: cite D-14b (published→draft legal for all roles server-side; editor/admin UI is the owner-requested UX-only gating — Pitfall #1).

    Run the targeted vitest command, then pnpm test. Commit feat(260828-gyt): posts list — Author column, View action, Scheduled badge, Unpublish row action (GREEN).
  </action>
  <verify>
    <automated>pnpm exec vitest run "src/app/(admin)/dashboard/posts/__tests__" && pnpm test && [ "$(pnpm exec tsc --noEmit 2>&1 | grep -c 'error TS')" -le 8 ] && echo T2_GATES_PASS</automated>
  </verify>
  <done>Both new suites green (RED proven); the list shows author names, a distinct Scheduled badge on draft+future rows, a correct View link per row (public URL for published, preview URL when token exists, nothing otherwise), and an Unpublish button for editor/admin on published rows that calls unpublishPost; full suite green; tsc at baseline; no changes to publishPost/transitionPost or the filter/pagination mechanics.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: PostForm — status-driven label, Unpublish action, create-redirect; SchedulePicker semantics-aware toast</name>
  <files>src/app/(admin)/dashboard/posts/PostForm.tsx, src/app/(admin)/dashboard/posts/components/SchedulePicker.tsx, src/app/(admin)/dashboard/posts/__tests__/PostForm.test.tsx, src/app/(admin)/dashboard/posts/__tests__/SchedulePicker.test.tsx</files>
  <behavior>
    - PostForm submit label reads "Save" when currentStatus is "published" and "Save draft" otherwise (new/draft/pending); after a successful Unpublish the label flips back to "Save draft" and the Publish button appears (status state flip)
    - An "Unpublish" button renders ONLY when role is editor/admin AND currentStatus is "published" AND initialId is present (a new post has nothing to unpublish; author role sees nothing); clicking calls unpublishPost(initialId); while pending all buttons disable
    - After creating a NEW post (no initialId) whose save resolves { id }, the form calls router.push with /dashboard/posts/{id}/edit; an EDIT save (initialId present) never pushes
    - SchedulePicker: when setSchedule resolves { unpublished: true } the success toast message contains "Post unpublished" (wording: Post unpublished — scheduled for {local date string}); when it resolves { ok: true, unpublished: false } the toast is exactly "Schedule saved"; errors still toast err.message
  </behavior>
  <action>
    RED first:

    (a) Extend src/app/(admin)/dashboard/posts/__tests__/PostForm.test.tsx — add unpublishPostMock to the vi.hoisted block AND to the vi.mock("@/actions/posts") factory (PostForm will import it); add vi.mock("next/navigation") exposing a captured pushMock via useRouter; extend the renderForm helper to accept optional props (render <PostForm {...props} /> inside the same QueryClientProvider). New cases: (1) with initialStatus "published" + initialId 7 + role "admin" the type=submit button text is "Save", and with no props it is "Save draft"; (2) admin+published+initialId renders an Unpublish button, author+published and admin+draft do not; (3) clicking Unpublish (mock resolves { ok: true }) calls unpublishPostMock with 7 and — after waitFor — a "Publish" button appears and the submit label reads "Save draft"; (4) create-redirect: render with ONLY initialCategoryId 5 (no initialId), fireEvent.change title to "Hello World" (slug auto-derives — the existing never-overwrite effect), then fireEvent.submit on the form element with savePostMock resolving { id: 42 } → waitFor pushMock called with /dashboard/posts/42/edit; (5) edit-save: same submission shape but rendered with initialId 7 and savePost resolving { id: 7 } → pushMock NOT called. Run the targeted command — all new cases MUST fail.

    (b) NEW src/app/(admin)/dashboard/posts/__tests__/SchedulePicker.test.tsx — jsdom pragma; vi.mock("sonner") with toast spies; vi.mock("flatpickr") with a default factory that captures the config object and returns { destroy: vi.fn() }; vi.mock("@/actions/posts") with a setSchedule spy; vi.mock("@/actions/settings") with getSetting resolving null. vi.useFakeTimers. Render <SchedulePicker postId={7} publishedAt={null} />, grab the captured flatpickr config, invoke its onChange with a future Date, then await vi.advanceTimersByTimeAsync(700) (flushes the debounce AND the awaited action microtasks). Two tests: setSchedule resolving { ok: true, unpublished: true } → toast.success called with a stringContaining "Post unpublished"; resolving { ok: true, unpublished: false } → toast.success called with "Schedule saved". Also assert setSchedule was called with (7, the picked date). Run the targeted command — the unpublished-toast test MUST fail (today's toast is unconditional).

    Commit test(260828-gyt): PostForm label/unpublish/redirect + SchedulePicker toast RED.

    GREEN:

    (1) src/app/(admin)/dashboard/posts/PostForm.tsx — import useRouter from next/navigation (const router = useRouter()) and add unpublishPost to the actions import. Save mutation onSuccess gains the data parameter: after the existing toast + invalidate, when props.initialId == null AND data?.id != null, router.push(/dashboard/posts/{data.id}/edit as a template literal) — per-call mutate callbacks in TanStack v5 fire in addition to this global onSuccess, so the publish/submit chains inherit the redirect for new posts for free. Add an unpublishMutation cloning submitReviewMutation's shape with mutationFn unpublishPost, onSuccess toast.success("Unpublished") + setCurrentStatus("draft") + invalidate ["posts"]. Add canUnpublish = (role admin or editor) AND currentStatus "published" AND props.initialId != null; include unpublishMutation.isPending in anyPending. Submit label: mutation.isPending ? "Saving…" : currentStatus === "published" ? "Save" : "Save draft" — with a comment that the submit only saves edits (status actions are the explicit buttons). Render the Unpublish button (type="button", disabled anyPending, muted-gray secondary styling) in the button row when canUnpublish, label "Unpublish" / "Unpublishing…" when its own mutation is pending. Header comment: note the 260828-gyt additions (label semantics, unpublish, create-redirect).

    (2) src/app/(admin)/dashboard/posts/components/SchedulePicker.tsx — capture the setSchedule result; when result.unpublished is true toast.success with the template literal Post unpublished — scheduled for {date.toLocaleString()} (date is the picked Date already in scope); otherwise keep toast.success("Schedule saved"). Extend the helper-text paragraph to state that scheduling a published post takes it offline until the scheduled time (the worker republishes it). Header comment: note the 260828-gyt semantics.

    Run the targeted vitest command, then pnpm test. Commit feat(260828-gyt): PostForm Save label + Unpublish + create-redirect, SchedulePicker semantics toast (GREEN).
  </action>
  <verify>
    <automated>pnpm exec vitest run "src/app/(admin)/dashboard/posts/__tests__" && pnpm test && [ "$(pnpm exec tsc --noEmit 2>&1 | grep -c 'error TS')" -le 8 ] && echo T3_GATES_PASS</automated>
  </verify>
  <done>All new suites green (RED proven); published posts show a "Save" submit (edits only) plus an explicit Unpublish button that flips the form to draft and reveals Publish; creating a new post navigates to /dashboard/posts/{id}/edit while edit-saves stay put; scheduling a published post toasts the unpublish + schedule message; full suite green; tsc at baseline; no publishPost/transitionPost/worker changes; no new packages.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Dashboard client → Server Actions | unpublishPost/setSchedule inputs (postId, Date) cross from client components; session-gated server-side |
| R7 transition funnel | All post.status writes must flow through transitionPost; posts.ts must never set status directly (the scheduler's D-12 exception is unchanged) |
| Public cache surfaces | unpublish/schedule-unpublish remove live content — public revalidation parity is a correctness/integrity requirement, not polish |
| Draft content via preview tokens | View links expose draft content through /preview/{token} — pre-existing route, unguessable UUID tokens |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-Q-gyt-01 | Elevation of privilege / Tampering | unpublishPost | high | mitigate | assertOwnsPost FIRST (authors limited to own posts per D-14b; editor/admin bypass) + transitionPost TRANSITIONS enforcement; structural MUST_NOT_BE_REACHED test proves the gate precedes any write. UI shows editor/admin only — UX-only per Pitfall #1 |
| T-Q-gyt-02 | Tampering | setSchedule status write | medium | mitigate | setSchedule calls transitionPost for the published→draft flip — never a direct status write; RED test asserts the .set() payload carries NO status key and that requireCan(post:publish) still rejects authors first (D-15) |
| T-Q-gyt-03 | DoS / cache integrity | unpublish + schedule-unpublish revalidation | high | mitigate | Both paths fire the full publishPost parity set (concrete /blog/{slug} + feeds + sitemap + 2-arg tags incl. posts-list) — test-pinned in both actions; without it the "offline" post stays publicly cached |
| T-Q-gyt-04 | Information disclosure | View preview link on draft rows | low | accept | The /preview/{token} route already exists (D-19, 404-not-403, no existence leak); the link appears only inside the already session-gated dashboard to viewers who passed listPosts' post:read gate; the token is a rotated crypto UUID |
| T-Q-gyt-05 | Tampering | time input (publishedAt) | medium | mitigate | Past dates on published posts are rejected server-side BEFORE any write (SCHEDULE_IN_PAST) — no client trust; a past date on a draft keeps existing worker semantics (immediate publish at next tick) unchanged by design |

No package installs — the npm/pip/cargo legitimacy gate does not apply (zero new dependencies).
</threat_model>

<verification>
- Targeted per task: pnpm exec vitest run src/actions/__tests__/posts.test.ts (T1); pnpm exec vitest run "src/app/(admin)/dashboard/posts/__tests__" (T2, T3) — every new suite RED at its test commit, GREEN at its feat commit
- Full suite: pnpm test — baseline 767 green + the new tests, zero regressions
- Type check: pnpm exec tsc --noEmit — at most the 8 documented pre-existing scaffold errors (deferred-items.md table); no NEW errors
- Build gate: SKIPPED by decision — no new route segments, no config, no 'use cache' components touched; the owner's live dev server HMRs the changes. If anything unexpected appears (e.g. a route/module-graph error), a cold build (rm -rf .next && pnpm build) is the fallback diagnostic, per the warm-build stale-cache known issue
- Owner UAT smoke (no executor action needed): on the running dev server — posts list shows Author/View/Scheduled badge; Unpublish takes a published post offline (public /blog/{slug} 404s or falls out of feeds after revalidation); scheduling a published post to +5 min unpublishes it now and the worker republishes at due time; creating a post from /dashboard/posts/new lands on its edit page
</verification>

<success_criteria>
- The owner, signed in as admin, can: see who authored each post in the list; open any post from the list (public page or draft preview) in a new tab; distinguish Scheduled posts from plain drafts at a glance; take any published post offline via Unpublish from the list OR the edit form; schedule a published post and watch it go offline now and reappear at the scheduled minute; and after creating a new post lands on the edit page where Schedule/Preview live
- All status changes still funnel through transitionPost (R7); every new action path is permission-check-first; public cache surfaces revalidate on every publish-state change (parity test-pinned)
- Three atomic RED commits + three GREEN commits; full suite green; tsc at the 8-error baseline; no schema/migration, no publishPost/transitionPost/worker changes, no new packages, no pnpm dev, no build required
</success_criteria>

<output>
Create `.planning/quick/260828-gyt-posts-author-view-unpublish-schedule/260828-gyt-SUMMARY.md` when done
</output>
