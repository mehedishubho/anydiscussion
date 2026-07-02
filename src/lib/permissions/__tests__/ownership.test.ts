// src/lib/permissions/__tests__/ownership.test.ts
// [CITED: VALIDATION.md AUTH-04 rows — assertOwnsPost blocks non-owner; admin/editor bypass]
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock @/lib/auth — assertOwnsPost calls auth.api.getSession.
vi.mock("@/lib/auth", () => ({
  auth: {
    api: {
      getSession: vi.fn(),
    },
  },
}));

// Mock @/lib/db — assertOwnsPost queries the post row.
vi.mock("@/lib/db", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(async () => [{ authorid: "user-1" }]),
        })),
      })),
    })),
  },
  schema: { posts: { id: "id", authorId: "author_id" } },
}));

// Mock next/headers — getSession calls headers().
vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers()),
}));

import { auth } from "@/lib/auth";
import { assertOwnsPost } from "@/lib/permissions";

function mockSession(role: string, userId: string) {
  return {
    user: { id: userId, role, name: "Test", email: "t@t.test" },
    session: { id: "s1", userId },
  };
}

describe("AUTH-04: assertOwnsPost ownership gate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("non-owner blocked: author editing a post they do NOT own throws FORBIDDEN", async () => {
    // The mocked db returns authorid "user-1" (the owner); the acting user is "user-2".
    (auth.api.getSession as unknown as { mockResolvedValue: (v: unknown) => void }).mockResolvedValue(
      mockSession("author", "user-2"),
    );
    await expect(assertOwnsPost(42)).rejects.toThrow("FORBIDDEN");
  });

  it("admin bypass: admin editing any post does NOT throw", async () => {
    (auth.api.getSession as unknown as { mockResolvedValue: (v: unknown) => void }).mockResolvedValue(
      mockSession("admin", "admin-1"),
    );
    // Admin bypass returns the session without hitting db.select for ownership.
    await expect(assertOwnsPost(42)).resolves.toBeDefined();
  });

  it("editor bypass: editor editing any post does NOT throw", async () => {
    (auth.api.getSession as unknown as { mockResolvedValue: (v: unknown) => void }).mockResolvedValue(
      mockSession("editor", "editor-1"),
    );
    await expect(assertOwnsPost(42)).resolves.toBeDefined();
  });

  it("unauthenticated: no session throws UNAUTHORIZED", async () => {
    (auth.api.getSession as unknown as { mockResolvedValue: (v: unknown) => void }).mockResolvedValue(
      null,
    );
    await expect(assertOwnsPost(42)).rejects.toThrow("UNAUTHORIZED");
  });
});
