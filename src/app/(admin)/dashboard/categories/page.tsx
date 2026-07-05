// src/app/(admin)/dashboard/categories/page.tsx
// [CITED: 04-02-PLAN.md Task 1 — D-16 standalone pages over Phase 3 actions]
// [CITED: 04-CONTEXT.md D-26 (RHF + Zod + TanStack Query), D-27 (optimistic taxonomy CRUD)]
// [CITED: src/app/(admin)/dashboard/posts/page.tsx — the canonical dashboard list-page shell]
//
// Server Component — calls listCategories() and renders into the AppSidebar/
// AppHeader chrome via the (admin)/layout.tsx AuthGate → AdminShell wrapper.
// Passes the rows into the client <CategoriesTable> which owns the optimistic
// CRUD mutations (D-27). The existing Phase 3 actions enforce permission-check-first
// (Pitfall #1); UI hiding via the sidebar role filter (Plan 04-01) is supplementary.
import { listCategories } from "@/actions/categories";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import CategoriesTable, { type CategoryRow } from "./CategoriesTable";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Categories | Any Discussion",
  description: "Manage post categories",
};

export default async function CategoriesListPage() {
  let rows: CategoryRow[] = [];
  let loadError: string | null = null;
  try {
    rows = (await listCategories()) as CategoryRow[];
  } catch (err) {
    // Permission denied or DB error — the proxy.ts + (admin)/layout.tsx AuthGate
    // already redirect unauthenticated users; reaching this catch means the
    // session lacks taxonomy:read or the DB is unreachable.
    loadError = err instanceof Error ? err.message : "Failed to load categories";
  }

  return (
    <div>
      <PageBreadcrumb pageTitle="Categories" />
      <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] lg:p-6">
        <div className="mb-5 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">All Categories</h3>
        </div>
        {loadError ? (
          <div className="rounded-lg border border-error-300 bg-error-50 p-4 text-sm text-error-700 dark:border-error-700 dark:bg-error-900/20 dark:text-error-300">
            {loadError}
          </div>
        ) : (
          <CategoriesTable initialRows={rows} />
        )}
      </div>
    </div>
  );
}
