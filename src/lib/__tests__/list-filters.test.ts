// src/lib/__tests__/list-filters.test.ts
// [CITED: 260827-se8-PLAN.md Task 2 <behavior> — the pure coercion helpers]
// [CITED: src/lib/rate-limit/__tests__/client-ip.test.ts — pure-module test shape]
//
// The dashboard list pages (posts/users/categories/media — Tasks 4-7) all
// parse the same URL searchParams shape the public search page already
// handles: `string | string[] | undefined` per key, first-entry flattening,
// trim + length caps, clamped page numbers. This module pins the extracted
// helpers' contracts BEFORE the pages consume them.
import { describe, it, expect } from "vitest";
import {
  firstValue,
  bounded,
  clampPage,
  DASHBOARD_PAGE_SIZE,
} from "../list-filters";

describe("260827-se8 Task 2: firstValue — flatten tampered string[] params (V5)", () => {
  it("picks the FIRST entry of a duplicated param (tampered ?q=a&q=b)", () => {
    expect(firstValue(["a", "b"])).toBe("a");
  });

  it("passes a single string through", () => {
    expect(firstValue("a")).toBe("a");
  });

  it("undefined → undefined (absent param)", () => {
    expect(firstValue(undefined)).toBeUndefined();
  });

  it("empty array → undefined (first entry of nothing)", () => {
    expect(firstValue([])).toBeUndefined();
  });
});

describe("260827-se8 Task 2: bounded — trim + length cap (V8)", () => {
  it("trims surrounding whitespace", () => {
    expect(bounded("  x  ", 200)).toBe("x");
  });

  it("slices to exactly max chars (200)", () => {
    const long = "x".repeat(500);
    expect(bounded(long, 200)).toHaveLength(200);
  });

  it("undefined → empty string", () => {
    expect(bounded(undefined, 200)).toBe("");
  });
});

describe("260827-se8 Task 2: clampPage — ≥1, ≤1000 (bounds prevent offset abuse)", () => {
  it("undefined → 1", () => {
    expect(clampPage(undefined)).toBe(1);
  });

  it("'0' → 1 (no page zero)", () => {
    expect(clampPage("0")).toBe(1);
  });

  it("'-5' → 1 (no negative offsets)", () => {
    expect(clampPage("-5")).toBe(1);
  });

  it("'abc' → 1 (NaN degrades to page 1)", () => {
    expect(clampPage("abc")).toBe(1);
  });

  it("'9999' → 1000 (hard cap)", () => {
    expect(clampPage("9999")).toBe(1000);
  });

  it("'42' → 42 (in-range passthrough)", () => {
    expect(clampPage("42")).toBe(42);
  });

  it("' 7 ' → 7 (trim before parse)", () => {
    expect(clampPage(" 7 ")).toBe(7);
  });
});

describe("260827-se8 Task 2: DASHBOARD_PAGE_SIZE — the uniform dashboard page size", () => {
  it("is 20 (posts/users/categories/media/bell all paginate 20 per page)", () => {
    expect(DASHBOARD_PAGE_SIZE).toBe(20);
  });
});
