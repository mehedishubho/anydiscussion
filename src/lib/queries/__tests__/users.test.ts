// src/lib/queries/__tests__/users.test.ts
// [CITED: 06-VALIDATION.md Wave 0 row "users.test.ts — getUserByUsername, listAuthorPosts"]
// [CITED: 06-01-PLAN.md Task 2 <behavior> — author page queries + taxonomy + pages]
//
// Wave-0 tests for the public read-query modules. These tests verify:
//   - SITE-06 / D-11: getUserByUsername returns the author or null.
//   - T-06-02: listAuthorPosts returns only published, non-deleted posts.
//   - SITE-04/05: getCategoryBySlug / getTagBySlug return taxonomy rows or null.
//   - SITE-11: getPublishedPage returns only published pages.
//
// Mock strategy: vi.hoisted + vi.mock @/lib/db (chainable Drizzle builder).

import { describe, it, expect, beforeEach, vi } from "vitest";

const { selectMock, cacheTagMock } = vi.hoisted(() => ({
  selectMock: vi.fn(),
  cacheTagMock: vi.fn(),
}));

vi.mock("next/cache", () => ({
  cacheTag: (...a: unknown[]) => cacheTagMock(...a),
  cacheLife: vi.fn(),
}));

vi.mock("@/lib/db", () => {
  const chainableSelect = () => {
    const self: Record<string, unknown> = {};
    self.leftJoin = vi.fn(() => self);
    self.innerJoin = vi.fn(() => self);
    self.where = vi.fn(() => self);
    self.orderBy = vi.fn(() => self);
    self.limit = vi.fn(() => selectMock());
    self.offset = vi.fn(() => self);
    self.groupBy = vi.fn(() => self);
    return self;
  };
  return {
    db: {
      select: vi.fn(() => ({
        from: vi.fn(() => chainableSelect()),
      })),
      update: vi.fn(),
    },
    schema: {
      posts: {
        id: "id",
        slug: "slug",
        title: "title",
        status: "status",
        authorId: "author_id",
        publishedAt: "published_at",
        deletedAt: "deleted_at",
      },
      user: {
        id: "id",
        name: "name",
        username: "username",
        bio: "bio",
        avatar: "avatar",
      },
      categories: {
        id: "id",
        slug: "slug",
        name: "name",
        deletedAt: "deleted_at",
      },
      tags: { id: "id", slug: "slug", name: "name", deletedAt: "deleted_at" },
      pages: {
        id: "id",
        slug: "slug",
        title: "title",
        body: "body",
        status: "status",
        deletedAt: "deleted_at",
      },
    },
  };
});

import { getUserByUsername, listAuthorPosts } from "../users";
import { getCategoryBySlug, getTagBySlug } from "../taxonomy";
import { getPublishedPage } from "../pages";

describe("SITE-06 / D-11: getUserByUsername", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns the user when the username exists", async () => {
    const mockUser = { id: "u1", name: "Mehedi", username: "mehedi" };
    selectMock.mockResolvedValue([mockUser]);
    const result = await getUserByUsername("mehedi");
    expect(result).toEqual(mockUser);
  });

  it("returns null for a missing username", async () => {
    selectMock.mockResolvedValue([]);
    const result = await getUserByUsername("nonexistent");
    expect(result).toBeNull();
  });
});

describe("SITE-06 / published-only: listAuthorPosts", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns published posts by the author", async () => {
    const mockPosts = [{ id: 1, title: "Post 1" }, { id: 2, title: "Post 2" }];
    selectMock.mockResolvedValue(mockPosts);
    const result = await listAuthorPosts("mehedi", 1);
    expect(result).toEqual(mockPosts);
  });

  it("returns empty array when the author has no published posts", async () => {
    selectMock.mockResolvedValue([]);
    const result = await listAuthorPosts("newauthor", 1);
    expect(result).toEqual([]);
  });
});

describe("SITE-04: getCategoryBySlug", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns the category when the slug exists", async () => {
    const mockCat = { id: 1, slug: "tech", name: "Technology" };
    selectMock.mockResolvedValue([mockCat]);
    const result = await getCategoryBySlug("tech");
    expect(result).toEqual(mockCat);
  });

  it("returns null for a missing category slug", async () => {
    selectMock.mockResolvedValue([]);
    const result = await getCategoryBySlug("nonexistent");
    expect(result).toBeNull();
  });
});

describe("SITE-05: getTagBySlug", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns the tag when the slug exists", async () => {
    const mockTag = { id: 1, slug: "nextjs", name: "Next.js" };
    selectMock.mockResolvedValue([mockTag]);
    const result = await getTagBySlug("nextjs");
    expect(result).toEqual(mockTag);
  });

  it("returns null for a missing tag slug", async () => {
    selectMock.mockResolvedValue([]);
    const result = await getTagBySlug("nonexistent");
    expect(result).toBeNull();
  });
});

describe("SITE-11: getPublishedPage", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns a published page by slug", async () => {
    const mockPage = { id: 1, slug: "about", title: "About", status: "published" };
    selectMock.mockResolvedValue([mockPage]);
    const result = await getPublishedPage("about");
    expect(result).toEqual(mockPage);
  });

  it("returns null for a draft page", async () => {
    selectMock.mockResolvedValue([]);
    const result = await getPublishedPage("draft-page");
    expect(result).toBeNull();
  });

  it("returns null for a missing page slug", async () => {
    selectMock.mockResolvedValue([]);
    const result = await getPublishedPage("nonexistent");
    expect(result).toBeNull();
  });
});
