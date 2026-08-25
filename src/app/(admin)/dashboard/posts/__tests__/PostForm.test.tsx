// @vitest-environment jsdom
// src/app/(admin)/dashboard/posts/__tests__/PostForm.test.tsx
// [CITED: 05-REVIEW.md WR-02 — slug ownership signal must be onChange, not onBlur]
// [CITED: 05-07-PLAN.md — slug auto-derive (derive-on-empty, never overwrite)]
// [CITED: src/app/(admin)/dashboard/settings/backup/__tests__/BackupSettingsForm.test.tsx — jsdom + QueryClientProvider + action-mock pattern]
//
// Pins the two WR-02 failure modes of the slug auto-derive ownership signal:
//   1. Tab/click THROUGH the slug field (focus + blur, NO typing) must NOT
//      disable auto-derive — deriving continues from the title afterwards.
//      (Old onBlur wiring permanently disabled derive on bare blur.)
//   2. Clearing the slug while still focused (select-all + Delete, NO blur)
//      must NOT trigger a mid-interaction refill — the field stays empty
//      until the user types. (Old wiring refilled "hello-world" under the
//      cursor because slugTouched was still false.)
// Plus the standing never-overwrite invariant: a user-TYPED slug survives
// later title edits (D-12/D-20 — slug is content identity).
//
// Mock strategy: the Server Actions in @/actions/posts are vi.fn spies so the
// form never crosses the client/server boundary; the heavy children that pull
// server/db chains or client-only dynamic imports (EditorProvider ->
// next/dynamic Tiptap, MediaPicker -> @/actions/media, TaxonomyPicker ->
// category/tag queries) are null stubs — none participate in slug behavior.
// SeoPanel renders real (leaf register-prop inputs). A QueryClientProvider
// wraps the form because the save path uses TanStack useMutation.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, fireEvent, waitFor, cleanup, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// --- Hoisted action spies (mock factory needs them at hoist time) ---
const { savePostMock, publishPostMock, submitForReviewMock } = vi.hoisted(() => ({
  savePostMock: vi.fn(),
  publishPostMock: vi.fn(),
  submitForReviewMock: vi.fn(),
}));

vi.mock("@/actions/posts", () => ({
  savePost: (...a: unknown[]) => savePostMock(...a),
  publishPost: (...a: unknown[]) => publishPostMock(...a),
  submitForReview: (...a: unknown[]) => submitForReviewMock(...a),
}));

// PostForm imports the NAMED export { EditorProvider } — provide it too.
vi.mock("@/components/editor/EditorProvider", () => ({
  EditorProvider: () => null,
  default: () => null,
}));

vi.mock("@/components/dashboard/media/MediaPicker", () => ({
  default: () => null,
}));

// Path relative to THIS test file — resolves to the same module PostForm
// imports via "./components/TaxonomyPicker".
vi.mock("../components/TaxonomyPicker", () => ({
  default: () => null,
}));

import PostForm from "../PostForm";

function renderForm() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <PostForm />
    </QueryClientProvider>,
  );
}

function field(name: string): HTMLInputElement {
  const el = document.querySelector(`input[name="${name}"]`);
  if (!el) throw new Error(`input[name=${name}] not rendered`);
  return el as HTMLInputElement;
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  // vitest runs without globals:true, so RTL auto-cleanup does not register —
  // unmount explicitly between tests.
  cleanup();
});

describe("05-REVIEW WR-02: slug ownership signal is onChange, not onBlur", () => {
  it("tabbing through the slug field (focus+blur, no typing) does NOT disable auto-derive", async () => {
    renderForm();
    const title = field("title");
    const slug = field("slug");

    // Simulate tab-through: the field gains and loses focus with NO change
    // event. Under the old onBlur wiring this permanently disabled derive.
    fireEvent.focus(slug);
    fireEvent.blur(slug);

    // Typing a title afterwards must still auto-derive the empty slug.
    fireEvent.change(title, { target: { value: "Hello World" } });

    await waitFor(() => {
      expect(slug.value).toBe("hello-world");
    });
  });

  it("clearing the slug while still focused (select-all + Delete, no blur) does NOT refill it", async () => {
    renderForm();
    const title = field("title");
    const slug = field("slug");

    // Auto-derive first: slug fills from the title.
    fireEvent.change(title, { target: { value: "Hello World" } });
    await waitFor(() => {
      expect(slug.value).toBe("hello-world");
    });

    // Select-all + Delete WITHOUT blurring: a user edit to empty. The derive
    // effect must not refill "hello-world" under the user's cursor (the old
    // wiring refilled because slugTouched was still false on clear).
    fireEvent.focus(slug);
    fireEvent.change(slug, { target: { value: "" } });

    // Flush pending effects/microtasks — the value must STAY empty.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(slug.value).toBe("");
  });

  it("a user-typed slug is never overwritten by later title edits (never-overwrite invariant)", async () => {
    renderForm();
    const title = field("title");
    const slug = field("slug");

    fireEvent.change(slug, { target: { value: "my-custom-slug" } });
    fireEvent.change(title, { target: { value: "Hello World" } });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(slug.value).toBe("my-custom-slug");
  });
});
