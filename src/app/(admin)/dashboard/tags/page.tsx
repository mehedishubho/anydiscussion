// src/app/(admin)/dashboard/tags/page.tsx
// [CITED: 04-02-PLAN.md Task 1 — D-16 standalone pages over Phase 3 actions]
// [CITED: 04-CONTEXT.md D-26 (RHF + Zod + TanStack Query), D-27 (optimistic taxonomy CRUD)]
// [CITED: src/app/(admin)/dashboard/categories/page.tsx — identical shape, swapping category→tag]
//
// Server Component — calls listTags() and renders into the AppSidebar/AppHeader
// chrome via (admin)/layout.tsx. Passes rows into <TagsTable> which owns the
// optimistic CRUD mutations. The existing Phase 3 actions enforce permission-
// check-first (Pitfall #1).
import { listTags } from "@/actions/tags";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import TagsTable, { type TagRow } from "./TagsTable";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Tags | Any Discussion",
  description: "Manage post tags",
};

export default async function TagsListPage() {
  let rows: TagRow[] = [];
  let loadError: string | null = null;
  try {
    rows = (await listTags()) as TagRow[];
  } catch (err) {
    loadError = err instanceof Error ? err.message : "Failed to load tags";
  }

  return (
    <div>
      <PageBreadcrumb pageTitle="Tags" />
      <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] lg:p-6">
        <div className="mb-5 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">All Tags</h3>
        </div>
        {loadError ? (
          <div className="rounded-lg border border-error-300 bg-error-50 p-4 text-sm text-error-700 dark:border-error-700 dark:bg-error-900/20 dark:text-error-300">
            {loadError}
          </div>
        ) : (
          <TagsTable initialRows={rows} />
        )}
      </div>
    </div>
  );
}
