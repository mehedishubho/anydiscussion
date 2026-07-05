"use client";
// src/app/(admin)/dashboard/pages/PagesTable.tsx
// [CITED: src/app/(admin)/dashboard/posts/page.tsx — the server-rendered list table template]
// [CITED: 04-CONTEXT.md D-20 (Draft/Published only — no Pending Review),
//  D-27 (page delete = optimistic — high-frequency small mutation)]
//
// Client component rendered inside the server-rendered list page. Receives the
// initial rows from the Server Component (which called listPages() with RBAC
// firing at request time) and owns the soft-delete mutation flow:
//   - useMutation wraps softDeletePage; optimistic removal from local state on
//     onMutate (D-27); rollback on onError; the canonical list refreshes on the
//     next navigation (the server page re-calls listPages()).
//
// The Status column shows Draft | Published ONLY (no Pending Review entry in
// STATUS_BADGE per D-20).
import { useState } from "react";
import Link from "next/link";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { softDeletePage } from "@/actions/pages";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableCell,
} from "@/components/ui/table";

interface PageRow {
  id: number;
  title: string;
  slug: string;
  status: string;
  updatedAt: Date | string | null;
}

interface PagesTableProps {
  rows: PageRow[];
}

// D-20 — Draft/Published ONLY. No "pending_review" entry (legal/contact content
// does not flow through the editorial review pipeline).
const STATUS_BADGE: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  published: "bg-success-100 text-success-700 dark:bg-success-900/30 dark:text-success-300",
};

export default function PagesTable({ rows: initialRows }: PagesTableProps) {
  const queryClient = useQueryClient();
  const [rows, setRows] = useState<PageRow[]>(initialRows);
  const [error, setError] = useState<string | null>(null);

  const deleteMutation = useMutation({
    mutationFn: (id: number) => softDeletePage(id),
    // D-27 — optimistic: remove the row immediately, rollback on error.
    onMutate: async (id: number) => {
      setError(null);
      const previous = rows;
      setRows((current) => current.filter((r) => r.id !== id));
      return { previous };
    },
    onError: (err: Error, _id, context) => {
      // Rollback the optimistic removal.
      if (context?.previous) setRows(context.previous);
      setError(err instanceof Error ? err.message : "Failed to delete page");
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["pages"] });
    },
  });

  const handleDelete = (id: number) => {
    // Confirm before soft-delete — even soft-deletes are reversible only via DB
    // (no undo UI in v1). The confirmation keeps the action deliberate.
    if (window.confirm("Soft-delete this page? The row is marked deleted; content is recoverable via DB only.")) {
      deleteMutation.mutate(id);
    }
  };

  if (rows.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500 dark:border-gray-700">
        No pages found. T&amp;C, Privacy, and Contact are seeded automatically on first boot —
        if you do not see them, the seed migration has not run yet.
      </div>
    );
  }

  return (
    <>
      {error && (
        <div className="mb-4 rounded-lg border border-error-300 bg-error-50 p-3 text-sm text-error-700 dark:border-error-700 dark:bg-error-900/20 dark:text-error-300">
          {error}
        </div>
      )}
      <div className="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-800">
        <Table>
          <TableHeader>
            <TableRow className="border-b border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-900/50">
              <TableCell isHeader className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500">
                Title
              </TableCell>
              <TableCell isHeader className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500">
                Slug
              </TableCell>
              <TableCell isHeader className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500">
                Status
              </TableCell>
              <TableCell isHeader className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500">
                Updated
              </TableCell>
              <TableCell isHeader className="px-4 py-3 text-right text-xs font-semibold uppercase text-gray-500">
                Actions
              </TableCell>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((page) => (
              <TableRow
                key={page.id}
                className="border-b border-gray-100 last:border-0 dark:border-gray-800"
              >
                <TableCell className="px-4 py-3 text-sm font-medium text-gray-800 dark:text-white/90">
                  {page.title}
                </TableCell>
                <TableCell className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                  /{page.slug}
                </TableCell>
                <TableCell className="px-4 py-3">
                  <span
                    className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${
                      STATUS_BADGE[page.status] ?? STATUS_BADGE.draft
                    }`}
                  >
                    {page.status}
                  </span>
                </TableCell>
                <TableCell className="px-4 py-3 text-sm text-gray-500">
                  {page.updatedAt ? new Date(page.updatedAt).toLocaleDateString() : "—"}
                </TableCell>
                <TableCell className="px-4 py-3 text-right">
                  <Link
                    href={`/dashboard/pages/${page.id}/edit`}
                    className="mr-3 text-sm font-medium text-brand-500 hover:text-brand-600"
                  >
                    Edit
                  </Link>
                  <button
                    type="button"
                    onClick={() => handleDelete(page.id)}
                    disabled={deleteMutation.isPending}
                    className="text-sm font-medium text-error-500 hover:text-error-600 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Delete
                  </button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
