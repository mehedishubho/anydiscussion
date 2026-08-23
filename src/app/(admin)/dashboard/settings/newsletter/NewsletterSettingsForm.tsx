"use client";
// src/app/(admin)/dashboard/settings/newsletter/NewsletterSettingsForm.tsx
// [CITED: 260824-3l2-CONTEXT.md D-02 — enable toggle + three footer texts]
// [CITED: src/app/(admin)/dashboard/settings/seo/SeoSettingsForm.tsx — EXACT
//  form analog (RHF + zodResolver + useMutation, NOT optimistic per D-27)]
// [CITED: src/components/site/ContactForm.tsx — client components importing the
//  pure schema module (@/actions/newsletter-schema) is established]
//
// The Newsletter Settings client form. react-hook-form + zodResolver for
// validation; TanStack useMutation calling saveNewsletterSettings — NOT
// optimistic (settings are server-confirm, same D-27 reasoning as
// SeoSettingsForm: site-wide footer chrome is high-stakes). Four fields: the
// enabled checkbox plus heading/description/success-message, each with a
// one-line note of the built-in default an empty value falls back to.
import { useForm } from "react-hook-form";
import { useMutation } from "@tanstack/react-query";
import {
  newsletterSettingsSchema,
  zodResolver,
  type NewsletterSettingsInput,
} from "@/actions/newsletter-schema";
import { saveNewsletterSettings } from "@/actions/newsletter";

const INPUT_CLASS =
  "h-11 w-full rounded-lg border appearance-none px-4 py-2.5 text-sm shadow-theme-xs placeholder:text-gray-400 focus:outline-hidden focus:ring-3 bg-transparent text-gray-800 border-gray-300 focus:border-brand-300 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:focus:border-brand-800";

const LABEL_CLASS =
  "mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400";

interface NewsletterSettingsFormProps {
  /** Defaults-applied snapshot from readNewsletterSettings (no null fields). */
  initial: {
    enabled: boolean;
    heading: string;
    description: string;
    successMessage: string;
  };
}

export default function NewsletterSettingsForm({
  initial,
}: NewsletterSettingsFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<NewsletterSettingsInput>({
    resolver: zodResolver(newsletterSettingsSchema),
    defaultValues: {
      enabled: initial.enabled,
      heading: initial.heading,
      description: initial.description,
      successMessage: initial.successMessage,
    },
  });

  // D-27 — NOT optimistic. Site-wide footer chrome is high-stakes; the server
  // confirms (and its revalidation refreshes the cached footer) before the UI
  // flips to "saved".
  const mutation = useMutation({
    mutationFn: (values: NewsletterSettingsInput) =>
      saveNewsletterSettings(
        values as Parameters<typeof saveNewsletterSettings>[0],
      ),
  });

  const onValid = (values: NewsletterSettingsInput) => {
    mutation.mutate(values);
  };

  const submitError = mutation.error?.message ?? null;
  const isSaving = mutation.isPending;
  const isSaved = mutation.isSuccess;

  return (
    <form onSubmit={handleSubmit(onValid)} className="space-y-6">
      <div>
        <div className="flex items-center gap-3">
          <input
            id="newsletter-enabled"
            type="checkbox"
            {...register("enabled")}
            className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500 dark:border-gray-700 dark:bg-gray-900"
          />
          <label htmlFor="newsletter-enabled" className={LABEL_CLASS}>
            Show newsletter column in the footer
          </label>
        </div>
        <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
          Turning this off removes the newsletter column from the public footer
          entirely — readers see no disabled form.
        </p>
      </div>

      <div>
        <label htmlFor="newsletter-heading" className={LABEL_CLASS}>
          Heading
        </label>
        <input
          id="newsletter-heading"
          type="text"
          {...register("heading")}
          placeholder="Newsletter"
          className={`${INPUT_CLASS} ${errors.heading ? "border-error-500" : ""}`}
        />
        {errors.heading && (
          <p className="mt-1.5 text-xs text-error-500">
            {errors.heading.message as string}
          </p>
        )}
        <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
          Built-in default: <span className="font-medium">Newsletter</span>.
          Leave empty to use it.
        </p>
      </div>

      <div>
        <label htmlFor="newsletter-description" className={LABEL_CLASS}>
          Description
        </label>
        <textarea
          id="newsletter-description"
          {...register("description")}
          placeholder="Subscribe for the latest posts delivered straight to your inbox."
          rows={3}
          className={`${INPUT_CLASS} h-auto py-2.5 ${errors.description ? "border-error-500" : ""}`}
        />
        {errors.description && (
          <p className="mt-1.5 text-xs text-error-500">
            {errors.description.message as string}
          </p>
        )}
        <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
          Built-in default:{" "}
          <span className="font-medium">
            Subscribe for the latest posts delivered straight to your inbox.
          </span>
        </p>
      </div>

      <div>
        <label htmlFor="newsletter-success" className={LABEL_CLASS}>
          Success message
        </label>
        <input
          id="newsletter-success"
          type="text"
          {...register("successMessage")}
          placeholder="Thanks for subscribing!"
          className={`${INPUT_CLASS} ${errors.successMessage ? "border-error-500" : ""}`}
        />
        {errors.successMessage && (
          <p className="mt-1.5 text-xs text-error-500">
            {errors.successMessage.message as string}
          </p>
        )}
        <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
          Shown inline after subscribing. Built-in default:{" "}
          <span className="font-medium">Thanks for subscribing!</span>
        </p>
      </div>

      {submitError && (
        <div className="rounded-lg border border-error-300 bg-error-50 p-3 text-sm text-error-700 dark:border-error-700 dark:bg-error-900/20 dark:text-error-300">
          {submitError}
        </div>
      )}
      {isSaved && (
        <div className="rounded-lg border border-success-300 bg-success-50 p-3 text-sm text-success-700 dark:border-success-700 dark:bg-success-900/20 dark:text-success-300">
          Newsletter settings saved.
        </div>
      )}

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={isSaving}
          className="inline-flex items-center justify-center rounded-lg bg-brand-500 px-5 py-3.5 text-sm font-medium text-white shadow-theme-xs hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isSaving ? "Saving…" : "Save newsletter settings"}
        </button>
      </div>
    </form>
  );
}
