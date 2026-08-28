// @vitest-environment jsdom
// src/app/(admin)/dashboard/posts/__tests__/PostRowActions.test.tsx
// [CITED: 260828-gyt-PLAN.md Task 2 <behavior> — Unpublish row action]
// [CITED: src/app/(admin)/dashboard/posts/__tests__/PostForm.test.tsx — the
//  jsdom + vi.hoisted + vi.mock("@/actions/posts") + QueryClientProvider pattern]
//
// Pins the 260828-gyt Unpublish row action:
//   - editor/admin + status "published" → an "Unpublish" link-button that calls
//     unpublishPost(postId) (D-27 non-optimistic: toast + invalidate ["posts"]
//     on success — asserted implicitly by the spy call; the toast itself is
//     sonner's concern, not re-pinned here).
//   - author + published → the component renders NOTHING (author sees no row
//     actions on a published post: Publish is role-blocked, Return is
//     status-blocked, Unpublish is owner-requested editor/admin UX gating).
//   - editor + draft → Publish shows, Unpublish does NOT (status gating).
//   - while the unpublish mutation is in flight → label "Unpublishing…" and
//     the button is disabled.
//
// The vi.mock factory REPLACES the whole @/actions/posts module — every named
// import PostRowActions pulls must exist in it (publishPost, submitForReview,
// returnForRevision, unpublishPost).
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// --- Hoisted action spies (mock factory needs them at hoist time) ---
const {
  publishPostMock,
  submitForReviewMock,
  returnForRevisionMock,
  unpublishPostMock,
} = vi.hoisted(() => ({
  publishPostMock: vi.fn(),
  submitForReviewMock: vi.fn(),
  returnForRevisionMock: vi.fn(),
  unpublishPostMock: vi.fn(),
}));

vi.mock("@/actions/posts", () => ({
  publishPost: (...a: unknown[]) => publishPostMock(...a),
  submitForReview: (...a: unknown[]) => submitForReviewMock(...a),
  returnForRevision: (...a: unknown[]) => returnForRevisionMock(...a),
  unpublishPost: (...a: unknown[]) => unpublishPostMock(...a),
}));

import PostRowActions from "../components/PostRowActions";

function renderActions(props: {
  postId: number;
  status: string;
  role?: "admin" | "editor" | "author";
}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <PostRowActions {...props} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  unpublishPostMock.mockResolvedValue({ ok: true });
});

afterEach(() => {
  // No globals:true — RTL auto-cleanup does not register; unmount explicitly.
  cleanup();
});

describe("260828-gyt: PostRowActions — Unpublish on published rows (editor/admin UX gating)", () => {
  it("editor + published shows an Unpublish button; clicking calls unpublishPost(postId)", async () => {
    renderActions({ postId: 9, status: "published", role: "editor" });

    fireEvent.click(screen.getByText("Unpublish"));

    await waitFor(() => {
      expect(unpublishPostMock).toHaveBeenCalledWith(9);
    });
  });

  it("author + published renders NOTHING (no Unpublish for the author role)", () => {
    const { container } = renderActions({
      postId: 9,
      status: "published",
      role: "author",
    });
    expect(container.querySelector("button")).toBeNull();
    expect(container.textContent).toBe("");
  });

  it("editor + draft shows Publish but NO Unpublish (status gating)", () => {
    renderActions({ postId: 9, status: "draft", role: "editor" });
    expect(screen.getByText("Publish")).toBeTruthy();
    expect(screen.queryByText("Unpublish")).toBeNull();
  });

  it("pending label reads 'Unpublishing…' and the button is disabled while in flight", async () => {
    // Never-settling promise: isPending stays true so the label flip is observable.
    unpublishPostMock.mockImplementation(() => new Promise(() => {}));

    renderActions({ postId: 9, status: "published", role: "admin" });
    fireEvent.click(screen.getByText("Unpublish"));

    await waitFor(() => {
      expect(screen.getByText("Unpublishing…")).toBeTruthy();
    });
    const pendingBtn = screen
      .getByText("Unpublishing…")
      .closest("button") as HTMLButtonElement;
    expect(pendingBtn.disabled).toBe(true);
  });
});
