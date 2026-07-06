"use client";
// src/app/(admin)/dashboard/settings/seo/SeoSettingsForm.tsx
// [CITED: 05-CONTEXT.md D-11 — admin-only site-wide SEO settings page]
// [CITED: src/app/(admin)/dashboard/settings/storage/StorageSettingsForm.tsx — EXACT form analog]
// [CITED: src/app/(admin)/dashboard/posts/PostForm.tsx — RHF + Zod + useMutation baseline]
//
// The SEO Settings client form. RHF + Zod for validation; TanStack useMutation
// for the save (NOT optimistic per D-27 — site-wide metadata is high-stakes; the
// server confirms before the UI flips to "saved"). Five fields: site title,
// description, default OG image, canonical base URL, twitter handle.
//
// Unlike Storage Settings (Pitfall 7 — secret fields never pre-filled), ALL fields
// here ARE pre-filled from getSeoSettings — SEO values are not secrets. There is
// no "Test connection" probe (no provider to ping).
import { useForm } from "react-hook-form";
import { useMutation } from "@tanstack/react-query";
import {
  seoSettingsSchema,
  zodResolver,
  type SeoSettingsInput,
} from "./schema-client";
import { saveSeoSettings } from "@/actions/settings";

const INPUT_CLASS =
  "h-11 w-full rounded-lg border appearance-none px-4 py-2.5 text-sm shadow-theme-xs placeholder:text-gray-400 focus:outline-hidden focus:ring-3 bg-transparent text-gray-800 border-gray-300 focus:border-brand-300 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:focus:border-brand-800";

const LABEL_CLASS =
  "mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400";

interface SeoSettingsFormProps {
  /** Initial settings from getSeoSettings (the cached snapshot). */
  initial: SeoSettingsInput;
}

export default function SeoSettingsForm({ initial }: SeoSettingsFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SeoSettingsInput>({
    resolver: zodResolver(seoSettingsSchema),
    defaultValues: {
      siteTitle: initial.siteTitle ?? "",
      siteDescription: initial.siteDescription ?? "",
      defaultOgImage: initial.defaultOgImage ?? "",
      canonicalBaseUrl: initial.canonicalBaseUrl ?? "",
      twitterHandle: initial.twitterHandle ?? "",
    },
  });

  // D-27 — NOT optimistic. Site-wide metadata is high-stakes; server confirms.
  const mutation = useMutation({
    mutationFn: (values: SeoSettingsInput) =>
      saveSeoSettings(values as Parameters<typeof saveSeoSettings>[0]),
  });

  const onValid = (values: SeoSettingsInput) => {
    mutation.mutate(values);
  };

  const submitError = mutation.error?.message ?? null;
  const isSaving = mutation.isPending;
  const isSaved = mutation.isSuccess;

  return (
    <form onSubmit={handleSubmit(onValid)} className="space-y-6">
      <Field
        label="Site title"
        {...register("siteTitle")}
        placeholder="Any Discussion"
        error={errors.siteTitle?.message as string | undefined}
        required
      />
      <p className="-mt-4 text-xs text-gray-500 dark:text-gray-400">
        The site name shown in browser tabs, OG/Twitter cards, and JSON-LD.
      </p>

      <div>
        <label htmlFor="siteDescription" className={LABEL_CLASS}>
          Site description
        </label>
        <textarea
          id="siteDescription"
          {...register("siteDescription")}
          placeholder="A fast, SEO-optimized blog from Any Discussion."
          rows={3}
          className={`${INPUT_CLASS} h-auto py-2.5`}
        />
      </div>
      <p className="-mt-4 text-xs text-gray-500 dark:text-gray-400">
        The default meta description for the homepage and archive pages.
      </p>

      <Field
        label="Default OG image"
        {...register("defaultOgImage")}
        placeholder="https://cdn.anydiscussion.com/default-og.png"
        error={errors.defaultOgImage?.message as string | undefined}
      />
      <p className="-mt-4 text-xs text-gray-500 dark:text-gray-400">
        Fallback Open Graph image when a post has no OG image or feature image
        (D-09 fallback chain: post_seo.ogImage → posts.featureImage → this).
      </p>

      <Field
        label="Canonical base URL"
        {...register("canonicalBaseUrl")}
        placeholder="https://anydiscussion.com"
        error={errors.canonicalBaseUrl?.message as string | undefined}
        required
      />
      <p className="-mt-4 text-xs text-gray-500 dark:text-gray-400">
        Store without a trailing slash (e.g. https://anydiscussion.com). Used for
        metadataBase, sitemap, robots, and RSS absolute URLs.
      </p>

      <Field
        label="Twitter handle"
        {...register("twitterHandle")}
        placeholder="@anydiscussion"
        error={errors.twitterHandle?.message as string | undefined}
      />
      <p className="-mt-4 text-xs text-gray-500 dark:text-gray-400">
        The site&apos;s Twitter/X handle for twitter:card metadata.
      </p>

      {submitError && (
        <div className="rounded-lg border border-error-300 bg-error-50 p-3 text-sm text-error-700 dark:border-error-700 dark:bg-error-900/20 dark:text-error-300">
          {submitError}
        </div>
      )}
      {isSaved && (
        <div className="rounded-lg border border-success-300 bg-success-50 p-3 text-sm text-success-700 dark:border-success-700 dark:bg-success-900/20 dark:text-success-300">
          SEO settings saved.
        </div>
      )}

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={isSaving}
          className="inline-flex items-center justify-center rounded-lg bg-brand-500 px-5 py-3.5 text-sm font-medium text-white shadow-theme-xs hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isSaving ? "Saving…" : "Save SEO settings"}
        </button>
      </div>
    </form>
  );
}

// ─── Field helper (mirrors StorageSettingsForm.tsx) ──────────────────────────

function Field({
  label,
  placeholder,
  error,
  required,
  ...registerProps
}: {
  label: string;
  placeholder?: string;
  error?: string;
  required?: boolean;
} & Record<string, unknown>) {
  return (
    <div>
      <label className={LABEL_CLASS}>
        {label}
        {required && <span className="text-error-500"> *</span>}
      </label>
      <input
        type="text"
        placeholder={placeholder}
        className={`${INPUT_CLASS} ${error ? "border-error-500" : ""}`}
        {...(registerProps as Record<string, unknown>)}
      />
      {error && <p className="mt-1.5 text-xs text-error-500">{error}</p>}
    </div>
  );
}
