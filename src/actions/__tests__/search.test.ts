// src/actions/__tests__/search.test.ts
// [CITED: 260827-se8-PLAN.md Task 8 <behavior> — the globalSearch contract]
// [CITED: src/actions/__tests__/users.test.ts — the mock harness pattern]
//
// 260827-se8 Task 8 — the header global search action:
//   - getSessionOrThrow FIRST (unauthenticated → UNAUTHORIZED before any db access)
//   - q length-bounded (100) via the Task 2 helper; <2 chars → empty groups,
//     zero DB round-trips
//   - posts leg: requireCan({post:["read"]}) AND role-scoped FROM THE SESSION —
//     author sees ONLY own posts (authorId equality); editor/admin see any
//     status (drafts findable — dashboard semantics)
//   - users leg: ONLY when session.user.role === "admin" — for any other role
//     the user-table select is NEVER invoked (MUST_NOT_BE_REACHED proof) and
//     the users group is empty
//   - categories + tags legs: open to all dashboard roles; tags exclude
//     soft-deleted; ilike name; every leg capped at limit 5
//   - shape: minimal columns only — the users projection must never carry
//     password material
//
// Mock strategy: @/lib/permissions fully stubbed (getSessionOrThrow +
// requireCan); @/lib/db select/from/where/limit chain records per-TABLE calls
// (from-table identity distinguishes the four legs) and resolves a controlled
// rows array; drizzle-orm operators stay REAL so the WHERE graphs are asserted
// structurally (deepContains).
import { describe, it, expect, beforeEach, vi } from "vitest";
import { schema } from "@/lib/db";

const {
  getSessionOrThrowMock,
  requireCanMock,
  selectProjMock,
  fromTableMock,
  whereCallsMock,
  limitCallsMock,
  selectResultMock,
} = vi.hoisted(() => ({
  getSessionOrThrowMock: vi.fn(),
  requireCanMock: vi.fn(),
  selectProjMock: vi.fn(),
  fromTableMock: vi.fn(),
  whereCallsMock: vi.fn(),
  limitCallsMock: vi.fn(),
  selectResultMock: vi.fn(),
}));

vi.mock("@/lib/permissions", () => ({
  getSessionOrThrow: (...a: unknown[]) => getSessionOrThrowMock(...a),
  requireCan: (...a: unknown[]) => requireCanMock(...a),
}));

vi.mock("@/lib/db", () => ({
  db: {
    // Lazy-thenable chain: the terminal mock fires only when the action awaits.
    // select(projection) and from(table) are captured so per-leg projections
    // and table routing stay assertable; where/limit calls carry their table.
    select: vi.fn((...proj: unknown[]) => {
      selectProjMock(proj[0]);
      return {
        from: vi.fn((table: unknown) => {
          fromTableMock(table);
          const node = {
            then: (
              onFulfilled?: (v: unknown) => unknown,
              onRejected?: (e: unknown) => unknown,
            ) =>
              Promise.resolve()
                .then(() => selectResultMock())
                .then(onFulfilled, onRejected),
            where: (...a: unknown[]) => {
              whereCallsMock({ table, args: a });
              return node;
            },
            limit: (...a: unknown[]) => {
              limitCallsMock({ table, args: a });
              return node;
            },
          };
          return node;
        }),
      };
    }),
  },
  schema: {
    posts: { id: "id", title: "title", slug: "slug", status: "status", authorId: "author_id" },
    user: { id: "id", name: "name", email: "email", passwordHash: "password_hash" },
    categories: { id: "id", name: "name", slug: "slug", deletedAt: "deleted_at" },
    tags: { id: "id", name: "name", slug: "slug", deletedAt: "deleted_at" },
  },
}));

import { globalSearch } from "../search";

/** Structural walker — proves primitive values reach the drizzle SQL graph. */
function contains(node: unknown, needle: string | number | boolean): boolean {
  if (node === needle) return true;
  if (Array.isArray(node)) return node.some((n) => contains(n, needle));
  if (node !== null && typeof node === "object") {
    return Object.values(node as Record<string, unknown>).some((v) => contains(v, needle));
  }
  return false;
}
const deepContains = (node: unknown, ...needles: (string | number | boolean)[]) =>
  needles.every((n) => contains(node, n));

const sessionOf = (role: string, id = `u-${role}`) => ({
  user: { id, role },
  session: { id: "s1" },
});

/** All WHERE-arg groups recorded for one table (table identity from the mock). */
const whereArgsFor = (table: unknown) =>
  whereCallsMock.mock.calls.map((c) => c[0] as { table: unknown; args: unknown[] })
    .filter((c) => c.table === table)
    .map((c) => c.args);

const limitArgsFor = (table: unknown) =>
  limitCallsMock.mock.calls.map((c) => c[0] as { table: unknown; args: unknown[] })
    .filter((c) => c.table === table)
    .map((c) => c.args);

describe("260827-se8 Task 8: globalSearch — session gate + short-circuit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSessionOrThrowMock.mockResolvedValue(sessionOf("editor"));
    requireCanMock.mockResolvedValue(sessionOf("editor"));
    selectResultMock.mockResolvedValue([]);
  });

  it("session FIRST: unauthenticated → UNAUTHORIZED before ANY db access or requireCan", async () => {
    getSessionOrThrowMock.mockImplementation(() => {
      throw new Error("UNAUTHORIZED");
    });
    await expect(globalSearch("title")).rejects.toThrow("UNAUTHORIZED");
    expect(fromTableMock).not.toHaveBeenCalled();
    expect(requireCanMock).not.toHaveBeenCalled();
  });

  it("q under 2 characters → empty groups WITHOUT touching the DB", async () => {
    const result = await globalSearch("a");
    expect(result).toEqual({ posts: [], users: [], categories: [], tags: [] });
    expect(fromTableMock).not.toHaveBeenCalled();
  });

  it("q is length-bounded to 100 (Task 2 helper) — a 300-char q searches a 100-char pattern", async () => {
    await globalSearch("x".repeat(300));
    const postsWhere = whereArgsFor(schema.posts).flat();
    // bounded() trims + slices to 100 → the ilike pattern carries at most
    // 100 x's between its wildcards. A 300-char needle proves the bound fired.
    expect(deepContains(postsWhere, `%${"x".repeat(100)}%`)).toBe(true);
    expect(deepContains(postsWhere, `%${"x".repeat(101)}%`)).toBe(false);
  });
});

describe("260827-se8 Task 8: globalSearch — role-safe scoping (session-derived, never client input)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    selectResultMock.mockResolvedValue([]);
  });

  it("AUTHOR: posts WHERE is scoped to own authorId from the session", async () => {
    const session = sessionOf("author", "u-me");
    getSessionOrThrowMock.mockResolvedValue(session);
    requireCanMock.mockResolvedValue(session);

    await globalSearch("title");

    expect(requireCanMock).toHaveBeenCalledWith({ post: ["read"] });
    const postsWhere = whereArgsFor(schema.posts).flat();
    expect(deepContains(postsWhere, "%title%")).toBe(true);
    expect(deepContains(postsWhere, "author_id")).toBe(true);
    expect(deepContains(postsWhere, "u-me")).toBe(true);
  });

  it("EDITOR: posts WHERE carries NO author scoping and NO status filter (drafts findable)", async () => {
    const session = sessionOf("editor", "u-editor");
    getSessionOrThrowMock.mockResolvedValue(session);
    requireCanMock.mockResolvedValue(session);

    await globalSearch("title");

    const postsWhere = whereArgsFor(schema.posts).flat();
    expect(deepContains(postsWhere, "%title%")).toBe(true);
    expect(deepContains(postsWhere, "author_id")).toBe(false);
    expect(deepContains(postsWhere, "status")).toBe(false);
  });

  it("NON-ADMIN: users leg NEVER runs — no user-table select (MUST_NOT_BE_REACHED), users group empty", async () => {
    const session = sessionOf("author");
    getSessionOrThrowMock.mockResolvedValue(session);
    requireCanMock.mockResolvedValue(session);
    selectResultMock.mockImplementation(() => {
      throw new Error("MUST_NOT_BE_REACHED");
    });

    const result = await globalSearch("title");

    // The throwing terminal must only be reachable by legs that RUN — prove the
    // user table was never routed to, then re-check with a benign terminal.
    expect(fromTableMock.mock.calls.some((c) => c[0] === schema.user)).toBe(false);
    selectResultMock.mockResolvedValue([]);
    const again = await globalSearch("title");
    expect(again.users).toEqual([]);
  });

  it("ADMIN: users leg runs with name OR email ilike + limit 5 and returns the rows", async () => {
    const session = sessionOf("admin");
    getSessionOrThrowMock.mockResolvedValue(session);
    requireCanMock.mockResolvedValue(session);
    const userRows = [{ id: "u1", name: "Alice", email: "alice@x.com" }];
    let userRowsReturned = false;
    selectResultMock.mockImplementation(() => {
      // 4 legs share one terminal; only assert the user group's content.
      userRowsReturned = true;
      return userRows;
    });

    const result = await globalSearch("alice");
    expect(userRowsReturned).toBe(true);
    expect(result.users).toEqual(userRows);
    const usersWhere = whereArgsFor(schema.user).flat();
    expect(deepContains(usersWhere, "%alice%")).toBe(true);
    expect(limitArgsFor(schema.user)).toEqual([[5]]);
  });
});

describe("260827-se8 Task 8: globalSearch — taxonomy legs + minimal projections", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSessionOrThrowMock.mockResolvedValue(sessionOf("editor"));
    requireCanMock.mockResolvedValue(sessionOf("editor"));
    selectResultMock.mockResolvedValue([]);
  });

  it("categories + tags legs: ilike name + soft-delete exclusion + limit 5, open to all roles", async () => {
    await globalSearch("news");

    for (const table of [schema.categories, schema.tags]) {
      const w = whereArgsFor(table).flat();
      expect(deepContains(w, "%news%")).toBe(true);
      expect(deepContains(w, "deleted_at")).toBe(true);
      expect(limitArgsFor(table)).toEqual([[5]]);
    }
  });

  it("every leg is capped at limit 5", async () => {
    getSessionOrThrowMock.mockResolvedValue(sessionOf("admin"));
    requireCanMock.mockResolvedValue(sessionOf("admin"));
    await globalSearch("term");
    const allLimits = limitCallsMock.mock.calls.map(
      (c) => (c[0] as { args: unknown[] }).args,
    );
    expect(allLimits.length).toBeGreaterThanOrEqual(3); // posts + taxonomy at minimum
    for (const args of allLimits) {
      expect(args).toEqual([5]);
    }
  });

  it("users projection is minimal — id/name/email keys, NEVER passwordHash", async () => {
    const session = sessionOf("admin");
    getSessionOrThrowMock.mockResolvedValue(session);
    requireCanMock.mockResolvedValue(session);

    await globalSearch("term");

    // select() and from() calls pair by index; find the user-table select.
    const fromCalls = fromTableMock.mock.calls.map((c) => c[0]);
    const userIdx = fromCalls.findIndex((t) => t === schema.user);
    expect(userIdx).toBeGreaterThanOrEqual(0);
    const userProj = selectProjMock.mock.calls[userIdx][0] as Record<string, unknown>;
    expect(Object.keys(userProj).sort()).toEqual(["email", "id", "name"]);
  });

  it("posts leg FORBIDDEN (requireCan denies) → posts group empty, other legs still return", async () => {
    const session = sessionOf("editor");
    getSessionOrThrowMock.mockResolvedValue(session);
    requireCanMock.mockImplementation(() => {
      throw new Error("FORBIDDEN");
    });

    const result = await globalSearch("term");
    expect(result.posts).toEqual([]);
    expect(fromTableMock.mock.calls.some((c) => c[0] === schema.categories)).toBe(true);
    expect(fromTableMock.mock.calls.some((c) => c[0] === schema.tags)).toBe(true);
  });
});
