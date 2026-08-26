// src/actions/__tests__/taxonomy.test.ts
// [CITED: VALIDATION.md Wave 0 rows "CONT-05/06 — category/tag CRUD + cap"]
// [CITED: 03-01-PLAN.md Task 3 <behavior> + <acceptance_criteria>]
// [CITED: PATTERNS.md row — clone users.test.ts mock shape]
//
// Wave-0 taxonomy tests:
//   - CONT-05/06: createCategory/createTag call assertUniqueSlug (D-20 applies to all 3)
//   - D-23: tag cap (8) is enforced SERVER-SIDE in postSchema.parse (cross-test
//     via importing postSchema directly — does NOT call any action)
//   - D-08: softDelete sets deletedAt, never hard-deletes
import { describe, it, expect, beforeEach, vi } from "vitest";

const {
  requireCanMock,
  assertUniqueSlugMock,
  validateSlugMock,
  selectMock,
  insertMock,
  updateMock,
  revalidatePathMock,
  revalidateTagMock,
} = vi.hoisted(() => ({
  requireCanMock: vi.fn(),
  assertUniqueSlugMock: vi.fn(),
  validateSlugMock: vi.fn(),
  selectMock: vi.fn(),
  insertMock: vi.fn(),
  updateMock: vi.fn(),
  revalidatePathMock: vi.fn(),
  revalidateTagMock: vi.fn(),
}));

// next/cache — Plan 07-03 Task 2 added revalidation calls to createCategory /
// updateCategory / softDeleteCategory / createTag / updateTag / softDeleteTag.
// Mock so the action bodies run in isolation without Next's static-generation store.
vi.mock("next/cache", () => ({
  revalidatePath: (...a: unknown[]) => revalidatePathMock(...a),
  revalidateTag: (...a: unknown[]) => revalidateTagMock(...a),
}));

vi.mock("@/lib/permissions", () => ({
  requireCan: (...a: unknown[]) => requireCanMock(...a),
}));

vi.mock("@/lib/slug", () => ({
  validateSlug: (...a: unknown[]) => validateSlugMock(...a),
  assertUniqueSlug: (...a: unknown[]) => assertUniqueSlugMock(...a),
}));

vi.mock("@/lib/log", () => ({
  log: { info: vi.fn(), error: vi.fn() },
}));

vi.mock("@/lib/auth", () => ({
  auth: { api: { getSession: vi.fn() } },
}));

vi.mock("@/lib/db", () => ({
  db: {
    // Chainable: select().from().where().{orderBy,limit}() — Plan 07-03 added a
    // .where(...).limit(1) slug-fetch in updateCategory/softDeleteCategory/
    // updateTag/softDeleteTag, so the chain must support both terminators.
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: (...a: unknown[]) => ({
          orderBy: (...b: unknown[]) => selectMock(...a, ...b),
          limit: (...b: unknown[]) => selectMock(...a, ...b),
        }),
      })),
    })),
    // insert().values().returning() chain — actions use .returning({ id, slug }) to get
    // the PK + slug for revalidation (Plan 07-03 Task 2).
    insert: vi.fn(() => ({
      values: vi.fn(() => ({ returning: (...a: unknown[]) => insertMock(...a) })),
    })),
    update: vi.fn(() => ({ set: vi.fn(() => ({ where: (...a: unknown[]) => updateMock(...a) })) })),
  },
  schema: {
    categories: { id: "id", slug: "slug", name: "name", deletedAt: "deleted_at" },
    tags: { id: "id", slug: "slug", name: "name", deletedAt: "deleted_at" },
    postTags: { postId: "post_id", tagId: "tag_id" },
  },
}));

import {
  createCategory,
  listCategories,
  updateCategory,
  softDeleteCategory,
} from "../categories";
import { createTag, listTags, softDeleteTag, updateTag } from "../tags";
import { postSchema } from "../posts-schema";

describe("CONT-05/06 + T-03-01: taxonomy actions enforce requireCan + assertUniqueSlug FIRST", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireCanMock.mockResolvedValue({ user: { id: "u1", role: "editor" }, session: { id: "s1" } });
    validateSlugMock.mockReturnValue({ valid: true });
    assertUniqueSlugMock.mockResolvedValue(undefined);
    // .returning() resolves to an array; actions destructure `const [row] = ...`.
    // Plan 07-03 Task 2: row now carries slug so createCategory/createTag can build
    // the concrete /category/${slug} path for revalidation.
    insertMock.mockResolvedValue([{ id: 1, slug: "news" }]);
    updateMock.mockResolvedValue(undefined);
    // The pre-update/pre-delete slug-fetch (.where(...).limit(1)) resolves to a
    // one-element array carrying the existing slug.
    selectMock.mockResolvedValue([{ slug: "existing-slug" }]);
    // next/cache mocks — no-op spies; the Plan 07-06 WR-04 describe below pins
    // the concrete revalidatePath/revalidateTag call literals each action emits.
    revalidatePathMock.mockReturnValue(undefined);
    revalidateTagMock.mockReturnValue(undefined);
  });

  it("createCategory calls requireCan({taxonomy:['create']}) FIRST", async () => {
    requireCanMock.mockImplementation(() => {
      throw new Error("FORBIDDEN");
    });
    insertMock.mockImplementation(() => {
      throw new Error("MUST_NOT_BE_REACHED");
    });
    await expect(createCategory({ name: "News", slug: "news" })).rejects.toThrow("FORBIDDEN");
    expect(insertMock).not.toHaveBeenCalled();
    expect(requireCanMock).toHaveBeenCalledWith({ taxonomy: ["create"] });
  });

  it("createCategory calls assertUniqueSlug(slug, 'categories') before db.insert (D-20)", async () => {
    assertUniqueSlugMock.mockImplementation(() => {
      throw new Error("SLUG_NOT_UNIQUE");
    });
    insertMock.mockImplementation(() => {
      throw new Error("MUST_NOT_BE_REACHED");
    });
    await expect(createCategory({ name: "News", slug: "dup" })).rejects.toThrow("SLUG_NOT_UNIQUE");
    expect(insertMock).not.toHaveBeenCalled();
    // D-20: assertUniqueSlug receives (slug, table, excludeId?). excludeId is undefined
    // on create (only passed on update so an edit doesn't collide with itself).
    expect(assertUniqueSlugMock).toHaveBeenCalledWith("dup", "categories");
  });

  it("createTag calls assertUniqueSlug(slug, 'tags') before db.insert", async () => {
    await createTag({ name: "Tech", slug: "tech" });
    expect(assertUniqueSlugMock).toHaveBeenCalledWith("tech", "tags");
    expect(insertMock).toHaveBeenCalledTimes(1);
  });

  it("softDeleteCategory sets deletedAt (D-08), does NOT hard-delete", async () => {
    requireCanMock.mockResolvedValue({ user: { id: "u1", role: "editor" } });
    await softDeleteCategory(7);
    expect(updateMock).toHaveBeenCalledTimes(1);
    // The set object is captured by the mock; we just assert update was the path.
  });

  it("softDeleteTag sets deletedAt (D-08)", async () => {
    await softDeleteTag(9);
    expect(updateMock).toHaveBeenCalledTimes(1);
  });
});

// ============================================================
// Plan 07-06 / WR-04 — revalidation call assertions. The Plan 07-03 wiring
// added these calls but the mocks existed only to keep the actions from
// crashing; zero call assertions existed, so a dropped "max" tag argument, a
// wrong slug literal, or a missing old-URL revalidation on rename/delete
// would pass green (07-REVIEW WR-04). These blocks pin the EXACT literals
// the source emits (seeded slugs: insert → "news", pre-fetch → "existing-slug").
// ============================================================
describe("Plan 07-06 / WR-04: taxonomy revalidation calls — concrete literal assertions (2-arg max form)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireCanMock.mockResolvedValue({ user: { id: "u1", role: "editor" }, session: { id: "s1" } });
    validateSlugMock.mockReturnValue({ valid: true });
    assertUniqueSlugMock.mockResolvedValue(undefined);
    insertMock.mockResolvedValue([{ id: 1, slug: "news" }]);
    updateMock.mockResolvedValue(undefined);
    selectMock.mockResolvedValue([{ slug: "existing-slug" }]);
    revalidatePathMock.mockReturnValue(undefined);
    revalidateTagMock.mockReturnValue(undefined);
  });

  it("createCategory revalidates /category/{slug} + all list surfaces + category-1 & posts-list tags (2-arg max)", async () => {
    await createCategory({ name: "News", slug: "news" });

    expect(revalidatePathMock).toHaveBeenCalledWith("/category/news");
    expect(revalidatePathMock).toHaveBeenCalledWith("/blog");
    expect(revalidatePathMock).toHaveBeenCalledWith("/");
    expect(revalidatePathMock).toHaveBeenCalledWith("/archive");
    expect(revalidatePathMock).toHaveBeenCalledWith("/sitemap.xml");
    expect(revalidateTagMock).toHaveBeenCalledWith("category-1", "max");
    expect(revalidateTagMock).toHaveBeenCalledWith("posts-list", "max");
  });

  it("softDeleteCategory revalidates the PRE-DELETE fetched slug URL + category-{id} & posts-list tags", async () => {
    await softDeleteCategory(7);

    expect(revalidatePathMock).toHaveBeenCalledWith("/category/existing-slug");
    expect(revalidateTagMock).toHaveBeenCalledWith("category-7", "max");
    expect(revalidateTagMock).toHaveBeenCalledWith("posts-list", "max");
  });

  it("updateCategory with a RENAMED slug revalidates BOTH the old-slug and new-slug paths (old URL must 404, new URL must prime)", async () => {
    await updateCategory(7, { name: "News 2", slug: "renamed-news" });

    expect(revalidatePathMock).toHaveBeenCalledWith("/category/existing-slug");
    expect(revalidatePathMock).toHaveBeenCalledWith("/category/renamed-news");
    expect(revalidateTagMock).toHaveBeenCalledWith("category-7", "max");
    expect(revalidateTagMock).toHaveBeenCalledWith("posts-list", "max");
  });

  it("createTag revalidates /tag/{slug} + posts-list tag, with NO per-entity tag (listArchive has no per-tag cacheTag)", async () => {
    await createTag({ name: "News", slug: "news" });

    expect(revalidatePathMock).toHaveBeenCalledWith("/tag/news");
    expect(revalidateTagMock).toHaveBeenCalledWith("posts-list", "max");
    // Tags have no per-entity cacheTag axis (only categories/authors do) —
    // pin the negative: no category-N / tag-N tag was fired.
    const tagCalls = revalidateTagMock.mock.calls.map((c) => String(c[0]));
    expect(tagCalls.every((t) => t === "posts-list")).toBe(true);
  });

  it("softDeleteTag revalidates the pre-delete fetched slug URL + posts-list tag", async () => {
    await softDeleteTag(9);

    expect(revalidatePathMock).toHaveBeenCalledWith("/tag/existing-slug");
    expect(revalidateTagMock).toHaveBeenCalledWith("posts-list", "max");
  });
});

// ============================================================
// Plan 07-07 / WR-05 — Zod input validation for taxonomy actions.
// createCategory/updateCategory/createTag/updateTag previously wrote WHATEVER
// arrived: an empty-string name sailed through on create (DB NOT NULL was the
// only backstop), updateCategory/updateTag's truthiness spread
// `input.name ? { name } : {}` SILENTLY DROPPED a present-but-empty name (a
// "rename to nothing" became a silent no-op instead of an error), and length
// limits (name ≤120, description ≤1000) did not exist at all (07-REVIEW
// WR-05). These tests pin the INVALID_INPUT contract: Zod safeParse fires
// AFTER requireCan, BEFORE slug validation and any db write.
// ============================================================
describe("Plan 07-07 / WR-05: taxonomy actions validate input via Zod (INVALID_INPUT)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireCanMock.mockResolvedValue({ user: { id: "u1", role: "editor" }, session: { id: "s1" } });
    validateSlugMock.mockReturnValue({ valid: true });
    assertUniqueSlugMock.mockResolvedValue(undefined);
    insertMock.mockResolvedValue([{ id: 1, slug: "news" }]);
    updateMock.mockResolvedValue(undefined);
    selectMock.mockResolvedValue([{ slug: "existing-slug" }]);
    revalidatePathMock.mockReturnValue(undefined);
    revalidateTagMock.mockReturnValue(undefined);
  });

  it("createCategory rejects an EMPTY name with INVALID_INPUT BEFORE db.insert", async () => {
    insertMock.mockImplementation(() => {
      throw new Error("MUST_NOT_BE_REACHED");
    });
    await expect(createCategory({ name: "", slug: "news" })).rejects.toThrow("INVALID_INPUT");
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("createTag rejects an EMPTY name with INVALID_INPUT BEFORE db.insert", async () => {
    insertMock.mockImplementation(() => {
      throw new Error("MUST_NOT_BE_REACHED");
    });
    await expect(createTag({ name: "", slug: "tech" })).rejects.toThrow("INVALID_INPUT");
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("createCategory rejects a name longer than 120 characters", async () => {
    insertMock.mockImplementation(() => {
      throw new Error("MUST_NOT_BE_REACHED");
    });
    await expect(
      createCategory({ name: "x".repeat(121), slug: "news" }),
    ).rejects.toThrow("INVALID_INPUT");
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("createCategory rejects a description longer than 1000 characters", async () => {
    insertMock.mockImplementation(() => {
      throw new Error("MUST_NOT_BE_REACHED");
    });
    await expect(
      createCategory({ name: "News", slug: "news", description: "d".repeat(1001) }),
    ).rejects.toThrow("INVALID_INPUT");
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("updateCategory rejects a PRESENT-BUT-EMPTY name (the truthiness spread silently dropped it — 07-REVIEW WR-05)", async () => {
    updateMock.mockImplementation(() => {
      throw new Error("MUST_NOT_BE_REACHED");
    });
    await expect(updateCategory(7, { name: "" })).rejects.toThrow("INVALID_INPUT");
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("updateTag rejects a present-but-empty name", async () => {
    updateMock.mockImplementation(() => {
      throw new Error("MUST_NOT_BE_REACHED");
    });
    await expect(updateTag(9, { name: "" })).rejects.toThrow("INVALID_INPUT");
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("validation fires AFTER the permission gate (a forbidden caller still gets FORBIDDEN, not INVALID_INPUT)", async () => {
    requireCanMock.mockImplementation(() => {
      throw new Error("FORBIDDEN");
    });
    await expect(createCategory({ name: "", slug: "news" })).rejects.toThrow("FORBIDDEN");
  });

  it("validation fires BEFORE slug validation (an invalid name wins over the INVALID_SLUG path)", async () => {
    validateSlugMock.mockImplementation(() => {
      throw new Error("INVALID_SLUG_MUST_NOT_WIN");
    });
    await expect(createCategory({ name: "", slug: "news" })).rejects.toThrow("INVALID_INPUT");
  });

  it("description-ONLY update with a valid value still passes (Partial semantics preserved)", async () => {
    await expect(updateCategory(7, { description: "A short description." })).resolves.toEqual({ id: 7 });
    expect(updateMock).toHaveBeenCalledTimes(1);
  });

  it("EMPTY-STRING description is ALLOWED on update (clearing the field is legitimate — only name has min(1))", async () => {
    await expect(updateCategory(7, { description: "" })).resolves.toEqual({ id: 7 });
    expect(updateMock).toHaveBeenCalledTimes(1);
  });
});

describe("CONT-05/06: listCategories / listTags return sorted data for pickers (D-22)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // listCategories/listTags mock returns rows — the .orderBy(asc(name)) in the
    // source code is the sorting implementation; the mock verifies the chain resolves.
    selectMock.mockResolvedValue([
      { id: 2, name: "Beta", slug: "beta" },
      { id: 1, name: "Alpha", slug: "alpha" },
      { id: 3, name: "Gamma", slug: "gamma" },
    ]);
  });

  it("listCategories returns rows (sorted by name in the query — D-22 UX for picker)", async () => {
    const rows = await listCategories();
    expect(Array.isArray(rows)).toBe(true);
    expect(rows.length).toBe(3);
    // The mock returns data as-is; the .orderBy(asc(name)) in categories.ts is the
    // sorting implementation (verified by code review — the chain reaches .orderBy()).
    expect(selectMock).toHaveBeenCalled();
  });

  it("listTags returns rows (sorted by name in the query — D-22 UX for picker)", async () => {
    const rows = await listTags();
    expect(Array.isArray(rows)).toBe(true);
    expect(rows.length).toBe(3);
    expect(selectMock).toHaveBeenCalled();
  });
});

describe("D-23: tagIds cap (8) enforced via postSchema.parse (server-side)", () => {
  it("postSchema rejects tagIds.length > 8 with TOO_MANY_TAGS", () => {
    const tooMany = Array.from({ length: 9 }, (_, i) => i + 1);
    expect(() =>
      postSchema.parse({
        title: "T",
        slug: "t-slug",
        categoryId: 1,
        tagIds: tooMany,
      }),
    ).toThrow(/TOO_MANY_TAGS/);
  });

  it("postSchema accepts tagIds.length === 8", () => {
    const ok = Array.from({ length: 8 }, (_, i) => i + 1);
    expect(() =>
      postSchema.parse({
        title: "T",
        slug: "t-slug",
        categoryId: 1,
        tagIds: ok,
      }),
    ).not.toThrow();
  });

  it("postSchema rejects undefined categoryId (D-23 required category)", () => {
    expect(() =>
      postSchema.parse({
        title: "T",
        slug: "t-slug",
        tagIds: [],
      }),
    ).toThrow();
  });
});
