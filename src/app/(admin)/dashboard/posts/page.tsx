// src/app/(admin)/dashboard/posts/page.tsx
// [CITED: PATTERNS.md row — basic-tables/page.tsx + ui/table/index.tsx analog]
// [CITED: 03-CONTEXT.md D-24 — TailAdmin-quality post list built into the (admin) shell]
// [CITED: 260827-se8-PLAN.md Task 4 step 5 — URL-driven list mechanics]
//
// Server Component — the list is fully URL-driven: every filter (q / status /
// category / author) and the page number live in searchParams, so list state
// is deep-linkable and back/forward-correct. The ListFilterBar client island
// ONLY writes URLs; this Server Component re-queries on every navigation
// (260827-se8 list-mechanics decision — no client data layer for lists).
//
// 05-06: reads the viewer's role via getSession and renders PostRowActions
// (Publish / Submit-for-review / Return link-buttons) in the Actions cell
// next to Edit — the list-side half of the UAT gap 1 publish wiring.
import Link from "next/link";
import { countPosts, listPosts } from "@/actions/posts";
import { listCategories } from "@/actions/categories";
import { getSession } from "@/lib/auth/server";
import { bounded, clampPage, firstValue, DASHBOARD_PAGE_SIZE } from "@/lib/list-filters";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import ListFilterBar from "@/components/dashboard/lists/ListFilterBar";
import Pagination from "@/components/site/Pagination";
import { Table, TableHeader, TableBody, TableRow, TableCell } from "@/components/ui/table";
import PostRowActions from "./components/PostRowActions";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Posts | Any Discussion",
  description: "Manage blog posts",
};

// Page-scope instant-navigation opt-out (260826-oif): this page's top-level
// uncached awaits (listPosts/countPosts + awaited searchParams —
// permission-checked Server Actions calling headers() + DB IO) sit below every
// effective <Suspense> boundary on client navigations between /dashboard
// segments — the (admin) layout's own opt-out does not cover sibling
// navigations (installed instant-navigation.md). Allowed-to-block is correct
// for session-gated content. NOTE: awaiting searchParams is itself the
// dynamic access — NO connection() call is needed (research Finding 2).
export const instant = false;

const STATUS_BADGE: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  pending_review: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  published: "bg-success-100 text-success-700 dark:bg-success-900/30 dark:text-success-300",
};

/** Raw Next.js 16 searchParams shape (Promise — awaited in the component). */
type RawSearchParams = Record<string, string | string[] | undefined>;

/** The parsed filter shape feeding listPosts/countPosts (postListSchema input). */
interface PostsFilters {
  q: string;
  status: "draft" | "pending_review" | "published" | undefined;
  categoryId: number | undefined;
  author: string;
  page: number;
}

/**
 * parsePostsFilters — the (site)/search/page.tsx parseSearch idiom on the
 * shared 260827-se8 helpers: flatten tampered string[] params, trim +
 * length-bound, clamp the page. Values feed listPosts/countPosts (which apply
 * the authoritative postListSchema Zod gate server-side).
 */
function parsePostsFilters(sp: RawSearchParams): PostsFilters {
  const status = bounded(firstValue(sp.status), 20);
  const categoryIdRaw = bounded(firstValue(sp.categoryId), 9);
  const categoryId = Number.parseInt(categoryIdRaw, 10);
  return {
    q: bounded(firstValue(sp.q), 200),
    status: status === "draft" || status === "pending_review" || status === "published"
      ? status
      : undefined,
    categoryId: Number.isFinite(categoryId) && categoryId > 0 ? categoryId : undefined,
    author: bounded(firstValue(sp.author), 200),
    page: clampPage(firstValue(sp.page)),
  };
}

export default async function PostsListPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const sp = await searchParams;
  const filters = parsePostsFilters(sp);

  let posts: Array<{
    id: number;
    title: string;
    slug: string;
    status: string;
    updatedAt: Date | null;
  }> = [];
  let total = 0;
  let categoryOptions: Array<{ value: string; label: string }> = [];
  let loadError: string | null = null;
  try {
    // One round-trip for the page window + the total (countPosts shares the
    // exact WHERE builder with listPosts — the count always matches).
    [posts, total] = await Promise.all([
      listPosts({
        q: filters.q || undefined,
        status: filters.status,
        categoryId: filters.categoryId,
        author: filters.author || undefined,
        page: filters.page,
        pageSize: DASHBOARD_PAGE_SIZE,
      }),
      countPosts({
        q: filters.q || undefined,
        status: filters.status,
        categoryId: filters.categoryId,
        author: filters.author || undefined,
      }),
    ]);
    // The bare category list feeds the filter select (full list — Task 6
    // keeps listCategories() no-arg back-compat).
    const categories = await listCategories();
    categoryOptions = categories.map((c) => ({
      value: String(c.id),
      label: c.name,
    }));
  } catch (err) {
    // Permission denied or DB error — surface a friendly message. The proxy.ts +
    // (admin)/layout.tsx AuthGate already redirect unauthenticated users; reaching
    // this catch means the session lacks post:read or the DB is unreachable.
    loadError = err instanceof Error ? err.message : "Failed to load posts";
  }

  // 05-06 — viewer role for PostRowActions' UX-ONLY Publish / Submit / Return
  // gating. Server Actions re-check every capability (Pitfall #1).
  const session = await getSession();
  const role =
    (session?.user.role as "admin" | "editor" | "author" | null) ?? undefined;

  const totalPages = Math.max(1, Math.ceil(total / DASHBOARD_PAGE_SIZE));

  return (
    <div>
      <PageBreadcrumb pageTitle="Posts" />
      <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] lg:p-6">
        <div className="mb-5 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">All Posts</h3>
          <Link
            href="/dashboard/posts/new"
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-medium text-white shadow-theme-xs hover:bg-brand-600"
          >
            + New Post
          </Link>
        </div>

        {/* 260827-se8 — URL-writing filter bar: q + status + category + author.
            Client island ONLY writes URLs; the Server Component re-queries. */}
        <div className="mb-5">
          <ListFilterBar
            basePath="/dashboard/posts"
            q={filters.q}
            selects={[
              {
                name: "status",
                label: "Status",
                value: filters.status ?? "",
                options: [
                  { value: "", label: "All statuses" },
                  { value: "draft", label: "Draft" },
                  { value: "pending_review", label: "Pending review" },
                  { value: "published", label: "Published" },
                ],
              },
              {
                name: "categoryId",
                label: "Category",
                value: filters.categoryId ? String(filters.categoryId) : "",
                options: [
                  { value: "", label: "All categories" },
                  ...categoryOptions,
                ],
              },
            ]}
            textField={{
              name: "author",
              label: "Author",
              value: filters.author,
              placeholder: "Filter by author name/email",
            }}
          />
        </div>

        {loadError ? (
          <div className="rounded-lg border border-error-300 bg-error-50 p-4 text-sm text-error-700 dark:border-error-700 dark:bg-error-900/20 dark:text-error-300">
            {loadError}
          </div>
        ) : posts.length === 0 ? (
          <div className="rounded-lg border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500 dark:border-gray-700">
            No posts match these filters.
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-800">
            <Table>
              <TableHeader>
                <TableRow className="border-b border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-900/50">
                  <TableCell isHeader className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500">Title</TableCell>
                  <TableCell isHeader className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500">Status</TableCell>
                  <TableCell isHeader className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500">Updated</TableCell>
                  <TableCell isHeader className="px-4 py-3 text-right text-xs font-semibold uppercase text-gray-500">Actions</TableCell>
                </TableRow>
              </TableHeader>
              <TableBody>
                {posts.map((post) => (
                  <TableRow key={post.id} className="border-b border-gray-100 last:border-0 dark:border-gray-800">
                    <TableCell className="px-4 py-3 text-sm font-medium text-gray-800 dark:text-white/90">
                      {post.title}
                    </TableCell>
                    <TableCell className="px-4 py-3">
                      <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_BADGE[post.status] ?? STATUS_BADGE.draft}`}>
                        {post.status}
                      </span>
                    </TableCell>
                    <TableCell className="px-4 py-3 text-sm text-gray-500">
                      {post.updatedAt ? new Date(post.updatedAt).toLocaleDateString() : "—"}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-right">
                      {/* 05-06 + 260827-se8 — Publish / Submit-for-review /
                          Return row actions next to Edit; renders nothing when
                          role+status don't qualify. */}
                      <div className="flex items-center justify-end gap-3">
                        <PostRowActions postId={post.id} status={post.status} role={role} />
                        <Link
                          href={`/dashboard/posts/${post.id}/edit`}
                          className="text-sm font-medium text-brand-500 hover:text-brand-600"
                        >
                          Edit
                        </Link>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Server-rendered Link pagination — buildPageHref preserves the
            filter params in ?page=N (unit-tested in pagination.test.ts). */}
        <Pagination
          currentPage={filters.page}
          totalPages={totalPages}
          basePath="/dashboard/posts"
          searchParams={sp}
        />
      </div>
    </div>
  );
}
