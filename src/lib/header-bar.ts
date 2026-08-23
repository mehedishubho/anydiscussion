// src/lib/header-bar.ts
// [CITED: 260823-79v-PLAN.md Task 2 — pure header-bar helper (boundHeaderBarCategories)]
// [CITED: 260823-79v-PLAN.md locked decision 2 — row 2 lists REAL DB categories, bounded ~10, most-published first]
// [CITED: 260823-79v-PLAN.md locked decision 4 — mobile keeps the scrolling category strip as its only navigation]
//
// Pure helper backing SiteHeader row 2 (the sticky gray category bar).
// SiteHeader.tsx is a server component awaiting cached reads, so the testable
// bound/sort logic lives in this separate pure module — same posture as
// src/lib/footer-links.ts (node-env vitest can import it with no DB mocks).
//
// Pure module — no db, no react, no next imports. No client directives.

import type { FooterCategoryLite } from "@/lib/footer-links";

/**
 * boundHeaderBarCategories — the header row-2 category bar source (locked
 * decision 2's "bounded ~10").
 *
 * Non-mutating: copies the input, sorts by postCount descending with a
 * name-ascending (localeCompare) tie-break BEFORE slicing — the same
 * comparator semantics as boundFooterCategories (deliberate consistency) —
 * then slices to `limit` (default 10). Rows from listCategoriesWithCounts
 * (src/lib/queries/taxonomy) structurally satisfy FooterCategoryLite; the
 * generic signature preserves each row's full type (e.g. `id` for React
 * keys) through the copy-sort-slice pipeline — extra fields ride along
 * untouched.
 *
 * Most-published categories fill the bar; zero-count ones only appear when
 * the roster is short. Horizontal overflow in the bar markup (Task 3) is the
 * degrade path for many/long (Bangla) names — no truncation logic here.
 */
export function boundHeaderBarCategories<T extends FooterCategoryLite>(
  categories: readonly T[],
  limit = 10,
): T[] {
  return [...categories]
    .sort(
      (a, b) => b.postCount - a.postCount || a.name.localeCompare(b.name),
    )
    .slice(0, limit);
}
