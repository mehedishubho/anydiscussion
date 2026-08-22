// src/lib/__tests__/footer-links.test.ts
// [CITED: 260823-6je-PLAN.md Task 1 <behavior> — pickSocialLinks + boundFooterCategories]
// [CITED: 260823-6je-PLAN.md locked decision 3 — configured-only social circles, no dead links]
// [CITED: 260823-6je-PLAN.md locked decision 7 — dynamic footer Categories bounded ~6]
//
// Tests for the pure footer helpers (src/lib/footer-links.ts). Both helpers are
// pure (no db/react/next imports — same posture as src/lib/post-card.ts), so
// node-env vitest imports them directly with no DB mocks.

import { describe, it, expect } from "vitest";
import {
  pickSocialLinks,
  boundFooterCategories,
  type FooterCategoryLite,
} from "../footer-links";

describe("pickSocialLinks — configured-only social circles (locked decision 3)", () => {
  it("returns an empty array when all three keys are null", () => {
    expect(
      pickSocialLinks({ twitter: null, facebook: null, linkedin: null }),
    ).toEqual([]);
  });

  it("treats whitespace-only and empty strings as unset (no dead links)", () => {
    expect(
      pickSocialLinks({ twitter: "   ", facebook: "", linkedin: null }),
    ).toEqual([]);
  });

  it("returns only configured keys, in declared order, with aria labels and trimmed URLs", () => {
    expect(
      pickSocialLinks({
        twitter: null,
        facebook: "  https://facebook.com/anydiscussion  ",
        linkedin: "https://linkedin.com/company/anydiscussion",
      }),
    ).toEqual([
      {
        key: "facebook",
        label: "Facebook",
        url: "https://facebook.com/anydiscussion",
      },
      {
        key: "linkedin",
        label: "LinkedIn",
        url: "https://linkedin.com/company/anydiscussion",
      },
    ]);
  });

  it("keeps the twitter → facebook → linkedin order when all three are configured", () => {
    const links = pickSocialLinks({
      linkedin: "https://linkedin.com/company/anydiscussion",
      facebook: "https://facebook.com/anydiscussion",
      twitter: "https://x.com/anydiscussion",
    });
    expect(links.map((l) => l.key)).toEqual([
      "twitter",
      "facebook",
      "linkedin",
    ]);
    expect(links[0]).toEqual({
      key: "twitter",
      label: "Twitter / X",
      url: "https://x.com/anydiscussion",
    });
  });
});

describe("boundFooterCategories — bounded most-published-first column (locked decision 7)", () => {
  it("sorts by postCount descending with a name-ascending tie-break", () => {
    const cats: FooterCategoryLite[] = [
      { name: "Travel", slug: "travel", postCount: 3 },
      { name: "Beta", slug: "beta", postCount: 10 },
      { name: "Tech", slug: "tech", postCount: 7 },
      { name: "Alpha", slug: "alpha", postCount: 10 },
    ];
    expect(boundFooterCategories(cats).map((c) => c.slug)).toEqual([
      "alpha",
      "beta",
      "tech",
      "travel",
    ]);
  });

  it("bounds to the default limit 6 — 7 categories in, the 6 most-posted out", () => {
    const seven: FooterCategoryLite[] = [
      { name: "C1", slug: "c1", postCount: 1 },
      { name: "C2", slug: "c2", postCount: 2 },
      { name: "C3", slug: "c3", postCount: 3 },
      { name: "C4", slug: "c4", postCount: 4 },
      { name: "C5", slug: "c5", postCount: 5 },
      { name: "C6", slug: "c6", postCount: 6 },
      { name: "C7", slug: "c7", postCount: 7 },
    ];
    expect(boundFooterCategories(seven).map((c) => c.slug)).toEqual([
      "c7",
      "c6",
      "c5",
      "c4",
      "c3",
      "c2",
    ]);
  });

  it("honors a custom limit (e.g., 3)", () => {
    const seven: FooterCategoryLite[] = [
      { name: "C1", slug: "c1", postCount: 1 },
      { name: "C2", slug: "c2", postCount: 2 },
      { name: "C3", slug: "c3", postCount: 3 },
      { name: "C4", slug: "c4", postCount: 4 },
      { name: "C5", slug: "c5", postCount: 5 },
      { name: "C6", slug: "c6", postCount: 6 },
      { name: "C7", slug: "c7", postCount: 7 },
    ];
    expect(boundFooterCategories(seven, 3).map((c) => c.slug)).toEqual([
      "c7",
      "c6",
      "c5",
    ]);
  });

  it("returns an empty array for empty input", () => {
    expect(boundFooterCategories([])).toEqual([]);
  });

  it("does not mutate the input array", () => {
    const input: FooterCategoryLite[] = [
      { name: "Travel", slug: "travel", postCount: 3 },
      { name: "Alpha", slug: "alpha", postCount: 10 },
    ];
    const snapshot = [...input];
    boundFooterCategories(input);
    expect(input).toEqual(snapshot);
  });
});
