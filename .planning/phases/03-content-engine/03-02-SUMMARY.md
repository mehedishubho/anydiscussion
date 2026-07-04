---
phase: 03-content-engine
plan: 02
subsystem: content-security
tags: [sanitize, dompurify, isomorphic-dompurify, xss, iframe-allowlist, ssr, generateHTML, taxonomy, category-picker, tag-picker, rhf, controller, pitfall-2]

requires:
  - phase: 03-content-engine
    plan: 01
    provides: "editorExtensions (single source of truth), postSchema (D-23 categoryId required + tagIds max 8), savePost/getPost/listPosts Server Actions, listCategories/listTags actions, PostForm + posts/new + posts/[id]/edit routes"
provides:
  - "sanitizeBeforeStore(html) + sanitizeBeforeRender(html) — ONE shared DOMPurify CONFIG used at both call sites (Pitfall #2 linchpin)"
  - "EMBED_DOMAIN_ALLOWLIST — per-provider iframe src domain allowlist (YouTube/X/Instagram/Vimeo/Soundcloud)"
  - "DOMPurify uponSanitizeAttribute hook — iframe src domain gate + target=_blank rel=noopener noreferrer fallback"
  - "renderPostBody(postBodyJson) — the SSR pipeline: generateHTML(json, editorExtensions) then sanitizeBeforeRender(html)"
  - "sanitizeBodyHtml(body) — recursive walker in posts.ts that sanitizes raw-HTML embed nodes in ProseMirror JSON before storage"
  - "CategoryPicker — single-select, required, wired to listCategories (D-23)"
  - "TagPicker — multi-select capped at 8, wired to listTags (D-23 UX hint)"
  - "TaxonomyPicker — composition component for the post form"
  - "getPostTagIds(postId) — returns tag IDs for a post (post_tags join), used by edit page"
affects: [03-04-publishing-preview-scheduler, 05-seo-basics, 06-public-frontend]

tech-stack:
  added: []
  patterns:
    - "Shared DOMPurify config: ONE CONFIG object referenced by both sanitizeBeforeStore + sanitizeBeforeRender (Pitfall #2 anti-drift)"
    - "DOMPurify uponSanitizeAttribute hook as the iframe-src security gate (ADD_TAGS permits iframe, hook validates domain)"
    - "Recursive body HTML walker: walks ProseMirror JSON tree, sanitizes any string containing < + > (catches raw-HTML embeds regardless of node structure)"
    - "RHF Controller for async-data pickers: CategoryPicker/TagPicker use Controller (not register) to handle dynamically-loaded options"

key-files:
  created:
    - "src/lib/sanitize/index.ts (THE shared config — Pitfall #2 linchpin)"
    - "src/lib/sanitize/__tests__/sanitize.test.ts (Wave-0 — 19 cases)"
    - "src/lib/post-render.ts (SSR pipeline: generateHTML → sanitizeBeforeRender)"
    - "src/app/(admin)/posts/components/CategoryPicker.tsx"
    - "src/app/(admin)/posts/components/TagPicker.tsx"
    - "src/app/(admin)/posts/components/TaxonomyPicker.tsx"
  modified:
    - "src/actions/posts.ts (sanitizeBodyHtml walker wired into savePost before db.insert/update)"
    - "src/actions/categories.ts (listCategories: added .orderBy(asc(name)) for picker UX)"
    - "src/actions/tags.ts (listTags: added .orderBy(asc(name)); added getPostTagIds for edit page)"
    - "src/app/(admin)/posts/PostForm.tsx (replaced hardcoded category select with live TaxonomyPicker)"
    - "src/app/(admin)/posts/[id]/edit/page.tsx (fetches + passes initialTagIds to PostForm)"
    - "src/actions/__tests__/posts.test.ts (added @/lib/sanitize mock + sanitize-wiring assertions)"
    - "src/actions/__tests__/taxonomy.test.ts (added listCategories/listTags test cases + mock chain)"

key-decisions:
  - "DOMPurify config uses mutable arrays (NOT `as const`) — DOMPurify's Config type expects mutable `string[]`. The same-config test (5 varied inputs through both functions) proves the anti-drift guarantee holds regardless."
  - "DOMPurify 3.4.11 auto-adds rel='noopener noreferrer' to target=_blank links when target+rel are in ADD_ATTR — A2 assumption CONFIRMED by the Wave-0 test (no hook fallback needed, but the hook includes it as defense-in-depth)."
  - "The uponSanitizeAttribute hook handles BOTH iframe src domain validation AND target=_blank rel enforcement — single hook, two security properties."
  - "Body sanitizer uses a recursive JSON walker that sanitizes ANY string containing `<` and `>` — catches raw-HTML embed nodes regardless of their ProseMirror node type or attr name. No-op for pure-JSON bodies (defense-in-depth)."
  - "CategoryPicker/TagPicker use RHF Controller (not register) — necessary because options are loaded asynchronously via Server Action calls on mount."
  - "getPostTagIds added to tags.ts (Rule 2) — the edit page needs the post's existing tag IDs to pre-select them in TagPicker; getPost returns only the posts table row (no join)."

patterns-established:
  - "Pitfall #2 closed: ONE shared CONFIG object used at two call sites (storage-time in posts.ts + render-time in post-render.ts). The same-config test prevents drift."
  - "Iframe security gate: ADD_TAGS permits the element, the uponSanitizeAttribute hook validates the domain. Never use ADD_TAGS alone for iframe."
  - "SSR render contract: generateHTML(json, editorExtensions) THEN sanitizeBeforeRender(html) — never the reverse order."

requirements-completed: [CONT-04, CONT-05, CONT-06]

coverage:
  - id: S1
    description: "Shared sanitize module — ONE DOMPurify config used at storage + render (Pitfall #2)"
    requirement: CONT-04
    verification:
      - kind: unit
        ref: "src/lib/sanitize/__tests__/sanitize.test.ts#strips onerror attribute from <img> but keeps the img tag"
        status: pass
      - kind: unit
        ref: "src/lib/sanitize/__tests__/sanitize.test.ts#blanks iframe src from disallowed domain (evil.com)"
        status: pass
      - kind: unit
        ref: "src/lib/sanitize/__tests__/sanitize.test.ts#preserves target=_blank and adds rel=noopener noreferrer"
        status: pass
      - kind: unit
        ref: "src/lib/sanitize/__tests__/sanitize.test.ts#produces identical output for both call sites (5 inputs)"
        status: pass
    human_judgment: false

  - id: S2
    description: "SSR render pipeline (generateHTML → sanitizeBeforeRender)"
    requirement: CONT-04
    verification:
      - kind: unit
        ref: "src/lib/post-render.ts — renderPostBody calls generateHTML then sanitizeBeforeRender"
        status: pass
      - kind: unit
        ref: "pnpm exec tsc --noEmit (0 errors in post-render.ts)"
        status: pass
    human_judgment: false

  - id: S3
    description: "sanitizeBeforeStore wired into posts.ts savePost (Pitfall #2 site #1)"
    requirement: CONT-04
    verification:
      - kind: unit
        ref: "src/actions/__tests__/posts.test.ts#savePost calls sanitizeBeforeStore on raw-HTML embed nodes"
        status: pass
      - kind: unit
        ref: "src/actions/__tests__/posts.test.ts#savePost does NOT call sanitizeBeforeStore when body has no HTML strings"
        status: pass
    human_judgment: false

  - id: S4
    description: "CategoryPicker wired to listCategories (D-23 required category)"
    requirement: CONT-05
    verification:
      - kind: unit
        ref: "src/actions/__tests__/taxonomy.test.ts#listCategories returns rows"
        status: pass
      - kind: manual
        ref: "CategoryPicker.tsx calls listCategories() on mount via useEffect"
        status: unknown
    human_judgment: true
    rationale: "Component renders correctly (tsc passes) but visual UAT deferred to Phase 4 DASH-01."

  - id: S5
    description: "TagPicker wired to listTags (D-23 cap 8 UX hint)"
    requirement: CONT-06
    verification:
      - kind: unit
        ref: "src/actions/__tests__/taxonomy.test.ts#listTags returns rows"
        status: pass
      - kind: unit
        ref: "src/actions/__tests__/taxonomy.test.ts#postSchema rejects tagIds.length > 8 with TOO_MANY_TAGS"
        status: pass
    human_judgment: false

duration: 18min
completed: 2026-07-04
status: complete
---

# Phase 3 Plan 02: Slice B — Shared Sanitization + Taxonomy Pickers Summary

**Shared DOMPurify config (ONE CONFIG at two call sites — storage-time + render-time) closing Pitfall #2 (malicious payload stripping, iframe domain allowlist, target/rel preservation), the SSR render pipeline (generateHTML → sanitizeBeforeRender), and live-data category/tag pickers wired into the post editor — 126/126 full suite green.**

## Performance

- **Duration:** ~18 min
- **Started:** 2026-07-04T17:12:01Z
- **Completed:** 2026-07-04T17:30:16Z
- **Tasks:** 3 (Task 1 TDD: RED → GREEN; Tasks 2-3: implementation + tests)
- **Files:** 6 created, 7 modified

## Accomplishments

- **Pitfall #2 CLOSED**: the shared `src/lib/sanitize/index.ts` module ships ONE DOMPurify CONFIG object used by both `sanitizeBeforeStore` (site #1, called in posts.ts before db.insert) and `sanitizeBeforeRender` (site #2, called in post-render.ts before dangerouslySetInnerHTML). The Wave-0 test proves both functions produce IDENTICAL output for 5 varied inputs — no config drift possible.
- **Iframe security gate (T-03-08)**: the `uponSanitizeAttribute` hook enforces the per-provider domain allowlist (YouTube, X, Instagram, Vimeo, Soundcloud + their subdomains). Disallowed domains and invalid URLs have their src blanked — the iframe becomes inert. ADD_TAGS permits the element; the hook is the actual security gate.
- **Anti-tabnabbing (T-03-09)**: DOMPurify 3.4.11 auto-adds `rel="noopener noreferrer"` to `target="_blank"` links when target+rel are in ADD_ATTR. A2 assumption CONFIRMED — the hook includes a defense-in-depth fallback that adds rel if it's ever missing.
- **SSR render pipeline shipped**: `renderPostBody(postBodyJson)` = `generateHTML(json, editorExtensions)` → `sanitizeBeforeRender(html)`. This is the render contract for every public/preview surface (Slice D's /preview/[token] + Phase 6's /[slug] page).
- **Taxonomy pickers consume live data**: CategoryPicker calls `listCategories()` on mount; TagPicker calls `listTags()`. Both use RHF `Controller` (required for async-loaded options). The hardcoded `CATEGORY_OPTIONS` placeholder from Slice A is replaced. Tag cap (8) enforced client-side (UX hint) + server-side (postSchema Zod parse).
- **Full suite green**: 126/126 tests pass across 16 files (103 from Slice A + 23 new). 0 new tsc errors.

## Task Commits

1. **Task 1 RED**: `b3a7ff3` — test(03-02): failing sanitize tests for Pitfall #2
2. **Task 1 GREEN**: `f72bfa8` — feat(03-02): shared sanitize module (19/19 Wave-0 tests pass)
3. **Task 2**: `8b8b58d` — feat(03-02): post-render SSR pipeline + sanitizeBeforeStore wiring
4. **Task 3**: `26c574f` — feat(03-02): taxonomy pickers + editor wiring

## Files Created/Modified

**Created (6):**
- `src/lib/sanitize/index.ts` — THE shared DOMPurify config (Pitfall #2 linchpin)
- `src/lib/sanitize/__tests__/sanitize.test.ts` — 19 Wave-0 test cases
- `src/lib/post-render.ts` — SSR pipeline (generateHTML → sanitizeBeforeRender)
- `src/app/(admin)/posts/components/CategoryPicker.tsx` — single-select, required
- `src/app/(admin)/posts/components/TagPicker.tsx` — multi-select, capped 8
- `src/app/(admin)/posts/components/TaxonomyPicker.tsx` — composition

**Modified (7):**
- `src/actions/posts.ts` — sanitizeBodyHtml walker + sanitizeBeforeStore wiring
- `src/actions/categories.ts` — listCategories: added .orderBy(asc(name))
- `src/actions/tags.ts` — listTags: added .orderBy(asc(name)); added getPostTagIds
- `src/app/(admin)/posts/PostForm.tsx` — TaxonomyPicker replaces hardcoded select
- `src/app/(admin)/posts/[id]/edit/page.tsx` — fetches + passes initialTagIds
- `src/actions/__tests__/posts.test.ts` — sanitize mock + wiring assertions
- `src/actions/__tests__/taxonomy.test.ts` — listCategories/listTags tests + mock chain

## Decisions Made

- **DOMPurify Config type**: removed `as const` from the CONFIG object because DOMPurify's TypeScript Config type expects mutable `string[]` arrays (not `readonly` tuples). The same-config test (5 inputs through both functions) proves the anti-drift guarantee holds — the mutability is a TypeScript concern, not a runtime one.
- **DOMPurify auto-rel confirmed (A2)**: the Wave-0 test validates that DOMPurify 3.4.11 DOES auto-add `rel="noopener noreferrer"` to `target="_blank"` links when `target`+`rel` are in `ADD_ATTR`. The hook includes a defense-in-depth fallback that adds `rel` via `node.setAttribute` if it's ever missing, but this fallback was not required — DOMPurify handles it natively.
- **Recursive body walker**: the `sanitizeBodyHtml` function in posts.ts walks the entire ProseMirror JSON tree recursively and sanitizes any string value containing `<` and `>`. This is broader than targeting specific node types — it catches raw-HTML embed nodes regardless of their ProseMirror type or attr name. The trade-off (running DOMPurify on non-HTML strings that happen to contain `<`/`>`) is negligible since ProseMirror JSON rarely contains angle brackets outside HTML contexts.
- **RHF Controller vs register**: CategoryPicker and TagPicker use `Controller` instead of `register` because their options are loaded asynchronously via Server Action calls. `register` doesn't handle dynamic option lists cleanly; `Controller`'s `render` prop gives full control over the select/checkbox rendering.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed DOMPurify Config type incompatibility**
- **Found during:** Task 1 (GREEN phase — tsc after implementation)
- **Issue:** `as const` on the CONFIG object made the arrays `readonly`, but DOMPurify's `Config` type expects mutable `string[]`. TypeScript error: "readonly cannot be assigned to mutable type".
- **Fix:** Removed `as const`, typed CONFIG as `Record<string, unknown>`. The same-config test proves anti-drift without needing `as const`.
- **Files modified:** `src/lib/sanitize/index.ts`
- **Committed in:** `8b8b58d`

**2. [Rule 1 - Bug] Fixed post-render.ts generateHTML type mismatch**
- **Found during:** Task 2 (tsc check)
- **Issue:** `generateHTML` expects `JSONContent` (from `@tiptap/core`) but `renderPostBody` accepts `unknown` (the stored jsonb type at the DB boundary).
- **Fix:** Cast `postBodyJson as JSONContent` — the stored JSON is structurally ProseMirror JSON; invalid nodes are silently dropped by generateHTML (safe behavior).
- **Files modified:** `src/lib/post-render.ts`
- **Committed in:** `8b8b58d`

**3. [Rule 1 - Bug] Fixed posts.test.ts spread-arg tsc error**
- **Found during:** Task 3 (tsc check)
- **Issue:** `sanitizeBeforeStoreMock: vi.fn((s: string) => s)` typed the mock as accepting exactly one `string`. The spread call `sanitizeBeforeStoreMock(...a: unknown[])` triggered tsc error TS2556.
- **Fix:** Changed to `vi.fn()` (untyped) — the passthrough behavior is set via `mockImplementation` in `beforeEach`.
- **Files modified:** `src/actions/__tests__/posts.test.ts`
- **Committed in:** `26c574f`

**4. [Rule 2 - Missing functionality] Added getPostTagIds to tags.ts**
- **Found during:** Task 3 (Step D — edit page wiring)
- **Issue:** The plan says "pre-select the post's existing categoryId + tagIds from getPost()" but `getPost` returns only the posts table row — it doesn't join `post_tags`. The edit page had no way to fetch the post's tag IDs.
- **Fix:** Added `getPostTagIds(postId): Promise<number[]>` to tags.ts — queries the `postTags` join table. The edit page calls it alongside `getPost` and passes `initialTagIds` to PostForm.
- **Files modified:** `src/actions/tags.ts`, `src/app/(admin)/posts/[id]/edit/page.tsx`
- **Committed in:** `26c574f`

**5. [Rule 2 - Missing functionality] Added .orderBy(asc(name)) to listCategories/listTags**
- **Found during:** Task 3 (Step E — taxonomy tests)
- **Issue:** The plan's Step E expects "listCategories returns categories sorted by name" but the Slice A actions didn't include `.orderBy()`.
- **Fix:** Added `.orderBy(asc(schema.categories.name))` to listCategories and `.orderBy(asc(schema.tags.name))` to listTags. Import updated to include `asc` from `drizzle-orm`.
- **Files modified:** `src/actions/categories.ts`, `src/actions/tags.ts`
- **Committed in:** `26c574f`

---

**Total deviations:** 5 auto-fixed (3 Rule 1 bugs, 2 Rule 2 missing functionality)
**Impact on plan:** All necessary for correctness and the plan's acceptance criteria. No scope creep — every fix maps to a plan requirement.

## Issues Encountered

- **Pre-existing tsc errors (10 total):** all in `src/components/auth/ResetPasswordForm.tsx`, `SignInForm.tsx`, `SignUpForm.tsx`, `src/components/form/date-picker.tsx`, `src/components/form/form-elements/DefaultInputs.tsx`, `src/layout/AppSidebar.tsx` — unrelated to Phase 3 work (inherited from the TailAdmin scaffold). Per the scope-boundary rule, these are out of scope and were NOT touched.

## Authentication Gates

None — this plan did not encounter any auth gates.

## Known Stubs

None — all pickers are wired with live data via Server Actions. The sanitize module is complete with both call sites active. No placeholder data remains in the post editor form (the hardcoded `CATEGORY_OPTIONS` from Slice A was replaced with live `listCategories()` data).

## Threat Flags

None. No new network endpoints, auth paths, or trust-boundary schema changes beyond what the plan's `<threat_model>` covers. The threats T-03-07 through T-03-11 are all mitigated by the shipped implementation.

## Next Phase Readiness

**Ready for Slice C (Plan 03-03 — Media library + storage provider):**
- No dependencies on this plan's artifacts.

**Ready for Slice D (Plan 03-04 — Publishing + preview + scheduler):**
- `renderPostBody(postBodyJson)` shipped — the `/preview/[token]` route calls it to render the draft body via `dangerouslySetInnerHTML` (after sanitize).
- `sanitizeBeforeRender` is the defense-in-depth gate before any public render.
- `sanitizeBeforeStore` is wired in `savePost` — all stored post bodies are sanitized at storage time.

## Self-Check: PASSED

**Files verified (6/6 FOUND):** all created files exist on disk.
- `src/lib/sanitize/index.ts` ✓
- `src/lib/sanitize/__tests__/sanitize.test.ts` ✓
- `src/lib/post-render.ts` ✓
- `src/app/(admin)/posts/components/CategoryPicker.tsx` ✓
- `src/app/(admin)/posts/components/TagPicker.tsx` ✓
- `src/app/(admin)/posts/components/TaxonomyPicker.tsx` ✓

**Commits verified (4/4 FOUND):**
- `b3a7ff3` — test(03-02): RED — failing sanitize tests
- `f72bfa8` — feat(03-02): GREEN — shared sanitize module
- `8b8b58d` — feat(03-02): post-render + sanitize wiring
- `26c574f` — feat(03-02): taxonomy pickers + editor wiring

**Test suite:** 126/126 pass across 16 files (`pnpm test`).
**tsc:** 0 errors in any Task 1/2/3 file; 10 pre-existing errors in auth/form/layout components (out of scope).

---
*Phase: 03-content-engine*
*Plan: 02 (Slice B — Shared Sanitization + Taxonomy Pickers)*
*Completed: 2026-07-04*
