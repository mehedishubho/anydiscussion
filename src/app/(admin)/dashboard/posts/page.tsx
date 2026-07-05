// src/app/(admin)/posts/page.tsx
// [CITED: PATTERNS.md row — basic-tables/page.tsx + ui/table/index.tsx analog]
// [CITED: 03-CONTEXT.md D-24 — TailAdmin-quality post list built into the (admin) shell]
//
// Server Component — calls listPosts() and renders into the existing AppSidebar/
// AppHeader chrome via the (admin)/layout.tsx AuthGate → AdminShell wrapper.
// The "New Post" button links to /dashboard/posts/new (the lazy-loaded editor page).
import Link from "next/link";
import { listPosts } from "@/actions/posts";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import { Table, TableHeader, TableBody, TableRow, TableCell } from "@/components/ui/table";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Posts | Any Discussion",
  description: "Manage blog posts",
};

const STATUS_BADGE: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  pending_review: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  published: "bg-success-100 text-success-700 dark:bg-success-900/30 dark:text-success-300",
};

export default async function PostsListPage() {
  let posts: Array<{
    id: number;
    title: string;
    slug: string;
    status: string;
    updatedAt: Date | null;
  }> = [];
  let loadError: string | null = null;
  try {
    posts = await listPosts();
  } catch (err) {
    // Permission denied or DB error — surface a friendly message. The proxy.ts +
    // (admin)/layout.tsx AuthGate already redirect unauthenticated users; reaching
    // this catch means the session lacks post:read or the DB is unreachable.
    loadError = err instanceof Error ? err.message : "Failed to load posts";
  }

  return (
    <div>
      <PageBreadcrumb pageTitle="Posts" />
      <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] lg:p-6">
        <div className="mb-5 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">All Posts</h3>
          <Link
            href="/dashboard/posts/new"
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-medium text-white shadow-theme-xs hover:bg-brand-600"
          >
            + New Post
          </Link>
        </div>

        {loadError ? (
          <div className="rounded-lg border border-error-300 bg-error-50 p-4 text-sm text-error-700 dark:border-error-700 dark:bg-error-900/20 dark:text-error-300">
            {loadError}
          </div>
        ) : posts.length === 0 ? (
          <div className="rounded-lg border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500 dark:border-gray-700">
            No posts yet. Click <span className="font-medium">+ New Post</span> to create your first post.
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-800">
            <Table>
              <TableHeader>
                <TableRow className="border-b border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-900/50">
                  <TableCell isHeader className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500">Title</TableCell>
                  <TableCell isHeader className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500">Status</TableCell>
                  <TableCell isHeader className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500">Updated</TableCell>
                  <TableCell isHeader className="px-4 py-3 text-right text-xs font-semibold uppercase text-gray-500">Actions</TableCell>
                </TableRow>
              </TableHeader>
              <TableBody>
                {posts.map((post) => (
                  <TableRow key={post.id} className="border-b border-gray-100 last:border-0 dark:border-gray-800">
                    <TableCell className="px-4 py-3 text-sm font-medium text-gray-800 dark:text-white/90">
                      {post.title}
                    </TableCell>
                    <TableCell className="px-4 py-3">
                      <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_BADGE[post.status] ?? STATUS_BADGE.draft}`}>
                        {post.status}
                      </span>
                    </TableCell>
                    <TableCell className="px-4 py-3 text-sm text-gray-500">
                      {post.updatedAt ? new Date(post.updatedAt).toLocaleDateString() : "—"}
                    </TableCell>
                    <TableCell className="px-4 py-3 text-right">
                      <Link
                        href={`/dashboard/posts/${post.id}/edit`}
                        className="text-sm font-medium text-brand-500 hover:text-brand-600"
                      >
                        Edit
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}
