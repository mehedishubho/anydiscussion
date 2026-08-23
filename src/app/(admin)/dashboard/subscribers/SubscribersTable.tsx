"use client";
// src/app/(admin)/dashboard/subscribers/SubscribersTable.tsx
// [CITED: 260824-3l2-CONTEXT.md D-03 — admin-only list hygiene surface: list +
//  delete + CSV export; NO create (the public form does that), NO edit
//  (invites typos into a field the subscriber owns)]
// [CITED: src/app/(admin)/dashboard/categories/CategoriesTable.tsx — the CRUD
//  analog followed verbatim, minus create/edit (optimistic delete via
//  onMutate/onError/onSettled, window.confirm, TailAdmin Table primitives,
//  dashed empty state)]
//
// Client component — owns the optimistic delete lifecycle. The Server
// Component page passes `initialRows` (from listSubscribers) which hydrates the
// useQuery cache keyed ["subscribers", currentPage] (SSR pattern — no refetch
// on mount). deleteSubscriber re-checks requireRole("admin") server-side; the
// sidebar role filter is UX-only.
//
// The token column is NEVER selected into these rows (T-3l2-05 — it is an
// unsubscribe credential and does not belong in dashboard payloads).
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { deleteSubscriber, listSubscribers } from "@/actions/newsletter";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableCell,
} from "@/components/ui/table";

export interface SubscriberRow {
  id: number;
  email: string;
  status: "active" | "unsubscribed";
  createdAt: Date;
}

interface SubscribersTableProps {
  initialRows: SubscriberRow[];
  /** 1-based current page (part of the query key). */
  currentPage: number;
  /** Total page count — used to distinguish "no subscribers at all" from
   *  "empty page past the end" in the empty state. */
  pageCount: number;
}

export default function SubscribersTable({
  initialRows,
  currentPage,
  pageCount,
}: SubscribersTableProps) {
  const queryClient = useQueryClient();
  const queryKey = ["subscribers", currentPage] as const;

  // SSR-hydrated cache — initialData avoids a refetch on mount.
  const { data: rows = initialRows } = useQuery({
    queryKey,
    queryFn: async () => {
      const { listSubscribers: fetchPage } = await import("@/actions/newsletter");
      return (await fetchPage(currentPage)) as SubscriberRow[];
    },
    initialData: initialRows,
    staleTime: 30_000,
  });

  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Delete — optimistic (D-27 pattern): onMutate removes the row, onError
  // rolls back + shows the banner, onSettled invalidates the ["subscribers"]
  // PREFIX so every page's cache refetches.
  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteSubscriber(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ["subscribers"] });
      const previous = queryClient.getQueryData<SubscriberRow[]>(queryKey);
      queryClient.setQueryData<SubscriberRow[]>(queryKey, (old = []) =>
        old.filter((row) => row.id !== id),
      );
      return { previous };
    },
    onError: (err, _id, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKey, context.previous);
      }
      setErrorMsg(err instanceof Error ? err.message : "Failed to delete subscriber");
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["subscribers"] });
    },
  });

  const handleDelete = (row: SubscriberRow) => {
    const ok = window.confirm(
      `Delete subscriber "${row.email}"? This permanently removes the row (hard delete — there is no undo).`,
    );
    if (!ok) return;
    deleteMutation.mutate(row.id);
  };

  return (
    <>
      {/* Export CSV (D-03) — plain anchor to the Route Handler: native browser
          download, zero client JS. Secondary styling (the + New Category button's
          sibling); the route re-checks requireRole("admin") in-handler (403). */}
      <div className="mb-4 flex justify-end">
        <a
          href="/dashboard/subscribers/export"
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-white px-4 py-2.5 text-sm font-medium text-gray-700 shadow-theme-xs ring-1 ring-inset ring-gray-300 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-300 dark:ring-gray-700"
        >
          Export CSV
        </a>
      </div>

      {errorMsg && (
        <div className="mb-4 rounded-lg border border-error-300 bg-error-50 p-3 text-sm text-error-700 dark:border-error-700 dark:bg-error-900/20 dark:text-error-300">
          {errorMsg}
        </div>
      )}

      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500 dark:border-gray-700">
          {pageCount > 1 ? (
            "No subscribers on this page."
          ) : (
            <>
              No subscribers yet. Subscriptions from the public footer form will
              appear here.
            </>
          )}
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-800">
          <Table>
            <TableHeader>
              <TableRow className="border-b border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-900/50">
                <TableCell isHeader className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500">Email</TableCell>
                <TableCell isHeader className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500">Status</TableCell>
                <TableCell isHeader className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500">Subscribed At</TableCell>
                <TableCell isHeader className="px-4 py-3 text-right text-xs font-semibold uppercase text-gray-500">Actions</TableCell>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id} className="border-b border-gray-100 last:border-0 dark:border-gray-800">
                  <TableCell className="px-4 py-3 text-sm font-medium text-gray-800 dark:text-white/90">
                    {row.email}
                  </TableCell>
                  <TableCell className="px-4 py-3">
                    <span
                      className={
                        row.status === "active"
                          ? "inline-flex rounded-full bg-success-50 px-2.5 py-0.5 text-xs font-medium text-success-700 dark:bg-success-900/30 dark:text-success-400"
                          : "inline-flex rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-400"
                      }
                    >
                      {row.status}
                    </span>
                  </TableCell>
                  <TableCell className="px-4 py-3 text-sm text-gray-500">
                    {/* Dashboard-only readable local datetime (the CSV export
                        keeps ISO-8601). suppressHydrationWarning: server TZ
                        differs from the viewer's — the client-corrected value
                        is what the admin should see. */}
                    <span suppressHydrationWarning>
                      {new Date(row.createdAt).toLocaleString(undefined, {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </span>
                  </TableCell>
                  <TableCell className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => handleDelete(row)}
                      className="text-sm font-medium text-error-500 hover:text-error-600"
                    >
                      Delete
                    </button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </>
  );
}
