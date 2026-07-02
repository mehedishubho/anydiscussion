// src/lib/permissions/__tests__/transitions.test.ts
// [CITED: VALIDATION.md AUTH-05 rows — author draft→pending_review allowed,
//  draft→published BLOCKED; editor pending_review→published allowed]
// Tests the TRANSITIONS policy table + transitionPost orchestration.
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the permission helpers — transitionPost calls assertOwnsPost + requireCan.
const assertOwnsPostMock = vi.fn();
const requireCanMock = vi.fn();
vi.mock("@/lib/permissions", () => ({
  assertOwnsPost: (...args: unknown[]) => assertOwnsPostMock(...args),
  requireCan: (...args: unknown[]) => requireCanMock(...args),
}));

// Mock @/lib/db — transitionPost selects current post + updates status.
const selectLimitMock = vi.fn();
vi.mock("@/lib/db", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({ limit: (...a: unknown[]) => selectLimitMock(...a) })),
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({ where: vi.fn(async () => ({ success: true })) })),
    })),
  },
  schema: { posts: { id: "id", status: "status", updatedAt: "updated_at" } },
}));

import { transitionPost } from "@/lib/permissions/post-transitions";

function sessionFor(role: string) {
  return { user: { id: "u1", role, name: "T", email: "t@t.test" }, session: { id: "s1" } };
}

describe("AUTH-05: transitionPost status-transition policy (D-13/D-14/D-15)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: ownership passes; requireCan passes (will be overridden for author publish).
    assertOwnsPostMock.mockResolvedValue(sessionFor("author"));
    requireCanMock.mockResolvedValue(sessionFor("editor"));
  });

  describe("author transitions", () => {
    it("author draft→pending_review is ALLOWED (submit for review)", async () => {
      assertOwnsPostMock.mockResolvedValue(sessionFor("author"));
      selectLimitMock.mockResolvedValue([{ status: "draft" }]);
      await expect(transitionPost(1, "pending_review")).resolves.toBeUndefined();
    });

    it("author draft→published is BLOCKED — requireCan({post:['publish']}) throws for author", async () => {
      assertOwnsPostMock.mockResolvedValue(sessionFor("author"));
      selectLimitMock.mockResolvedValue([{ status: "draft" }]);
      // Author lacks post.publish — requireCan throws BEFORE the transition check.
      requireCanMock.mockRejectedValue(new Error("FORBIDDEN"));
      await expect(transitionPost(1, "published")).rejects.toThrow("FORBIDDEN");
    });

    it("author published→draft is ALLOWED (unpublish own post, D-14b)", async () => {
      assertOwnsPostMock.mockResolvedValue(sessionFor("author"));
      selectLimitMock.mockResolvedValue([{ status: "published" }]);
      await expect(transitionPost(1, "draft")).resolves.toBeUndefined();
    });
  });

  describe("editor transitions", () => {
    it("editor approve: pending_review→published is ALLOWED", async () => {
      assertOwnsPostMock.mockResolvedValue(sessionFor("editor"));
      requireCanMock.mockResolvedValue(sessionFor("editor"));
      selectLimitMock.mockResolvedValue([{ status: "pending_review" }]);
      await expect(transitionPost(1, "published")).resolves.toBeUndefined();
    });

    it("editor draft→published is ALLOWED (direct publish)", async () => {
      assertOwnsPostMock.mockResolvedValue(sessionFor("editor"));
      requireCanMock.mockResolvedValue(sessionFor("editor"));
      selectLimitMock.mockResolvedValue([{ status: "draft" }]);
      await expect(transitionPost(1, "published")).resolves.toBeUndefined();
    });
  });

  describe("invalid transitions throw", () => {
    it("author pending_review→published is BLOCKED at requireCan (author cannot publish)", async () => {
      assertOwnsPostMock.mockResolvedValue(sessionFor("author"));
      requireCanMock.mockRejectedValue(new Error("FORBIDDEN"));
      selectLimitMock.mockResolvedValue([{ status: "pending_review" }]);
      await expect(transitionPost(1, "published")).rejects.toThrow("FORBIDDEN");
    });
  });
});
