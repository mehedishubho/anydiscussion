---
status: pending
phase: 05-seo-basics
source: [05-VERIFICATION.md]
started: 2026-07-07T04:30:00Z
updated: 2026-08-26T04:15:00Z
---

## Current Test
<!-- OVERWRITE each test - shows where we are -->

number: R1
name: Live publish flow re-test (after 05-08)
expected: |
  As an editor, open /dashboard/posts/new (fresh load) — the editor-surface, slug,
  and validation-toast behaviors from the prior re-test (all confirmed working
  2026-08-25) still hold. After publishing, open the post's edit page — it LOADS
  (no RSC crash): "Edit: {title}" heading, form pre-filled, sidebar Schedule picker
  + Preview visible. Picking a date in the Schedule picker saves it (toast) and the
  value survives a page reload. (Claude then auto-verifies: post in /sitemap.xml +
  /rss.xml, /blog/{slug} page source shows canonical + og:url + BlogPosting JSON-LD.)
awaiting: user response
note: |
  2026-08-25 run: 05-07 + WR-01/WR-02 fixes CONFIRMED WORKING — publish succeeded
  end-to-end (post 2 "R1 Walkthrough Test Post" published, published_at stamped,
  DB-verified). NEW blocker surfaced on the post-publish visit to the edit page:
  Server Component passes an inline onChange function prop to the client
  SchedulePicker → RSC serialization throws, edit page unrenderable. Fix = plan
  05-08 (wire picker to setSchedule action client-side, remove the function prop).
  2026-08-26 post-05-08 re-test surfaced two new blockers — (a) client crash on
  the posts edit page (tiptap#7849 destroyed-editor selector) and (b) publish
  rejected media-library feature images with "Invalid url" (absolute-only image
  schemas) — both root-caused and fixed by quick task 260826-5l0
  (.planning/quick/260826-5l0-fix-two-phase-05-uat-r1-bugs-tiptap-v3-7/);
  R1 live re-test still awaiting user response.

## Tests

### 1. Live HTML — home page `<title>` + two JSON-LD script tags
expected: With `pnpm dev` running, `http://localhost:3000/` page source contains `<title>Any Discussion</title>` (or seeded site.title) and two `<script type="application/ld+json">` tags (WebSite + Organization). Proves SC-1 at runtime (build + unit tests cannot observe streamed HTML).
result: pass
source: automated
note: Auto-verified via curl of live dev server 2026-08-24 — `<title>Any Discussion</title>` present; JSON-LD emitted as ONE script tag containing a @graph with WebSite + SearchAction + Organization (functionally equivalent to two tags; all three entities present).

### 2. Populated-DB sitemap / RSS / robots content
expected: With ≥1 published post + page seeded, `curl http://localhost:3000/sitemap.xml` lists home (1.0/daily) + post (/blog/{slug}, 0.8/weekly) + page (/{slug}, 0.5/monthly), no drafts/soft-deleted; `curl /rss.xml` returns `application/rss+xml` with one `<item>` per published post (full-text body in CDATA); `curl /robots.txt` shows allow "/" + disallow ["/preview/","/dashboard/","/signin","/signup","/forgot-password"] + sitemap pointer.
result: issue
reported: "when I try to published post the is only showing draft button, no published button and the body text box not working proporly as expected also check if the body box uses elsewhere also fix it. robots/sitemap/RSS pass but I mistakely deleted privacy page"
severity: major
partial_pass: robots.txt exact ✓; sitemap structure ✓ incl. published page entry (/contact, 0.5/monthly) ✓; RSS content-type ✓. Blocked-from-verification: /blog/{slug} sitemap entry + RSS <item> — could not publish a post (no Publish button in editor). Separately: privacy page accidentally deleted by user (data, not code).

### 3. Editor flow — SEO panel saves post_seo
expected: As an editor, create a post filling the 4 SEO panel fields (meta title, meta description, canonical URL, OG image), save, then inspect the `post_seo` row in the DB. Row exists with the 4 fields populated; grapheme-invalid inputs are logged + skipped without failing the save (defensive safeParse).
result: issue
reported: "after adding all done and hit the save draft it will nothing happen, so I clond not understand is it save or not so add a toast notification"
severity: major
partial_pass: none observable — save gives zero UI feedback (success AND failure silent), so the user cannot tell whether the post + post_seo saved. post_seo write to be re-verified from live meta tags after publish fix lands.

### 4. Admin flow — settings/seo cache invalidation end-to-end (covers behavior_unverified[0])
expected: As admin, open `/dashboard/settings/seo`, edit the 5 fields, save, then reload `/` in a browser. The home page `<title>` + JSON-LD update on the NEXT request (no container restart) — proves `revalidateTag("seo-settings","max")` actually invalidates the `getSeoSettings` `'use cache'` snapshot at runtime.
result: pass
note: User reached the page by URL (SEO item missing from sidebar — logged as separate gap), edited, saved, and confirmed "settings works" — cache invalidation confirmed at runtime by user.

### 5. Redirects runtime — 404 fallback + populated-row redirect (covers behavior_unverified[1])
expected: On a running dev server, visit an unmatched path (e.g. `/nonexistent`) → the 404 UI renders WITHOUT crashing (empty redirects table → try/catch swallows → null → 404). Then manually insert a `redirects` row (old_path `/old`, new_path `/new`, status_code 301) and visit `/old` → `permanentRedirect`/`redirect` fires to `/new`.
result: pass
note: RESOLVED by gap-closure plan 05-04 (middleware moved to src/middleware.ts, Node runtime, redirect lookup + 308/307 mapping before 404). Re-verified live 2026-08-25 in re-run R2: GET /old → 308 → /new; GET /old2 → 307 → /new2; /nonexistent → 404.

## Summary

total: 5
passed: 2
issues: 3
pending: 0
skipped: 0
blocked: 0

## Gaps

- truth: "Editor can publish a post from /dashboard/posts/new (Publish button present, body editor functional) so published posts appear in sitemap + RSS"
  status: failed
  reason: "User reported: only draft button shows, no published button, and the body text box not working properly"
  severity: major
  test: 2
  root_cause: "CONFIRMED (publish button): PostForm.tsx L242-256 only renders Cancel + 'Save draft'; Server Actions publishPost()/submitForReview() exist in src/actions/posts.ts but were NEVER wired to any UI (git log -S confirms no call site ever existed — Phase 3 UAT 'editor can publish' pass was inaccurate). Body box: symptom not yet specified — needs user detail (can't type / toolbar dead / not saved / too small)."
  artifacts:
    - path: "src/app/(admin)/dashboard/posts/PostForm.tsx"
      issue: "No Publish / Submit-for-review buttons; only Save draft"
    - path: "src/actions/posts.ts"
      issue: "publishPost/submitForReview actions exist but have zero UI call sites"
    - path: "src/components/editor/TiptapEditor.tsx"
      issue: "body box misbehaving — symptom TBD; same EditorProvider also used by src/app/(admin)/dashboard/pages/PageForm.tsx (fix benefits both)"
  missing:
    - "Wire Publish (editor/admin, calls publishPost) + Submit-for-review (author, calls submitForReview) buttons in PostForm / posts list"
    - "Rebuild body editor surface to WordPress-classic-editor spec (user screenshot, verbatim ask: 'the body box mush be functional like the screenshot I provided ... so I want same for post and pages or where the body box used'): Visual/Text tabs (Text = HTML source view — planner to scope generateHTML/parse round-trip feasibility); toolbar in this order — Paragraph/block-type dropdown (Paragraph/H1/H2/H3), Bold, Italic, Bulleted list, Numbered list, Blockquote, Align left/center/right (@tiptap/extension-text-align@3 — NEW dep), Insert link, Insert table, More(…) overflow (strike, code, code block, image via MediaPicker, undo/redo); large white min-height writing area; footer bar with live Word count (@tiptap/extension-character-count@3 — NEW dep). Applies EVERYWHERE EditorProvider/TiptapEditor is used (PostForm.tsx + PageForm.tsx). extensions.ts stays the single shared client+server source (round-trip test must still pass). pnpm only; @tiptap/*@3.27.1 line."
  debug_session: ""

- truth: "Saving a post shows clear success/failure feedback (toast) so the user knows the save landed"
  status: failed
  reason: "User reported: hit save draft and nothing happens — cannot tell if it saved; asked for a toast notification"
  severity: major
  test: 3
  root_cause: "CONFIRMED: PostForm useMutation onSuccess only invalidates the ['posts'] query — no toast, no redirect, no form-state reset. Error path renders an inline box only when the action throws. Systemic: UsersTable.tsx L161 comment also references a 'success toast' that was never built. No toast library installed (no sonner/react-hot-toast); TailAdmin ui/ has alert but no toast."
  artifacts:
    - path: "src/app/(admin)/dashboard/posts/PostForm.tsx"
      issue: "mutation.onSuccess invalidates queries but gives zero user-visible feedback"
    - path: "src/app/(admin)/dashboard/pages/PageForm.tsx"
      issue: "same silent-save pattern (shares the fix)"
  missing:
    - "Add a toast/notification primitive (add sonner OR a small TailAdmin-style toast) and fire success+error toasts from PostForm/PageForm mutations (dashboard-wide pattern)"
  debug_session: ""

- truth: "SEO settings page is reachable from the dashboard Settings menu"
  status: failed
  reason: "User reported: under Settings no SEO menu showing — had to navigate by URL; the page itself works"
  severity: major
  test: 4
  root_cause: "CONFIRMED: src/layout/AppSidebar.tsx L85-95 Settings submenu lists Storage, Backup, Newsletter — the SEO entry (/dashboard/settings/seo) was never added."
  artifacts:
    - path: "src/layout/AppSidebar.tsx"
      issue: "Settings submenu missing { name: 'SEO', path: '/dashboard/settings/seo' } entry"
  missing:
    - "Add SEO item to the Settings submenu in AppSidebar.tsx"
  debug_session: ""

- truth: "A redirects-table row makes visiting old_path redirect to new_path (301→308 / 302→307)"
  status: failed
  reason: "Row id 1 (/old → /new, 301) inserted in dev DB; visiting /old returns 404 — redirect never fires"
  severity: blocker
  test: 5
  root_cause: "CONFIRMED: src/app/not-found.tsx L58-61 reads the incoming path from the 'x-invoke-path' request header — an internal VERCEL-injected header that does not exist in self-hosted Next.js (this project deploys self-hosted via Coolify per CLAUDE.md). incomingPath is always null → DB lookup never runs → always 404. middleware.ts exists (repo root, documented why not proxy.ts under 16.2.9/Turbopack) but only matches /dashboard/* + auth pages and never sets the header."
  artifacts:
    - path: "src/app/not-found.tsx"
      issue: "RedirectChecker depends on Vercel-only 'x-invoke-path' header — dead code self-hosted"
    - path: "middleware.ts"
      issue: "Runs only on dashboard/auth matchers; never propagates pathname to the app"
  missing:
    - "Set the incoming-path request header in middleware.ts (NextResponse.next({ request: { headers } })) and extend matcher to public paths, OR read the path via a [...catchAll] route — planner to choose; keep the redirect call outside try/catch"
  debug_session: ""

## Re-run (post gap-closure)

Gap-closure plans 05-04/05-05/05-06 are merged, code review Criticals are fixed
(commits 5da67e1, 4d7a999, cabf58a), suite is 590/590 green. Verification
(05-VERIFICATION.md, 2026-08-25) reports status `human_needed`: all 8 SEO
requirements SATISFIED in code, no code gaps — 3 runtime flows need live re-testing.

### R1. Live publish flow re-run (covers original tests 2 + 3, gaps 1 + 2)
expected: As an editor, open `/dashboard/posts/new` (or an existing draft). Body editor shows the WordPress-classic surface (Visual/Text tabs, toolbar, word-count footer) and accepts typing. Fill title + body, click Publish — a success toast appears. The post then: (a) appears in `/sitemap.xml` under `/blog/{slug}` (0.8/weekly), (b) appears in `/rss.xml` as an `<item>` with a correct `pubDate` (CR-02: publish stamps `publishedAt`), (c) its live page source at `/blog/{slug}` shows `<link rel="canonical" href=".../blog/{slug}">` (CR-01), matching `og:url`, and a `BlogPosting` JSON-LD script (CR-03-escaped). Save-draft also toasts.
result: issue
fix_state: partial — 05-07 b84f952/38ace32/e0356e9 + WR-01 657ff3e + WR-02 e12cb59 fixes CONFIRMED WORKING live (publish flow succeeded end-to-end, post 2 published); NEW blocker found in the same re-test (edit-page RSC crash, see "edit page renders" gap below) — fix = plan 05-08
reported: "first time body box input showing like this and after adding all data and click on publish button nothing happen"
severity: major
evidence: "Screenshot 2026-08-25: toolbar renders correctly (Visual/Text tabs, Paragraph dropdown, B/I/lists/align/link/table/More, word-count footer '1 word, 9 characters') BUT the writing surface renders as an unstyled plain text box (black border, no padding, no ProseMirror placeholder) instead of the Tiptap contenteditable surface. Typed text 'hjhjhjhj' lands in the plain box. Category* field visible and empty. After filling all data, clicking Publish produces no toast, no navigation, no visible save."
retest_reported: 'Console Error {"level":"error","msg":"Event handlers cannot be passed to Client Component props. <... postId={2} publishedAt={Date} onChange={function onChange} initialTimezone=...> ... If you need interactivity, consider converting part of this to a Client Component.","name":"Error"} at src/app/error.tsx (20:13) GlobalError.useEffect — "getting this error and toste notification showing error url when I click to publish"'
retest_severity: blocker — edit page unrenderable (EVERY visit to /dashboard/posts/[id]/edit throws). Publish itself SUCCEEDED: DB shows post 2 published_at=2026-08-25 18:05:37.

### R2. Live redirects re-run (covers original test 5, gap 4)
expected: Dev server running, `redirects` row id 1 (`/old` → `/new`, 301) present in dev DB from the prior UAT (re-insert if the DB was reset). `curl -i http://localhost:3000/old` returns **308** with `Location: /new` (middleware maps 301→308). Unmatched path (e.g. `/nonexistent`) still renders the 404 UI.
result: pass
source: automated
note: Auto-verified via curl 2026-08-25 against live dev server. DB rows present: /old→/new (301), /old2→/new2 (302), /blog/old-post→/blog/new-post (301). GET /old → 308 Permanent Redirect, Location: /new; GET /old2 → 307 Temporary Redirect, Location: /new2; GET /nonexistent → 404. Node-runtime middleware (src/middleware.ts) firing on public paths — original blocker resolved by gap-closure plan 05-04.

### R3. Sidebar SEO click-through (covers original test 4 gap)
expected: In the dashboard, Settings submenu shows an `SEO` entry; clicking it navigates to `/dashboard/settings/seo` and the form loads (no URL typing).
result: pending

## Gaps added by re-run

- truth: "The rebuilt classic-editor body box renders the styled Tiptap surface on first load, and Publish saves the post with a visible success toast"
  status: failed
  reason: "User reported after gap-closure merge: body box renders as an unstyled plain text box on first load (toolbar + word-count footer render fine), and clicking Publish after filling all data does nothing — no toast, no navigation, no save"
  severity: major
  test: R1
  root_cause: "CONFIRMED (two independent causes; hydration/JS-death REFUTED — live word-count updates in screenshot prove hydration, TiptapEditor is next/dynamic ssr:false and could not appear in SSR HTML at all). (A) Editor surface: the .tiptap.ProseMirror contenteditable has ZERO styles in the codebase — Tiptap v3 ships no CSS, globals.css has no .ProseMirror rules, the 'prose prose-sm dark:prose-invert' classes on TiptapEditor.tsx:128 are DEAD (@tailwindcss/typography not in package.json, no @plugin in globals.css; verified against served chunk: min-h-[350px] present, zero prose rules), 'focus:outline-none' is on the wrapper div while focus lands on the child contenteditable so the browser default focus ring (hard black border on Windows Chrome/Edge) survives, and no Placeholder extension means the empty surface shows nothing. Secondary: useEditor without immediatelyRender:true yields a transient null-editor first frame under Next.js; warm dev server may serve stale CSS on first post-rebuild load (dev-only). (B) Publish no-op: posts-schema.ts:30 makes categoryId REQUIRED (z.number().int().positive) with undefined default on /dashboard/posts/new; screenshot shows Category empty → RHF/Zod validation fails → handleSubmit (PostForm.tsx:208, 358, 368) has NO onInvalid callback → silent no-op (no toast/focus/scroll; only small inline captions mid-form above the button). Slug is a bare manual input (no auto-derive from title) failing ^[a-z0-9]+(-[a-z0-9]+)*$ silently — second blocker. Zod 4 emits cryptic 'Invalid input: expected number, received undefined' instead of 'Category is required'. Toaster IS mounted (sonner 2.0.8, AdminShell.tsx:71) — once the mutation fires, toasts work."
  artifacts:
    - path: "src/components/editor/TiptapEditor.tsx"
      issue: "L53 useEditor without immediatelyRender (null-editor first frame under Next); L128 wrapper carries dead prose classes + misdirected focus:outline-none (focus lands on child .ProseMirror)"
    - path: "src/app/globals.css"
      issue: "no .ProseMirror/.tiptap rules; no @plugin for @tailwindcss/typography"
    - path: "package.json"
      issue: "@tailwindcss/typography absent — prose classes generate zero CSS"
    - path: "src/components/editor/extensions.ts"
      issue: "no Placeholder extension — empty surface shows nothing"
    - path: "src/app/(admin)/dashboard/posts/PostForm.tsx"
      issue: "L208/L358/L368 handleSubmit called without onInvalid — validation failure is a silent no-op; slug input L224-240 has no auto-derivation"
    - path: "src/actions/posts-schema.ts"
      issue: "L30 categoryId required but undefined yields cryptic Zod type error, not 'Category is required'"
    - path: "src/app/(admin)/dashboard/pages/PageForm.tsx"
      issue: "shares EditorProvider — same unstyled surface (fix benefits both)"
  missing:
    - "Style the editor writing surface: install @tailwindcss/typography (pnpm) + @plugin directive in globals.css, add .tiptap.ProseMirror rules (outline:none, fill height), fix focus:outline-none placement, add Placeholder extension (@tiptap/extension-placeholder@3)"
    - "Set immediatelyRender:true in useEditor (component is client-only behind next/dynamic ssr:false — safe)"
    - "Add onInvalid callback to all three handleSubmit calls in PostForm.tsx: error toast + focus/scroll to first invalid field"
    - "Fix categoryId Zod 4 error message (z.number({ error: 'Category is required' }))"
    - "Auto-derive slug from title when slug empty/untouched (transliterate-strip to ^[a-z0-9]+(-[a-z0-9]+)*$), or mark Slug required with visible asterisk — planner to scope"
  debug_session: "2 parallel gsd-debugger agents 2026-08-25 (editor-surface + publish no-op); both refuted shared hydration cause; cross-confirmed typography-plugin finding"

- truth: "The post edit page (/dashboard/posts/[id]/edit) renders, and the Schedule picker persists picked dates"
  status: failed
  reason: "User reported (re-test 2026-08-25): after a successful publish, console error 'Event handlers cannot be passed to Client Component props' with props dump postId={2} publishedAt={Date} onChange={function onChange} initialTimezone=...; error toast shows a URL (Next.js docs link embedded in the error); edit page unrenderable"
  severity: blocker
  test: R1
  root_cause: "CONFIRMED (direct code read, orchestrator): src/app/(admin)/dashboard/posts/[id]/edit/page.tsx:99-103 — the edit page is a Server Component passing an inline onChange={() => {}} stub to the 'use client' SchedulePicker; functions cannot cross the server→client RSC serialization boundary, so EVERY render of the edit page throws (surfaces via error.tsx; the 'error url' in the toast is the Next.js docs link embedded in the message). SchedulePicker.tsx:30 declares onChange REQUIRED (which forced the stub) and consumes it only in its flatpickr config (L69-75) — nothing persists the picked date: setSchedule(postId, publishedAt) exists at actions/posts.ts:391 (D-15 editor/admin gated) but has ZERO call sites, so the picker is currently decorative. Grep confirms posts/[id]/edit/page.tsx is SchedulePicker's ONLY render site (pages editor drops it, D-18) and no other function props cross the boundary on that page (PostForm/PreviewLink receive serializable values only; PostForm has no router.* calls). Bug predates 05-07 — Phase-3 code, first live load-test of the edit page. Publish itself SUCCEEDED: posts row id=2 'R1 Walkthrough Test Post' / r1-walkthrough-test / published / published_at 2026-08-25 18:05:37 (psql)."
  artifacts:
    - path: "src/app/(admin)/dashboard/posts/[id]/edit/page.tsx"
      issue: "L99-103 inline onChange function prop server→client — RSC serialization throw on every edit-page render"
    - path: "src/app/(admin)/dashboard/posts/components/SchedulePicker.tsx"
      issue: "L30 onChange required in props interface (forces server pages to pass a function); L69-75 flatpickr onChange only forwards to the dead prop — picked dates never reach setSchedule"
    - path: "src/actions/posts.ts"
      issue: "setSchedule (L391) exists but has no call sites anywhere"
  missing:
    - "Remove the onChange prop from SchedulePicker's interface entirely; wire the flatpickr onChange to call the setSchedule server action directly from the client component (setSchedule(postId, dates[0])) with sonner success/error toasts matching the 05-06 toast pattern; decide clear-to-empty semantics (setSchedule requires a Date — ignore clears or toast guidance); delete the stub prop from posts/[id]/edit/page.tsx:99-103"
  debug_session: "orchestrator inline 2026-08-26 — direct Read of edit/page.tsx + SchedulePicker.tsx + actions grep; no agent needed (single 10-line root cause)"

- truth: "The post edit page loads without a client crash after the editor mounts (React StrictMode destroy/remount cycle)"
  status: failed
  reason: "Post-05-08 re-test 2026-08-26: visiting /dashboard/posts/[id]/edit throws TypeError: Cannot read properties of null (reading 'can') and the page is replaced by the error boundary"
  severity: blocker
  test: R1
  root_cause: "CONFIRMED: tiptap#7849 — @tiptap/core Editor.destroy() nulls the internal commandManager but leaves the instance non-null, and @tiptap/react 3.27.1 useEditorState re-invokes the unmemoized selector with the destroyed editor during React StrictMode's mount→remount cycle; the Toolbar selector guard (Toolbar.tsx ~L109) checked null only, so the destroyed editor passed it and can().undo() threw, bubbling to src/app/error.tsx (logged twice by the double effect). Upstream fix (PR #8015) is not in @tiptap/react 3.27.1."
  artifacts:
    - path: "src/components/editor/toolbar/Toolbar.tsx"
      issue: "useEditorState selector guard checked null only — a destroyed editor passed it and can().undo() threw"
    - path: "src/components/editor/TiptapEditor.tsx"
      issue: "counts selector survived destroyed editors only implicitly (storage check) — no explicit guard"
  missing:
    - "Explicit null OR destroyed guards in both useEditorState selectors, bailing to the everything-off / zero-counts state"
    - "jsdom regression test rendering Toolbar with a real destroyed Editor"
  debug_session: ""
  resolution: "FIXED by quick task 260826-5l0 — both selectors bail to their zero-states when destroyed; jsdom test renders Toolbar with a destroyed Editor"

- truth: "Publishing a post with a media-library feature image succeeds (root-relative /api/media/<providerKey> URLs are valid image values)"
  status: failed
  reason: "Post-05-08 re-test 2026-08-26: publishing a post whose feature image was picked from the media library toasts 'Invalid url' — Zod rejects the root-relative /api/media/<providerKey> value"
  severity: major
  test: R1
  root_cause: "CONFIRMED: MediaPicker.resolvePublicUrl emits root-relative /api/media/<providerKey> (correct portable convention — same-origin next/image optimization verified working live via GET /api/media/... 200), but featureImage/ogImage/defaultOgImage schemas used absolute-only Zod URL validation → 'Invalid url' toast on publish."
  artifacts:
    - path: "src/actions/posts-schema.ts"
      issue: "featureImage (L38) and ogImage (L50) used z.string().url() — absolute-only, rejects media-library values"
    - path: "src/lib/seo/validation.ts"
      issue: "ogImage (L61) used z.string().url() — absolute-only"
    - path: "src/actions/seo-settings-schema.ts"
      issue: "defaultOgImage (L29) used z.string().url() — absolute-only (same rejection awaited a local media URL there)"
  missing:
    - "Shared image-URL schema accepting empty | absolute http(s) | root-relative, applied to the four picker-fed image fields"
    - "canonicalUrl/canonical/canonicalBaseUrl/cdnBaseUrl fields staying absolute-only, pinned by failing-parse tests"
  debug_session: ""
  resolution: "FIXED by quick task 260826-5l0 — shared imageUrlSchema (src/lib/validation/image-url.ts) applied to the four image fields; canonicalUrl/canonical/canonicalBaseUrl/cdnBaseUrl still absolute-only, pinned by tests"
