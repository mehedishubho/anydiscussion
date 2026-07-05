// src/app/(admin)/dashboard/media/page.tsx
// [CITED: 04-02-PLAN.md Task 2 — D-12 grid + list toggle, D-14 drag-drop + multi-file + progress]
// [CITED: src/app/(admin)/dashboard/posts/page.tsx — the canonical dashboard list-page shell]
// [CITED: CLAUDE.md hard rule — all image previews go through next/image, NEVER raw <img>]
//
// Server Component — calls listMedia() and renders the AppSidebar/AppHeader chrome
// via (admin)/layout.tsx. Passes the rows into the client <MediaGrid> which owns the
// grid/list toggle, details drawer, optimistic delete (D-27), and the warn-confirm
// flow (D-15 — findMediaReferences). <MediaUploader> is rendered inside MediaGrid
// and is NOT optimistic (progress indicator communicates state — D-27 explicit).
import { listMedia } from "@/actions/media";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import MediaGrid, { type MediaRow } from "./MediaGrid";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Media Library | Any Discussion",
  description: "Browse and upload media",
};

export default async function MediaListPage() {
  let rows: MediaRow[] = [];
  let loadError: string | null = null;
  try {
    rows = (await listMedia({ limit: 100 })) as MediaRow[];
  } catch (err) {
    // Permission denied or DB error — proxy.ts + (admin)/layout.tsx AuthGate
    // already redirect unauthenticated users; reaching this catch means the
    // session lacks media:read or the DB is unreachable.
    loadError = err instanceof Error ? err.message : "Failed to load media";
  }

  return (
    <div>
      <PageBreadcrumb pageTitle="Media Library" />
      <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] lg:p-6">
        <div className="mb-5 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">Media</h3>
        </div>
        {loadError ? (
          <div className="rounded-lg border border-error-300 bg-error-50 p-4 text-sm text-error-700 dark:border-error-700 dark:bg-error-900/20 dark:text-error-300">
            {loadError}
          </div>
        ) : (
          <MediaGrid initialMedia={rows} />
        )}
      </div>
    </div>
  );
}
