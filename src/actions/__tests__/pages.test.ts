// src/actions/__tests__/pages.test.ts
// [CITED: VALIDATION.md Wave 0 row "pages.test.ts — covers DASH-05/D-17/D-20"]
// [CITED: 04-04-PLAN.md Task 1 <behavior> + <acceptance_criteria>]
// [CITED: PATTERNS.md row — clone taxonomy.test.ts mock shape]
//
// Wave-0 pages tests:
//   - DASH-05: createPage / updatePage / listPages / getPage / softDeletePage all
//     enforce requireCan({ page: [...] }) FIRST (Phase 2 Pitfall #1).
//   - D-20: pageSchema rejects status: "pending_review" (pages = draft | published only).
//   - D-08: softDeletePage sets deletedAt, never hard-deletes.
//   - NOT_FOUND: getPage throws on missing id.
//
// Mock strategy: vi.hoisted + vi.mock server-only deps so the action bodies run in
// isolation. The MUST_NOT_BE_REACHED idiom proves the permission check fires BY
// EXECUTION ORDER, not just that refusal happens eventually.
import { describe, it, expect, beforeEach, vi } from "vitest";

const {
  requireCanMock,
  selectMock,
  insertMock,
  updateMock,
} = vi.hoisted(() => ({
  requireCanMock: vi.fn(),
  selectMock: vi.fn(),
  insertMock: vi.fn(),
  updateMock: vi.fn(),
}));

vi.mock("@/lib/permissions", () => ({
  requireCan: (...a: unknown[]) => requireCanMock(...a),
}));

vi.mock("@/lib/log", () => ({
  log: { info: vi.fn(), error: vi.fn() },
}));

vi.mock("@/lib/sanitize", () => ({
  // Body sanitize is a no-op walk over JSON strings — stub it as identity for tests.
  sanitizeBeforeStore: (s: string) => s,
}));

vi.mock("@/lib/db", () => {
  // Build a chainable select/from/where/limit/orderBy mock so any combination
  // used by pages.ts (listPages: .where().orderBy(); getPage: .where().limit(1))
  // resolves to selectMock without falling off the chain.
  const chain = () => {
    const self: Record<string, unknown> = {};
    self.from = vi.fn(() => self);
    self.where = vi.fn(() => self);
    self.limit = vi.fn(() => selectMock());
    self.orderBy = vi.fn(() => selectMock());
    return self;
  };
  return {
    db: {
      // select() kicks off the chain — both .limit() and .orderBy() terminators
      // resolve to selectMock (the rows array).
      select: vi.fn(() => chain()),
      // insert().values().returning() chain — actions destructure `const [row] = ...`.
      insert: vi.fn(() => ({
        values: vi.fn(() => ({ returning: (...a: unknown[]) => insertMock(...a) })),
      })),
      // update().set().where() chain.
      update: vi.fn(() => ({
        set: vi.fn(() => ({ where: (...a: unknown[]) => updateMock(...a) })),
      })),
    },
    schema: {
      pages: {
        id: "id",
        slug: "slug",
        title: "title",
        body: "body",
        status: "status",
        deletedAt: "deleted_at",
        metaTitle: "meta_title",
        metaDescription: "meta_description",
        canonical: "canonical",
      },
    },
  };
});

import {
  createPage,
  updatePage,
  listPages,
  getPage,
  softDeletePage,
} from "../pages";
import { pageSchema } from "../pages-schema";

describe("DASH-05 / T-04-16: pages actions enforce requireCan FIRST (Pitfall #1)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireCanMock.mockResolvedValue({
      user: { id: "u1", role: "admin" },
      session: { id: "s1" },
    });
    insertMock.mockResolvedValue([{ id: 1 }]);
    updateMock.mockResolvedValue(undefined);
    selectMock.mockResolvedValue([
      {
        id: 1,
        title: "Terms",
        slug: "terms-and-conditions",
        body: null,
        status: "draft",
        deletedAt: null,
        metaTitle: null,
        metaDescription: null,
        canonical: null,
      },
    ]);
  });

  it("createPage calls requireCan({page:['create']}) FIRST — FORBIDDEN before db.insert", async () => {
    requireCanMock.mockImplementation(() => {
      throw new Error("FORBIDDEN");
    });
    insertMock.mockImplementation(() => {
      throw new Error("MUST_NOT_BE_REACHED");
    });
    await expect(
      createPage({ title: "T", slug: "t-and-c" }),
    ).rejects.toThrow("FORBIDDEN");
    expect(insertMock).not.toHaveBeenCalled();
    expect(requireCanMock).toHaveBeenCalledWith({ page: ["create"] });
  });

  it("updatePage calls requireCan({page:['update']}) FIRST — FORBIDDEN before db.update", async () => {
    requireCanMock.mockImplementation(() => {
      throw new Error("FORBIDDEN");
    });
    updateMock.mockImplementation(() => {
      throw new Error("MUST_NOT_BE_REACHED");
    });
    await expect(
      updatePage(1, { title: "T2" }),
    ).rejects.toThrow("FORBIDDEN");
    expect(updateMock).not.toHaveBeenCalled();
    expect(requireCanMock).toHaveBeenCalledWith({ page: ["update"] });
  });

  it("listPages calls requireCan({page:['read']}) FIRST", async () => {
    requireCanMock.mockImplementation(() => {
      throw new Error("FORBIDDEN");
    });
    selectMock.mockImplementation(() => {
      throw new Error("MUST_NOT_BE_REACHED");
    });
    await expect(listPages()).rejects.toThrow("FORBIDDEN");
    expect(selectMock).not.toHaveBeenCalled();
    expect(requireCanMock).toHaveBeenCalledWith({ page: ["read"] });
  });

  it("getPage calls requireCan({page:['read']}) FIRST", async () => {
    requireCanMock.mockImplementation(() => {
      throw new Error("FORBIDDEN");
    });
    selectMock.mockImplementation(() => {
      throw new Error("MUST_NOT_BE_REACHED");
    });
    await expect(getPage(1)).rejects.toThrow("FORBIDDEN");
    expect(selectMock).not.toHaveBeenCalled();
  });

  it("softDeletePage calls requireCan({page:['delete']}) FIRST — FORBIDDEN before db.update", async () => {
    requireCanMock.mockImplementation(() => {
      throw new Error("FORBIDDEN");
    });
    updateMock.mockImplementation(() => {
      throw new Error("MUST_NOT_BE_REACHED");
    });
    await expect(softDeletePage(7)).rejects.toThrow("FORBIDDEN");
    expect(updateMock).not.toHaveBeenCalled();
    expect(requireCanMock).toHaveBeenCalledWith({ page: ["delete"] });
  });
});

describe("DASH-05: listPages / getPage return row data", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireCanMock.mockResolvedValue({
      user: { id: "u1", role: "admin" },
      session: { id: "s1" },
    });
    selectMock.mockResolvedValue([
      {
        id: 2,
        title: "Privacy",
        slug: "privacy-policy",
        body: null,
        status: "draft",
      },
    ]);
  });

  it("listPages returns rows", async () => {
    const rows = await listPages();
    expect(Array.isArray(rows)).toBe(true);
    expect(rows.length).toBe(1);
    expect(selectMock).toHaveBeenCalled();
  });

  it("getPage returns the row for the requested id", async () => {
    const row = await getPage(2);
    expect(row).toBeTruthy();
    expect(row.id).toBe(2);
  });

  it("getPage throws NOT_FOUND when the row is missing", async () => {
    selectMock.mockResolvedValue([]);
    await expect(getPage(99)).rejects.toThrow("NOT_FOUND");
  });
});

describe("D-08: softDeletePage sets deletedAt (never hard-deletes)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireCanMock.mockResolvedValue({
      user: { id: "u1", role: "admin" },
      session: { id: "s1" },
    });
    updateMock.mockResolvedValue(undefined);
  });

  it("softDeletePage routes through db.update (sets deletedAt)", async () => {
    await softDeletePage(5);
    expect(updateMock).toHaveBeenCalledTimes(1);
  });
});

describe("D-20: pageSchema rejects pending_review (pages = draft | published only)", () => {
  it("accepts status: 'draft'", () => {
    expect(() =>
      pageSchema.parse({
        title: "Terms",
        slug: "terms-and-conditions",
        status: "draft",
      }),
    ).not.toThrow();
  });

  it("accepts status: 'published'", () => {
    expect(() =>
      pageSchema.parse({
        title: "Privacy",
        slug: "privacy-policy",
        status: "published",
      }),
    ).not.toThrow();
  });

  it("rejects status: 'pending_review' (D-20 — no review workflow for pages)", () => {
    expect(() =>
      pageSchema.parse({
        title: "Contact",
        slug: "contact",
        status: "pending_review",
      }),
    ).toThrow();
  });

  it("accepts a fully-populated page input (slug + SEO fields)", () => {
    expect(() =>
      pageSchema.parse({
        title: "Legal",
        slug: "legal",
        body: { type: "doc" },
        status: "published",
        metaTitle: "Legal — Any Discussion",
        metaDescription: "Legal pages",
        canonical: "https://anydiscussion.com/legal",
      }),
    ).not.toThrow();
  });
});
