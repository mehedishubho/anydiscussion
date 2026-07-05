// src/app/(admin)/dashboard/pages/page.tsx
// [CITED: src/app/(admin)/dashboard/posts/page.tsx — the server-rendered list template]
// [CITED: 04-CONTEXT.md D-17 (T&C + Privacy + Contact seeded), D-20 (Draft/Published
//  only — no Pending Review), D-26 (RHF + Zod + TanStack Query pattern)]
//
// Server Component — calls listPages() (which is gated by requireCan({ page: ["read"] })
// — admins + editors + authors-with-read all pass) and renders into the existing
// AppSidebar/AppHeader chrome via the (admin)/layout.tsx AuthGate → AdminShell wrapper.
// Passes rows to the client <PagesTable> which owns the optimistic soft-delete flow.
//
// D-20 — the STATUS_BADGE map for pages has NO in-review entry; the only valid
// statuses are draft | published (the schema rejects the in-review value).
import { listPages } from "@/actions/pages";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import PagesTable from "./PagesTable";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Pages | Any Discussion",
  description: "Manage legal, contact, and other standalone pages",
};

export default async function PagesListPage() {
  let rows: Array<{
    id: number;
    title: string;
    slug: string;
    status: string;
    updatedAt: Date | string | null;
  }> = [];
  let loadError: string | null = null;
  try {
    rows = await listPages();
  } catch (err) {
    // Permission denied or DB error — surface a friendly message. The proxy.ts +
    // (admin)/layout.tsx AuthGate already redirect unauthenticated users; reaching
    // this catch means the session lacks page:read or the DB is unreachable.
    loadError = err instanceof Error ? err.message : "Failed to load pages";
  }

  return (
    <div>
      <PageBreadcrumb pageTitle="Pages" />
      <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] lg:p-6">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">All Pages</h3>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              T&amp;C, Privacy, and Contact are seeded automatically as drafts on first boot.
            </p>
          </div>
        </div>

        {loadError ? (
          <div className="rounded-lg border border-error-300 bg-error-50 p-4 text-sm text-error-700 dark:border-error-700 dark:bg-error-900/20 dark:text-error-300">
            {loadError}
          </div>
        ) : (
          <PagesTable rows={rows} />
        )}
      </div>
    </div>
  );
}
