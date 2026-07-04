// src/app/(admin)/posts/[id]/edit/page.tsx
// [CITED: PATTERNS.md row — profile/page.tsx Server Component form-page analog]
// [CITED: 03-CONTEXT.md D-24 — TailAdmin-quality post editor]
//
// Server Component. Calls getPost(params.id) (which is gated by assertOwnsPost —
// author-own OR editor/admin), then renders the same PostForm pre-filled with
// the existing post values. The same lazy-load boundary applies (PostForm uses
// EditorProvider → next/dynamic({ssr:false}) → TiptapEditor).
import { getPost } from "@/actions/posts";
import { getPostTagIds } from "@/actions/tags";
import PostForm from "../../PostForm";
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
  try {
    post = await getPost(postId);
    tagIds = await getPostTagIds(postId);
  } catch {
    // getPost throws NOT_FOUND or FORBIDDEN/UNAUTHORIZED — either way, 404 the route.
    notFound();
  }

  return (
    <div>
      <PageBreadcrumb pageTitle="Edit Post" />
      <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] lg:p-6">
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
    </div>
  );
}
