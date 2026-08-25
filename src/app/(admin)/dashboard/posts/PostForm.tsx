"use client";
// src/app/(admin)/dashboard/posts/PostForm.tsx
// [CITED: PATTERNS.md row — RHF + Zod wiring (schema-client.ts)]
// [CITED: 03-CONTEXT.md D-24 — TailAdmin-quality post form; D-23 required category, tags ~8]
// [CITED: 04-CONTEXT.md D-26 — TanStack useMutation retrofit (dashboard-wide form/mutation baseline)]
// [CITED: 04-CONTEXT.md D-27 — NOT optimistic on post save (high-stakes + revalidation needs server confirmation)]
// [CITED: 04-RESEARCH.md Pattern 4 — useMutation + invalidate shape]
// [CITED: 04-02-PLAN.md Task 3 — feature-image field now uses <MediaPicker> (closes Phase 3 UAT gap)]
// [CITED: 05-06-PLAN.md — Publish/Submit-for-review buttons (UAT gap 1 publish half) + save toasts (UAT test 3)]
// [CITED: 05-07-PLAN.md — loud validation (onInvalid toast + focus) + slug auto-derive (UAT re-run R1 cause B)]
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
//
// 05-07 (UAT re-run R1 cause B — "publish button nothing happen"): the three
// handleSubmit call sites below (form onSubmit, Publish onClick, Submit-for-
// review onClick) previously passed NO onInvalid callback — a Zod/RHF
// validation failure (missing Category, bad slug) was a total silent no-op
// before any mutation fired. Every site now passes the shared onInvalid
// (error toast + focus/scroll to the first offending field). The slug field
// also auto-derives from the title while the user has not typed a slug
// (derive-on-empty, never overwrite — D-12/D-20: slug is content identity).
import { useEffect, useRef, useState } from "react";
import { useForm, type FieldErrors } from "react-hook-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import Image from "next/image";
import { toast } from "sonner";
import { EditorProvider } from "@/components/editor/EditorProvider";
import { deriveSlugFromTitle } from "@/lib/slug/derive";
import { postSchema, zodResolver, type PostSchemaInput } from "./schema-client";
import { savePost, publishPost, submitForReview } from "@/actions/posts";
import TaxonomyPicker from "./components/TaxonomyPicker";
import MediaPicker from "@/components/dashboard/media/MediaPicker";
import SeoPanel from "@/components/dashboard/posts/SeoPanel";

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
  /**
   * 05-06 — viewer role, passed from the server pages (getSession). Drives the
   * UX-ONLY Publish / Submit-for-review button gating; the server chain
   * (publishPost -> transitionPost -> requireCan + TRANSITIONS) is the
   * authority (Pitfall #1 — never trust UI hiding).
   */
  role?: "admin" | "editor" | "author";
  /** 05-06 — current post status (edit page only); hides Publish on published posts. */
  initialStatus?: "draft" | "pending_review" | "published";
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
  // eslint-disable-next-line react-hooks/incompatible-library -- RHF watch() is the documented API; React Compiler safely skips memoizing it
  const featureImageValue = watch("featureImage");

  // 05-07 — slug auto-derive (derive-on-empty, NEVER overwrite). slugTouched is
  // set by the slug input's custom onChange (merged into register below): once
  // the user has actually EDITED the slug, derivation stops. WR-02: the signal
  // must be onChange, not onBlur — blur alone (tabbing or clicking through the
  // field without typing) must NOT disable derive, while any real edit
  // (including clearing to empty) must own it, or a clear gets refilled under
  // the user's cursor mid-retype. RHF fires the merged onChange only on real
  // user input; programmatic setValue from the effect below never trips it.
  // EXISTING slugs on /edit are protected by the derive-on-empty guard itself
  // (slug is content identity per D-12/D-20; a title edit on a published post
  // must not silently change the URL).
  const slugTouched = useRef(false);
  // eslint-disable-next-line react-hooks/incompatible-library -- RHF watch() is the documented API; React Compiler safely skips memoizing it
  const [titleValue, slugValue] = watch(["title", "slug"]);
  useEffect(() => {
    if (slugTouched.current) return;
    if (typeof slugValue === "string" && slugValue !== "") return; // never overwrite
    const derived = deriveSlugFromTitle(typeof titleValue === "string" ? titleValue : "");
    // Skip when nothing survives (empty or Bangla-only title): writing "" with
    // shouldValidate would flag the pristine slug field as invalid on mount.
    // A fully-Bangla title derives "" and the loud slug validation catches it
    // on submit instead (toast + focus — D-20: strip, never transliterate).
    if (derived === "") return;
    setValue("slug", derived, { shouldValidate: true });
  }, [titleValue, slugValue, setValue]);

  // D-26 + D-27 — savePost wrapped in useMutation; NOT optimistic on post save.
  // Invalidate the ["posts"] query key on success so any dashboard list refreshes.
  // The mutation inherits the Server Action's behavior 1:1 (no client-side
  // transformation) — the form is the source of truth until the server confirms.
  //
  // 05-06 gap closure (UAT test 3 — "silent saves"): every outcome fires a
  // sonner toast. The success toast is the always-visible signal that the save
  // landed; the error toast carries the raw action message (FORBIDDEN /
  // NOT_FOUND / validation text) so failures are diagnosable. The inline error
  // box below stays — the toast is the primary channel, the box is persistent.
  const mutation = useMutation({
    mutationFn: (values: PostSchemaInput) =>
      savePost(values as Parameters<typeof savePost>[0]),
    onSuccess: () => {
      toast.success("Post saved");
      void queryClient.invalidateQueries({ queryKey: ["posts"] });
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  const onValid = (values: PostSchemaInput) => {
    // mutate (not mutateAsync) — RHF's handleSubmit doesn't need to await;
    // mutation.isPending drives the button-disabled state instead.
    mutation.mutate(values);
  };

  // 05-07 — shared onInvalid, wired as the SECOND handleSubmit argument at all
  // three submit paths (form onSubmit, Publish, Submit-for-review). Before
  // this, a validation failure was a silent no-op — the core UAT R1 bug.
  // toast.error carries the first field's message (e.g. "Category is
  // required"); focus + scrollIntoView land on the offending element via its
  // HTML id. Fields without an id (body/editor) degrade to toast-only.
  const onInvalid = (fieldErrors: FieldErrors<PostSchemaInput>): void => {
    const first = Object.entries(fieldErrors).find(([, v]) => v !== undefined);
    if (!first) return;
    const [key, value] = first;
    const message =
      value && typeof value === "object" && typeof (value as { message?: unknown }).message === "string"
        ? (value as { message: string }).message
        : "Please fix the highlighted fields";
    toast.error(message);
    const el = document.getElementById(key);
    if (el) {
      el.focus();
      el.scrollIntoView({ block: "center" });
    }
  };

  // 05-06 Task 3 — role-aware Publish / Submit-for-review. UX gating ONLY
  // (T-05-12): publishPost -> assertOwnsPost + transitionPost ->
  // requireCan({post:["publish"]}) + the TRANSITIONS table is the authority —
  // authors are double-blocked server-side even if the client gating is bypassed.
  // Status flips are NOT optimistic (D-27 — high-stakes, server-confirmed).
  const [currentStatus, setCurrentStatus] = useState<PostFormProps["initialStatus"]>(
    props.initialStatus,
  );

  const publishMutation = useMutation({
    mutationFn: (postId: number) => publishPost(postId),
    onSuccess: () => {
      toast.success("Published");
      setCurrentStatus("published");
      void queryClient.invalidateQueries({ queryKey: ["posts"] });
    },
    onError: (err: Error) => {
      // The save already succeeded ("Post saved" fired); only the transition
      // failed — the post REMAINS SAVED as a draft (stated semantics).
      toast.error(err.message);
    },
  });

  const submitReviewMutation = useMutation({
    mutationFn: (postId: number) => submitForReview(postId),
    onSuccess: () => {
      toast.success("Submitted for review");
      setCurrentStatus("pending_review");
      void queryClient.invalidateQueries({ queryKey: ["posts"] });
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });

  // Save-then-act chains: RHF validation + savePost run exactly like the save
  // path (same mutation — same toasts + ["posts"] invalidation), then the
  // per-call onSuccess hands the SAVED id to publishPost/submitForReview.
  // savePost returns { id } — created id on the new-post path, input.id on edit.
  const onPublishValid = (values: PostSchemaInput) => {
    mutation.mutate(values, {
      onSuccess: (data) => {
        if (data?.id != null) publishMutation.mutate(data.id);
      },
    });
  };

  const onSubmitReviewValid = (values: PostSchemaInput) => {
    mutation.mutate(values, {
      onSuccess: (data) => {
        if (data?.id != null) submitReviewMutation.mutate(data.id);
      },
    });
  };

  // UX-only gating (server re-checks everything):
  // - editor/admin + draft/pending_review (or a new post): Publish — on
  //   pending_review the same button doubles as "approve and publish".
  // - author + draft (or a new post): Submit for review. Authors NEVER see
  //   Publish (they lack post:publish; TRANSITIONS excludes it too).
  // - already-published posts (initialStatus/currentStatus "published"): no
  //   Publish button — a re-publish would be an INVALID_TRANSITION anyway.
  const canPublish =
    (props.role === "admin" || props.role === "editor") &&
    (currentStatus === undefined ||
      currentStatus === "draft" ||
      currentStatus === "pending_review");
  const canSubmitForReview =
    props.role === "author" &&
    (currentStatus === undefined || currentStatus === "draft");

  const anyPending = mutation.isPending || publishMutation.isPending || submitReviewMutation.isPending;

  // RHF still owns the featureImage value — the picker calls setValue('featureImage', url).
  // The hidden register call keeps the field in the form schema; the visible UI is the
  // "Select image" button + thumbnail preview below.

  const submitError = mutation.error?.message ?? null;

  return (
    <form onSubmit={handleSubmit(onValid, onInvalid)} className="space-y-5">
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
          {...register("slug", {
            // 05-07 / WR-02 — ANY user edit (typing OR clearing to empty)
            // marks the slug as user-owned: auto-derive stops. RHF merges
            // this custom onChange with its internal one and fires it ONLY
            // on real user input — programmatic setValue from the derive
            // effect never trips it, and tabbing/clicking through the field
            // (no input) must not either.
            onChange: () => {
              slugTouched.current = true;
            },
          })}
          placeholder="auto-fills from title — or type your own"
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

      {/* Phase 5 D-08 — collapsible SEO panel (meta title, meta description,
          canonical URL, OG image). All four fields are part of this RHF form
          (registered via SeoPanel's prop spread) and submit with the rest of the
          data into savePost, which upserts them into the post_seo table. */}
      <SeoPanel register={register} errors={errors} />

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
        {/* Save draft — neutral secondary (brand-500 is reserved for the
            Publish/Submit primary per the 05-06 button conventions). */}
        <button
          type="submit"
          disabled={anyPending}
          className="inline-flex items-center justify-center rounded-lg bg-white px-5 py-3.5 text-sm font-medium text-gray-700 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-gray-800 dark:text-gray-400 dark:ring-gray-700"
        >
          {mutation.isPending ? "Saving…" : "Save draft"}
        </button>
        {/* Publish (editor/admin) or Submit for review (author) — brand-500
            primary, type="button" so RHF validation runs through each one's
            own handleSubmit wrapper before the save-then-act chain. */}
        {canPublish && (
          <button
            type="button"
            disabled={anyPending}
            onClick={handleSubmit(onPublishValid, onInvalid)}
            className="inline-flex items-center justify-center rounded-lg bg-brand-500 px-5 py-3.5 text-sm font-medium text-white shadow-theme-xs hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {publishMutation.isPending ? "Publishing…" : "Publish"}
          </button>
        )}
        {canSubmitForReview && (
          <button
            type="button"
            disabled={anyPending}
            onClick={handleSubmit(onSubmitReviewValid, onInvalid)}
            className="inline-flex items-center justify-center rounded-lg bg-brand-500 px-5 py-3.5 text-sm font-medium text-white shadow-theme-xs hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitReviewMutation.isPending ? "Submitting…" : "Submit for review"}
          </button>
        )}
      </div>
    </form>
  );
}
