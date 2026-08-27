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
  updateSetMock,
  insertValuesMock,
  revalidatePathMock,
  revalidateTagMock,
  // 260827-se8 Task 4 — list-mechanics + notify-hook mocks:
  //   notifyUsersMock    — spy standing in for @/lib/notifications
  //   where/leftJoin/orderBy/limit/offset ArgsMocks — the chain-step recorders
  //   of the unified select builder (structural filter proofs via deepContains)
  notifyUsersMock,
  whereArgsMock,
  leftJoinArgsMock,
  orderByArgsMock,
  limitArgsMock,
  offsetArgsMock,
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
  // CR-02: capture the .set() / .values() payloads so tests can assert on
  // exactly which columns a write touches (publishedAt preservation).
  updateSetMock: vi.fn(),
  insertValuesMock: vi.fn(),
  revalidatePathMock: vi.fn(),
  revalidateTagMock: vi.fn(),
  notifyUsersMock: vi.fn(),
  whereArgsMock: vi.fn(),
  leftJoinArgsMock: vi.fn(),
  orderByArgsMock: vi.fn(),
  limitArgsMock: vi.fn(),
  offsetArgsMock: vi.fn(),
}));

vi.mock("@/lib/permissions", () => ({
  requireCan: (...a: unknown[]) => requireCanMock(...a),
  assertOwnsPost: (...a: unknown[]) => assertOwnsPostMock(...a),
}));

// @/lib/notifications — 260827-se8 Task 4. submitForReview / publishPost /
// returnForRevision await notifyUsers after their transitions. The helper's
// own swallow contract is proven against the REAL module in
// notifications.test.ts; here it is a spy so the per-action call shapes
// (recipients, type, actor exclusion) and the actions' defense-in-depth
// catches are testable.
vi.mock("@/lib/notifications", () => ({
  notifyUsers: (...a: unknown[]) => notifyUsersMock(...a),
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

// 260827-se8 Task 4 — postSchema stays mocked (savePost tests override its
// parse); the NEW postListSchema stays REAL (importOriginal) so listPosts /
// countPosts tests exercise the actual Zod coercion (defaults, enum gates,
// pageSize cap) rather than a passthrough.
vi.mock("./posts-schema", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../posts-schema")>()),
  // postSchema.parse(input) returns the input shape — tests override via mockResolvedValue.
  postSchema: { parse: (input: unknown) => postSchemaParseMock(input) },
}));

// Chainable Drizzle select builder.
vi.mock("@/lib/db", () => {
  // 260827-se8 Task 4 — UNIFIED lazy chain node: every builder method
  // (leftJoin/where/orderBy/limit/offset) records its args into a dedicated
  // ArgsMock and returns the SAME node; the node is a lazy thenable — awaiting
  // at ANY point (where for countPosts, offset for listPosts, limit for the
  // legacy single-row fetches) resolves selectPostMock(). Lazy = the terminal
  // only fires when the action actually awaits, so gate-ordering proofs
  // ("MUST_NOT_BE_REACHED before any select") stay honest.
  const makeChain = () => {
    const node: {
      then: (onF?: (v: unknown) => unknown, onR?: (e: unknown) => unknown) => Promise<unknown>;
      leftJoin: (...a: unknown[]) => unknown;
      where: (...a: unknown[]) => unknown;
      orderBy: (...a: unknown[]) => unknown;
      limit: (...a: unknown[]) => unknown;
      offset: (...a: unknown[]) => unknown;
    } = {} as typeof node;
    node.then = (onF, onR) =>
      Promise.resolve()
        .then(() => selectPostMock())
        .then(onF, onR);
    node.leftJoin = (...a: unknown[]) => {
      leftJoinArgsMock(...a);
      return node;
    };
    node.where = (...a: unknown[]) => {
      whereArgsMock(...a);
      return node;
    };
    node.orderBy = (...a: unknown[]) => {
      orderByArgsMock(...a);
      return node;
    };
    node.limit = (...a: unknown[]) => {
      limitArgsMock(...a);
      return node;
    };
    node.offset = (...a: unknown[]) => {
      offsetArgsMock(...a);
      return node;
    };
    return node;
  };
  return {
    db: {
      select: vi.fn(() => ({
        from: vi.fn(() => makeChain()),
      })),
      insert: vi.fn(() => ({
        values: (v: unknown) => {
          insertValuesMock(v);
          return { returning: (...a: unknown[]) => insertMock(...a) };
        },
      })),
      update: vi.fn(() => ({
        set: (v: unknown) => {
          updateSetMock(v);
          return { where: (...a: unknown[]) => updateMock(...a) };
        },
      })),
    },
    schema: {
      posts: {
        id: "id",
        title: "title",
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
      // Phase 5 D-08 — post_seo one-to-one table (accessed by upsertPostSeo in savePost).
      postSeo: {
        id: "id",
        postId: "post_id",
        metaTitle: "meta_title",
        metaDescription: "meta_description",
        ogImage: "og_image",
        canonicalUrl: "canonical_url",
      },
      // 260827-se8 Task 4 — name/email/role markers: the author ilike filter
      // and the editor+admin recipient select reference these columns.
      user: { id: "id", name: "name", email: "email", role: "role" },
      settings: { key: "key", value: "value" },
    },
  };
});

import {
  savePost,
  getPost,
  listPosts,
  countPosts,
  submitForReview,
  autosavePost,
  rotatePreviewToken,
  publishPost,
  returnForRevision,
  setSchedule,
  revokePreviewToken,
} from "../posts";

const adminSession = () => ({ user: { id: "u-admin", role: "admin" }, session: { id: "s1" } });

/**
 * deepContains — walk an object graph looking for an exact value (260827-se8).
 * drizzle eq()/ilike()/and() embed the runtime value inside SQL nodes of the
 * captured WHERE/ORDER BY arguments; this helper proves a filter value reached
 * the query without depending on drizzle internals. Copied verbatim from
 * src/actions/__tests__/notifications.test.ts.
 */
function deepContains(value: unknown, needle: unknown): boolean {
  const seen = new Set<unknown>();
  const walk = (v: unknown): boolean => {
    if (v === null || v === undefined) return false;
    if (typeof v === "string") return v === needle;
    if (typeof v === "number") return v === needle;
    if (typeof v !== "object") return false;
    if (seen.has(v)) return false;
    seen.add(v);
    if (Array.isArray(v)) return v.some(walk);
    return Object.values(v).some(walk);
  };
  return walk(value);
}

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

describe("CR-02: savePost update path preserves publishedAt (publish-date data loss)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    assertOwnsPostMock.mockResolvedValue(adminSession());
    validateSlugMock.mockReturnValue({ valid: true });
    assertUniqueSlugMock.mockResolvedValue(undefined);
    deriveExcerptMock.mockReturnValue("auto-excerpt");
    sanitizeBeforeStoreMock.mockImplementation((s: string) => s);
    sanitizeBeforeRenderMock.mockImplementation((s: string) => s);
    postSchemaParseMock.mockImplementation((input) => input);
    // upsertPostSeo: no existing post_seo row → the INSERT path (not UPDATE).
    selectPostMock.mockResolvedValue([]);
    insertMock.mockResolvedValue(undefined);
    updateMock.mockResolvedValue(undefined);
  });

  it("OMITS publishedAt from the UPDATE set when the payload omits it (PostForm never sends it)", async () => {
    await savePost({ id: 7, title: "T", slug: "t", categoryId: 1, tagIds: [] });
    expect(updateSetMock).toHaveBeenCalledTimes(1);
    const setPayload = updateSetMock.mock.calls[0][0] as Record<string, unknown>;
    // The column must be entirely absent from the write — an explicit
    // publishedAt: null would wipe the publish date on every edit-save.
    expect("publishedAt" in setPayload).toBe(false);
  });

  it("writes publishedAt when the payload explicitly includes it (manual schedule path)", async () => {
    const when = new Date("2026-08-15T09:00:00Z");
    await savePost({ id: 7, title: "T", slug: "t", categoryId: 1, tagIds: [], publishedAt: when });
    expect(updateSetMock).toHaveBeenCalledTimes(1);
    const setPayload = updateSetMock.mock.calls[0][0] as Record<string, unknown>;
    expect(setPayload.publishedAt).toBe(when);
  });

  it("still defaults publishedAt to null on CREATE (no prior value to preserve)", async () => {
    insertMock.mockReturnValue([{ id: 42 }]);
    await savePost({ title: "T", slug: "t", categoryId: 1, tagIds: [] });
    // First insert call is the posts row (upsertPostSeo may insert post_seo after).
    const values = insertValuesMock.mock.calls[0][0] as Record<string, unknown>;
    expect(values.status).toBe("draft"); // sanity: this is the posts insert
    expect(values.publishedAt).toBeNull();
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

// ===========================================================================
// 260827-se8 Task 4 — URL-driven list mechanics (listPosts/countPosts),
// returnForRevision, and the submit/publish/return notify hooks
// [CITED: 260827-se8-PLAN.md Task 4 <behavior>]
// [CITED: research — ILIKE not FTS for the dashboard list (drafts/pending must
//  be findable; admin tables are small); T-Q-se8-07 awaited-swallow notify]
// ===========================================================================

describe("260827-se8 Task 4: listPosts — URL-filter mechanics (ILIKE, desc(updatedAt), page math)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireCanMock.mockResolvedValue(adminSession());
    selectPostMock.mockResolvedValue([]);
  });

  it("non-privileged call → requireCan throws BEFORE any db select (MUST_NOT_BE_REACHED)", async () => {
    requireCanMock.mockImplementation(() => {
      throw new Error("FORBIDDEN");
    });
    selectPostMock.mockImplementation(() => {
      throw new Error("MUST_NOT_BE_REACHED");
    });

    await expect(listPosts({ q: "x" })).rejects.toThrow("FORBIDDEN");
    expect(selectPostMock).not.toHaveBeenCalled();
    expect(requireCanMock).toHaveBeenCalledWith({ post: ["read"] });
  });

  it("q='hello' → WHERE embeds %hello% (title OR slug ilike); page 1 defaults → limit 20 / offset 0", async () => {
    await listPosts({ q: "hello" });

    expect(whereArgsMock).toHaveBeenCalled();
    expect(deepContains(whereArgsMock.mock.calls[0][0], "%hello%")).toBe(true);
    expect(limitArgsMock).toHaveBeenCalledWith(20);
    expect(offsetArgsMock).toHaveBeenCalledWith(0);
  });

  it("status + categoryId equality reach the WHERE clause", async () => {
    await listPosts({ status: "draft", categoryId: 12 });

    const whereArg = whereArgsMock.mock.calls[0][0];
    expect(deepContains(whereArg, "draft")).toBe(true);
    expect(deepContains(whereArg, 12)).toBe(true);
  });

  it("author='jane' → leftJoin user + WHERE embeds %jane% (joined name OR email ilike)", async () => {
    await listPosts({ author: "jane" });

    expect(leftJoinArgsMock).toHaveBeenCalled();
    expect(deepContains(whereArgsMock.mock.calls[0][0], "%jane%")).toBe(true);
  });

  it("deterministic desc(updatedAt) ordering", async () => {
    await listPosts({});

    expect(orderByArgsMock).toHaveBeenCalled();
    expect(deepContains(orderByArgsMock.mock.calls[0][0], "updated_at")).toBe(true);
  });

  it("page 3 → offset (3-1)×20 = 40; explicit pageSize 50 passes through; pageSize 500 → Zod REJECTS (>100 gate)", async () => {
    await listPosts({ page: 3 });
    expect(limitArgsMock).toHaveBeenCalledWith(20);
    expect(offsetArgsMock).toHaveBeenCalledWith(40);

    vi.clearAllMocks();
    selectPostMock.mockResolvedValue([]);
    await listPosts({ pageSize: 50 });
    expect(limitArgsMock).toHaveBeenCalledWith(50);

    // The 1-100 window is a hard gate (bounds DB work), not a silent clamp.
    selectPostMock.mockClear();
    await expect(listPosts({ pageSize: 500 })).rejects.toThrow();
    expect(selectPostMock).not.toHaveBeenCalled();
  });

  it("invalid status enum → Zod throws BEFORE any db select", async () => {
    // typed as never at the boundary — the URL layer hands raw strings in
    await expect(listPosts({ status: "bogus" } as never)).rejects.toThrow();
    expect(selectPostMock).not.toHaveBeenCalled();
  });
});

describe("260827-se8 Task 4: countPosts — same gate + same WHERE, count(*) shape, NO page window", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireCanMock.mockResolvedValue(adminSession());
    selectPostMock.mockResolvedValue([{ value: 7 }]);
  });

  it("non-privileged call → FORBIDDEN before any db select", async () => {
    requireCanMock.mockImplementation(() => {
      throw new Error("FORBIDDEN");
    });
    selectPostMock.mockImplementation(() => {
      throw new Error("MUST_NOT_BE_REACHED");
    });

    await expect(countPosts({})).rejects.toThrow("FORBIDDEN");
    expect(selectPostMock).not.toHaveBeenCalled();
  });

  it("applies the SAME q filter and returns Number(row.value) — never limit/offset (no page window)", async () => {
    const n = await countPosts({ q: "hello" });

    expect(n).toBe(7);
    expect(deepContains(whereArgsMock.mock.calls[0][0], "%hello%")).toBe(true);
    expect(limitArgsMock).not.toHaveBeenCalled();
    expect(offsetArgsMock).not.toHaveBeenCalled();
  });
});

describe("260827-se8 Task 4: returnForRevision — assertOwnsPost FIRST, notify author (minus actor), single 2-arg revalidation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    assertOwnsPostMock.mockResolvedValue(adminSession()); // actor u-admin
    transitionPostMock.mockResolvedValue(undefined);
    selectPostMock.mockResolvedValue([
      { title: "Hello", slug: "hello", authorId: "u-author" },
    ]);
    notifyUsersMock.mockResolvedValue(undefined);
    revalidatePathMock.mockReturnValue(undefined);
    revalidateTagMock.mockReturnValue(undefined);
  });

  it("assertOwnsPost fires FIRST — UNAUTHORIZED before transition/notify/select (MUST_NOT_BE_REACHED)", async () => {
    assertOwnsPostMock.mockRejectedValue(new Error("UNAUTHORIZED"));
    transitionPostMock.mockImplementation(() => {
      throw new Error("MUST_NOT_BE_REACHED");
    });
    selectPostMock.mockImplementation(() => {
      throw new Error("MUST_NOT_BE_REACHED");
    });
    notifyUsersMock.mockImplementation(() => {
      throw new Error("MUST_NOT_BE_REACHED");
    });

    await expect(returnForRevision(5)).rejects.toThrow("UNAUTHORIZED");
    expect(transitionPostMock).not.toHaveBeenCalled();
    expect(notifyUsersMock).not.toHaveBeenCalled();
  });

  it("happy path → transitionPost(5,'draft'), notify the author 'post_returned' with postId+postTitle, EXACTLY ONE revalidateTag('posts-list','max') and NO revalidatePath", async () => {
    const result = await returnForRevision(5);

    expect(result).toEqual({ ok: true });
    expect(transitionPostMock).toHaveBeenCalledWith(5, "draft");
    expect(notifyUsersMock).toHaveBeenCalledTimes(1);
    expect(notifyUsersMock).toHaveBeenCalledWith(
      ["u-author"],
      "post_returned",
      { postId: 5, postTitle: "Hello" },
    );
    expect(revalidateTagMock).toHaveBeenCalledTimes(1);
    expect(revalidateTagMock).toHaveBeenCalledWith("posts-list", "max");
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("actor IS the author → no self-notify, action still ok", async () => {
    selectPostMock.mockResolvedValue([
      { title: "Mine", slug: "mine", authorId: "u-admin" },
    ]);

    await expect(returnForRevision(5)).resolves.toEqual({ ok: true });
    expect(notifyUsersMock).not.toHaveBeenCalled();
  });

  it("notifyUsers rejection → action STILL returns ok (T-Q-se8-07 awaited-swallow, action-level catch)", async () => {
    notifyUsersMock.mockRejectedValue(new Error("insert failed"));

    await expect(returnForRevision(5)).resolves.toEqual({ ok: true });
    expect(revalidateTagMock).toHaveBeenCalledWith("posts-list", "max");
  });

  it("null authorId → no notify, still ok + revalidated", async () => {
    selectPostMock.mockResolvedValue([{ title: "T", slug: "t", authorId: null }]);

    await expect(returnForRevision(5)).resolves.toEqual({ ok: true });
    expect(notifyUsersMock).not.toHaveBeenCalled();
    expect(revalidateTagMock).toHaveBeenCalledWith("posts-list", "max");
  });
});

describe("260827-se8 Task 4: submitForReview notifies editors+admins (actor excluded)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    assertOwnsPostMock.mockResolvedValue(adminSession()); // actor u-admin
    transitionPostMock.mockResolvedValue(undefined);
    notifyUsersMock.mockResolvedValue(undefined);
  });

  it("after the transition → notifyUsers fires with reviewer ids EXCLUDING the actor, 'post_submitted' + postId/postTitle", async () => {
    // First select: the post title fetch; second: the editor+admin id rows.
    selectPostMock
      .mockResolvedValueOnce([{ title: "Draft T" }])
      .mockResolvedValueOnce([{ id: "u-e1" }, { id: "u-admin" }]);

    const result = await submitForReview(9);

    expect(result).toEqual({ ok: true });
    expect(transitionPostMock).toHaveBeenCalledWith(9, "pending_review");
    expect(notifyUsersMock).toHaveBeenCalledTimes(1);
    expect(notifyUsersMock).toHaveBeenCalledWith(
      ["u-e1"],
      "post_submitted",
      { postId: 9, postTitle: "Draft T" },
    );
  });

  it("notifyUsers rejection → submit STILL returns ok (T-Q-se8-07)", async () => {
    selectPostMock
      .mockResolvedValueOnce([{ title: "T" }])
      .mockResolvedValueOnce([{ id: "u-e1" }]);
    notifyUsersMock.mockRejectedValue(new Error("insert failed"));

    await expect(submitForReview(9)).resolves.toEqual({ ok: true });
  });

  it("transitionPost rejection → notify NEVER fires (funnel-first ordering)", async () => {
    transitionPostMock.mockImplementation(() => {
      throw new Error("FORBIDDEN");
    });
    notifyUsersMock.mockImplementation(() => {
      throw new Error("MUST_NOT_BE_REACHED");
    });

    await expect(submitForReview(9)).rejects.toThrow("FORBIDDEN");
    expect(notifyUsersMock).not.toHaveBeenCalled();
  });
});

describe("260827-se8 Task 4: publishPost notifies the author (actor excluded)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    assertOwnsPostMock.mockResolvedValue(adminSession()); // actor u-admin
    requireCanMock.mockResolvedValue(adminSession());
    transitionPostMock.mockResolvedValue(undefined);
    updateMock.mockResolvedValue(undefined);
    revalidatePathMock.mockReturnValue(undefined);
    revalidateTagMock.mockReturnValue(undefined);
    notifyUsersMock.mockResolvedValue(undefined);
    selectPostMock.mockResolvedValue([
      {
        id: 7,
        title: "Hello World",
        slug: "hello-world",
        authorId: "u-author-1",
        categoryId: 3,
        categorySlug: "news",
      },
    ]);
  });

  it("after revalidation → notifyUsers fires for the post's authorId with 'post_published' + postTitle", async () => {
    const result = await publishPost(7);

    expect(result).toEqual({ ok: true });
    expect(notifyUsersMock).toHaveBeenCalledTimes(1);
    expect(notifyUsersMock).toHaveBeenCalledWith(
      ["u-author-1"],
      "post_published",
      { postId: 7, postTitle: "Hello World" },
    );
    // Revalidation is UNTOUCHED by the notify hook.
    expect(revalidateTagMock.mock.calls.length).toBeGreaterThan(0);
  });

  it("notifyUsers rejection → publish still ok and revalidation already fired (T-Q-se8-07)", async () => {
    notifyUsersMock.mockRejectedValue(new Error("insert failed"));

    await expect(publishPost(7)).resolves.toEqual({ ok: true });
    expect(revalidateTagMock.mock.calls.length).toBeGreaterThan(0);
  });

  it("actor IS the author → no self-notify", async () => {
    selectPostMock.mockResolvedValue([
      {
        id: 7,
        title: "Mine",
        slug: "mine",
        authorId: "u-admin",
        categoryId: 3,
        categorySlug: "news",
      },
    ]);

    await publishPost(7);
    expect(notifyUsersMock).not.toHaveBeenCalled();
  });
});
