---
phase: 05-seo-basics
verified: 2026-08-25T20:30:52Z
status: human_needed
score: 9/12 must-haves verified
behavior_unverified: 3
overrides_applied: 0
requirements:
  SEO-01: satisfied
  SEO-02: satisfied
  SEO-03: satisfied
  SEO-04: satisfied
  SEO-05: satisfied
  SEO-06: satisfied
  SEO-07: satisfied
  SEO-08: satisfied
re_verification:
  previous_status: human_needed
  previous_score: 5/5
  gaps_closed:
    - "UAT re-run R2 (redirects runtime) PASSED and is recorded in 05-UAT.md: automated curl 2026-08-25 — GET /old → 308 → /new, /old2 → 307 → /new2, /nonexistent → 404. Prior behavior_unverified[1] (middleware redirects branch) DISCHARGED by live evidence; prior human item 2 closed."
    - "UAT re-run R1 root causes closed in code by 05-07 (b84f952 typography @plugin + ProseMirror rules + Placeholder + immediatelyRender; 38ace32 onInvalid toast/focus + Zod 4 'Category is required' + derive-on-empty slug) and review fixes (657ff3e WR-01 min-h-[inherit] bridge; e12cb59 WR-02 slug ownership via onChange) — all verified against source in this pass."
    - "Scoped code review 550089a (0 Critical / 2 Warning / 4 Info): both Warnings fixed and pinned by tests; REVIEW-FIX eb28a45 records status all_fixed — confirmed."
  gaps_remaining: []
  regressions: []
behavior_unverified_items:
  - truth: "/dashboard/posts/new renders the styled Tiptap surface on FIRST load (typography-styled text, no browser-default black focus ring, visible placeholder while empty)"
    test: "Open /dashboard/posts/new in a browser and observe the body editor before interacting"
    expected: "Comfortable typography-styled text area, gray placeholder text ('Write something…') visible without focus, tall (~350px) white clickable surface, NO hard black browser focus ring on click"
    why_human: "The chain is proven at every programmatically checkable level — @plugin wired in globals.css L9, .tiptap.ProseMirror + placeholder rules authored (L310-337), Placeholder extension in the shared array (extensions.ts L97-100), immediatelyRender:true (TiptapEditor.tsx L73), WR-01 bridge (L160), built CSS contains both ProseMirror and not-prose fragments — but jsdom cannot compute CSS, so the visual first-load truth is observable only in a real browser."
  - truth: "Clicking Publish / Save draft / Submit-for-review with missing or invalid fields NEVER silently no-ops — an error toast names the first problem and focus jumps to that field"
    test: "On /dashboard/posts/new, leave Category empty (and/or slug) and click Publish, then Save draft"
    expected: "Error toast 'Category is required' appears and focus/scroll jump to the Category select (or the slug input); no silent dead click on any of the three submit paths"
    why_human: "onInvalid is wired as the second handleSubmit argument at all three call sites (PostForm.tsx L267, L427, L437) with toast.error + getElementById(key).focus() + scrollIntoView (L171-185), but no test exercises the toast/focus path (PostForm tests mock the actions and pin only slug ownership); toast rendering + focus movement are runtime browser behaviors."
  - truth: "A fully filled form publishes with visible success toasts and the post appears in /sitemap.xml and /rss.xml and its /blog/{slug} page carries canonical + og:url + BlogPosting JSON-LD on the next request"
    test: "As an editor, fill title + body + category, click Publish, then curl /sitemap.xml, /rss.xml and view the post page source"
    expected: "'Post saved' then 'Published' toasts; /blog/{slug} in the sitemap at 0.8/weekly; one <item> in RSS with a stamped pubDate; page source shows canonical, matching og:url, and a BlogPosting JSON-LD script"
    why_human: "The button → publishPost → revalidatePath → route output loop crosses four systems and is exercised by no test (PostForm tests mock all actions). Executor D4 curls (05-07-SUMMARY, dev server, r1-walkthrough-test post) are execution-time evidence, not independent confirmation; the live UI re-run is the designated discharge path (UAT re-run R1)."
human_verification:
  - test: "Re-run UAT R1 live (covers behavior_unverified items 1-3 and original UAT tests 2+3): on a freshly started dev server, open /dashboard/posts/new — verify the styled surface (typography, placeholder visible, ~350px clickable area, no black focus ring); type a title and watch the slug auto-fill; leave Category empty and click Publish — expect the 'Category is required' error toast + focus jump to Category; fill Category + body and Publish — expect 'Post saved' then 'Published' toasts; then curl /sitemap.xml (expect /blog/{slug} at 0.8/weekly), /rss.xml (expect one <item>, stamped pubDate), and the /blog/{slug} page source (expect canonical + matching og:url + BlogPosting JSON-LD). Spot-check /dashboard/pages (PageForm) shares the styled surface."
    expected: "All of the above hold on first load with no restart; Save-draft also toasts."
    why_human: "Cross-system runtime loop (UI → Server Action → revalidation → route output) plus visual first-load styling — no test exercises it end-to-end; grep/unit evidence covers structure and pure logic only."
  - test: "Re-run UAT R3: in the dashboard, open the Settings submenu and click the 'SEO' entry (no URL typing)"
    expected: "Navigates to /dashboard/settings/seo and the 5-field form loads; (optionally) edit + save and confirm the site-wide title/JSON-LD refresh on the next request — prior UAT test 4 already confirmed the save + invalidation by URL."
    why_human: "Sidebar entry (AppSidebar.tsx L93) and the page are code-verified and the page was live-confirmed via URL in UAT test 4; the shipped sidebar entry postdates that UAT, so one live click-through closes it."
---

# Phase 5: SEO Basics Verification Report

**Phase Goal:** Every public-facing route emits accurate, source-of-truth metadata so posts are indexable, shareable, and canonical-correct — sourced from `post_seo`/`settings`, including Bangla-aware validation and an RSS feed.
**Verified:** 2026-08-25T20:30:52Z
**Status:** human_needed
**Re-verification:** Yes — third pass. Supersedes the 2026-08-25 report (e7bcb85); covers the 05-07 gap-closure plan (UAT re-run R1 root causes) and the scoped review fixes (WR-01/WR-02).

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Each public route produces correct title/description/canonical/OG/Twitter via `generateMetadata`, sourced from `post_seo`/`settings`, respecting `canonical_url` override else slug-derived (SC-1) | ✓ VERIFIED | Regression intact: metadata.ts (214 lines) with CR-01 override at L95-97; all 16 `(site)` routes export generateMetadata calling getSeoSettings; unit tests green in the 599 run. |
| 2 | `/sitemap.xml` lists every published post + managed page (per-type priority/changefreq); `/robots.txt` correct; both update without full rebuild (SC-2) | ✓ VERIFIED | sitemap.ts (106 lines) + robots.ts (33 lines) unchanged since prior pass; publishPost revalidation block intact (posts.ts L357-364: /blog/{slug}, /, /blog, category, **/sitemap.xml, /rss.xml**) + 2-arg revalidateTags L368-373. |
| 3 | A published post page injects valid `BlogPosting` JSON-LD (SC-3) | ✓ VERIFIED | blog/[slug]/page.tsx (283 lines) intact; jsonLdScript used at all 6 injection sites across 5 files; zero raw stringify ld+json sites remain (grep). |
| 4 | Long Bangla meta description passes byte/grapheme-aware validation, not Latin char limits (SC-4) | ✓ VERIFIED (behaviorally proven) | validation.ts Intl.Segmenter grapheme rule unchanged; validation.test.ts Bangla-pass/Latin-fail cases green in this pass's suite run. |
| 5 | RSS feed at `/rss.xml` publishes latest posts (SC-5) | ✓ VERIFIED | rss.xml/route.ts (134 lines) unchanged; 14 RSS unit tests green; live content-type confirmed in prior UAT. |
| 6 | (05-04) Redirects rows produce real HTTP 308/307; unmatched paths render 404; no restart needed | ✓ VERIFIED (upgraded — live evidence) | Code: middleware.ts runtime="nodejs" (L59), 301→308/302→307 mapping (L125-126), x-incoming-path anti-spoof overwrite (L45). Behavior: **UAT re-run R2 PASS recorded in 05-UAT.md** (automated curl 2026-08-25: GET /old → 308 → /new; /old2 → 307 → /new2; /nonexistent → 404; rows present in dev DB). Discharges prior behavior_unverified[1]. |
| 7 | (05-07) /dashboard/posts/new renders the styled Tiptap surface on FIRST load — typography text, no black focus ring, visible placeholder | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | All structure verified: globals.css L9 `@plugin "@tailwindcss/typography"` + L310-337 `.tiptap.ProseMirror { outline:none; min-height:inherit }` + `p.is-empty:first-child::before` placeholder rule; extensions.ts L97-100 Placeholder.configure({ showOnlyCurrent:false }); TiptapEditor.tsx L73 immediatelyRender:true, L159 prose wrapper, L160 WR-01 `min-h-[inherit]` bridge; package.json exact pins @tailwindcss/typography@0.5.20 + @tiptap/extensions@3.27.1; **built-CSS proof: both "ProseMirror" and "not-prose" present under .next/static/**; WR-01 DOM-chain pin green. The visual first-load truth needs a browser → human item 1. |
| 8 | (05-07) A missing Category reports "Category is required", not Zod 4's default type-error string | ✓ VERIFIED (behaviorally proven) | posts-schema.ts L35 `z.number({ error: "Category is required" }).int().positive("Category is required")`; derive.test.ts L62-70 asserts the exact message via safeParse — green in this pass's suite run. |
| 9 | (05-07) Slug auto-fills from Title (URL-safe Latin + hyphens) while the user has not typed one; a user-entered or existing slug is never overwritten | ✓ VERIFIED (behaviorally proven) | PostForm.tsx L122-135 derive-on-empty effect (never overwrite, skip-empty-derive); WR-02 ownership via custom onChange (L289-299), no onBlur; derive.ts pure strip-to-regex (D-20). Behavioral evidence: 3 pins in PostForm.test.tsx (tab-through keeps derive; clear-while-focused does not refill; typed slug survives title edits) — green, and REVIEW-FIX recorded them failing against pre-fix code (load-bearing). |
| 10 | (05-07) Clicking Publish / Save draft / Submit-for-review with invalid fields NEVER silently no-ops — toast + focus jump | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | Wired: shared onInvalid (PostForm.tsx L171-185) as second argument at ALL THREE handleSubmit sites (L267 form onSubmit, L427 Publish, L437 Submit-for-review); focus targets exist (id="title" L273, id="slug" L288, CategoryPicker id={name}). No test exercises the toast/focus path (actions mocked) → human item 1. |
| 11 | (05-07) A fully filled form publishes with visible success toasts; post appears in sitemap/RSS; page carries canonical + og:url + JSON-LD | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | Toast wiring verified (mutation onSuccess "Post saved" L151, "Published" L199, "Submitted for review" L213; onError toast.error on all three mutations); save-then-act chains L226-240. Executor D4 curls prove the downstream chain at execution time (05-07-SUMMARY); independent live confirmation is the queued UAT R1 re-run → human item 1. |
| 12 | (05-04) SEO settings page reachable from the Settings submenu | ✓ VERIFIED (code) | AppSidebar.tsx L93 `{ name: "SEO", path: "/dashboard/settings/seo" }` intact; page trio shipped by 05-03 and live-confirmed via URL (UAT test 4). Live click-through remains UAT R3 → human item 2. |

**Score:** 9/12 truths verified (3 present + wired, behavior not exercised — items 7, 10, 11; all three are covered by human verification item 1)

### Required Artifacts

All prior-pass artifacts re-checked (existence + substance, quick regression): metadata.ts, jsonld.ts, validation.ts, settings.ts (lib/seo), sitemap.ts, robots.ts, rss.xml/route.ts, blog/[slug]/page.tsx, actions/posts.ts, actions/settings.ts, middleware.ts, not-found.tsx, db/schema.ts, SeoPanel.tsx, settings/seo trio, AppSidebar — all present, substantive, unchanged-or-improved. New 05-07 / review-fix artifacts:

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/app/globals.css` | @plugin typography + .tiptap.ProseMirror + placeholder rules | ✓ VERIFIED | L9 @plugin immediately after @import; L310-323 surface rule (outline:none + two-link min-height chain documented); L331-337 placeholder rule. |
| `src/components/editor/extensions.ts` | Placeholder in shared client+server array | ✓ VERIFIED | L57 import from @tiptap/extensions; L97-100 Placeholder.configure({ placeholder: "Write something…", showOnlyCurrent: false }); decoration-only server-safety documented; round-trip parity test green. |
| `src/components/editor/TiptapEditor.tsx` | immediatelyRender + WR-01 bridge + live prose classes | ✓ VERIFIED | L73 immediatelyRender:true; L159 prose prose-sm dark:prose-invert max-w-none min-h-[350px] wrapper (dead focus:outline-none removed); L160 `<EditorContent className="min-h-[inherit]" />`. |
| `src/actions/posts-schema.ts` | Zod 4 constructor-level category error | ✓ VERIFIED | L35; pinned by test (truth 8). |
| `src/lib/slug/derive.ts` | pure deriveSlugFromTitle, D-20 strip | ✓ VERIFIED | Zero imports; toLowerCase → [^a-z0-9]+ → hyphen → collapse → trim. |
| `src/lib/slug/__tests__/derive.test.ts` | 5 behavior-case tests | ✓ VERIFIED | Exact derivation, fold/collapse/trim, Bangla→"", SLUG_REGEX round-trip, schema message — all green. |
| `src/app/(admin)/dashboard/posts/PostForm.tsx` | onInvalid ×3 + slug auto-derive | ✓ VERIFIED | Truths 9-11 wiring; role gating and 05-06 mutation wiring untouched as planned. |
| `src/app/(admin)/dashboard/posts/__tests__/PostForm.test.tsx` | WR-02 behavioral pins | ✓ VERIFIED | 3 pins (tab-through, clear-no-refill, never-overwrite); proven fail-first pre-fix per REVIEW-FIX. |

### Key Link Verification

| From | To | Via | Status |
|------|----|----|--------|
| TiptapEditor prose classes | typography CSS in served chunk | @plugin in globals.css | ✓ WIRED — source classes (TiptapEditor L159) + plugin (globals L9) + built-CSS proof (ProseMirror & not-prose in .next/static) |
| Placeholder extension | visible first-load placeholder | is-empty decoration → CSS ::before | ✓ WIRED (extensions L97-100 → globals L331-337; showOnlyCurrent:false) |
| handleSubmit(onValid, onInvalid) ×3 | toast.error + focus/scrollIntoView | second-argument callback | ✓ WIRED (L267/L427/L437 → L171-185; ids title/slug/categoryId) |
| title watch | slug auto-fill | deriveSlugFromTitle → setValue({ shouldValidate }) | ✓ WIRED (L124-135 → derive.ts; behavioral pins green) |
| Prior-pass links (getSeoSettings↔routes, cacheTag↔revalidateTag, redirects table↔middleware/not-found, seoMetaSchema↔savePost/SeoPanel, renderPostBody↔rss, publishPost↔revalidation, buttons↔actions, sidebar↔seo page, jsonLdScript↔6 sites) | — | — | ✓ WIRED (regression greps re-run this pass; all intact) |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| PostForm slug derive | slugValue | watch(["title","slug"]) → deriveSlugFromTitle | ✓ real user input | ✓ FLOWING |
| Category error toast | categoryId | postSchema.safeParse (real Zod resolver) | ✓ real validation | ✓ FLOWING |
| Prior-pass flows (blog/[slug] metadata, sitemap, rss, savePost→post_seo, SeoSettingsForm) | — | — | ✓ | ✓ FLOWING (unchanged) |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full test suite (run once this pass) | `pnpm test` | **599/599 passed, 59 files** (2.78s) — matches the claimed count exactly (590 baseline + 5 derive/schema + 3 PostForm WR-02 + 1 WR-01 surface pin) | ✓ PASS |
| Typecheck baseline | `pnpm exec tsc --noEmit` | Exactly the 4 documented pre-existing TS18048 errors in storage-settings.test.ts; zero new | ✓ PASS |
| Generated-CSS proof (R1 cause A artifact level) | `grep -rql ProseMirror / not-prose .next/static/` | Both FOUND | ✓ PASS |
| Fix commits exist | `git log -1 {hash}` × 8 | b84f952, 38ace32, e0356e9, 981c3ab, 550089a, 657ff3e, e12cb59, eb28a45 — all present with exact subjects | ✓ PASS |
| Redirects live behavior | (recorded evidence) 05-UAT.md re-run R2, automated curl 2026-08-25 | 308→/new, 307→/new2, 404 for unmatched | ✓ PASS |
| WR-02 pins load-bearing | REVIEW-FIX record: pins run against pre-fix PostForm | both failure-mode tests failed pre-fix, pass post-fix | ✓ PASS |

Step 7c (probes): SKIPPED — no `scripts/*/tests/probe-*.sh` declared or present; this phase's runnable evidence is vitest + build (both evidenced).

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| SEO-01 | 05-01, 05-03, 05-04 | generateMetadata per public route from post_seo/settings | ✓ SATISFIED | Truth 1 + dashboard data side (SeoPanel, savePost upsert, settings/seo page, sidebar entry truth 12) |
| SEO-02 | 05-02, 05-05, 05-06, 05-07 | Dynamic sitemap.ts + robots.ts | ✓ SATISFIED | Truth 2; publish UI + loud validation (05-06/05-07) make publishing operable end-to-end |
| SEO-03 | 05-01 | JSON-LD BlogPosting per post | ✓ SATISFIED | Truth 3 |
| SEO-04 | 05-01, 05-04 | Canonical override else slug-derived | ✓ SATISFIED | Truth 1 (CR-01 line re-verified); redirects runtime live-proven (truth 6) |
| SEO-05 | 05-01 | OG + Twitter images with fallback chain | ✓ SATISFIED | metadata.ts OG chain unchanged; unit-tested |
| SEO-06 | 05-01, 05-03, 05-05, 05-07 | Bangla-aware meta validation | ✓ SATISFIED | Truth 4 (behavioral test) + slug derivation respects the same D-20 boundary (truth 9, Bangla strips to "" and loud validation catches it) |
| SEO-07 | 05-02, 05-06 | RSS feed of published posts | ✓ SATISFIED | Truth 5 |
| SEO-08 | 05-02 | Sitemap priority/changefreq per type | ✓ SATISFIED | sitemap.ts per-type values unchanged + tests green |

No ORPHANED requirements — all 8 SEO IDs claimed by plans (05-01..05-07) and satisfied; REQUIREMENTS.md marks all 8 Complete.

### Decision Coverage

`check.decision-coverage-verify` (05-CONTEXT.md, 13 trackable decisions): **13/13 honored** by shipped artifacts — non-blocking gate, no findings.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| .planning/ROADMAP.md | all phases | `**Mode**: mvp` on all 8 phases but NO goal is in User Story format (validator: valid=false for phase 5) | ⚠️ Warning | Mode annotation/goal-format mismatch — MVP user-flow narrowing cannot be applied as specified; standard goal-backward verification used consistently with all prior passes. Human decision: run `/gsd mvp-phase 5` to reword, or drop the Mode lines. Does not affect code correctness. |
| .next/ (build output) | — | Built CSS predates WR-01: `min-h-[inherit]` absent from .next/static (stale cold build from e0356e9; WR fixes ran tests+tsc only, no rebuild) | ℹ️ Info | Tailwind v4 generates the arbitrary-value class from source at the next build/dev compile; live UAT R1 on a dev server is unaffected (dev compiles on demand). Re-run `rm -rf .next && pnpm build` before the next production deploy (per project memory: mandatory when globals.css-adjacent output could be cached). |
| src/app/sitemap.ts | 59 | Stale "Phase 6 TODO" comment (Phase 6 complete) | ℹ️ Info | Carried from prior report; cosmetic |
| src/actions/posts-schema.ts | 35 | `.int()` path still yields Zod default message for non-integer numbers (review IN-01) | ℹ️ Info | Unreachable from the select UI; accepted out of scope by user (Critical+Warning fix scope) |
| rss.xml/route.ts / actions/posts.ts | 115 / 99-170 | WR-03 CDATA breakout + WR-08 no revalidation on edit (prior review, open by user decision) | ℹ️ Info | Unchanged from prior pass; no SC impact |

No TBD/FIXME/XXX/HACK/TODO markers in any 05-07 or review-fix source file (grep-verified this pass).

### Human Verification Required

2 items (3 behavior-unverified truths are all covered by item 1) — see `human_verification` in frontmatter:

1. **UAT R1 live re-run** — styled surface on first load, loud validation (empty-Category Publish → toast + focus), full publish → "Post saved"/"Published" toasts, then curl sitemap/RSS/post-page source.
2. **UAT R3 sidebar click-through** — Settings submenu → SEO entry → page loads.

### Gaps Summary

**No code gaps found.** The R1 root causes are closed and pinned in code at every level programmatically checkable: the typography plugin is wired (source + exact pins + built-CSS artifact proof), the surface/placeholder rules are authored, the editor renders synchronously with the WR-01 min-height bridge, the Zod 4 constructor error reads "Category is required" (test-pinned), the slug derivation is pure and test-pinned including the never-overwrite invariant (WR-02 pins proven fail-first), and onInvalid is wired on all three submit paths. The scoped review's two Warnings are fixed with behavioral pins; the four Infos remain open by explicit user scope decision. The full suite is green at exactly the claimed 599/599 (59 files), tsc sits at the documented 4-error baseline, and all prior-pass findings regress-checked clean (R2 redirects now live-proven PASS, recorded in 05-UAT.md).

The phase routes to **human_needed** solely for live confirmation: the R1 flow through a real browser (visual first-load styling + toast/focus interactivity + the cross-system publish→feeds loop) and the R3 sidebar click-through. These are exactly the pending entries in 05-UAT.md's re-run section (R1 issue → fixed, awaiting re-test; R3 pending).

---

_Verified: 2026-08-25T20:30:52Z_
_Verifier: Claude (gsd-verifier)_
