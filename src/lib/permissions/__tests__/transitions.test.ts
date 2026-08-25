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
// CR-02: capture the .set() payload so tests can assert whether publishedAt
// is stamped (publish with NULL date) or omitted (already set / non-publish).
const updateSetMock = vi.fn();
vi.mock("@/lib/db", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({ limit: (...a: unknown[]) => selectLimitMock(...a) })),
      })),
    })),
    update: vi.fn(() => ({
      set: (v: unknown) => {
        updateSetMock(v);
        return { where: vi.fn(async () => ({ success: true })) };
      },
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

  describe("CR-02: publishing stamps publishedAt when it was never set", () => {
    beforeEach(() => {
      assertOwnsPostMock.mockResolvedValue(sessionFor("editor"));
      requireCanMock.mockResolvedValue(sessionFor("editor"));
    });

    it("stamps publishedAt when transitioning to published with a NULL date", async () => {
      selectLimitMock.mockResolvedValue([{ status: "pending_review", publishedAt: null }]);
      await transitionPost(1, "published");
      expect(updateSetMock).toHaveBeenCalledTimes(1);
      const payload = updateSetMock.mock.calls[0][0] as Record<string, unknown>;
      expect(payload.status).toBe("published");
      expect(payload.publishedAt).toBeInstanceOf(Date);
    });

    it("preserves an existing publishedAt (scheduled / prior publish) verbatim", async () => {
      const scheduled = new Date("2026-08-01T08:00:00Z");
      selectLimitMock.mockResolvedValue([{ status: "draft", publishedAt: scheduled }]);
      await transitionPost(1, "published");
      const payload = updateSetMock.mock.calls[0][0] as Record<string, unknown>;
      // The column must be absent from the write — the scheduled date survives.
      expect("publishedAt" in payload).toBe(false);
    });

    it("does NOT stamp publishedAt on non-publish transitions", async () => {
      selectLimitMock.mockResolvedValue([{ status: "draft", publishedAt: null }]);
      await transitionPost(1, "pending_review");
      const payload = updateSetMock.mock.calls[0][0] as Record<string, unknown>;
      expect(payload.status).toBe("pending_review");
      expect("publishedAt" in payload).toBe(false);
    });
  });
});
