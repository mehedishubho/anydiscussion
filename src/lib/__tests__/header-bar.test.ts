// src/lib/__tests__/header-bar.test.ts
// [CITED: 260823-79v-PLAN.md Task 2 <behavior> — boundHeaderBarCategories]
// [CITED: 260823-79v-PLAN.md locked decision 2 — row 2 lists REAL DB categories, bounded ~10, most-published first]
//
// Tests for the pure header-bar helper (src/lib/header-bar.ts). The helper is
// pure (no db/react/next imports — same posture as src/lib/footer-links.ts),
// so node-env vitest imports it directly with no DB mocks.

import { describe, it, expect } from "vitest";
import { boundHeaderBarCategories } from "../header-bar";
import type { FooterCategoryLite } from "../footer-links";

describe("boundHeaderBarCategories — bounded most-published-first header bar (locked decision 2)", () => {
  it("returns an empty array for empty input", () => {
    expect(boundHeaderBarCategories([])).toEqual([]);
  });

  it("bounds to the default limit 10 — 11 categories in, the 10 highest postCounts out", () => {
    const eleven: FooterCategoryLite[] = Array.from({ length: 11 }, (_, i) => ({
      name: `Cat ${i + 1}`,
      slug: `cat-${i + 1}`,
      postCount: i + 1,
    }));
    const bar = boundHeaderBarCategories(eleven);
    expect(bar).toHaveLength(10);
    // cat-11 (11 posts) is the highest; cat-1 (1 post) is the dropped one.
    expect(bar.map((c) => c.slug)).toEqual([
      "cat-11",
      "cat-10",
      "cat-9",
      "cat-8",
      "cat-7",
      "cat-6",
      "cat-5",
      "cat-4",
      "cat-3",
      "cat-2",
    ]);
  });

  it("honors a custom limit (e.g., 3 of 5 in — 3 out, most-published first)", () => {
    const five: FooterCategoryLite[] = [
      { name: "Travel", slug: "travel", postCount: 2 },
      { name: "Beta", slug: "beta", postCount: 9 },
      { name: "Tech", slug: "tech", postCount: 4 },
      { name: "Alpha", slug: "alpha", postCount: 7 },
      { name: "Food", slug: "food", postCount: 0 },
    ];
    expect(boundHeaderBarCategories(five, 3).map((c) => c.slug)).toEqual([
      "beta",
      "alpha",
      "tech",
    ]);
  });

  it("sorts by postCount descending with a name-ascending localeCompare tie-break", () => {
    const cats: FooterCategoryLite[] = [
      { name: "Travel", slug: "travel", postCount: 3 },
      { name: "Beta", slug: "beta", postCount: 10 },
      { name: "Tech", slug: "tech", postCount: 7 },
      { name: "Alpha", slug: "alpha", postCount: 10 },
    ];
    expect(boundHeaderBarCategories(cats).map((c) => c.slug)).toEqual([
      "alpha",
      "beta",
      "tech",
      "travel",
    ]);
  });

  it("does not mutate the input array (original order and length preserved)", () => {
    const input: FooterCategoryLite[] = [
      { name: "Travel", slug: "travel", postCount: 3 },
      { name: "Alpha", slug: "alpha", postCount: 10 },
      { name: "Mid", slug: "mid", postCount: 5 },
    ];
    const snapshot = [...input];
    boundHeaderBarCategories(input);
    expect(input).toEqual(snapshot);
    expect(input).toHaveLength(3);
  });

  it("accepts rows carrying extra fields — listCategoriesWithCounts rows structurally satisfy the category-lite shape", () => {
    // Shape returned by listCategoriesWithCounts (src/lib/queries/taxonomy):
    // { id, name, slug, description, postCount } — id/description ride along.
    const dbRows = [
      { id: 1, name: "Tech", slug: "tech", description: "Tech posts", postCount: 4 },
      { id: 2, name: "Travel", slug: "travel", description: null, postCount: 12 },
      { id: 3, name: "Food", slug: "food", description: "Recipes", postCount: 6 },
    ];
    const bar = boundHeaderBarCategories(dbRows);
    expect(bar.map((c) => c.slug)).toEqual(["travel", "food", "tech"]);
    // Extra fields survive the copy-sort-slice pipeline untouched.
    expect(bar[0]).toEqual({
      id: 2,
      name: "Travel",
      slug: "travel",
      description: null,
      postCount: 12,
    });
  });
});
