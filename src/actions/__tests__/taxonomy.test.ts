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
} = vi.hoisted(() => ({
  requireCanMock: vi.fn(),
  assertUniqueSlugMock: vi.fn(),
  validateSlugMock: vi.fn(),
  selectMock: vi.fn(),
  insertMock: vi.fn(),
  updateMock: vi.fn(),
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
    select: vi.fn(() => ({
      from: vi.fn(() => ({ where: (...a: unknown[]) => selectMock(...a) })),
    })),
    // insert().values().returning() chain — actions use .returning({ id }) to get the PK.
    insert: vi.fn(() => ({
      values: vi.fn(() => ({ returning: (...a: unknown[]) => insertMock(...a) })),
    })),
    update: vi.fn(() => ({ set: vi.fn(() => ({ where: (...a: unknown[]) => updateMock(...a) })) })),
  },
  schema: {
    categories: { id: "id", slug: "slug", name: "name", deletedAt: "deleted_at" },
    tags: { id: "id", slug: "slug", name: "name", deletedAt: "deleted_at" },
  },
}));

import { createCategory, softDeleteCategory } from "../categories";
import { createTag, softDeleteTag } from "../tags";
import { postSchema } from "../posts-schema";

describe("CONT-05/06 + T-03-01: taxonomy actions enforce requireCan + assertUniqueSlug FIRST", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireCanMock.mockResolvedValue({ user: { id: "u1", role: "editor" }, session: { id: "s1" } });
    validateSlugMock.mockReturnValue({ valid: true });
    assertUniqueSlugMock.mockResolvedValue(undefined);
    // .returning() resolves to an array; actions destructure `const [row] = ...`.
    insertMock.mockResolvedValue([{ id: 1 }]);
    updateMock.mockResolvedValue(undefined);
    selectMock.mockResolvedValue([]);
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
