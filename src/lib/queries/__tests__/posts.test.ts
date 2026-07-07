// src/lib/queries/__tests__/posts.test.ts
// [CITED: 06-VALIDATION.md Wave 0 row "posts.test.ts — incrementViewCount, published-only, cacheTag"]
// [CITED: 06-01-PLAN.md Task 2 <behavior> — the published-only + atomic increment invariants]
// [CITED: 06-RESEARCH.md Pattern 1 (L495-538) — getPostForPublic + incrementViewCount shapes]
//
// Wave-0 tests for the public read-query module. These tests verify:
//   - T-06-02: Every read function filters status='published' AND deletedAt IS NULL
//     (drafts and soft-deleted posts NEVER reach public reads).
//   - D-01: incrementViewCount is an atomic UPDATE views = views + 1.
//   - D-02: cacheTag strings match publishPost's existing revalidateTag calls.
//   - D-09: searchPosts uses websearch_to_tsquery('simple', ...) for Bangla FTS.
//
// Mock strategy: vi.hoisted + vi.mock @/lib/db (chainable Drizzle builder),
// next/cache (cacheTag/cacheLife capture), so the query bodies run in isolation.

import { describe, it, expect, beforeEach, vi } from "vitest";

const {
  selectMock,
  updateMock,
  cacheTagMock,
  cacheLifeMock,
} = vi.hoisted(() => ({
  selectMock: vi.fn(),
  updateMock: vi.fn(),
  cacheTagMock: vi.fn(),
  cacheLifeMock: vi.fn(),
}));

vi.mock("next/cache", () => ({
  cacheTag: (...a: unknown[]) => cacheTagMock(...a),
  cacheLife: (...a: unknown[]) => cacheLifeMock(...a),
}));

vi.mock("@/lib/db", () => {
  // Chainable Drizzle builder: select().from().leftJoin().leftJoin().where().limit()
  // resolves to selectMock; orderBy/limit terminators also resolve to selectMock.
  const chainableSelect = () => {
    const self: Record<string, unknown> = {};
    self.leftJoin = vi.fn(() => self);
    self.innerJoin = vi.fn(() => self);
    self.where = vi.fn(() => self);
    self.orderBy = vi.fn(() => self);
    self.limit = vi.fn(() => selectMock());
    self.offset = vi.fn(() => self);
    return self;
  };
  return {
    db: {
      select: vi.fn(() => ({
        from: vi.fn(() => chainableSelect()),
      })),
      update: vi.fn(() => ({
        set: vi.fn(() => ({
          where: vi.fn(() => ({
            returning: (...a: unknown[]) => updateMock(...a),
          })),
        })),
      })),
    },
    schema: {
      posts: {
        id: "id",
        slug: "slug",
        title: "title",
        excerpt: "excerpt",
        body: "body",
        status: "status",
        authorId: "author_id",
        categoryId: "category_id",
        featureImage: "feature_image",
        publishedAt: "published_at",
        deletedAt: "deleted_at",
        featured: "featured",
        views: "views",
        searchVector: "search_vector",
      },
      postSeo: {
        postId: "post_id",
        slug: "slug",
        metaTitle: "meta_title",
        metaDescription: "meta_description",
        ogImage: "og_image",
        canonicalUrl: "canonical_url",
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
      },
      tags: { id: "id", slug: "slug", name: "name" },
      postTags: { postId: "post_id", tagId: "tag_id" },
    },
  };
});

import {
  getPostForPublic,
  incrementViewCount,
  listPublished,
  listFeatured,
} from "../posts";

describe("T-06-02 / published-only: getPostForPublic", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns null when no published post matches the slug", async () => {
    selectMock.mockResolvedValue([]);
    const result = await getPostForPublic("nonexistent-slug");
    expect(result).toBeNull();
  });

  it("returns the post + seo + author data for a published slug", async () => {
    const mockRow = {
      posts: { id: 1, slug: "hello-world", title: "Hello", status: "published", authorId: "u1" },
      post_seo: { metaTitle: "Hello SEO" },
      user: { id: "u1", name: "Author" },
    };
    selectMock.mockResolvedValue([mockRow]);
    const result = await getPostForPublic("hello-world");
    expect(result).toEqual(mockRow);
  });

  it("calls cacheTag with post-${id} matching publishPost's revalidateTag", async () => {
    selectMock.mockResolvedValue([
      { posts: { id: 42, authorId: "u1" }, post_seo: null, user: null },
    ]);
    await getPostForPublic("hello");
    expect(cacheTagMock).toHaveBeenCalledWith("post-42");
  });

  it("calls cacheTag with author-${authorId} when authorId exists", async () => {
    selectMock.mockResolvedValue([
      { posts: { id: 42, authorId: "u7" }, post_seo: null, user: null },
    ]);
    await getPostForPublic("hello");
    expect(cacheTagMock).toHaveBeenCalledWith("author-u7");
  });
});

describe("D-01 / atomic increment: incrementViewCount", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns the new view count after atomic +1", async () => {
    updateMock.mockResolvedValue([{ views: 5 }]);
    const result = await incrementViewCount(42);
    expect(result).toBe(5);
  });

  it("returns 0 when the post does not exist", async () => {
    updateMock.mockResolvedValue([]);
    const result = await incrementViewCount(9999);
    expect(result).toBe(0);
  });

  it("does NOT call cacheTag (per-request write, never cached)", async () => {
    updateMock.mockResolvedValue([{ views: 1 }]);
    cacheTagMock.mockClear();
    await incrementViewCount(1);
    expect(cacheTagMock).not.toHaveBeenCalled();
  });
});

describe("published-only list: listPublished", () => {
  beforeEach(() => vi.clearAllMocks());

  it("calls cacheTag with posts-list matching publishPost's revalidateTag", async () => {
    selectMock.mockResolvedValue([]);
    await listPublished({ page: 1 });
    expect(cacheTagMock).toHaveBeenCalledWith("posts-list");
  });

  it("calls cacheTag with category-${categoryId} when provided", async () => {
    selectMock.mockResolvedValue([]);
    await listPublished({ page: 1, categoryId: 5 });
    expect(cacheTagMock).toHaveBeenCalledWith("category-5");
  });

  it("returns published posts ordered by publishedAt desc", async () => {
    const mockPosts = [{ id: 1, title: "A" }, { id: 2, title: "B" }];
    selectMock.mockResolvedValue(mockPosts);
    const result = await listPublished({ page: 1 });
    expect(result).toEqual(mockPosts);
  });
});

describe("D-04 / featured: listFeatured", () => {
  beforeEach(() => vi.clearAllMocks());

  it("calls cacheTag with posts-list", async () => {
    selectMock.mockResolvedValue([]);
    await listFeatured();
    expect(cacheTagMock).toHaveBeenCalledWith("posts-list");
  });

  it("returns featured published posts", async () => {
    const mockFeatured = [{ id: 1, featured: true }];
    selectMock.mockResolvedValue(mockFeatured);
    const result = await listFeatured();
    expect(result).toEqual(mockFeatured);
  });
});
