// src/app/(admin)/dashboard/media/page.tsx
// [CITED: 04-02-PLAN.md Task 2 — D-12 grid + list toggle, D-14 drag-drop + multi-file + progress]
// [CITED: src/app/(admin)/dashboard/posts/page.tsx — the canonical dashboard list-page shell]
// [CITED: CLAUDE.md hard rule — all image previews go through next/image, NEVER raw <img>]
// [CITED: 260827-se8-PLAN.md Task 7 <action> step 3 — URL-driven list mechanics]
//
// Server Component — URL-driven: the q/kind filters and the page number live in
// searchParams (deep-linkable, back/forward-correct). Calls listMedia(opts) +
// countMedia(opts) (both gated on media:read FIRST) and passes the page of rows
// into the client <MediaGrid> which owns the grid/list toggle, details drawer,
// optimistic delete (D-27), and the warn-confirm flow (D-15 — findMediaReferences).
// <MediaUploader> is rendered inside MediaGrid and is NOT optimistic (progress
// indicator communicates state — D-27 explicit).
import { countMedia, listMedia } from "@/actions/media";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import ListFilterBar from "@/components/dashboard/lists/ListFilterBar";
import Pagination from "@/components/site/Pagination";
import { bounded, clampPage, firstValue, DASHBOARD_PAGE_SIZE } from "@/lib/list-filters";
import MediaGrid, { type MediaRow } from "./MediaGrid";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Media Library | Any Discussion",
  description: "Browse and upload media",
};

// Page-scope instant-navigation opt-out (260826-oif): this page's top-level
// uncached awaits (listMedia/countMedia — permission-checked Server Actions
// calling headers() + DB IO, plus the awaited searchParams — itself the
// dynamic access, no connection() needed) sit below every effective <Suspense>
// boundary on client navigations between /dashboard segments — the (admin)
// layout's own opt-out does not cover sibling navigations (installed
// instant-navigation.md). Allowed-to-block is correct for session-gated
// content; a static shell buys nothing.
export const instant = false;

/** Raw Next.js 16 searchParams shape (Promise — awaited in the component). */
type RawSearchParams = Record<string, string | string[] | undefined>;

/** The media page's kind filter values — a strict subset of mime prefixes. */
const KINDS = ["image", "video", "audio", "application"] as const;
type MediaKind = (typeof KINDS)[number];

function isKind(v: string): v is MediaKind {
  return (KINDS as readonly string[]).includes(v);
}

/**
 * parseMediaFilters — the shared 260827-se8 list-filters idiom: flatten
 * tampered string[] params, trim + length-bound, clamp the page, and validate
 * the kind enum before it ever reaches the action's Zod gate.
 */
function parseMediaFilters(sp: RawSearchParams) {
  const kindRaw = firstValue(sp.kind);
  const kind = kindRaw !== undefined && isKind(kindRaw) ? kindRaw : undefined;
  return {
    q: bounded(firstValue(sp.q), 200),
    kind,
    page: clampPage(firstValue(sp.page)),
  };
}

export default async function MediaListPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const sp = await searchParams;
  const filters = parseMediaFilters(sp);

  let rows: MediaRow[] = [];
  let total = 0;
  let loadError: string | null = null;
  try {
    [rows, total] = await Promise.all([
      listMedia({
        q: filters.q || undefined,
        kind: filters.kind,
        page: filters.page,
        pageSize: DASHBOARD_PAGE_SIZE,
      }) as Promise<MediaRow[]>,
      countMedia({ q: filters.q || undefined, kind: filters.kind }),
    ]);
  } catch (err) {
    // Permission denied or DB error — proxy.ts + (admin)/layout.tsx AuthGate
    // already redirect unauthenticated users; reaching this catch means the
    // session lacks media:read or the DB is unreachable.
    loadError = err instanceof Error ? err.message : "Failed to load media";
  }

  const totalPages = Math.max(1, Math.ceil(total / DASHBOARD_PAGE_SIZE));

  return (
    <div>
      <PageBreadcrumb pageTitle="Media Library" />
      <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] lg:p-6">
        <div className="mb-5 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">Media</h3>
        </div>

        {/* 260827-se8 — URL-writing filter bar: q free text + Kind select
            (image/video/audio/application mime-prefix groups). Client island
            ONLY writes URLs; the Server Component re-queries. */}
        <div className="mb-5">
          <ListFilterBar
            basePath="/dashboard/media"
            q={filters.q}
            selects={[
              {
                name: "kind",
                label: "Kind",
                value: filters.kind ?? "",
                options: [
                  { value: "", label: "All Kinds" },
                  { value: "image", label: "Image" },
                  { value: "video", label: "Video" },
                  { value: "audio", label: "Audio" },
                  { value: "application", label: "Application" },
                ],
              },
            ]}
          />
        </div>

        {loadError ? (
          <div className="rounded-lg border border-error-300 bg-error-50 p-4 text-sm text-error-700 dark:border-error-700 dark:bg-error-900/20 dark:text-error-300">
            {loadError}
          </div>
        ) : (
          <MediaGrid initialMedia={rows} />
        )}

        {/* Server-rendered Link pagination — preserves filter params in ?page=N. */}
        <Pagination
          currentPage={filters.page}
          totalPages={totalPages}
          basePath="/dashboard/media"
          searchParams={sp}
        />
      </div>
    </div>
  );
}
