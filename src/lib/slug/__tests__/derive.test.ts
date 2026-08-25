// src/lib/slug/__tests__/derive.test.ts
// [CITED: 05-07-PLAN.md Task 2 <behavior> — deriveSlugFromTitle unit tests]
// [CITED: 03-CONTEXT.md D-20 — slugs are Latin; STRIP to regex, never transliterate]
// [CITED: .planning/phases/05-seo-basics/05-UAT.md R1 — slug was a silent second blocker]
//
// Unit tests for the PURE client-safe slug derivation helper (derive.ts has NO
// imports — unlike src/lib/slug/index.ts which imports the server-only db and
// therefore cannot be used from the PostForm client component).
//
// Also pins the Zod 4 constructor-level categoryId error message: a missing
// category on /dashboard/posts/new must read "Category is required", NOT Zod's
// default type-error string (the cryptic message users never saw because
// onInvalid didn't exist — UAT re-run R1 cause B).
import { describe, it, expect } from "vitest";
import { deriveSlugFromTitle } from "../derive";
import { SLUG_REGEX, postSchema } from "@/actions/posts-schema";

describe("05-07 — deriveSlugFromTitle (D-20: strip, never transliterate)", () => {
  it("derives 'hello-world-2026' from 'Hello World 2026!'", () => {
    expect(deriveSlugFromTitle("Hello World 2026!")).toBe("hello-world-2026");
  });

  it("folds uppercase to lowercase, collapses non-[a-z0-9] runs to one hyphen, trims edge hyphens", () => {
    expect(deriveSlugFromTitle("Hello World")).toBe("hello-world");
    // Runs of mixed junk collapse to a SINGLE hyphen...
    expect(deriveSlugFromTitle("A  --  B")).toBe("a-b");
    expect(deriveSlugFromTitle("foo...bar___baz")).toBe("foo-bar-baz");
    // ...and leading/trailing hyphens are trimmed.
    expect(deriveSlugFromTitle("!!! leading and trailing !!!")).toBe(
      "leading-and-trailing",
    );
    expect(deriveSlugFromTitle("--already-dashed--")).toBe("already-dashed");
  });

  it("derives '' for a Bangla-only title (strip, never transliterate — D-20 boundary)", () => {
    // Bangla-to-Latin transliteration is explicitly out of scope for v1: a
    // fully-Bangla title strips to "" and the now-loud slug validation
    // (toast + focus, wired in PostForm) catches it.
    expect(deriveSlugFromTitle("বাংলা শিরোনাম")).toBe("");
  });

  it("every NON-empty derived value satisfies SLUG_REGEX", () => {
    const titles = [
      "Hello World 2026!",
      "My Post: A Deep Dive?",
      "UPPER lower 123",
      "  spaced   out  ",
      "bangla mixed বাংলা title",
      "tabs\tand\nnewlines",
      "café-résumé (accents strip)",
    ];
    for (const title of titles) {
      const derived = deriveSlugFromTitle(title);
      if (derived !== "") {
        expect(SLUG_REGEX.test(derived)).toBe(true);
      }
    }
  });
});

describe("05-07 — categoryId Zod 4 constructor-level error message", () => {
  it("reports 'Category is required' when categoryId is missing (the /new default)", () => {
    const result = postSchema.safeParse({ title: "t", slug: "t" });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find((i) => i.path[0] === "categoryId");
      expect(issue).toBeDefined();
      expect(issue?.message).toBe("Category is required");
    }
  });
});
