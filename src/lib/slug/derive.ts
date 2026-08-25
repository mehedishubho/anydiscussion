// src/lib/slug/derive.ts
// [CITED: 05-07-PLAN.md Task 2 — pure deriveSlugFromTitle helper]
// [CITED: 03-CONTEXT.md D-20 — slugs are manual Latin; STRIP to regex, never transliterate]
// [CITED: src/lib/slug/index.ts — the D-20 boundary this mirrors]
//
// PURE module — ZERO imports. Deliberately NOT added to src/lib/slug/index.ts:
// that file imports the db (server-only) and PostForm is a client component.
// This helper exists purely for the dashboard slug UX (auto-fill from title
// while the user has not typed a slug); the server contract is unchanged —
// savePost still runs postSchema parse + validateSlug + assertUniqueSlug.
//
// D-20 boundary (mirrors src/lib/slug/index.ts): this is STRIP-to-regex,
// never transliteration. Bangla-to-Latin transliteration is explicitly out of
// scope for v1 — a fully-Bangla title derives "" and the now-loud slug
// validation (toast + focus, wired in PostForm) catches it.
//
// The derivation: lowercase, replace every character outside [a-z0-9] with a
// hyphen, collapse consecutive hyphens, trim leading/trailing hyphens. ""
// when nothing survives.

/**
 * Derive a URL-safe slug fragment from a free-text title by stripping every
 * character outside [a-z0-9] (lowercased) to a hyphen separator.
 *
 * @returns the derived slug ("" when the title contains no [a-z0-9] characters —
 *          e.g. a fully-Bangla title; callers surface that loudly via validation).
 */
export function deriveSlugFromTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+/, "")
    .replace(/-+$/, "");
}
