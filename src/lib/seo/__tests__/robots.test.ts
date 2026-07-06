// src/lib/seo/__tests__/robots.test.ts
// [CITED: 05-02-PLAN.md Task 1 <behavior> — userAgent '*', allow '/', disallow list, sitemap pointer]
// [CITED: 05-VALIDATION.md row 05-02-T1 — SEO-02 robots side]
// [CITED: 05-RESEARCH.md Pattern 3 (L484-503) — verified robots.ts body]
//
// Unit tests for app/robots.ts. @/lib/seo/settings is mocked to return the fixture
// SeoSettings snapshot (Pitfall 7 — canonicalBaseUrl comes from the single source).
import { describe, it, expect, vi } from "vitest";
import type { MetadataRoute } from "next";
import { fakeSettings } from "./shared-fixtures";

vi.mock("@/lib/seo/settings", () => ({
  getSeoSettings: vi.fn(async () => fakeSettings),
}));

import robotsFn from "@/app/robots";

describe("SEO-02: app/robots.ts — allow/disallow + sitemap pointer (D-06)", () => {
  it("returns userAgent '*' allowing '/'", async () => {
    const r: MetadataRoute.Robots = await robotsFn();
    expect(r.rules).toMatchObject({
      userAgent: "*",
      allow: "/",
    });
  });

  it("disallow list includes /preview/ and /dashboard/ (D-06)", async () => {
    const r = await robotsFn();
    // Our robots() always returns the single-rule-object form (not an array).
    const rules = r.rules as { userAgent: string; allow: string; disallow: string[] };
    expect(rules.disallow).toEqual(
      expect.arrayContaining(["/preview/", "/dashboard/"]),
    );
  });

  it("disallow list includes auth routes (signin, signup, forgot-password)", async () => {
    const r = await robotsFn();
    const rules = r.rules as { userAgent: string; allow: string; disallow: string[] };
    expect(rules.disallow).toEqual(
      expect.arrayContaining(["/signin", "/signup", "/forgot-password"]),
    );
  });

  it("sitemap pointer equals {canonicalBaseUrl}/sitemap.xml (Pitfall 7)", async () => {
    const r = await robotsFn();
    expect(r.sitemap).toBe(`${fakeSettings.canonicalBaseUrl}/sitemap.xml`);
  });
});
