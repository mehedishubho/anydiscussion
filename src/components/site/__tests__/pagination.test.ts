// src/components/site/__tests__/pagination.test.ts
// [CITED: 260823-4yc-PLAN.md Task 2 — buildPageHref root-basePath normalization]
// [CITED: 260823-4yc-PLAN.md locked decision 2 — homepage pagination "/page/N"]
//
// Unit tests for buildPageHref. The homepage passes basePath "/" — without
// normalization that produced the protocol-relative double-slash "//page/2" URL
// (a real bug this task fixes). Existing callers ("/blog", "/archive" +
// searchParams) must stay byte-identical.
//
// Node env — imports the pure helper only (buildPageHref).

import { describe, it, expect } from "vitest";
import { buildPageHref } from "../Pagination";

describe("buildPageHref — root basePath (homepage, decision 2)", () => {
  it("resolves page 1 of the root base to '/' (never a double slash)", () => {
    expect(buildPageHref(1, "/")).toBe("/");
  });

  it("resolves page 2 of the root base to '/page/2'", () => {
    expect(buildPageHref(2, "/")).toBe("/page/2");
  });

  it("resolves a higher page of the root base to '/page/N'", () => {
    expect(buildPageHref(9, "/")).toBe("/page/9");
  });
});

describe("buildPageHref — segment routes (existing callers unchanged)", () => {
  it("resolves /blog page 1 to '/blog'", () => {
    expect(buildPageHref(1, "/blog")).toBe("/blog");
  });

  it("resolves /blog page 2 to '/blog/page/2'", () => {
    expect(buildPageHref(2, "/blog")).toBe("/blog/page/2");
  });
});

describe("buildPageHref — searchParams mode (archive, unchanged)", () => {
  it("replaces an incoming page param with the target page number", () => {
    expect(buildPageHref(3, "/archive", { page: "2" })).toBe("/archive?page=3");
  });
});
