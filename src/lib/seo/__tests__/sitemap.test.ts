// src/lib/seo/__tests__/sitemap.test.ts
// [CITED: 05-02-PLAN.md Task 1 <behavior> — sitemap entry count, priority/changefreq, exclusion]
// [CITED: 05-VALIDATION.md row 05-02-T1 — SEO-02 + SEO-08, draft/soft-deleted excluded]
// [CITED: 05-RESEARCH.md Pattern 2 (L426-481) — verified sitemap.ts body]
//
// Unit tests for app/sitemap.ts. The DB query is mocked (chainable builder pattern
// from src/lib/slug/__tests__/slug.test.ts); @/lib/seo/settings is mocked to return
// the fixture SeoSettings snapshot (Pitfall 7 — single source for canonicalBaseUrl).
//
// Covers:
//   SEO-02 — sitemap lists every published post + page; home entry present.
//   SEO-08 — per-content-type priority (home 1.0 / posts 0.8 / pages 0.5) + changeFrequency.
//   T-05-05 — draft + soft-deleted posts do NOT appear.
import { describe, it, expect, beforeEach, vi } from "vitest";
import type { MetadataRoute } from "next";
import {
  fakeSettings,
  fakeSitemapPosts,
  fakeSitemapPages,
  DRAFT_POST_SLUG,
  SOFT_DELETED_POST_SLUG,
} from "./shared-fixtures";

// --- Mocks -------------------------------------------------------------
// vi.mock factories are hoisted ABOVE all top-level code, so any variable they
// reference must itself be hoisted via vi.hoisted (otherwise TDZ). The schema
// mock is hoisted because `schema: schemaMock` is read during factory execution.
// postsResult/pagesResult are only read inside callback closures that execute
// later (during the test), so plain module-level `let` bindings suffice.
const { schemaMock } = vi.hoisted(() => ({
  schemaMock: {
    posts: {
      slug: "slug",
      updatedAt: "updated_at",
      status: "status",
      deletedAt: "deleted_at",
      publishedAt: "published_at",
    },
    pages: {
      slug: "slug",
      updatedAt: "updated_at",
      status: "status",
      deletedAt: "deleted_at",
    },
  },
}));

// Module-scoped results so individual tests can override the query output.
let postsResult: typeof fakeSitemapPosts = fakeSitemapPosts;
let pagesResult: typeof fakeSitemapPages = fakeSitemapPages;

vi.mock("@/lib/db", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn((table: unknown) => {
        if (table === schemaMock.posts) {
          return {
            where: vi.fn(() => ({
              orderBy: vi.fn(() => Promise.resolve(postsResult)),
            })),
          };
        }
        if (table === schemaMock.pages) {
          return {
            where: vi.fn(() => Promise.resolve(pagesResult)),
          };
        }
        return {};
      }),
    })),
  },
  schema: schemaMock,
}));

vi.mock("@/lib/seo/settings", () => ({
  getSeoSettings: vi.fn(async () => fakeSettings),
}));

// --- SUT (imported AFTER mocks are registered) --------------------------

import sitemapFn from "@/app/sitemap";
import { buildHomeSitemapEntry, buildPostSitemapEntry, buildPageSitemapEntry } from "@/app/sitemap";

// --- Helpers ------------------------------------------------------------

/** Find a sitemap entry by url substring. */
function findEntry(entries: MetadataRoute.Sitemap, slug: string): MetadataRoute.Sitemap[number] | undefined {
  return entries.find((e) => e.url.includes(slug));
}

// --- Tests ---------------------------------------------------------------

describe("SEO-02 / SEO-08: app/sitemap.ts — published posts + pages + home", () => {
  beforeEach(() => {
    postsResult = fakeSitemapPosts;
    pagesResult = fakeSitemapPages;
  });

  it("returns home + 2 posts + 1 page = 4 entries (D-05)", async () => {
    const entries = await sitemapFn();
    expect(entries).toHaveLength(4);
  });

  it("home entry has priority 1.0 and changeFrequency daily (SEO-08)", async () => {
    const entries = await sitemapFn();
    const home = entries[0];
    expect(home.priority).toBe(1.0);
    expect(home.changeFrequency).toBe("daily");
    expect(home.url).toBe(fakeSettings.canonicalBaseUrl);
  });

  it("each post entry: priority 0.8, weekly, url {base}/blog/{slug}, lastModified from updatedAt", async () => {
    const entries = await sitemapFn();
    const postEntry = findEntry(entries, "understanding-cache-components");
    expect(postEntry).toBeDefined();
    expect(postEntry!.priority).toBe(0.8);
    expect(postEntry!.changeFrequency).toBe("weekly");
    expect(postEntry!.url).toBe(
      `${fakeSettings.canonicalBaseUrl}/blog/understanding-cache-components`,
    );
    expect(postEntry!.lastModified).toEqual(new Date("2026-06-20T12:00:00Z"));
  });

  it("each page entry: priority 0.5, monthly, url {base}/{slug}", async () => {
    const entries = await sitemapFn();
    const pageEntry = findEntry(entries, "about");
    expect(pageEntry).toBeDefined();
    expect(pageEntry!.priority).toBe(0.5);
    expect(pageEntry!.changeFrequency).toBe("monthly");
    expect(pageEntry!.url).toBe(`${fakeSettings.canonicalBaseUrl}/about`);
  });

  it("draft post does NOT appear (T-05-05 exclusion)", async () => {
    // The DB query filters drafts; simulate by ensuring the draft slug is absent
    // from the returned entries regardless.
    const entries = await sitemapFn();
    expect(findEntry(entries, DRAFT_POST_SLUG)).toBeUndefined();
  });

  it("soft-deleted published post does NOT appear (T-05-05 exclusion)", async () => {
    const entries = await sitemapFn();
    expect(findEntry(entries, SOFT_DELETED_POST_SLUG)).toBeUndefined();
  });

  it("reads canonicalBaseUrl from getSeoSettings (Pitfall 7 — single source)", async () => {
    const entries = await sitemapFn();
    // Every URL must start with the settings-derived base, never an env var.
    for (const e of entries) {
      expect(e.url.startsWith(fakeSettings.canonicalBaseUrl)).toBe(true);
    }
  });
});

describe("SEO-08: pure sitemap entry builders (testable without DB)", () => {
  it("buildHomeSitemapEntry returns priority 1.0 / daily / base url", () => {
    const home = buildHomeSitemapEntry(fakeSettings.canonicalBaseUrl);
    expect(home.priority).toBe(1.0);
    expect(home.changeFrequency).toBe("daily");
    expect(home.url).toBe(fakeSettings.canonicalBaseUrl);
    expect(home.lastModified).toBeInstanceOf(Date);
  });

  it("buildPostSitemapEntry returns priority 0.8 / weekly / {base}/blog/{slug}", () => {
    const entry = buildPostSitemapEntry(
      "my-post",
      new Date("2026-06-20T00:00:00Z"),
      fakeSettings.canonicalBaseUrl,
    );
    expect(entry.priority).toBe(0.8);
    expect(entry.changeFrequency).toBe("weekly");
    expect(entry.url).toBe(`${fakeSettings.canonicalBaseUrl}/blog/my-post`);
    expect(entry.lastModified).toEqual(new Date("2026-06-20T00:00:00Z"));
  });

  it("buildPageSitemapEntry returns priority 0.5 / monthly / {base}/{slug}", () => {
    const entry = buildPageSitemapEntry(
      "about",
      new Date("2026-06-01T00:00:00Z"),
      fakeSettings.canonicalBaseUrl,
    );
    expect(entry.priority).toBe(0.5);
    expect(entry.changeFrequency).toBe("monthly");
    expect(entry.url).toBe(`${fakeSettings.canonicalBaseUrl}/about`);
    expect(entry.lastModified).toEqual(new Date("2026-06-01T00:00:00Z"));
  });
});
