// src/app/(admin)/dashboard/subscribers/page.tsx
// [CITED: 260824-3l2-CONTEXT.md D-03 — admin-gated subscriber management:
//  paginated table + delete + CSV export (the export route + link land in
//  Task 7 alongside the route it points to)]
// [CITED: src/app/(admin)/dashboard/categories/page.tsx — the list-page shell]
// [CITED: src/lib/queries/users.ts — PAGE_SIZE + offset pagination shape]
//
// Server Component — FIRST dashboard page to paginate via searchParams (Next 16
// async form: searchParams is a Promise, awaited below). Link-based server
// pagination (prev/next + "Page X of Y") is the simplest shape for a hygiene
// surface; the public Pagination component is the visual analog.
//
// The actions re-check requireRole("admin") FIRST server-side — the middleware
// matcher and sidebar filter are UX-only (forged cookies pass the former).
import Link from "next/link";
import { listSubscribers, countSubscribers } from "@/actions/newsletter";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import SubscribersTable, { type SubscriberRow } from "./SubscribersTable";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Subscribers | Any Discussion",
  description: "Manage newsletter subscribers",
};

/** Must match SUBSCRIBERS_PAGE_SIZE in src/actions/newsletter.ts. */
const PAGE_SIZE = 20;

export default async function SubscribersPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  // Next 16: searchParams is a Promise — await it, parse with fallback 1.
  const params = await searchParams;
  const requested = Number.parseInt(params.page ?? "1", 10);
  const currentPage =
    Number.isFinite(requested) && requested > 0 ? requested : 1;

  let rows: SubscriberRow[] = [];
  let total = 0;
  let loadError: string | null = null;
  try {
    [rows, total] = await Promise.all([
      listSubscribers(currentPage),
      countSubscribers(),
    ]);
  } catch (err) {
    // Permission denied or DB error — the AuthGate already redirected
    // unauthenticated users; reaching this catch means the session lacks the
    // admin role or the DB is unreachable.
    loadError = err instanceof Error ? err.message : "Failed to load subscribers";
  }
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const hasPrev = currentPage > 1;
  const hasNext = currentPage < pageCount;

  return (
    <div>
      <PageBreadcrumb pageTitle="Subscribers" />
      <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] lg:p-6">
        <div className="mb-5 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
            All Subscribers
          </h3>
          <span className="text-sm text-gray-500 dark:text-gray-400">
            {total} total
          </span>
        </div>
        {loadError ? (
          <div className="rounded-lg border border-error-300 bg-error-50 p-4 text-sm text-error-700 dark:border-error-700 dark:bg-error-900/20 dark:text-error-300">
            {loadError}
          </div>
        ) : (
          <SubscribersTable
            initialRows={rows}
            currentPage={currentPage}
            pageCount={pageCount}
          />
        )}
      </div>

      {/* Server pagination — Link-based prev/next + page indicator below the
          table card (the public Pagination component is the visual analog). */}
      <div className="mt-4 flex items-center justify-between">
        {hasPrev ? (
          <Link
            href={`/dashboard/subscribers?page=${currentPage - 1}`}
            className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-gray-700 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-400 dark:ring-gray-700"
          >
            Previous
          </Link>
        ) : (
          <span className="rounded-lg px-4 py-2 text-sm font-medium text-gray-300 ring-1 ring-inset ring-gray-200 dark:text-gray-600 dark:ring-gray-800">
            Previous
          </span>
        )}
        <span className="text-sm text-gray-500 dark:text-gray-400">
          Page {currentPage} of {pageCount}
        </span>
        {hasNext ? (
          <Link
            href={`/dashboard/subscribers?page=${currentPage + 1}`}
            className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-gray-700 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-400 dark:ring-gray-700"
          >
            Next
          </Link>
        ) : (
          <span className="rounded-lg px-4 py-2 text-sm font-medium text-gray-300 ring-1 ring-inset ring-gray-200 dark:text-gray-600 dark:ring-gray-800">
            Next
          </span>
        )}
      </div>
    </div>
  );
}
