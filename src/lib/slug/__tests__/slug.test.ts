// src/lib/slug/__tests__/slug.test.ts
// [CITED: VALIDATION.md Wave 0 row "CONT-07 — slug validator"]
// [CITED: 03-01-PLAN.md Task 2 <behavior> + <acceptance_criteria>]
// [CITED: 03-CONTEXT.md D-20 — manual slugs, URL-safe Latin + hyphens, no transliteration]
//
// Validates the slug validator that applies to posts, categories, AND tags
// (all three tables have `slug varchar unique`). D-20 rejects auto-transliteration
// (zero transliteration research risk) — this validator only enforces URL-safety
// on manual entry.
//
// Default Vitest node env. @/lib/db is mocked (clone of users.test.ts chainable
// builder) — assertUniqueSlug's DB query runs against the mock.
import { describe, it, expect, beforeEach, vi } from "vitest";

// Chainable builder mock for Drizzle select().from().where().limit()
const slugWhereMock = vi.fn();
const slugLimitMock = vi.fn();
vi.mock("@/lib/db", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: (...args: unknown[]) => slugWhereMock(...args),
      })),
    })),
  },
  // schema.posts.slug / schema.categories.slug / schema.tags.slug are column refs
  // used inside eq() calls — plain string objects are sufficient (eq just reads them).
  schema: {
    posts: { id: "id", slug: "slug" },
    categories: { id: "id", slug: "slug" },
    tags: { id: "id", slug: "slug" },
  },
}));

import { validateSlug, assertUniqueSlug } from "../index";

describe("CONT-07 / D-20: validateSlug — URL-safe Latin + hyphens, manual entry", () => {
  it("accepts a simple lowercase Latin slug", () => {
    expect(validateSlug("hello-world")).toEqual({ valid: true });
  });

  it("accepts digits + hyphens + single-char segments", () => {
    expect(validateSlug("a1-b2-c3")).toEqual({ valid: true });
  });

  it("rejects 'Hello World' — spaces + uppercase", () => {
    const r = validateSlug("Hello World");
    expect(r.valid).toBe(false);
    expect(r.reason).toMatch(/URL-safe|latin|hyphen/i);
  });

  it("rejects non-Latin (Bangla) — D-20 manual slugs, no transliteration", () => {
    const r = validateSlug("bangla-বাংলা");
    expect(r.valid).toBe(false);
  });

  it("rejects empty string", () => {
    expect(validateSlug("").valid).toBe(false);
  });

  it("rejects leading hyphen", () => {
    expect(validateSlug("-leading").valid).toBe(false);
  });

  it("rejects trailing hyphen", () => {
    expect(validateSlug("trailing-").valid).toBe(false);
  });

  it("rejects double hyphen", () => {
    expect(validateSlug("double--hyphen").valid).toBe(false);
  });

  it("rejects special characters", () => {
    expect(validateSlug("has_underscore").valid).toBe(false);
    expect(validateSlug("has.dot").valid).toBe(false);
    expect(validateSlug("has/slash").valid).toBe(false);
  });
});

describe("CONT-07 / D-20: assertUniqueSlug — DB uniqueness, table-parameterized", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: chainable → array result. The mock returns [] (no rows = unique).
    slugWhereMock.mockReturnValue({ limit: (...a: unknown[]) => slugLimitMock(...a) });
    slugLimitMock.mockResolvedValue([]);
  });

  it("resolves when db returns [] (no existing slug)", async () => {
    await expect(assertUniqueSlug("fresh-slug", "posts")).resolves.toBeUndefined();
  });

  it("throws SLUG_NOT_UNIQUE when db returns an existing row", async () => {
    slugLimitMock.mockResolvedValue([{ id: 1 }]);
    await expect(assertUniqueSlug("taken-slug", "posts")).rejects.toThrow("SLUG_NOT_UNIQUE");
  });

  it("passes excludeId through so the uniqueness check skips the current row", async () => {
    // The post being edited should not collide with itself.
    await assertUniqueSlug("my-slug", "posts", 42);
    expect(slugLimitMock).toHaveBeenCalledTimes(1);
  });

  it("accepts table='categories' and 'tags' (D-20 applies to all 3)", async () => {
    await expect(assertUniqueSlug("cat-slug", "categories")).resolves.toBeUndefined();
    await expect(assertUniqueSlug("tag-slug", "tags")).resolves.toBeUndefined();
  });
});
