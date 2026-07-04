"use client";
// src/app/(admin)/posts/components/TaxonomyPicker.tsx
// [CITED: 03-02-PLAN.md Task 3 Step C — composes CategoryPicker + TagPicker]
// [CITED: 03-CONTEXT.md D-22 (taxonomy pickers in post editor now), D-23 (rules)]
//
// Composition component — renders CategoryPicker (required, single-select) +
// TagPicker (capped 8, multi-select) together for the post form. Import this
// single component from PostForm; it delegates to the two pickers internally.
import type { Control, FieldErrors } from "react-hook-form";
import type { PostSchemaInput } from "@/actions/posts-schema";
import CategoryPicker from "./CategoryPicker";
import TagPicker from "./TagPicker";

interface TaxonomyPickerProps {
  control: Control<PostSchemaInput>;
  errors?: FieldErrors<PostSchemaInput>;
}

export default function TaxonomyPicker({ control, errors }: TaxonomyPickerProps) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <CategoryPicker name="categoryId" control={control} errors={errors} />
      <TagPicker name="tagIds" control={control} errors={errors} />
    </div>
  );
}
