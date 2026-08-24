---
status: complete
phase: 05-seo-basics
source: [05-VERIFICATION.md]
started: 2026-07-07T04:30:00Z
updated: 2026-08-24T23:50:00Z
---

## Current Test

[testing complete]

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
result: issue
reported: "Row inserted (id 1, /old → /new, 301) via docker compose psql by Claude; curl http://localhost:3000/old returns 404 — redirect never fires"
severity: blocker
partial_pass: 404 fallback ✓ (auto-verified: unmatched path renders 404 UI, no crash, before and after row insert). Redirect lookup FAILS: row present but no redirect — root cause below.

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
