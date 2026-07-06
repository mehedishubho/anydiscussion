// src/lib/seo/__tests__/validation.test.ts
// [CITED: 05-VALIDATION.md row "05-01-T2" — SEO-06 grapheme rule]
// [CITED: 05-RESEARCH.md Code Example 1 (L760-805) + Pitfall 3 (L719-732)]
//
// Validates the SEO-06 rule: Bangla-aware grapheme counting via Intl.Segmenter,
// NOT Latin `.length` or byte count. The 59-grapheme Bangla fixture PASSES; the
// 250-grapheme Latin fixture FAILS the refine.

import { describe, it, expect } from "vitest";
import {
  seoMetaSchema,
  graphemeCount,
  TITLE_MAX_GRAPHEMES,
  DESC_MAX_GRAPHEMES,
} from "../validation";
import {
  BANLA_59_GRAPHEMES,
  LATIN_250_GRAPHEMES,
} from "./shared-fixtures";

describe("SEO-06 / D-10: graphemeCount — Intl.Segmenter grapheme clusters", () => {
  it("counts Latin characters 1:1", () => {
    expect(graphemeCount("hello world")).toBe(11);
  });

  it("counts the empirical Bangla fixture as 59 graphemes (NOT 97 UTF-16 units)", () => {
    const count = graphemeCount(BANLA_59_GRAPHEMES, "bn");
    expect(count).toBe(59);
    // Demonstrate the false-rejection danger: .length is 97, bytes are 264.
    expect(BANLA_59_GRAPHEMES.length).toBeGreaterThan(59);
  });

  it("counts the 250-grapheme Latin string as 250", () => {
    expect(graphemeCount(LATIN_250_GRAPHEMES)).toBe(250);
  });
});

describe("SEO-06 / D-10: seoMetaSchema — Bangla passes, Latin over-long fails", () => {
  it("exports TITLE_MAX_GRAPHEMES=80 and DESC_MAX_GRAPHEMES=200", () => {
    expect(TITLE_MAX_GRAPHEMES).toBe(80);
    expect(DESC_MAX_GRAPHEMES).toBe(200);
  });

  it("PASS: 59-grapheme Bangla metaDescription is accepted (not falsely rejected)", () => {
    const r = seoMetaSchema.safeParse({
      metaTitle: "বাংলা ব্লগ পোস্ট",
      metaDescription: BANLA_59_GRAPHEMES,
    });
    expect(r.success).toBe(true);
  });

  it("PASS: empty/undefined fields are accepted (all optional)", () => {
    expect(seoMetaSchema.safeParse({}).success).toBe(true);
    expect(
      seoMetaSchema.safeParse({ metaTitle: undefined, metaDescription: undefined })
        .success,
    ).toBe(true);
  });

  it("FAIL: 250-grapheme Latin metaDescription is rejected by the grapheme refine", () => {
    const r = seoMetaSchema.safeParse({
      metaDescription: LATIN_250_GRAPHEMES,
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0].message).toMatch(/grapheme/i);
    }
  });

  it("FAIL: a meta title over 80 graphemes is rejected", () => {
    const longTitle = "A".repeat(81);
    const r = seoMetaSchema.safeParse({ metaTitle: longTitle });
    expect(r.success).toBe(false);
  });

  it("PASS: ogImage and canonicalUrl accept valid URLs", () => {
    const r = seoMetaSchema.safeParse({
      ogImage: "https://cdn.anydiscussion.com/og.png",
      canonicalUrl: "https://example.com/post",
    });
    expect(r.success).toBe(true);
  });

  it("PASS: ogImage and canonicalUrl accept empty string (the 'cleared' state)", () => {
    const r = seoMetaSchema.safeParse({
      ogImage: "",
      canonicalUrl: "",
    });
    expect(r.success).toBe(true);
  });

  it("FAIL: ogImage rejects a non-URL string", () => {
    const r = seoMetaSchema.safeParse({ ogImage: "not-a-url" });
    expect(r.success).toBe(false);
  });
});
