// src/lib/seo/validation.ts
// [CITED: 05-CONTEXT.md D-10 — Bangla-aware meta validation: grapheme count, NOT Latin-char limits]
// [CITED: 05-RESEARCH.md Code Example 1 (L760-805) + Pitfall 3 (L719-732) — Intl.Segmenter grapheme rule]
// [CITED: CLAUDE.md "SEO requirements" — "validate by reasonable byte/character count, not Latin-style limits"]
//
// The shared SEO meta-validation schema. Reused client-side (post-editor SEO panel,
// Plan 03 D-08) AND server-side (savePost / savePage actions). The grapheme rule
// (SEO-06) replaces the Latin `.length` heuristic that would falsely reject valid
// Bangla descriptions (a 59-grapheme Bangla string is 84 UTF-16 units / 220 bytes
// but visually ~60 chars — well within Google's pixel limit).
//
// Server-only — NO "use client" directive (the same schema is imported client-side;
// it has no server-only deps so it is safe to bundle both ways).

import { z } from "zod";

/** Max grapheme clusters for a meta title (Latin ~50-60 fit; Bangla ~50-70). */
export const TITLE_MAX_GRAPHEMES = 80;

/** Max grapheme clusters for a meta description (Latin ~155 fit; Bangla ~140-180). */
export const DESC_MAX_GRAPHEMES = 200;

/**
 * Count user-perceived characters (grapheme clusters) — the only script-agnostic
 * metric. `.length` counts UTF-16 code units (inflated by Bangla combining marks);
 * bytes triple-count each Bengali code point. Google truncates by pixel width;
 * graphemes are the closest proxy available in JS.
 *
 * Verified on Node 24.15.0 for 'bn' locale — a sample 59-grapheme Bangla string
 * is 84 UTF-16 code units and 220 bytes (05-RESEARCH.md Pitfall 3).
 *
 * @param s      The string to measure.
 * @param locale BCP-47 locale tag (default "en"; pass "bn" for Bangla-aware segmentation).
 */
export function graphemeCount(s: string, locale = "en"): number {
  const segmenter = new Intl.Segmenter(locale, { granularity: "grapheme" });
  return [...segmenter.segment(s)].length;
}

/**
 * Shared SEO meta schema. The hard `.max()` caps are UTF-16 code-unit ceilings
 * (a safety net); the `.refine()` rules enforce the grapheme rule (SEO-06).
 */
export const seoMetaSchema = z.object({
  metaTitle: z
    .string()
    .max(255, "Meta title too long")
    .refine(
      (v) => !v || graphemeCount(v) <= TITLE_MAX_GRAPHEMES,
      `Title exceeds ${TITLE_MAX_GRAPHEMES} grapheme clusters (Google may truncate)`,
    )
    .optional(),
  metaDescription: z
    .string()
    .max(600, "Meta description too long")
    .refine(
      (v) => !v || graphemeCount(v) <= DESC_MAX_GRAPHEMES,
      `Description exceeds ${DESC_MAX_GRAPHEMES} grapheme clusters (Google may truncate)`,
    )
    .optional(),
  ogImage: z.string().url().optional().or(z.literal("")),
  canonicalUrl: z.string().url().optional().or(z.literal("")),
});

export type SeoMetaInput = z.input<typeof seoMetaSchema>;
