// src/actions/__tests__/posts.test.ts
// [CITED: VALIDATION.md Wave 0 rows "CONT-01/08/10/11 — posts action tests"]
// [CITED: 03-01-PLAN.md Task 3 <behavior> + <acceptance_criteria>]
// [CITED: PATTERNS.md row — clone src/actions/__tests__/users.test.ts mock shape]
//
// Wave-0 action tests proving:
//   - CONT-01: Posts CRUD + status transitions (transitionPost is the R7 funnel)
//   - T-03-01: Permission-check-FIRST (Pitfall #1) — every mutating action calls
//     requireCan/assertOwnsPost BEFORE any db.write (proven structurally by
//     mocking db.insert/update to throw 'MUST_NOT_BE_REACHED')
//   - T-03-03: D-17 — autosavePost returns {skipped:true} for status='published'
//     WITHOUT calling db.update (proven by mocking db.update to throw)
//   - T-03-04: D-19 — rotatePreviewToken uses crypto.randomUUID + writes previewToken
//
// Mock strategy mirrors users.test.ts: vi.hoisted + vi.mock the server-only deps
// (@/lib/db, @/lib/permissions, @/lib/log, @/lib/slug, @/lib/excerpt, @/lib/auth,
// ./posts-schema, @/lib/permissions/post-transitions, next/cache).
import { describe, it, expect, beforeEach, vi } from "vitest";

const {
  requireCanMock,
  assertOwnsPostMock,
  transitionPostMock,
  validateSlugMock,
  assertUniqueSlugMock,
  deriveExcerptMock,
  postSchemaParseMock,
  selectPostMock,
  insertMock,
  updateMock,
  revalidatePathMock,
  revalidateTagMock,
} = vi.hoisted(() => ({
  requireCanMock: vi.fn(),
  assertOwnsPostMock: vi.fn(),
  transitionPostMock: vi.fn(),
  validateSlugMock: vi.fn(),
  assertUniqueSlugMock: vi.fn(),
  deriveExcerptMock: vi.fn(),
  postSchemaParseMock: vi.fn(),
  selectPostMock: vi.fn(),
  insertMock: vi.fn(),
  updateMock: vi.fn(),
  revalidatePathMock: vi.fn(),
  revalidateTagMock: vi.fn(),
}));

vi.mock("@/lib/permissions", () => ({
  requireCan: (...a: unknown[]) => requireCanMock(...a),
  assertOwnsPost: (...a: unknown[]) => assertOwnsPostMock(...a),
}));

vi.mock("@/lib/permissions/post-transitions", () => ({
  transitionPost: (...a: unknown[]) => transitionPostMock(...a),
}));

vi.mock("@/lib/slug", () => ({
  validateSlug: (...a: unknown[]) => validateSlugMock(...a),
  assertUniqueSlug: (...a: unknown[]) => assertUniqueSlugMock(...a),
}));

vi.mock("@/lib/excerpt", () => ({
  deriveExcerpt: (...a: unknown[]) => deriveExcerptMock(...a),
}));

vi.mock("@/lib/log", () => ({
  log: { info: vi.fn(), error: vi.fn() },
}));

vi.mock("@/lib/auth", () => ({
  auth: { api: { getSession: vi.fn() } },
}));

vi.mock("next/cache", () => ({
  revalidatePath: (...a: unknown[]) => revalidatePathMock(...a),
  revalidateTag: (...a: unknown[]) => revalidateTagMock(...a),
}));

vi.mock("./posts-schema", () => ({
  // postSchema.parse(input) returns the input shape — tests override via mockResolvedValue.
  postSchema: { parse: (input: unknown) => postSchemaParseMock(input) },
}));

// Chainable Drizzle select builder.
vi.mock("@/lib/db", () => {
  // Chainable Drizzle builder mock: supports select().from().where().limit(),
  // select().from().limit(), insert().values().returning(), update().set().where().
  const chainableSelect = () => ({
    where: () => ({ limit: (...a: unknown[]) => selectPostMock(...a) }),
    limit: (...a: unknown[]) => selectPostMock(...a),
  });
  return {
    db: {
      select: vi.fn(() => ({
        from: vi.fn(() => chainableSelect()),
      })),
      insert: vi.fn(() => ({
        values: vi.fn(() => ({ returning: (...a: unknown[]) => insertMock(...a) })),
      })),
      update: vi.fn(() => ({
        set: vi.fn(() => ({ where: (...a: unknown[]) => updateMock(...a) })),
      })),
    },
    schema: {
      posts: { id: "id", slug: "slug", status: "status", authorId: "author_id", body: "body" },
      categories: { id: "id", slug: "slug" },
      tags: { id: "id", slug: "slug" },
      postTags: { postId: "post_id", tagId: "tag_id" },
      user: { id: "id" },
      settings: { key: "key", value: "value" },
    },
  };
});

import {
  savePost,
  getPost,
  listPosts,
  submitForReview,
  autosavePost,
  rotatePreviewToken,
} from "../posts";

const adminSession = () => ({ user: { id: "u-admin", role: "admin" }, session: { id: "s1" } });

describe("T-03-01 / Pitfall #1: every posts.ts mutating action calls requireCan/assertOwnsPost FIRST", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireCanMock.mockResolvedValue(adminSession());
    assertOwnsPostMock.mockResolvedValue(adminSession());
    transitionPostMock.mockResolvedValue(undefined);
    validateSlugMock.mockReturnValue({ valid: true });
    assertUniqueSlugMock.mockResolvedValue(undefined);
    deriveExcerptMock.mockReturnValue("auto-excerpt");
    postSchemaParseMock.mockImplementation((input) => input);
    selectPostMock.mockResolvedValue([]);
    insertMock.mockResolvedValue(undefined);
    updateMock.mockResolvedValue(undefined);
  });

  it("savePost calls requireCan({post:['create']}) BEFORE any db.insert on new post", async () => {
    requireCanMock.mockImplementation(() => {
      throw new Error("FORBIDDEN");
    });
    insertMock.mockImplementation(() => {
      throw new Error("MUST_NOT_BE_REACHED");
    });

    await expect(
      savePost({ title: "T", slug: "t", categoryId: 1, tagIds: [] }),
    ).rejects.toThrow("FORBIDDEN");
    expect(insertMock).not.toHaveBeenCalled();
    expect(requireCanMock).toHaveBeenCalledWith({ post: ["create"] });
  });

  it("savePost calls assertUniqueSlug before db.insert (D-20)", async () => {
    assertUniqueSlugMock.mockImplementation(() => {
      throw new Error("SLUG_NOT_UNIQUE");
    });
    insertMock.mockImplementation(() => {
      throw new Error("MUST_NOT_BE_REACHED");
    });

    await expect(
      savePost({ title: "T", slug: "dup", categoryId: 1, tagIds: [] }),
    ).rejects.toThrow("SLUG_NOT_UNIQUE");
    expect(insertMock).not.toHaveBeenCalled();
    expect(assertUniqueSlugMock).toHaveBeenCalledWith("dup", "posts", undefined);
  });

  it("savePost calls deriveExcerpt when excerpt is empty (D-21)", async () => {
    insertMock.mockReturnValue([{ id: 42 }]);
    await savePost({ title: "T", slug: "t", body: { type: "doc" }, excerpt: "", categoryId: 1, tagIds: [] });
    expect(deriveExcerptMock).toHaveBeenCalledTimes(1);
  });

  it("savePost does NOT call deriveExcerpt when excerpt is provided (D-21 manual wins)", async () => {
    insertMock.mockReturnValue([{ id: 42 }]);
    await savePost({
      title: "T",
      slug: "t",
      body: { type: "doc" },
      excerpt: "manual",
      categoryId: 1,
      tagIds: [],
    });
    expect(deriveExcerptMock).not.toHaveBeenCalled();
  });

  it("submitForReview calls transitionPost(postId, 'pending_review') (R7 funnel)", async () => {
    await submitForReview(7);
    expect(assertOwnsPostMock).toHaveBeenCalledWith(7);
    expect(transitionPostMock).toHaveBeenCalledWith(7, "pending_review");
  });

  it("submitForReview requires assertOwnsPost FIRST — throws FORBIDDEN before transitionPost when denied", async () => {
    assertOwnsPostMock.mockImplementation(() => {
      throw new Error("FORBIDDEN");
    });
    transitionPostMock.mockImplementation(() => {
      throw new Error("MUST_NOT_BE_REACHED");
    });
    await expect(submitForReview(7)).rejects.toThrow("FORBIDDEN");
    expect(transitionPostMock).not.toHaveBeenCalled();
  });
});

describe("T-03-03 / D-17: autosavePost DISABLED for published posts (manual save required)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    assertOwnsPostMock.mockResolvedValue(adminSession());
    updateMock.mockResolvedValue(undefined);
    revalidatePathMock.mockReturnValue(undefined);
    revalidateTagMock.mockReturnValue(undefined);
  });

  it("autosavePost returns {skipped:true} WITHOUT calling db.update when status='published'", async () => {
    selectPostMock.mockResolvedValue([{ id: 1, status: "published" }]);
    updateMock.mockImplementation(() => {
      throw new Error("MUST_NOT_BE_REACHED");
    });

    const result = await autosavePost(1, { type: "doc", content: [] });

    expect(result).toEqual({ skipped: true });
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("autosavePost updates the body when status='draft'", async () => {
    selectPostMock.mockResolvedValue([{ id: 1, status: "draft" }]);
    const body = { type: "doc", content: [{ type: "paragraph" }] };
    await autosavePost(1, body);
    expect(updateMock).toHaveBeenCalledTimes(1);
  });

  it("autosavePost updates the body when status='pending_review'", async () => {
    selectPostMock.mockResolvedValue([{ id: 1, status: "pending_review" }]);
    await autosavePost(1, { type: "doc" });
    expect(updateMock).toHaveBeenCalledTimes(1);
  });
});

describe("T-03-04 / D-19: rotatePreviewToken generates crypto.randomUUID + writes previewToken", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    assertOwnsPostMock.mockResolvedValue(adminSession());
    updateMock.mockResolvedValue(undefined);
  });

  it("rotatePreviewToken writes a non-empty token via db.update", async () => {
    const result = await rotatePreviewToken(7);
    expect(typeof result.token).toBe("string");
    expect(result.token.length).toBeGreaterThan(0);
    expect(updateMock).toHaveBeenCalledTimes(1);
  });

  it("rotatePreviewToken requires assertOwnsPost FIRST (T-03-01)", async () => {
    assertOwnsPostMock.mockImplementation(() => {
      throw new Error("FORBIDDEN");
    });
    updateMock.mockImplementation(() => {
      throw new Error("MUST_NOT_BE_REACHED");
    });
    await expect(rotatePreviewToken(7)).rejects.toThrow("FORBIDDEN");
    expect(updateMock).not.toHaveBeenCalled();
  });
});

describe("getPost / listPosts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireCanMock.mockResolvedValue(adminSession());
    assertOwnsPostMock.mockResolvedValue(adminSession());
    selectPostMock.mockResolvedValue([{ id: 1, title: "T", status: "draft" }]);
  });

  it("getPost returns the row when found", async () => {
    const post = await getPost(1);
    expect(post).toEqual({ id: 1, title: "T", status: "draft" });
  });

  it("getPost throws NOT_FOUND when no row", async () => {
    selectPostMock.mockResolvedValue([]);
    await expect(getPost(999)).rejects.toThrow("NOT_FOUND");
  });

  it("listPosts calls requireCan({post:['read']})", async () => {
    await listPosts();
    expect(requireCanMock).toHaveBeenCalledWith({ post: ["read"] });
  });
});
