"use client";
// src/app/(admin)/posts/components/CategoryPicker.tsx
// [CITED: 03-02-PLAN.md Task 3 Step A — single-select required category picker]
// [CITED: 03-CONTEXT.md D-22 (picker now, mgmt UI Phase 4), D-23 (required category)]
// [CITED: 03-01-PLAN.md deviation 5 — native inputs + Tailwind classes (RHF-compatible)]
//
// Single-select category picker wired to the listCategories Server Action.
// On mount, calls listCategories() and populates a native <select>. The field is
// required — postSchema enforces this server-side (categoryId: z.number().positive()).
// The client-side <select required> + Controller validation is the UX hint; the
// Zod parse is the hard enforcement.
//
// Does NOT include a "Create category" affordance — D-22 boundary (standalone
// Categories management UI is Phase 4 DASH-02). If no categories exist, shows
// a message directing the author to ask an admin.
import { useState, useEffect } from "react";
import { Controller, type Control, type FieldErrors } from "react-hook-form";
import { listCategories } from "@/actions/categories";
import type { PostSchemaInput } from "@/actions/posts-schema";

interface CategoryPickerProps {
  name: string;
  control: Control<PostSchemaInput>;
  errors?: FieldErrors<PostSchemaInput>;
}

const INPUT_CLASS =
  "h-11 w-full rounded-lg border appearance-none px-4 py-2.5 text-sm shadow-theme-xs placeholder:text-gray-400 focus:outline-hidden focus:ring-3 bg-transparent text-gray-800 border-gray-300 focus:border-brand-300 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:focus:border-brand-800";

interface CategoryRow {
  id: number;
  name: string;
  slug: string;
}

export default function CategoryPicker({ name, control, errors }: CategoryPickerProps) {
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listCategories()
      .then((rows) => {
        if (!cancelled) {
          setCategories(rows as CategoryRow[]);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLoadError("Failed to load categories");
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const errorMessage = errors?.[name as keyof PostSchemaInput]?.message as string | undefined;

  return (
    <div>
      <label
        htmlFor={name}
        className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400"
      >
        Category <span className="text-error-500">*</span>
      </label>
      <Controller
        name={name as keyof PostSchemaInput & "categoryId"}
        control={control}
        render={({ field }) => (
          <select
            id={name}
            className={`${INPUT_CLASS} ${errorMessage ? "border-error-500" : ""}`}
            value={field.value !== undefined && field.value !== null ? String(field.value) : ""}
            onChange={(e) => field.onChange(e.target.value === "" ? undefined : Number(e.target.value))}
          >
            <option value="" disabled>
              {loading ? "Loading…" : "Select a category"}
            </option>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.name}
              </option>
            ))}
          </select>
        )}
      />
      {!loading && categories.length === 0 && !loadError && (
        <p className="mt-1 text-xs text-gray-500">
          No categories yet — ask an admin to create one.
        </p>
      )}
      {loadError && <p className="mt-1 text-xs text-error-500">{loadError}</p>}
      {errorMessage && <p className="mt-1 text-xs text-error-500">{errorMessage}</p>}
    </div>
  );
}
