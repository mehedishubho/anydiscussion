"use client";
// src/app/(admin)/dashboard/categories/CategoriesTable.tsx
// [CITED: 04-02-PLAN.md Task 1 — D-26 RHF + Zod + TanStack useMutation, D-27 optimistic CRUD]
// [CITED: src/app/(admin)/dashboard/posts/PostForm.tsx — the useMutation baseline]
// [CITED: src/actions/categories.ts — existing Phase 3 actions (permission-check-first)]
//
// Client component — owns the optimistic CRUD lifecycle for categories. The
// Server Component page passes `initialRows` from listCategories() which hydrates
// the useQuery cache (TanStack SSR pattern — no refetch on mount). All mutations
// wrap the existing Phase 3 actions: createCategory / updateCategory /
// softDeleteCategory. onMutate optimistically updates the cache (D-27 — high-
// frequency small mutations); onError rolls back; onSuccess invalidates
// ["categories"] so any other dashboard surface refreshes.
//
// The "+ New Category" button opens an inline Modal with an RHF form (name + slug).
// Edit opens the same modal pre-populated. Soft-delete confirms before mutating.
//
// UX-only: the sidebar role filter (Plan 04-01) hides this route from authors
// lacking taxonomy:create/update/delete. The actions RE-CHECK permissions
// server-side (Pitfall #1) — UI hiding is supplementary, never authoritative.
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  createCategory,
  updateCategory,
  softDeleteCategory,
} from "@/actions/categories";
import { Modal } from "@/components/ui/modal";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableCell,
} from "@/components/ui/table";

export interface CategoryRow {
  id: number;
  name: string;
  slug: string;
  description?: string | null;
}

const INPUT_CLASS =
  "h-11 w-full rounded-lg border appearance-none px-4 py-2.5 text-sm shadow-theme-xs placeholder:text-gray-400 focus:outline-hidden focus:ring-3 bg-transparent text-gray-800 border-gray-300 focus:border-brand-300 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:focus:border-brand-800";

// Local Zod schema for the create/edit form. Lives alongside the table per
// CLAUDE.md ("Zod schemas live alongside their feature"). Matches the shape
// the existing createCategory/updateCategory Server Action consumes.
const categoryFormSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  slug: z
    .string()
    .min(1, "Slug is required")
    .max(120)
    .regex(/^[a-z0-9-]+$/, "Slug must be URL-safe Latin + hyphens (D-20)"),
  description: z.string().max(500).optional(),
});
type CategoryFormValues = z.infer<typeof categoryFormSchema>;

interface CategoriesTableProps {
  initialRows: CategoryRow[];
}

type EditingState = { mode: "new" } | { mode: "edit"; row: CategoryRow } | null;

export default function CategoriesTable({ initialRows }: CategoriesTableProps) {
  const queryClient = useQueryClient();
  const queryKey = ["categories"] as const;

  // SSR-hydrated cache — initialData avoids a refetch on mount.
  const { data: rows = initialRows } = useQuery({
    queryKey,
    queryFn: async () => {
      // The Server Component already populated initialRows via listCategories();
      // a refetch here is rare (manual invalidation only). Re-use the existing
      // Phase 3 action — no new server endpoint.
      const { listCategories } = await import("@/actions/categories");
      return (await listCategories()) as CategoryRow[];
    },
    initialData: initialRows,
    staleTime: 30_000,
  });

  const [editing, setEditing] = useState<EditingState>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // createCategory — D-27 optimistic: onMutate inserts the optimistic row,
  // onError rolls back, onSuccess invalidates the cache.
  const createMutation = useMutation({
    mutationFn: (values: CategoryFormValues) =>
      createCategory({
        name: values.name,
        slug: values.slug,
        description: values.description,
      }),
    onMutate: async (values) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<CategoryRow[]>(queryKey);
      const optimisticRow: CategoryRow = {
        id: Math.max(0, ...rows.map((r) => r.id)) + 1,
        name: values.name,
        slug: values.slug,
        description: values.description ?? null,
      };
      queryClient.setQueryData<CategoryRow[]>(queryKey, (old = []) => [
        ...old,
        optimisticRow,
      ]);
      return { previous };
    },
    onError: (err, _values, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKey, context.previous);
      }
      setErrorMsg(err instanceof Error ? err.message : "Failed to create category");
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({
      id,
      values,
    }: {
      id: number;
      values: CategoryFormValues;
    }) =>
      updateCategory(id, {
        name: values.name,
        slug: values.slug,
        description: values.description,
      }),
    onMutate: async ({ id, values }) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<CategoryRow[]>(queryKey);
      queryClient.setQueryData<CategoryRow[]>(queryKey, (old = []) =>
        old.map((row) =>
          row.id === id
            ? {
                ...row,
                name: values.name,
                slug: values.slug,
                description: values.description ?? row.description,
              }
            : row,
        ),
      );
      return { previous };
    },
    onError: (err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKey, context.previous);
      }
      setErrorMsg(err instanceof Error ? err.message : "Failed to update category");
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => softDeleteCategory(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<CategoryRow[]>(queryKey);
      queryClient.setQueryData<CategoryRow[]>(queryKey, (old = []) =>
        old.filter((row) => row.id !== id),
      );
      return { previous };
    },
    onError: (err, _id, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKey, context.previous);
      }
      setErrorMsg(err instanceof Error ? err.message : "Failed to delete category");
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey });
    },
  });

  const openNew = () => {
    setErrorMsg(null);
    setEditing({ mode: "new" });
  };
  const openEdit = (row: CategoryRow) => {
    setErrorMsg(null);
    setEditing({ mode: "edit", row });
  };
  const close = () => setEditing(null);

  const handleDelete = (row: CategoryRow) => {
    const ok = window.confirm(
      `Delete category "${row.name}"? This is a soft-delete (D-08 — restorable via DB).`,
    );
    if (!ok) return;
    deleteMutation.mutate(row.id);
  };

  return (
    <>
      <div className="mb-4 flex justify-end">
        <button
          type="button"
          onClick={openNew}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-medium text-white shadow-theme-xs hover:bg-brand-600"
        >
          + New Category
        </button>
      </div>

      {errorMsg && (
        <div className="mb-4 rounded-lg border border-error-300 bg-error-50 p-3 text-sm text-error-700 dark:border-error-700 dark:bg-error-900/20 dark:text-error-300">
          {errorMsg}
        </div>
      )}

      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500 dark:border-gray-700">
          No categories yet. Click <span className="font-medium">+ New Category</span> to create your first category.
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-800">
          <Table>
            <TableHeader>
              <TableRow className="border-b border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-900/50">
                <TableCell isHeader className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500">Name</TableCell>
                <TableCell isHeader className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500">Slug</TableCell>
                <TableCell isHeader className="px-4 py-3 text-right text-xs font-semibold uppercase text-gray-500">Actions</TableCell>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id} className="border-b border-gray-100 last:border-0 dark:border-gray-800">
                  <TableCell className="px-4 py-3 text-sm font-medium text-gray-800 dark:text-white/90">
                    {row.name}
                  </TableCell>
                  <TableCell className="px-4 py-3 text-sm text-gray-500">
                    {row.slug}
                  </TableCell>
                  <TableCell className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => openEdit(row)}
                      className="mr-3 text-sm font-medium text-brand-500 hover:text-brand-600"
                    >
                      Edit
                    </button>
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

      {editing && (
        <CategoryFormModal
          initialState={editing}
          onClose={close}
          onCreate={(values) => {
            createMutation.mutate(values);
            close();
          }}
          onUpdate={(id, values) => {
            updateMutation.mutate({ id, values });
            close();
          }}
        />
      )}
    </>
  );
}

type NonNullEditingState = Exclude<EditingState, null>;

interface CategoryFormModalProps {
  initialState: NonNullEditingState;
  onClose: () => void;
  onCreate: (values: CategoryFormValues) => void;
  onUpdate: (id: number, values: CategoryFormValues) => void;
}

function CategoryFormModal({
  initialState,
  onClose,
  onCreate,
  onUpdate,
}: CategoryFormModalProps) {
  const isEdit = initialState.mode === "edit";
  const defaultValues: CategoryFormValues = {
    name: initialState.mode === "edit" ? initialState.row.name : "",
    slug: initialState.mode === "edit" ? initialState.row.slug : "",
    description:
      initialState.mode === "edit"
        ? (initialState.row.description ?? undefined)
        : undefined,
  };

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CategoryFormValues>({
    resolver: zodResolver(categoryFormSchema),
    defaultValues,
  });

  const onValid = (values: CategoryFormValues) => {
    if (isEdit && initialState.mode === "edit") {
      onUpdate(initialState.row.id, values);
    } else {
      onCreate(values);
    }
  };

  return (
    <Modal isOpen onClose={onClose} className="max-w-lg p-6">
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
          {isEdit ? "Edit category" : "New category"}
        </h3>
        <form onSubmit={handleSubmit(onValid)} className="space-y-4">
          <div>
            <label
              htmlFor="cat-name"
              className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400"
            >
              Name
            </label>
            <input
              id="cat-name"
              {...register("name")}
              placeholder="Category name"
              className={`${INPUT_CLASS} ${errors.name ? "border-error-500" : ""}`}
            />
            {errors.name && (
              <p className="mt-1.5 text-xs text-error-500">{errors.name.message as string}</p>
            )}
          </div>
          <div>
            <label
              htmlFor="cat-slug"
              className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400"
            >
              Slug
            </label>
            <input
              id="cat-slug"
              {...register("slug")}
              placeholder="url-safe-latin-hyphens"
              className={`${INPUT_CLASS} ${errors.slug ? "border-error-500" : ""}`}
            />
            {errors.slug && (
              <p className="mt-1.5 text-xs text-error-500">{errors.slug.message as string}</p>
            )}
          </div>
          <div>
            <label
              htmlFor="cat-description"
              className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400"
            >
              Description (optional)
            </label>
            <textarea
              id="cat-description"
              {...register("description")}
              placeholder="Short description (optional)"
              rows={3}
              className={`${INPUT_CLASS} h-auto py-2.5`}
            />
            {errors.description && (
              <p className="mt-1.5 text-xs text-error-500">{errors.description.message as string}</p>
            )}
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center justify-center rounded-lg bg-white px-5 py-2.5 text-sm font-medium text-gray-700 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-400 dark:ring-gray-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="inline-flex items-center justify-center rounded-lg bg-brand-500 px-5 py-2.5 text-sm font-medium text-white shadow-theme-xs hover:bg-brand-600"
            >
              {isEdit ? "Save changes" : "Create category"}
            </button>
          </div>
        </form>
      </div>
    </Modal>
  );
}
