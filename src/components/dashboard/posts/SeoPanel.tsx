"use client";
// src/components/dashboard/posts/SeoPanel.tsx
// [CITED: 05-CONTEXT.md D-08 — post-editor SEO panel (meta title, meta description, canonical URL, OG image)]
// [CITED: 05-CONTEXT.md D-10 — shared Zod reused client+server (grapheme rule enforced server-side via seoMetaSchema.safeParse in savePost)]
// [CITED: src/app/(admin)/dashboard/pages/PageForm.tsx L185-237 — the existing collapsible "SEO" section (EXACT analog)]
// [CITED: CLAUDE.md "SEO requirements" — validate by reasonable byte/grapheme count, not Latin-style limits]
//
// The collapsible SEO-fields panel for the post editor. Renders four optional
// fields (meta title, meta description, canonical URL, OG image) as a section
// after the feature-image block. Mirrors the pages-editor SEO section markup so
// editors see a consistent pattern across content types (D-08).
//
// Receives react-hook-form `register` + `errors` as props from the parent
// PostForm — does NOT call useForm itself, so it has no local form state. The
// four fields are part of the SAME RHF form (registered via the spread), so they
// submit with the rest of the form data and flow into savePost's input, which
// upserts them into the post_seo table (D-08).
//
// Validation split (D-10): the client schema (postSchema) applies simple .max()
// UTF-16 caps for quick inline errors; the grapheme rule (SEO-06, Bangla-aware)
// is enforced SERVER-SIDE in savePost via seoMetaSchema.safeParse. The placeholder
// copy documents the grapheme rule so editors know the server applies a
// script-agnostic limit (not a Latin-character count).
import type {
  UseFormRegister,
  FieldErrors,
} from "react-hook-form";
import type { PostSchemaInput } from "@/app/(admin)/dashboard/posts/schema-client";

const INPUT_CLASS =
  "h-11 w-full rounded-lg border appearance-none px-4 py-2.5 text-sm shadow-theme-xs placeholder:text-gray-400 focus:outline-hidden focus:ring-3 bg-transparent text-gray-800 border-gray-300 focus:border-brand-300 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:focus:border-brand-800";

const LABEL_CLASS =
  "mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400";

interface SeoPanelProps {
  register: UseFormRegister<PostSchemaInput>;
  errors: FieldErrors<PostSchemaInput>;
}

/**
 * SeoPanel — the four-field SEO section for the post editor.
 *
 * Fields:
 *   - metaTitle: overrides <title> when set (else auto-derives from the post title)
 *   - metaDescription: overrides the search-result snippet (else auto-derives from excerpt)
 *   - canonicalUrl: overrides the slug-derived canonical URL
 *   - ogImage: overrides the OG/Twitter image (fallback chain: post_seo.ogImage → posts.featureImage → site default)
 *
 * All four are optional — leaving them blank means buildPostMetadata auto-derives
 * from the post row + site defaults (D-09 fallback chain).
 */
export default function SeoPanel({ register, errors }: SeoPanelProps) {
  return (
    <div className="border-t border-gray-200 pt-5 dark:border-gray-800">
      <h4 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
        SEO
      </h4>

      <div className="space-y-5">
        <div>
          <label htmlFor="metaTitle" className={LABEL_CLASS}>
            Meta title
          </label>
          <input
            id="metaTitle"
            {...register("metaTitle")}
            placeholder="Overrides the post title when set (max 80 grapheme clusters)"
            className={`${INPUT_CLASS} ${errors.metaTitle ? "border-error-500" : ""}`}
          />
          {errors.metaTitle && (
            <p className="mt-1.5 text-xs text-error-500">
              {errors.metaTitle.message as string}
            </p>
          )}
        </div>

        <div>
          <label htmlFor="metaDescription" className={LABEL_CLASS}>
            Meta description
          </label>
          <textarea
            id="metaDescription"
            {...register("metaDescription")}
            placeholder="Search-result snippet text — validated by grapheme clusters, not Latin character limits (max 200 graphemes)"
            rows={3}
            className={`${INPUT_CLASS} h-auto py-2.5 ${errors.metaDescription ? "border-error-500" : ""}`}
          />
          {errors.metaDescription && (
            <p className="mt-1.5 text-xs text-error-500">
              {errors.metaDescription.message as string}
            </p>
          )}
        </div>

        <div>
          <label htmlFor="canonicalUrl" className={LABEL_CLASS}>
            Canonical URL
          </label>
          <input
            id="canonicalUrl"
            {...register("canonicalUrl")}
            placeholder="https://anydiscussion.com/... (optional — overrides the slug-derived canonical)"
            className={`${INPUT_CLASS} ${errors.canonicalUrl ? "border-error-500" : ""}`}
          />
          {errors.canonicalUrl && (
            <p className="mt-1.5 text-xs text-error-500">
              {errors.canonicalUrl.message as string}
            </p>
          )}
        </div>

        <div>
          <label htmlFor="ogImage" className={LABEL_CLASS}>
            OG image
          </label>
          <input
            id="ogImage"
            {...register("ogImage")}
            placeholder="https://... (optional — overrides feature image, then site default)"
            className={`${INPUT_CLASS} ${errors.ogImage ? "border-error-500" : ""}`}
          />
          {errors.ogImage && (
            <p className="mt-1.5 text-xs text-error-500">
              {errors.ogImage.message as string}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
