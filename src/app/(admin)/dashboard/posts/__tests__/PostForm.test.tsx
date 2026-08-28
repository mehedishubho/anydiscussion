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
import { render, screen, fireEvent, waitFor, cleanup, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// --- Hoisted action spies (mock factory needs them at hoist time) ---
const { savePostMock, publishPostMock, submitForReviewMock, unpublishPostMock } =
  vi.hoisted(() => ({
    savePostMock: vi.fn(),
    publishPostMock: vi.fn(),
    submitForReviewMock: vi.fn(),
    unpublishPostMock: vi.fn(),
  }));

vi.mock("@/actions/posts", () => ({
  savePost: (...a: unknown[]) => savePostMock(...a),
  publishPost: (...a: unknown[]) => publishPostMock(...a),
  submitForReview: (...a: unknown[]) => submitForReviewMock(...a),
  unpublishPost: (...a: unknown[]) => unpublishPostMock(...a),
}));

// 260828-gyt — next/navigation stub (AdminShell.test precedent): PostForm's
// create-redirect uses useRouter; jsdom has no app router. The captured
// pushMock lets the redirect tests assert the destination.
const { pushMock, replaceMock, backMock, prefetchMock } = vi.hoisted(() => ({
  pushMock: vi.fn(),
  replaceMock: vi.fn(),
  backMock: vi.fn(),
  prefetchMock: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: pushMock,
    replace: replaceMock,
    back: backMock,
    prefetch: prefetchMock,
  }),
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
import type { ComponentProps } from "react";

type PostFormProps = Partial<ComponentProps<typeof PostForm>>;

function renderForm(props: PostFormProps = {}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <PostForm {...props} />
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

// ===========================================================================
// 260828-gyt Task 3 — status-driven submit label, Unpublish action,
// create-redirect after a NEW post save
// [CITED: 260828-gyt-PLAN.md Task 3 <behavior>]
// ===========================================================================

function submitButton(): HTMLButtonElement {
  const el = document.querySelector('button[type="submit"]');
  if (!el) throw new Error("submit button not rendered");
  return el as HTMLButtonElement;
}

function formElement(): HTMLFormElement {
  const el = document.querySelector("form");
  if (!el) throw new Error("form not rendered");
  return el as HTMLFormElement;
}

describe("260828-gyt: PostForm — status-driven submit label + Unpublish", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    savePostMock.mockResolvedValue({ id: 42 });
    unpublishPostMock.mockResolvedValue({ ok: true });
  });

  it("submit reads 'Save' on a published post and 'Save draft' otherwise", () => {
    renderForm({ initialId: 7, initialStatus: "published", role: "admin" });
    expect(submitButton().textContent).toBe("Save");

    cleanup();
    renderForm();
    expect(submitButton().textContent).toBe("Save draft");
  });

  it("Unpublish renders for admin/editor on a published EDIT; author+published and admin+draft render none", () => {
    const { queryByText } = renderForm({
      initialId: 7,
      initialStatus: "published",
      role: "admin",
    });
    expect(queryByText("Unpublish")).not.toBeNull();

    cleanup();
    renderForm({ initialId: 7, initialStatus: "published", role: "author" });
    expect(screen.queryByText("Unpublish")).toBeNull();

    cleanup();
    renderForm({ initialId: 7, initialStatus: "draft", role: "admin" });
    expect(screen.queryByText("Unpublish")).toBeNull();
  });

  it("clicking Unpublish calls unpublishPost(initialId); after success the form flips to draft (Publish appears, submit reads 'Save draft')", async () => {
    renderForm({ initialId: 7, initialStatus: "published", role: "admin" });

    fireEvent.click(screen.getByText("Unpublish"));

    await waitFor(() => {
      expect(unpublishPostMock).toHaveBeenCalledWith(7);
    });
    // The status flip re-renders: Publish (brand primary) reappears and the
    // submit label drops back to "Save draft".
    await waitFor(() => {
      expect(screen.getByText("Publish")).toBeTruthy();
      expect(submitButton().textContent).toBe("Save draft");
    });
  });
});

describe("260828-gyt: PostForm — create-redirect to /dashboard/posts/{id}/edit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("NEW post save resolving { id: 42 } → router.push('/dashboard/posts/42/edit')", async () => {
    savePostMock.mockResolvedValue({ id: 42 });
    // Only initialCategoryId — no initialId (the /dashboard/posts/new shape).
    renderForm({ initialCategoryId: 5 });

    const title = field("title");
    fireEvent.change(title, { target: { value: "Hello World" } });
    // Slug auto-derives from the title (the existing derive-on-empty effect).
    await waitFor(() => {
      expect(field("slug").value).toBe("hello-world");
    });

    fireEvent.submit(formElement());

    await waitFor(() => {
      expect(pushMock).toHaveBeenCalledWith("/dashboard/posts/42/edit");
    });
    expect(savePostMock).toHaveBeenCalledTimes(1);
  });

  it("EDIT save (initialId 7) NEVER pushes — the form stays put", async () => {
    savePostMock.mockResolvedValue({ id: 7 });
    renderForm({
      initialId: 7,
      initialTitle: "Existing",
      initialSlug: "existing",
      initialCategoryId: 5,
      role: "admin",
    });

    fireEvent.submit(formElement());

    await waitFor(() => {
      expect(savePostMock).toHaveBeenCalledTimes(1);
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(pushMock).not.toHaveBeenCalled();
  });
});
