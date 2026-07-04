// src/app/(admin)/posts/[id]/edit/page.tsx
// [CITED: PATTERNS.md row — profile/page.tsx Server Component form-page analog]
// [CITED: 03-CONTEXT.md D-24 — TailAdmin-quality post editor, D-14 timezone pre-fetch]
//
// Server Component. Calls getPost(params.id) (which is gated by assertOwnsPost —
// author-own OR editor/admin), then renders the same PostForm pre-filled with
// the existing post values. The same lazy-load boundary applies (PostForm uses
// EditorProvider → next/dynamic({ssr:false}) → TiptapEditor).
//
// Slice D (Plan 03-04): pre-fetches site.timezone via getSetting for SchedulePicker's
// initialTimezone prop (D-14 — instant first-paint, no flash of an unresolved label),
// and wires SchedulePicker + PreviewLink into the editor sidebar.
import { getPost } from "@/actions/posts";
import { getSetting } from "@/actions/settings";
import { getPostTagIds } from "@/actions/tags";
import PostForm from "../../PostForm";
import SchedulePicker from "../../components/SchedulePicker";
import PreviewLink from "../../components/PreviewLink";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import { Metadata } from "next";
import { notFound } from "next/navigation";

export const metadata: Metadata = {
  title: "Edit Post | Any Discussion",
};

interface EditPostPageProps {
  params: Promise<{ id: string }>;
}

export default async function EditPostPage({ params }: EditPostPageProps) {
  const { id } = await params;
  const postId = Number(id);
  if (!Number.isInteger(postId) || postId <= 0) {
    notFound();
  }

  let post: Awaited<ReturnType<typeof getPost>> | null = null;
  let tagIds: number[] = [];
  let timezone: string | null = null;
  try {
    post = await getPost(postId);
    tagIds = await getPostTagIds(postId);
    // D-14 — pre-fetch the site timezone so SchedulePicker renders the label
    // instantly (the client component also re-validates on mount via the same action).
    timezone = await getSetting("site.timezone");
  } catch {
    // getPost throws NOT_FOUND or FORBIDDEN/UNAUTHORIZED — either way, 404 the route.
    notFound();
  }

  return (
    <div>
      <PageBreadcrumb pageTitle="Edit Post" />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Main form column */}
        <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] lg:col-span-2 lg:p-6">
          <h3 className="mb-5 text-lg font-semibold text-gray-800 dark:text-white/90">
            Edit: {post.title}
          </h3>
          <PostForm
            initialId={post.id}
            initialTitle={post.title ?? undefined}
            initialSlug={post.slug ?? undefined}
            initialExcerpt={post.excerpt ?? undefined}
            initialBody={post.body ?? undefined}
            initialCategoryId={post.categoryId ?? undefined}
            initialTagIds={tagIds}
            initialFeatureImage={post.featureImage ?? undefined}
          />
        </div>

        {/* Sidebar — scheduling + preview (Slice D) */}
        <div className="space-y-6">
          <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] lg:p-6">
            <h3 className="mb-5 text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              Publish
            </h3>
            <SchedulePicker
              postId={post.id}
              publishedAt={
                post.publishedAt ? new Date(post.publishedAt) : null
              }
              onChange={() => {
                // The onChange handler is wired client-side; the actual setSchedule
                // action is called from the client component on blur or a save button.
                // This prop is required by the SchedulePicker interface.
              }}
              initialTimezone={timezone ?? undefined}
            />
          </div>
          <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] lg:p-6">
            <h3 className="mb-5 text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
              Preview
            </h3>
            <PreviewLink
              postId={post.id}
              previewToken={post.previewToken ?? null}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
