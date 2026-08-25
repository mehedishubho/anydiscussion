---
phase: 05-seo-basics
reviewed: 2026-08-25T18:20:18Z
depth: standard
files_reviewed: 7
files_reviewed_list:
  - src/lib/slug/derive.ts
  - src/lib/slug/__tests__/derive.test.ts
  - src/app/globals.css
  - src/components/editor/extensions.ts
  - src/components/editor/TiptapEditor.tsx
  - src/actions/posts-schema.ts
  - src/app/(admin)/dashboard/posts/PostForm.tsx
findings:
  critical: 0
  warning: 2
  info: 4
  total: 6
status: issues_found
---

# Phase 5: Code Review Report (Gap-Closure 05-07 Scope)

**Reviewed:** 2026-08-25T18:20:18Z
**Depth:** standard
**Files Reviewed:** 7
**Status:** issues_found

## Summary

Scoped re-review of the 05-07 gap-closure commits (b84f952, 38ace32; merged as 981c3ab) only — the prior full-phase review (48 files) and its 3 fixed Criticals are out of scope. All 7 in-scope files were read in full; supporting files were cross-referenced to verify claims (CategoryPicker's `id={name}`, SeoPanel field ids, EditorProvider's `next/dynamic({ssr:false})`, the round-trip test's shared-array import, installed `@tiptap/extensions@3.27.1` Placeholder source, installed `@tiptap/react` EditorContent mount logic). Targeted suites re-run: `pnpm vitest run src/lib/slug src/components/editor` — 32/32 green.

**Verified sound (adversarial checks that did NOT yield findings):**

- `deriveSlugFromTitle` is correct for the D-20 contract: lowercase → strip `[^a-z0-9]+` to single hyphen → trim; Bangla-only titles derive `""` (no transliteration); mixed Bangla titles derive the Latin fragment; output is always `[a-z0-9-]` so it cannot inject into URLs, and the server chain (`postSchema` regex + `validateSlug` + `assertUniqueSlug`) is untouched.
- Zod 4 constructor error verified empirically against the installed zod: `undefined`, `null`, `NaN`, and string inputs all report "Category is required" — the previously cryptic missing-category path is closed.
- Placeholder server-safety holds: `generateHTML` walks the schema only and never instantiates plugin views (the v3 Placeholder's viewport-tracking plugin — scroll listeners, ResizeObserver, dispatched transactions — is client-only). The round-trip test imports the SAME shared `editorExtensions` array, so Placeholder is inside the parity gate; all editor tests green in jsdom.
- `immediatelyRender: true` is safe — `EditorProvider.tsx:18-21` confirms `next/dynamic(..., { ssr: false })`, so there is no SSR/hydration surface.
- globals.css `@plugin "@tailwindcss/typography"` sits immediately after `@import 'tailwindcss'` (correct Tailwind v4 CSS-first ordering); the surface rules are scoped under `.tiptap.ProseMirror`, which matches zero nodes on the public site (no contenteditable there) — no leak.
- onInvalid focus targets exist: `title`/`slug` inputs carry ids, CategoryPicker renders `id={name}` (= `categoryId`) on its `<select>`, all four SeoPanel fields carry ids matching field names; id-less fields (tagIds, hidden featureImage, body) degrade to toast-only as documented. No duplicate-id collisions (PageForm's ids render on a different route).
- No XSS surface: `data-placeholder` is a static string, `content: attr(data-placeholder)` cannot execute script, and derived slugs are regex-constrained before touching URLs.

Two Warnings found, both in the interaction details of the new code, plus four Info polish items. No Criticals.

## Warnings

### WR-01: `min-height: inherit` chain is broken — the contenteditable does not fill the 350px wrapper

**File:** `src/app/globals.css:310-318` (with `src/components/editor/TiptapEditor.tsx:151-153`)
**Issue:** The rule's stated purpose ("Fill the wrapper's min-h-[350px] so the white writing area is tall") does not hold. `EditorContent` does not render the `.tiptap.ProseMirror` element directly under the `min-h-[350px]` prose wrapper — `@tiptap/react@3.27.1`'s `PureEditorContent` renders its own bare container `<div>` (`<div ref={...} {...rest} />`, no className since none is passed) and then appends `editor.view.dom` into it (verified in `node_modules/@tiptap/react/dist/index.js`, `init()` → `element.append(...editor.view.dom.parentNode.childNodes)`). Actual DOM: `wrapper(min-h-[350px]) > bare div > .tiptap.ProseMirror`. CSS `min-height: inherit` takes the *parent's* computed value — the bare container div's min-height is `auto` (computes to 0 for a block box), so the contenteditable inherits 0, not 350px. Consequence: the white area still looks 350px tall (the wrapper carries the min-height), but the actual editable/clickable surface is only ~one line tall — clicking in the lower empty area of the white box does not focus the editor, defeating the point of the rule. No test covers this (the surface smoke test asserts only `.tiptap.ProseMirror` existence, not height), and the D2 human-judgment UAT walkthrough has not run yet — so this is currently unverified-by-anyone.
**Fix:** Carry the height through the container div, e.g. in `TiptapEditor.tsx`:

```tsx
<EditorContent editor={editor} className="min-h-[inherit] sm:min-h-[inherit]" />
```

(`EditorContent` spreads props onto its container div.) Then `.tiptap.ProseMirror { min-height: inherit }` inherits 350px from the container. Alternatively, in globals.css target the container: `.prose > div:has(> .tiptap.ProseMirror) { min-height: inherit; }` — but the `EditorContent` className is the cleanest chain.

### WR-02: `slugTouched`-on-blur defeats auto-derive for keyboard users and refills a slug the user just cleared

**File:** `src/app/(admin)/dashboard/posts/PostForm.tsx:116-129, 283-290`
**Issue:** The ownership signal for the slug field is `onBlur` (`slugTouched.current = true`). Two misbehaviors follow:

1. **Tab-through disables auto-derive without any typing.** The slug input is between title and excerpt in tab order. A keyboard user who tabs title → slug → excerpt has "blurred" the slug without ever typing in it: `slugTouched` becomes true and auto-derive is permanently off, even though the must-have truth is "auto-fills from the Title while the user has not typed a slug". Same for click-into-slug-then-click-away. Submit then fails with "Slug is required" — loud, but the shipped feature silently disabled itself for a user who never typed a slug.
2. **Clear-and-retype is corrupted by mid-interaction refill.** User clicks into the auto-filled slug ("hello-world"), selects all, hits Delete (no blur — still focused), pauses: `slugValue` becomes `""`, `slugTouched` is still false, so the effect immediately `setValue("slug", "hello-world")` again — under their cursor, with the caret moved to end. Their next keystrokes APPEND to the refilled value ("hello-worldnews" instead of "news"). If unnoticed, a wrong-but-regex-valid slug publishes. This violates the never-overwrite invariant for the clearing interaction.

Root cause: blur is the wrong "user owns this field" signal; any user edit (including deleting to empty) is the correct one, and RHF's merged custom `onChange` fires only for user input — programmatic `setValue` does not fire it, so auto-fill itself would not trip the flag.
**Fix:** Move the ownership signal from `onBlur` to `onChange`:

```tsx
{...register("slug", {
  onChange: () => {
    slugTouched.current = true; // any user edit (incl. clear-to-empty) owns the field
  },
})}
```

This fixes both edges: tab-through never fires `onChange` (auto-derive keeps working); select-all+delete fires it once (no refill, clean retype). Drop the `onBlur` handler entirely.

## Info

### IN-01: `.int()` path still yields a cryptic Zod default message

**File:** `src/actions/posts-schema.ts:35`
**Issue:** Empirically probed against the installed zod: every path now reads "Category is required" (undefined/null/NaN/string/zero/negative) EXCEPT a non-integer number, which returns Zod's default "Invalid input: expected int, received number". Unreachable from the `<select>` UI (options carry integer ids), but it is the one remaining cryptic path on this field and the fix is one word.
**Fix:** `z.number({ error: "Category is required" }).int("Category is required").positive("Category is required")`.

### IN-02: Dead regex step in `deriveSlugFromTitle`

**File:** `src/lib/slug/derive.ts:32`
**Issue:** `.replace(/-+/g, "-")` is unreachable as a collapse step: the preceding `[^a-z0-9]+` replacement already consumes every hyphen (hyphens match the negated class) and emits single hyphens, so consecutive hyphens cannot exist at that point. Harmless belt-and-braces, but it reads as load-bearing.
**Fix:** Remove the step, or keep it with a comment saying it is redundant defense. Removing is cleaner — the tests already pin collapse behavior.

### IN-03: onInvalid surfaces raw Zod defaults and code-like strings into user-facing toasts

**File:** `src/app/(admin)/dashboard/posts/PostForm.tsx:169-173` (messages sourced from `src/actions/posts-schema.ts:20, 36`)
**Issue:** The gap-closure's goal was "no cryptic messages", but onInvalid toasts `message` verbatim for every field. Fields without custom messages still surface Zod 4 defaults ("Too big: expected string to have at most 255 elements" for title/metaTitle caps) and `tagIds.max` surfaces the code-like constant "TOO_MANY_TAGS" directly to the user. Readable-ish, but inconsistent with the bar this change set for categoryId.
**Fix:** Add human custom messages to the few user-facing caps (`title.max(255, "Title is too long (max 255)")`, `tagIds.max(8, "Maximum 8 tags")`, same for metaTitle/metaDescription/excerpt caps) — the schema is shared, so the server error path improves too.

### IN-04: Placeholder CSS misses the empty-heading-first case

**File:** `src/app/globals.css:326`
**Issue:** The selector is `p.is-empty:first-child`. If the document's first block is an empty heading (e.g. user formatted the first line as a heading, then deleted the text), the editor is visually empty but shows no placeholder — the decoration is painted on the `<h1>` (showOnlyCurrent:false paints all empty textblocks) but the CSS only matches `p`. Cosmetic edge.
**Fix:** Broaden to `.tiptap.ProseMirror > .is-empty:first-child::before` (any textblock tag) if the heading case matters, or accept as-is and note it.

---

_Reviewed: 2026-08-25T18:20:18Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
