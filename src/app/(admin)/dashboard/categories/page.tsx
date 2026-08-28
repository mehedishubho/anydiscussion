// src/app/(admin)/dashboard/categories/page.tsx
// [CITED: 04-02-PLAN.md Task 1 — D-16 standalone pages over Phase 3 actions]
// [CITED: 04-CONTEXT.md D-26 (RHF + Zod + TanStack Query), D-27 (optimistic taxonomy CRUD)]
// [CITED: src/app/(admin)/dashboard/posts/page.tsx — the canonical dashboard list-page shell]
// [CITED: 260827-se8-PLAN.md Task 6 <action> step 3 — URL-driven list mechanics]
//
// Server Component — URL-driven: the q filter and the page number live in
// searchParams (deep-linkable, back/forward-correct). Calls listCategories(opts)
// + countCategories(opts) (both ungated dashboard reads — the proxy + (admin)
// route-group gate is the boundary; see categories.ts) and passes the page of
// rows into the client <CategoriesTable> which owns the optimistic CRUD
// mutations (D-27). Pagination applies only here (page always passed); bare
// listCategories() callers elsewhere (CategoryPicker, posts-page options)
// keep getting the full list — the Task 6 back-compat contract.
import { countCategories, listCategories } from "@/actions/categories";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import ListFilterBar from "@/components/dashboard/lists/ListFilterBar";
import Pagination from "@/components/site/Pagination";
import { bounded, clampPage, firstValue, DASHBOARD_PAGE_SIZE } from "@/lib/list-filters";
import CategoriesTable, { type CategoryRow } from "./CategoriesTable";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Categories | Any Discussion",
  description: "Manage post categories",
};

// Page-scope instant-navigation opt-out (260826-oif): this page's top-level
// uncached awaits (listCategories/countCategories — Server Actions calling
// headers() + DB IO, plus the awaited searchParams — itself the dynamic
// access, no connection() needed) sit below every effective <Suspense>
// boundary on client navigations between /dashboard segments — the (admin)
// layout's own opt-out does not cover sibling navigations (installed
// instant-navigation.md). Allowed-to-block is correct for session-gated
// content; a static shell buys nothing.
export const instant = false;

/** Raw Next.js 16 searchParams shape (Promise — awaited in the component). */
type RawSearchParams = Record<string, string | string[] | undefined>;

/**
 * parseCategoriesFilters — the shared 260827-se8 list-filters idiom: flatten
 * tampered string[] params, trim + length-bound, clamp the page. q-only here —
 * the per-page discretion (plan Task 6 step 3); no select filters.
 */
function parseCategoriesFilters(sp: RawSearchParams) {
  return {
    q: bounded(firstValue(sp.q), 200),
    page: clampPage(firstValue(sp.page)),
  };
}

export default async function CategoriesListPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const sp = await searchParams;
  const filters = parseCategoriesFilters(sp);

  let rows: CategoryRow[] = [];
  let total = 0;
  let loadError: string | null = null;
  try {
    [rows, total] = await Promise.all([
      listCategories({
        q: filters.q || undefined,
        page: filters.page,
        pageSize: DASHBOARD_PAGE_SIZE,
      }) as Promise<CategoryRow[]>,
      countCategories({ q: filters.q || undefined }),
    ]);
  } catch (err) {
    // Permission denied or DB error — the proxy.ts + (admin)/layout.tsx AuthGate
    // already redirect unauthenticated users; reaching this catch means the
    // DB is unreachable or the action rejected malformed input.
    loadError = err instanceof Error ? err.message : "Failed to load categories";
  }

  const totalPages = Math.max(1, Math.ceil(total / DASHBOARD_PAGE_SIZE));

  return (
    <div>
      <PageBreadcrumb pageTitle="Categories" />
      <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] lg:p-6">
        <div className="mb-5 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">All Categories</h3>
        </div>

        {/* 260827-se8 — URL-writing filter bar: q only (per-page discretion).
            Client island ONLY writes URLs; the Server Component re-queries. */}
        <div className="mb-5">
          <ListFilterBar basePath="/dashboard/categories" q={filters.q} />
        </div>

        {loadError ? (
          <div className="rounded-lg border border-error-300 bg-error-50 p-4 text-sm text-error-700 dark:border-error-700 dark:bg-error-900/20 dark:text-error-300">
            {loadError}
          </div>
        ) : (
          <CategoriesTable initialRows={rows} />
        )}

        {/* Server-rendered Link pagination — preserves filter params in ?page=N. */}
        <Pagination
          currentPage={filters.page}
          totalPages={totalPages}
          basePath="/dashboard/categories"
          searchParams={sp}
        />
      </div>
    </div>
  );
}
