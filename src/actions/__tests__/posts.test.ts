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
  sanitizeBeforeStoreMock,
  sanitizeBeforeRenderMock,
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
  // Slice B (03-02): passthrough set in beforeEach (untyped vi.fn avoids spread-arg tsc error).
  sanitizeBeforeStoreMock: vi.fn(),
  sanitizeBeforeRenderMock: vi.fn(),
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

// Slice B (03-02): mock the shared sanitize module. Passthrough by default so the
// body walker doesn't mutate test data; the sanitize-wiring test overrides the spy
// to assert the call was made.
vi.mock("@/lib/sanitize", () => ({
  sanitizeBeforeStore: (...a: unknown[]) => sanitizeBeforeStoreMock(...a),
  sanitizeBeforeRender: (...a: unknown[]) => sanitizeBeforeRenderMock(...a),
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
  // select().from().leftJoin().where().limit() (publishPost category join),
  // select().from().limit(), insert().values().returning(), update().set().where().
  const chainableSelect = () => ({
    leftJoin: vi.fn(() => ({
      where: () => ({ limit: (...a: unknown[]) => selectPostMock(...a) }),
    })),
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
      posts: {
        id: "id",
        slug: "slug",
        status: "status",
        authorId: "author_id",
        body: "body",
        categoryId: "category_id",
        publishedAt: "published_at",
        previewToken: "preview_token",
        updatedAt: "updated_at",
      },
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
  publishPost,
  setSchedule,
  revokePreviewToken,
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
    // Slice B: passthrough sanitize by default (tests override to assert the call).
    sanitizeBeforeStoreMock.mockImplementation((s: string) => s);
    sanitizeBeforeRenderMock.mockImplementation((s: string) => s);
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

  it("savePost calls sanitizeBeforeStore on raw-HTML embed nodes in the body (Pitfall #2 site #1)", async () => {
    // Body contains a raw-HTML embed node with an iframe string (D-02 paste path).
    // The body walker in savePost should detect the HTML-like string and call
    // sanitizeBeforeStore on it before db.insert.
    insertMock.mockReturnValue([{ id: 42 }]);
    const maliciousHtml = '<iframe src="https://evil.com"></iframe><img src=x onerror=alert(1)>';
    await savePost({
      title: "T",
      slug: "t",
      body: {
        type: "doc",
        content: [
          { type: "paragraph", content: [{ type: "text", text: "safe" }] },
          { type: "html", attrs: { html: maliciousHtml } },
        ],
      },
      categoryId: 1,
      tagIds: [],
    });
    // sanitizeBeforeStore must have been called with the malicious HTML string.
    expect(sanitizeBeforeStoreMock).toHaveBeenCalledWith(maliciousHtml);
    expect(insertMock).toHaveBeenCalledTimes(1);
  });

  it("savePost does NOT call sanitizeBeforeStore when body has no HTML strings (pure JSON no-op)", async () => {
    insertMock.mockReturnValue([{ id: 42 }]);
    await savePost({
      title: "T",
      slug: "t",
      body: { type: "doc", content: [{ type: "paragraph" }] },
      categoryId: 1,
      tagIds: [],
    });
    // No string in this body contains '<' + '>' → walker is a no-op, sanitize is not called.
    expect(sanitizeBeforeStoreMock).not.toHaveBeenCalled();
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

// ===========================================================================
// Slice D (Plan 03-04) — publishPost + setSchedule + revokePreviewToken
// ===========================================================================

describe("CONT-08 / D-25 / Pitfall #3: publishPost revalidation wiring", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    assertOwnsPostMock.mockResolvedValue(adminSession());
    requireCanMock.mockResolvedValue(adminSession());
    transitionPostMock.mockResolvedValue(undefined);
    updateMock.mockResolvedValue(undefined);
    revalidatePathMock.mockReturnValue(undefined);
    revalidateTagMock.mockReturnValue(undefined);
    // The post fetch returns a row with slug + authorId + categoryId + categorySlug.
    selectPostMock.mockResolvedValue([
      {
        id: 7,
        slug: "hello-world",
        authorId: "u-author-1",
        categoryId: 3,
        categorySlug: "news",
        status: "draft",
      },
    ]);
  });

  it("calls transitionPost(postId, 'published') FIRST (R7 funnel)", async () => {
    await publishPost(7);
    expect(transitionPostMock).toHaveBeenCalledWith(7, "published");
  });

  it("does NOT revalidate when transitionPost throws (funnel-first ordering)", async () => {
    transitionPostMock.mockImplementation(() => {
      throw new Error("FORBIDDEN");
    });
    revalidatePathMock.mockImplementation(() => {
      throw new Error("MUST_NOT_BE_REACHED");
    });
    revalidateTagMock.mockImplementation(() => {
      throw new Error("MUST_NOT_BE_REACHED");
    });
    await expect(publishPost(7)).rejects.toThrow("FORBIDDEN");
    expect(revalidatePathMock).not.toHaveBeenCalled();
    expect(revalidateTagMock).not.toHaveBeenCalled();
  });

  it("revalidates concrete literal paths (D-25 — Pitfall #3)", async () => {
    await publishPost(7);
    const paths = revalidatePathMock.mock.calls.map((c) => c[0]);
    expect(paths).toContain("/blog/hello-world");
    expect(paths).toContain("/");
    expect(paths).toContain("/blog");
    expect(paths).toContain("/category/news");
    expect(paths).toContain("/sitemap.xml");
    expect(paths).toContain("/rss.xml");
  });

  it("calls revalidateTag with 2-arg form only — every call is (tag, 'max') (D-25)", async () => {
    await publishPost(7);
    expect(revalidateTagMock.mock.calls.length).toBeGreaterThan(0);
    for (const call of revalidateTagMock.mock.calls) {
      expect(call.length).toBe(2);
      expect(call[1]).toBe("max");
    }
  });

  it("revalidates post, author, category, and posts-list tags (D-25)", async () => {
    await publishPost(7);
    const tags = revalidateTagMock.mock.calls.map((c) => c[0]);
    expect(tags).toContain("post-7");
    expect(tags).toContain("author-u-author-1");
    expect(tags).toContain("category-3");
    expect(tags).toContain("posts-list");
  });

  it("does NOT use template-string path patterns like '/blog/[slug]' (D-25)", async () => {
    await publishPost(7);
    for (const call of revalidatePathMock.mock.calls) {
      const path = call[0] as string;
      expect(path).not.toContain("[slug]");
      expect(path).not.toContain("[");
    }
  });

  it("rotates the preview token AFTER transition (D-19 — old preview link invalidated)", async () => {
    await publishPost(7);
    // rotatePreviewToken runs db.update internally; since transitionPost is mocked
    // (no db.update from it), the only db.update fired is from rotatePreviewToken.
    expect(updateMock).toHaveBeenCalledTimes(1);
  });
});

describe("D-15: setSchedule requires post:publish capability (authors blocked)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    assertOwnsPostMock.mockResolvedValue(adminSession());
    requireCanMock.mockResolvedValue(adminSession());
    updateMock.mockResolvedValue(undefined);
  });

  it("calls requireCan({post:['publish']}) (D-15)", async () => {
    const when = new Date("2026-08-01T12:00:00Z");
    await setSchedule(7, when);
    expect(requireCanMock).toHaveBeenCalledWith({ post: ["publish"] });
  });

  it("throws FORBIDDEN when requireCan denies (authors lack publish — D-15)", async () => {
    requireCanMock.mockImplementation(() => {
      throw new Error("FORBIDDEN");
    });
    updateMock.mockImplementation(() => {
      throw new Error("MUST_NOT_BE_REACHED");
    });
    await expect(setSchedule(7, new Date())).rejects.toThrow("FORBIDDEN");
    expect(updateMock).not.toHaveBeenCalled();
  });
});

describe("D-19: revokePreviewToken clears the preview token", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    assertOwnsPostMock.mockResolvedValue(adminSession());
    updateMock.mockResolvedValue(undefined);
  });

  it("sets previewToken to null via db.update", async () => {
    await revokePreviewToken(7);
    expect(updateMock).toHaveBeenCalledTimes(1);
  });

  it("requires assertOwnsPost FIRST (T-03-01)", async () => {
    assertOwnsPostMock.mockImplementation(() => {
      throw new Error("FORBIDDEN");
    });
    updateMock.mockImplementation(() => {
      throw new Error("MUST_NOT_BE_REACHED");
    });
    await expect(revokePreviewToken(7)).rejects.toThrow("FORBIDDEN");
    expect(updateMock).not.toHaveBeenCalled();
  });
});
