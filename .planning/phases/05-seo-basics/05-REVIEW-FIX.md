---
phase: 05-seo-basics
fixed_at: 2026-08-25T20:22:01Z
review_path: .planning/phases/05-seo-basics/05-REVIEW.md
iteration: 1
findings_in_scope: 2
fixed: 2
skipped: 0
status: all_fixed
---

# Phase 5: Code Review Fix Report (Gap-Closure 05-07 Scope)

**Fixed at:** 2026-08-25T20:22:01Z
**Source review:** .planning/phases/05-seo-basics/05-REVIEW.md (committed 550089a)
**Iteration:** 1
**Fix scope:** critical_warning (user-selected — Critical + Warning only)

**Summary:**
- Findings in scope: 2 (0 Critical, 2 Warning)
- Fixed: 2
- Skipped: 0
- Out of scope by user selection: IN-01, IN-02, IN-03, IN-04 (Info tier — not attempted)

**Verification:**
- Targeted suites after each fix: `src/components/editor` 15/15 green; `src/app/(admin)/dashboard/posts` 3/3 green
- Full suite: 599/599 passed (baseline 595 + 4 new tests: 1 WR-01 surface pin + 3 WR-02 PostForm pins)
- `tsc --noEmit`: exactly main's 4 documented pre-existing errors (`src/actions/__tests__/storage-settings.test.ts` TS18048 x4) — no new errors from the fix delta. (Note: the scratch worktree initially showed 8 extra TS2322 errors; those traced to the gitignored build-generated `next-env.d.ts` being absent from the fresh worktree, not to any fix file — reproducing the file made them vanish.)
- WR-02 tests proven load-bearing: run against the pre-fix PostForm, the two new failure-mode tests fail (`expected '' to be 'hello-world'` / `expected 'hello-world' to be ''`); against the fix they pass.

## Fixed Issues

### WR-01: `min-height: inherit` chain is broken — the contenteditable does not fill the 350px wrapper

**Files modified:** `src/components/editor/TiptapEditor.tsx`, `src/app/globals.css`, `src/components/editor/__tests__/tiptap-editor-surface.test.tsx`
**Commit:** 657ff3e
**Applied fix:** Verified the reviewer's premise against the installed `@tiptap/react@3.27.1` (`PureEditorContent.render()` spreads `...rest` onto a bare container `<div>`). Bridged the chain via `<EditorContent editor={editor} className="min-h-[inherit]" />` — the container now inherits the wrapper's computed `min-h-[350px]`, and the existing `.tiptap.ProseMirror { min-height: inherit }` globals.css rule resolves against the container instead of `auto`. The wrapper carries no responsive min-height variants (only `min-h-[350px]`), so the single `min-h-[inherit]` bridge suffices — the reviewer's speculative `sm:min-h-[inherit]` variant was unnecessary and omitted. The globals.css rule itself is unchanged (still correct once bridged); both files' comments now document the two-link chain so it is not re-broken. Extended `tiptap-editor-surface.test.tsx` with a DOM-chain pin: contenteditable -> parent container `DIV` carrying `min-h-[inherit]` -> grandparent wrapper carrying `min-h-[350px] prose` (passes; jsdom cannot compute CSS inheritance, so pixel-level rendering remains covered by the pending D2 human UAT walkthrough — **fixed: requires human verification** for the visual confirmation that the 350px white area is fully clickable).

### WR-02: `slugTouched`-on-blur defeats auto-derive for keyboard users and refills a slug the user just cleared

**Files modified:** `src/app/(admin)/dashboard/posts/PostForm.tsx`, `src/app/(admin)/dashboard/posts/__tests__/PostForm.test.tsx` (new)
**Commit:** e12cb59
**Applied fix:** Moved the slug ownership signal from the `register("slug", { onBlur })` handler to `register("slug", { onChange })` and removed the blur handler entirely. RHF fires the merged custom `onChange` only on real user input — programmatic `setValue` from the derive effect never trips it — so: tab/click-through without typing no longer disables auto-derive, and select-all+Delete while still focused fires `onChange` once (field owned, no mid-interaction refill). Comments at both the ref and the register site updated to state the WR-02 rationale. PostForm had no test file; created `src/app/(admin)/dashboard/posts/__tests__/PostForm.test.tsx` following the existing BackupSettingsForm/SignInForm patterns (jsdom pragma, vi.hoisted action mocks for `@/actions/posts`, null stubs for EditorProvider/MediaPicker/TaxonomyPicker, real SeoPanel, QueryClientProvider wrapper) with three pins: (1) focus+blur without typing does not disable derive; (2) clearing while focused does not refill; (3) a user-typed slug is never overwritten by later title edits. Pins (1) and (2) were verified to FAIL against the pre-fix code before committing the fix.

## Out of Scope (user selection)

IN-01 (cryptic `.int()` Zod default), IN-02 (dead regex step in `deriveSlugFromTitle`), IN-03 (raw Zod defaults / `TOO_MANY_TAGS` in onInvalid toasts), IN-04 (placeholder CSS misses empty-heading-first case) — Info-tier findings excluded from this fix pass per the user's Critical+Warning scope selection. See 05-REVIEW.md for the recorded fix directions.

---

_Fixed: 2026-08-25T20:22:01Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
