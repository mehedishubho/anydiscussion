// src/app/(admin)/dashboard/pages/[id]/edit/page.tsx
// [CITED: src/app/(admin)/dashboard/posts/[id]/edit/page.tsx — the server-shell template]
// [CITED: 04-CONTEXT.md D-18 (slimmed editor — drop SchedulePicker + PreviewLink sidebar),
//  D-19 (Contact = content-only — no form-builder), D-26 (RHF + Zod + TanStack Query)]
//
// Server Component. Calls getPage(params.id) (gated by requireCan({ page: ["read"] })),
// then renders <PageForm initial={page} />. The same lazy-load boundary applies
// (PageForm uses EditorProvider → next/dynamic({ssr:false}) → TiptapEditor).
//
// D-18 — the post-only SchedulePicker + PreviewLink sidebar is DROPPED. Pages have
// no scheduling (they publish immediately when status flips to "published") and
// no draft-preview-token route (legal/contact content is internal-review-only).
import { getPage } from "@/actions/pages";
import PageForm from "../../PageForm";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import { Metadata } from "next";
import { notFound } from "next/navigation";

export const metadata: Metadata = {
  title: "Edit Page | Any Discussion",
};

interface EditPagePageProps {
  params: Promise<{ id: string }>;
}

export default async function EditPagePage({ params }: EditPagePageProps) {
  const { id } = await params;
  const pageId = Number(id);
  if (!Number.isInteger(pageId) || pageId <= 0) {
    notFound();
  }

  let page: Awaited<ReturnType<typeof getPage>> | null = null;
  try {
    page = await getPage(pageId);
  } catch {
    // getPage throws NOT_FOUND or FORBIDDEN/UNAUTHORIZED — either way, 404 the route.
    notFound();
  }

  return (
    <div>
      <PageBreadcrumb pageTitle="Edit Page" />
      <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] lg:p-6">
        <h3 className="mb-5 text-lg font-semibold text-gray-800 dark:text-white/90">
          Edit: {page.title}
        </h3>
        <PageForm initial={page} />
      </div>
    </div>
  );
}
