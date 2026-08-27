// src/lib/list-filters.ts
// [CITED: 260827-se8-PLAN.md Task 2 <action> step 1 — extraction target]
// [CITED: src/app/(site)/search/page.tsx L41-95 — VERBATIM extraction source]
//
// The shared URL-searchParams coercion helpers for every dashboard list page
// (posts / users / categories / media — 260827-se8 Tasks 4-7). All four pages
// parse the same raw searchParams shape the public search page already
// handles, so the coercion lives ONCE here instead of four private copies.
//
// Input-validation rationale carried over from the (site)/search/page.tsx
// parseSearch docblock (V5/V8 ASVS):
//   URL searchParams can carry `string | string[] | undefined` per key; the
//   filter bar emits one value per key, but a tampered URL may send
//   duplicates. Each value is flattened to its first entry, trimmed,
//   length-bounded, and coerced before it reaches a query. Bad types fall
//   back to safe defaults rather than throwing. Manual parsing (not Zod
//   preprocess) avoids API drift across Zod versions and keeps the boundary
//   explicit — every coercion is visible.
//
// Pure module: NO server-only imports, no "use server"/"use client" — safe
// to import from Server Components (page.tsx parsers) and client components
// alike.
/**
 * Read the first value of a string | string[] | undefined (URL searchParams
 * shape) — duplicated/tampered params flatten to their first entry.
 */
export function firstValue(
  v: string | string[] | undefined,
): string | undefined {
  if (Array.isArray(v)) return v[0];
  return v;
}

/** Trim + length-bound a string searchParam (empty when absent). */
export function bounded(v: string | undefined, max: number): string {
  const s = (v ?? "").trim();
  return s.slice(0, max);
}

/** Parse the page number (≥1, ≤1000 — bounds prevent offset abuse). */
export function clampPage(v: string | undefined): number {
  const n = Number.parseInt((v ?? "1").trim(), 10);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(n, 1000);
}

/**
 * Uniform dashboard list page size (260827-se8 decision): posts, users,
 * categories, media, and the notification bell all paginate 20 rows per
 * page — one constant, not five coincidentally-equal literals.
 */
export const DASHBOARD_PAGE_SIZE = 20;
