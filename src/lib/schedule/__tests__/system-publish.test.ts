// src/lib/schedule/__tests__/system-publish.test.ts
// [CITED: VALIDATION.md Wave 0 row "CONT-09 — system-publish worker flips due posts"]
// [CITED: 03-04-PLAN.md Task 1 <behavior> + <acceptance_criteria>]
// [CITED: PATTERNS.md row — clone transitions.test.ts mock shape (lib unit test)]
//
// Wave-0 tests proving:
//   - CONT-09: publishDueScheduledPosts queries WHERE status='draft' AND publishedAt<=now()
//     and flips each to status='published' via db.update (A6 recommendation — no enum migration)
//   - D-12: publishDueScheduledPosts does NOT import or call transitionPost (documented
//     exception to R7 — the scheduler has NO session)
//   - D-25 (Pitfall #3): revalidatePath uses concrete literal paths; revalidateTag uses
//     the 2-arg form revalidateTag(tag, "max") — no single-arg calls, no template-string
//     patterns like '/blog/[slug]'
//   - D-11: startScheduler calls cron.schedule("* * * * *", fn) — every minute, v1 single-instance
//   - instrumentation register(): NEXT_RUNTIME='nodejs' boots the scheduler; 'edge' skips
import { describe, it, expect, beforeEach, vi } from "vitest";

const {
  selectDueMock,
  updateMock,
  revalidatePathMock,
  revalidateTagMock,
  logInfoMock,
  logErrorMock,
  transitionPostMock,
  cronScheduleMock,
  startSchedulerMock,
} = vi.hoisted(() => ({
  selectDueMock: vi.fn(),
  updateMock: vi.fn(),
  revalidatePathMock: vi.fn(),
  revalidateTagMock: vi.fn(),
  logInfoMock: vi.fn(),
  logErrorMock: vi.fn(),
  // D-12: transitionPost is mocked so we can assert it is NEVER called by the scheduler.
  transitionPostMock: vi.fn(),
  cronScheduleMock: vi.fn(),
  startSchedulerMock: vi.fn(),
}));

// Mock @/lib/db — chainable select().from().leftJoin().where() returning the controlled
// due-posts array, plus db.update().set().where() spy. The leftJoin is needed because
// publishDueScheduledPosts joins categories to get the category slug for revalidatePath.
vi.mock("@/lib/db", () => {
  const chainableSelect = () => ({
    // publishDueScheduledPosts uses: db.select({...}).from(posts).leftJoin(categories,...).where(...)
    leftJoin: vi.fn(() => ({
      where: () => selectDueMock(),
    })),
    where: () => selectDueMock(),
  });
  return {
    db: {
      select: vi.fn(() => ({
        from: vi.fn(() => chainableSelect()),
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
        categoryId: "category_id",
        publishedAt: "published_at",
        updatedAt: "updated_at",
      },
      categories: { id: "id", slug: "slug" },
    },
  };
});

vi.mock("next/cache", () => ({
  revalidatePath: (...a: unknown[]) => revalidatePathMock(...a),
  revalidateTag: (...a: unknown[]) => revalidateTagMock(...a),
}));

vi.mock("@/lib/log", () => ({
  log: {
    info: (...a: unknown[]) => logInfoMock(...a),
    error: (...a: unknown[]) => logErrorMock(...a),
  },
}));

// D-12: mock transitionPost so we can assert it is NEVER called by the scheduler.
// The scheduler MUST NOT import or call it (no session → would throw UNAUTHORIZED).
vi.mock("@/lib/permissions/post-transitions", () => ({
  transitionPost: (...a: unknown[]) => transitionPostMock(...a),
}));

vi.mock("node-cron", () => ({
  default: {
    schedule: (...a: unknown[]) => cronScheduleMock(...a),
  },
}));

import { publishDueScheduledPosts } from "../system-publish";
import { startScheduler } from "../index";

// Controlled "due" post fixture — simulates a row returned by the db.select query
// (with the categories join for categorySlug). Includes slug + authorId + categoryId
// + categorySlug so the revalidation assertions can verify the concrete paths and tags.
const duePost = (overrides: Partial<Record<string, unknown>> = {}) => ({
  id: 42,
  slug: "hello-world",
  status: "draft",
  authorId: "u-author-1",
  categoryId: 7,
  categorySlug: "news",
  publishedAt: new Date("2026-01-01T00:00:00Z"),
  ...overrides,
});

describe("CONT-09 / D-12: publishDueScheduledPosts — system-level publish (no session)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    selectDueMock.mockResolvedValue([]);
    updateMock.mockResolvedValue(undefined);
    revalidatePathMock.mockReturnValue(undefined);
    revalidateTagMock.mockReturnValue(undefined);
  });

  it("flips a due post (status='draft' AND publishedAt<=now()) to status='published' via db.update", async () => {
    selectDueMock.mockResolvedValue([duePost()]);
    await publishDueScheduledPosts();
    expect(updateMock).toHaveBeenCalledTimes(1);
  });

  it("flips multiple due posts — one db.update per post", async () => {
    selectDueMock.mockResolvedValue([
      duePost({ id: 1, slug: "a" }),
      duePost({ id: 2, slug: "b" }),
      duePost({ id: 3, slug: "c" }),
    ]);
    await publishDueScheduledPosts();
    expect(updateMock).toHaveBeenCalledTimes(3);
  });

  it("returns the count of flipped posts", async () => {
    selectDueMock.mockResolvedValue([duePost({ id: 1 }), duePost({ id: 2 })]);
    const count = await publishDueScheduledPosts();
    expect(count).toBe(2);
  });

  it("does NOT call transitionPost (D-12 — scheduler has no session)", async () => {
    selectDueMock.mockResolvedValue([duePost()]);
    await publishDueScheduledPosts();
    expect(transitionPostMock).not.toHaveBeenCalled();
  });

  it("logs system-publish audit entry per flipped post", async () => {
    selectDueMock.mockResolvedValue([duePost({ id: 10 }), duePost({ id: 20 })]);
    await publishDueScheduledPosts();
    expect(logInfoMock).toHaveBeenCalledWith("system-publish", { postId: 10 });
    expect(logInfoMock).toHaveBeenCalledWith("system-publish", { postId: 20 });
  });

  it("revalidates concrete literal paths per due post (D-25 — Pitfall #3)", async () => {
    selectDueMock.mockResolvedValue([duePost({ id: 5, slug: "my-post" })]);
    await publishDueScheduledPosts();
    const paths = revalidatePathMock.mock.calls.map((c) => c[0]);
    expect(paths).toContain("/blog/my-post");
    expect(paths).toContain("/");
    expect(paths).toContain("/blog");
    expect(paths).toContain("/sitemap.xml");
    expect(paths).toContain("/rss.xml");
  });

  it("revalidates the category path using the joined category slug", async () => {
    selectDueMock.mockResolvedValue([duePost({ id: 5, slug: "p", categoryId: 3, categorySlug: "tech" })]);
    await publishDueScheduledPosts();
    const paths = revalidatePathMock.mock.calls.map((c) => c[0]);
    expect(paths).toContain("/category/tech");
  });

  it("calls revalidateTag with 2-arg form (tag, 'max') — NEVER single-arg (D-25)", async () => {
    selectDueMock.mockResolvedValue([duePost({ id: 5, authorId: "u1", categoryId: 3 })]);
    await publishDueScheduledPosts();
    // Every revalidateTag call must have exactly 2 arguments, and the second must be "max".
    for (const call of revalidateTagMock.mock.calls) {
      expect(call.length).toBe(2);
      expect(call[1]).toBe("max");
    }
    expect(revalidateTagMock.mock.calls.length).toBeGreaterThan(0);
  });

  it("revalidates post, author, category, and posts-list tags (D-25)", async () => {
    selectDueMock.mockResolvedValue([duePost({ id: 5, authorId: "u-a", categoryId: 3 })]);
    await publishDueScheduledPosts();
    const tags = revalidateTagMock.mock.calls.map((c) => c[0]);
    expect(tags).toContain("post-5");
    expect(tags).toContain("author-u-a");
    expect(tags).toContain("category-3");
    expect(tags).toContain("posts-list");
  });

  it("does NOT use template-string path patterns like '/blog/[slug]' (D-25)", async () => {
    selectDueMock.mockResolvedValue([duePost({ id: 5, slug: "real-slug" })]);
    await publishDueScheduledPosts();
    for (const call of revalidatePathMock.mock.calls) {
      const path = call[0] as string;
      expect(path).not.toContain("[slug]");
      expect(path).not.toContain("[");
    }
  });

  it("no-op when no posts are due — zero updates, zero revalidations", async () => {
    selectDueMock.mockResolvedValue([]);
    const count = await publishDueScheduledPosts();
    expect(count).toBe(0);
    expect(updateMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
    expect(revalidateTagMock).not.toHaveBeenCalled();
  });
});

describe("D-11: startScheduler — node-cron registration (every minute, v1 single-instance)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cronScheduleMock.mockReturnValue({ stop: vi.fn() });
    selectDueMock.mockResolvedValue([]);
    updateMock.mockResolvedValue(undefined);
  });

  it("calls cron.schedule with '* * * * *' (every minute)", () => {
    startScheduler();
    expect(cronScheduleMock).toHaveBeenCalledTimes(1);
    const [expression] = cronScheduleMock.mock.calls[0];
    expect(expression).toBe("* * * * *");
  });

  it("passes a function as the second arg to cron.schedule", () => {
    startScheduler();
    const [, handler] = cronScheduleMock.mock.calls[0];
    expect(typeof handler).toBe("function");
  });

  it("the cron tick calls publishDueScheduledPosts when invoked", async () => {
    startScheduler();
    const [, handler] = cronScheduleMock.mock.calls[0];
    selectDueMock.mockResolvedValue([duePost({ id: 99 })]);
    await handler();
    expect(updateMock).toHaveBeenCalledTimes(1);
    expect(logInfoMock).toHaveBeenCalledWith("system-publish", { postId: 99 });
  });

  it("the cron tick catches errors without throwing (resilience — next minute retries)", async () => {
    startScheduler();
    const [, handler] = cronScheduleMock.mock.calls[0];
    selectDueMock.mockRejectedValue(new Error("DB_DOWN"));
    // Should not throw — the tick wraps in try/catch.
    await expect(handler()).resolves.not.toThrow();
    expect(logErrorMock).toHaveBeenCalled();
  });
});
