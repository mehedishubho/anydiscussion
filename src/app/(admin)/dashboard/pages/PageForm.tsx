"use client";
// src/app/(admin)/dashboard/pages/PageForm.tsx
// [CITED: src/app/(admin)/dashboard/posts/PostForm.tsx — the RHF + Zod + useMutation baseline]
// [CITED: 04-CONTEXT.md D-18 (slimmed editor — drop category/tags/excerpt/feature-image/
//  schedule/preview; keep title/slug/body/SEO/status), D-19 (Contact = content-only),
//  D-26 (RHF + Zod + TanStack Query), D-27 (page save IS optimistic — high-frequency
//  small mutation)]
// [CITED: CLAUDE.md "sanitize raw HTML before storage AND render — no exception for
//  trusted admin content" — the body sanitize lives in actions/pages.ts (T-04-17)]
//
// The client-component page create/edit form. Slimmed version of PostForm: drops
// the post-only fields (category, tags, excerpt, feature-image, schedule, preview
// token per D-18). Reuses the SAME Phase 3 Tiptap editor (extensions.ts single
// source of truth) via EditorProvider — the editor itself is NOT modified.
//
// D-26 + D-27: savePage wrapped in TanStack useMutation. Page save IS optimistic
// (D-27 — page save is a high-frequency small mutation, unlike post publish which
// needs server confirmation). Optimistic update is local UI feedback; the server
// remains source of truth and onError rolls back.
//
// The save wrapper dispatches createPage vs updatePage based on `initial` presence
// (mirrors posts' savePost dispatch by id).
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { EditorProvider } from "@/components/editor/EditorProvider";
import { pageSchema, zodResolver, type PageSchemaInput } from "./schema-client";
import { createPage, updatePage } from "@/actions/pages";

const INPUT_CLASS =
  "h-11 w-full rounded-lg border appearance-none px-4 py-2.5 text-sm shadow-theme-xs placeholder:text-gray-400 focus:outline-hidden focus:ring-3 bg-transparent text-gray-800 border-gray-300 focus:border-brand-300 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:focus:border-brand-800";

interface PageFormProps {
  /** When editing — the existing page values. Absent on the create path. */
  initial?: {
    id: number;
    title: string;
    slug: string;
    body?: unknown;
    status?: "draft" | "published";
    metaTitle?: string | null;
    metaDescription?: string | null;
    canonical?: string | null;
  };
}

export default function PageForm({ initial }: PageFormProps) {
  const queryClient = useQueryClient();
  const [optimisticMessage, setOptimisticMessage] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<PageSchemaInput>({
    resolver: zodResolver(pageSchema),
    defaultValues: {
      ...(initial?.id ? { id: initial.id } : {}),
      title: initial?.title ?? "",
      slug: initial?.slug ?? "",
      body: initial?.body ?? null,
      status: initial?.status ?? "draft",
      metaTitle: initial?.metaTitle ?? "",
      metaDescription: initial?.metaDescription ?? "",
      canonical: initial?.canonical ?? "",
    },
  });

  // D-26 + D-27 — savePage wrapped in useMutation; OPTIMISTIC on page save.
  // Dispatches createPage vs updatePage based on initial.id presence. onSuccess
  // invalidates ["pages"] so any dashboard list refreshes.
  const mutation = useMutation({
    mutationFn: async (values: PageSchemaInput) => {
      const payload = {
        title: values.title,
        slug: values.slug,
        body: values.body,
        status: values.status,
        metaTitle: values.metaTitle,
        metaDescription: values.metaDescription,
        canonical: values.canonical,
      };
      if (initial?.id) {
        return updatePage(initial.id, payload);
      }
      return createPage(payload);
    },
    // D-27 optimistic — instant UI feedback. The server is still source of truth.
    onMutate: () => {
      setOptimisticMessage("Saving…");
    },
    onSuccess: () => {
      setOptimisticMessage("Saved.");
      void queryClient.invalidateQueries({ queryKey: ["pages"] });
      // Clear the optimistic banner after a beat so it doesn't linger.
      setTimeout(() => setOptimisticMessage(null), 2000);
    },
    onError: (err: Error) => {
      setOptimisticMessage(null);
      // Surface the server error (FORBIDDEN / NOT_FOUND / validation message).
      void err;
    },
  });

  const onValid = (values: PageSchemaInput) => {
    mutation.mutate(values);
  };

  const submitError = mutation.error?.message ?? null;
  const isSubmitting = mutation.isPending;

  return (
    <form onSubmit={handleSubmit(onValid)} className="space-y-5">
      <div>
        <label
          htmlFor="title"
          className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400"
        >
          Title
        </label>
        <input
          id="title"
          {...register("title")}
          placeholder="Page title"
          className={`${INPUT_CLASS} ${errors.title ? "border-error-500" : ""}`}
        />
        {errors.title && (
          <p className="mt-1.5 text-xs text-error-500">{errors.title.message as string}</p>
        )}
      </div>

      <div>
        <label
          htmlFor="slug"
          className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400"
        >
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
        <label
          htmlFor="status"
          className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400"
        >
          Status
        </label>
        <select
          id="status"
          {...register("status")}
          className={INPUT_CLASS}
          defaultValue="draft"
        >
          {/* D-20 — draft | published ONLY. NO in-review state for legal/contact content. */}
          <option value="draft">Draft</option>
          <option value="published">Published</option>
        </select>
        {errors.status && (
          <p className="mt-1 text-xs text-error-500">{errors.status.message as string}</p>
        )}
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
          Body
        </label>
        {/* Reuses the SAME Phase 3 Tiptap editor (extensions.ts single source of truth).
            D-18 — the editor itself is NOT modified; only the wrapping form is slimmed. */}
        <EditorProvider name="body" control={control} />
      </div>

      <div className="border-t border-gray-200 pt-5 dark:border-gray-800">
        <h4 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
          SEO
        </h4>

        <div className="space-y-5">
          <div>
            <label
              htmlFor="metaTitle"
              className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400"
            >
              Meta title
            </label>
            <input
              id="metaTitle"
              {...register("metaTitle")}
              placeholder="Overrides <title> when set (max 255 chars)"
              className={INPUT_CLASS}
            />
          </div>

          <div>
            <label
              htmlFor="metaDescription"
              className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400"
            >
              Meta description
            </label>
            <textarea
              id="metaDescription"
              {...register("metaDescription")}
              placeholder="Search-result snippet text (max 500 chars — validate by reasonable byte count, not Latin character limits)"
              rows={3}
              className={`${INPUT_CLASS} h-auto py-2.5`}
            />
          </div>

          <div>
            <label
              htmlFor="canonical"
              className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400"
            >
              Canonical URL
            </label>
            <input
              id="canonical"
              {...register("canonical")}
              placeholder="https://anydiscussion.com/... (optional — overrides slug-derived URL)"
              className={INPUT_CLASS}
            />
          </div>
        </div>
      </div>

      {optimisticMessage && (
        <div className="rounded-lg border border-brand-300 bg-brand-50 p-3 text-sm text-brand-700 dark:border-brand-700 dark:bg-brand-900/20 dark:text-brand-300">
          {optimisticMessage}
        </div>
      )}

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
          {isSubmitting ? "Saving…" : "Save page"}
        </button>
      </div>
    </form>
  );
}
