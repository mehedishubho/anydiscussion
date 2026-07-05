"use client";
// src/app/(admin)/dashboard/posts/PostForm.tsx
// [CITED: PATTERNS.md row — RHF + Zod wiring (schema-client.ts)]
// [CITED: 03-CONTEXT.md D-24 — TailAdmin-quality post form; D-23 required category, tags ~8]
// [CITED: 04-CONTEXT.md D-26 — TanStack useMutation retrofit (dashboard-wide form/mutation baseline)]
// [CITED: 04-CONTEXT.md D-27 — NOT optimistic on post save (high-stakes + revalidation needs server confirmation)]
// [CITED: 04-RESEARCH.md Pattern 4 — useMutation + invalidate shape]
// [CITED: 04-02-PLAN.md Task 3 — feature-image field now uses <MediaPicker> (closes Phase 3 UAT gap)]
//
// The client-component post create/edit form. Wires react-hook-form to the
// shared postSchema via zodResolver (the SAME schema the Server Action parses —
// proven by importing from schema-client.ts which re-exports from
// @/actions/posts-schema). The Tiptap editor is lazy-loaded via EditorProvider
// (which uses next/dynamic({ssr:false})) — PERF-02 prep.
//
// D-26 retrofit (Plan 04-01 Task 3c): savePost is wrapped in TanStack
// useMutation. The form fields, Zod schema, and validation are unchanged —
// only the submission wrapper is replaced. Submit state is read from the
// mutation (isPending / error?.message) instead of local useState.
//
// D-27 explicit: post save is NOT optimistic. High-stakes mutation with
// revalidatePath/revalidateTag — must wait for server confirmation before
// flipping UI state. Optimistic patterns are reserved for low-stakes
// high-frequency mutations (media delete, taxonomy CRUD — Plan 04-02/04-03).
//
// Plan 04-02 Task 3 — feature-image field: previously a plain text input that
// required pasting an external URL. Now uses the reusable <MediaPicker> modal
// (D-13) so authors can browse the library, upload-in-place, or paste an
// external URL. Closes the Phase 3 UAT gap ("no option to upload the feature
// image, just URL box"). The RHF field is still registered — the picker calls
// setValue('featureImage', url, { shouldValidate: true }).
//
// Native <input> elements + register() spread — the TailAdmin InputField component
// has its own controlled API and doesn't accept RHF's register props; the native
// input + Tailwind classes is the standard RHF wiring pattern. Phase 4 DASH-01
// can swap back to a TailAdmin form kit component if desired.
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import Image from "next/image";
import { EditorProvider } from "@/components/editor/EditorProvider";
import { postSchema, zodResolver, type PostSchemaInput } from "./schema-client";
import { savePost } from "@/actions/posts";
import TaxonomyPicker from "./components/TaxonomyPicker";
import MediaPicker from "@/components/dashboard/media/MediaPicker";

const INPUT_CLASS =
  "h-11 w-full rounded-lg border appearance-none px-4 py-2.5 text-sm shadow-theme-xs placeholder:text-gray-400 focus:outline-hidden focus:ring-3 bg-transparent text-gray-800 border-gray-300 focus:border-brand-300 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:focus:border-brand-800";

interface PostFormProps {
  /** When editing — the existing post id + values. */
  initialId?: number;
  initialTitle?: string;
  initialSlug?: string;
  initialExcerpt?: string;
  initialBody?: unknown;
  initialCategoryId?: number;
  initialTagIds?: number[];
  initialFeatureImage?: string;
}

export default function PostForm(props: PostFormProps) {
  const queryClient = useQueryClient();
  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    formState: { errors },
  } = useForm<PostSchemaInput>({
    resolver: zodResolver(postSchema),
    defaultValues: {
      ...(props.initialId ? { id: props.initialId } : {}),
      title: props.initialTitle ?? "",
      slug: props.initialSlug ?? "",
      excerpt: props.initialExcerpt ?? "",
      body: props.initialBody ?? null,
      categoryId: props.initialCategoryId,
      tagIds: props.initialTagIds ?? [],
      featureImage: props.initialFeatureImage ?? "",
    },
  });
  const [mediaPickerOpen, setMediaPickerOpen] = useState(false);
  const featureImageValue = watch("featureImage");

  // D-26 + D-27 — savePost wrapped in useMutation; NOT optimistic on post save.
  // Invalidate the ["posts"] query key on success so any dashboard list refreshes.
  // The mutation inherits the Server Action's behavior 1:1 (no client-side
  // transformation) — the form is the source of truth until the server confirms.
  const mutation = useMutation({
    mutationFn: (values: PostSchemaInput) =>
      savePost(values as Parameters<typeof savePost>[0]),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["posts"] });
    },
  });

  const onValid = (values: PostSchemaInput) => {
    // mutate (not mutateAsync) — RHF's handleSubmit doesn't need to await;
    // mutation.isPending drives the button-disabled state instead.
    mutation.mutate(values);
  };

  // RHF still owns the featureImage value — the picker calls setValue('featureImage', url).
  // The hidden register call keeps the field in the form schema; the visible UI is the
  // "Select image" button + thumbnail preview below.

  const submitError = mutation.error?.message ?? null;
  const isSubmitting = mutation.isPending;

  return (
    <form onSubmit={handleSubmit(onValid)} className="space-y-5">
      <div>
        <label htmlFor="title" className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
          Title
        </label>
        <input
          id="title"
          {...register("title")}
          placeholder="Post title"
          className={`${INPUT_CLASS} ${errors.title ? "border-error-500" : ""}`}
        />
        {errors.title && (
          <p className="mt-1.5 text-xs text-error-500">{errors.title.message as string}</p>
        )}
      </div>

      <div>
        <label htmlFor="slug" className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
          Slug
        </label>
        <input
          id="slug"
          {...register("slug")}
          placeholder="url-safe-latin-hyphens"
          className={`${INPUT_CLASS} ${errors.slug ? "border-error-500" : ""}`}
        />
        <p className="mt-1 text-xs text-gray-500">
          URL-safe Latin + hyphens only (D-20 — no uppercase, non-Latin, or special chars).
        </p>
        {errors.slug && (
          <p className="mt-1 text-xs text-error-500">{errors.slug.message as string}</p>
        )}
      </div>

      <div>
        <label htmlFor="excerpt" className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
          Excerpt
        </label>
        <input
          id="excerpt"
          {...register("excerpt")}
          placeholder="Leave blank to auto-derive from body (D-21)"
          className={INPUT_CLASS}
        />
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">Body</label>
        <EditorProvider name="body" control={control} />
      </div>

      <TaxonomyPicker control={control} errors={errors} />

      <div>
        <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
          Feature image
        </label>
        {/* Hidden RHF registration — keeps featureImage in the form schema so Zod
            validation still runs. The visible UI is the Select-image button + the
            thumbnail preview. The picker calls setValue('featureImage', url). */}
        <input
          type="hidden"
          {...register("featureImage")}
          aria-hidden
        />
        {featureImageValue ? (
          <div className="flex items-start gap-4 rounded-lg border border-gray-200 p-3 dark:border-gray-800">
            <div className="relative h-20 w-32 shrink-0 overflow-hidden rounded-md bg-gray-100 dark:bg-gray-800">
              <Image
                src={featureImageValue}
                alt="Feature image preview"
                fill
                sizes="128px"
                className="object-cover"
              />
            </div>
            <div className="flex-1 space-y-2">
              <p className="break-all text-xs text-gray-500">{featureImageValue}</p>
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => setMediaPickerOpen(true)}
                  className="text-xs font-medium text-brand-500 hover:text-brand-600"
                >
                  Replace
                </button>
                <button
                  type="button"
                  onClick={() => setValue("featureImage", "", { shouldValidate: true })}
                  className="text-xs font-medium text-error-500 hover:text-error-600"
                >
                  Remove image
                </button>
              </div>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setMediaPickerOpen(true)}
            className="inline-flex items-center justify-center rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-medium text-white shadow-theme-xs hover:bg-brand-600"
          >
            Select image
          </button>
        )}
        <MediaPicker
          isOpen={mediaPickerOpen}
          onClose={() => setMediaPickerOpen(false)}
          onSelect={(url) => {
            setValue("featureImage", url, { shouldValidate: true });
            setMediaPickerOpen(false);
          }}
        />
      </div>

      {submitError && (
        <div className="rounded-lg border border-error-300 bg-error-50 p-3 text-sm text-error-700 dark:border-error-700 dark:bg-error-900/20 dark:text-error-300">
          {submitError}
        </div>
      )}

      <div className="flex justify-end gap-3">
        <button
          type="button"
          className="inline-flex items-center justify-center rounded-lg bg-white px-5 py-3.5 text-sm font-medium text-gray-700 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-400 dark:ring-gray-700"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isSubmitting}
          className="inline-flex items-center justify-center rounded-lg bg-brand-500 px-5 py-3.5 text-sm font-medium text-white shadow-theme-xs hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isSubmitting ? "Saving…" : "Save draft"}
        </button>
      </div>
    </form>
  );
}
