// @vitest-environment jsdom
// src/app/(admin)/dashboard/posts/__tests__/posts-page.test.tsx
// [CITED: 260828-gyt-PLAN.md Task 2 <behavior> — Author column, View action,
//  Scheduled badge in the posts list]
//
// Renders the posts list page as an async Server Component in jsdom (mocked
// actions): the page is `await`ed directly, then the returned element renders
// inside a QueryClientProvider (PostRowActions uses useMutation — no RSC
// boundary exists in RTL render, so the whole tree is one client render).
//
// Pins the 260828-gyt list additions:
//   - Author column: "Jane Author" on the joined-name row, "—" on authorName
//     null rows.
//   - View action per row: /blog/{slug} (target _blank) when published,
//     /preview/{previewToken} for non-published rows with a token, NO link
//     when neither.
//   - "Scheduled" badge on a draft row whose publishedAt is in the FUTURE
//     (A6: draft + future publishedAt IS the scheduled state).
//   - Bonus pin: the published row has an Unpublish button under admin role
//     (PostRowActions rendering inside the real page tree).
//
// next/navigation is stubbed: ListFilterBar writes URLs through useRouter and
// jsdom has no app router.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const {
  listPostsMock,
  countPostsMock,
  listCategoriesMock,
  publishPostMock,
  submitForReviewMock,
  returnForRevisionMock,
  unpublishPostMock,
  getSessionMock,
  pushMock,
  replaceMock,
  backMock,
  prefetchMock,
} = vi.hoisted(() => ({
  listPostsMock: vi.fn(),
  countPostsMock: vi.fn(),
  listCategoriesMock: vi.fn(),
  publishPostMock: vi.fn(),
  submitForReviewMock: vi.fn(),
  returnForRevisionMock: vi.fn(),
  unpublishPostMock: vi.fn(),
  getSessionMock: vi.fn(),
  pushMock: vi.fn(),
  replaceMock: vi.fn(),
  backMock: vi.fn(),
  prefetchMock: vi.fn(),
}));

vi.mock("@/actions/posts", () => ({
  listPosts: (...a: unknown[]) => listPostsMock(...a),
  countPosts: (...a: unknown[]) => countPostsMock(...a),
  publishPost: (...a: unknown[]) => publishPostMock(...a),
  submitForReview: (...a: unknown[]) => submitForReviewMock(...a),
  returnForRevision: (...a: unknown[]) => returnForRevisionMock(...a),
  unpublishPost: (...a: unknown[]) => unpublishPostMock(...a),
}));

vi.mock("@/actions/categories", () => ({
  listCategories: (...a: unknown[]) => listCategoriesMock(...a),
}));

vi.mock("@/lib/auth/server", () => ({
  getSession: (...a: unknown[]) => getSessionMock(...a),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: pushMock,
    replace: replaceMock,
    back: backMock,
    prefetch: prefetchMock,
  }),
}));

import PostsListPage from "../page";

const DAY_MS = 24 * 60 * 60 * 1000;

beforeEach(() => {
  vi.clearAllMocks();
  getSessionMock.mockResolvedValue({ user: { id: "u-admin", role: "admin" } });
  listCategoriesMock.mockResolvedValue([]);
  countPostsMock.mockResolvedValue(3);
  listPostsMock.mockResolvedValue([
    {
      id: 1,
      title: "Live One",
      slug: "live-one",
      status: "published",
      updatedAt: new Date(Date.now() - DAY_MS),
      publishedAt: new Date(Date.now() - DAY_MS),
      previewToken: "tok-live",
      authorName: "Jane Author",
      // 260828-blog-url: categorySlug drives the new /blog/{category}/{slug}
      // View-link shape. Null exercises the "uncategorized" fallback.
      categorySlug: "engineering",
    },
    {
      id: 2,
      title: "Draft Scheduled",
      slug: "draft-scheduled",
      status: "draft",
      updatedAt: new Date(Date.now() - DAY_MS),
      publishedAt: new Date(Date.now() + DAY_MS), // FUTURE — the scheduled signal
      previewToken: "tok-2",
      categorySlug: null,
      authorName: null,
    },
    {
      id: 3,
      title: "Bare Draft",
      slug: "bare-draft",
      status: "draft",
      updatedAt: new Date(Date.now() - DAY_MS),
      publishedAt: null,
      previewToken: null,
      authorName: null,
    },
  ]);
});

afterEach(() => {
  // No globals:true — RTL auto-cleanup does not register; unmount explicitly.
  cleanup();
});

async function renderPage() {
  const element = await PostsListPage({ searchParams: Promise.resolve({}) });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>{element}</QueryClientProvider>,
  );
}

describe("260828-gyt: posts list — Author column, View action, Scheduled badge, row Unpublish", () => {
  it("renders the joined author name in the Author column; '—' for authorName null rows", async () => {
    await renderPage();

    expect(screen.getByText("Jane Author")).toBeTruthy();
    // Rows 2 and 3 have authorName null → both Author cells render the em dash.
    expect(screen.getAllByText("—").length).toBe(2);
  });

  it("published row's View link targets the public /blog/{category}/{slug} page in a new tab (260828-blog-url)", async () => {
    await renderPage();

    // 260828-blog-url: the View link now points at /blog/{categorySlug}/{slug}.
    // The "live-one" fixture row carries categorySlug: "engineering".
    const viewLink = document.querySelector(
      'a[href="/blog/engineering/live-one"]',
    ) as HTMLAnchorElement | null;
    expect(viewLink).not.toBeNull();
    expect(viewLink?.getAttribute("target")).toBe("_blank");
    expect(viewLink?.textContent).toBe("View");
  });

  it("non-published row with a previewToken links to /preview/{token}; a draft with NO token renders NO View link", async () => {
    await renderPage();

    // Exactly one preview link (row 2's tok-2) — row 3 has no token and is
    // not published, so it must not render a View link at all.
    const previewLinks = document.querySelectorAll('a[href^="/preview/"]');
    expect(previewLinks.length).toBe(1);
    expect(previewLinks[0].getAttribute("href")).toBe("/preview/tok-2");
  });

  it("draft + FUTURE publishedAt renders a 'Scheduled' badge (A6 derived state)", async () => {
    await renderPage();

    expect(screen.getByText("Scheduled")).toBeTruthy();
  });

  it("published row shows an Unpublish button under admin role (row action wiring)", async () => {
    await renderPage();

    expect(screen.getByText("Unpublish")).toBeTruthy();
  });
});
