// src/app/(admin)/dashboard/page.tsx
// [CITED: 04-CONTEXT.md D-04 — lean real-stats overview, NO charts]
// [CITED: 04-PATTERNS.md "src/app/(admin)/dashboard/page.tsx (MODIFY overview)"]
// [CITED: 03-01-SUMMARY.md — listPosts/listMedia action reads pattern]
//
// Server Component overview. Replaces the Phase-3 placeholder string with lean
// server-rendered stats: posts-by-status counts, a short pending-review list
// (max 5), a media count, and a "+ New post" CTA. NO charts (D-04 — richer
// analytics deferred to Phase 7). NO client components (mutations are user-
// initiated from the dedicated list/edit pages, not the overview).
//
// Marker string for scripts/test-auth-gate.mjs: the <h1> renders the literal
// "Dashboard overview" — the auth-gate structural check reads this page's
// prerendered HTML and confirms the marker is ABSENT from the static shell
// (it should only stream in once the auth-gated dynamic content renders).
import type { Metadata } from "next";
import Link from "next/link";
import { countPosts, listPosts } from "@/actions/posts";
import { listMedia } from "@/actions/media";

export const metadata: Metadata = {
  title: "Dashboard | Any Discussion",
  description: "Admin dashboard overview",
};

// Page-scope instant-navigation opt-out (260826-oif): this page's top-level
// uncached awaits (listPosts + listMedia — permission-checked Server Actions
// calling headers() + DB IO) sit below every effective <Suspense> boundary on
// client navigations between /dashboard segments — the (admin) layout's own
// opt-out does not cover sibling navigations (installed instant-navigation.md).
// Allowed-to-block is correct for session-gated content; a static shell buys nothing.
export const instant = false;

// Caps for the small-team dashboard (PROJECT.md: 2–5 person team). Set high
// enough that a normal volume of drafts/published posts is captured for the
// counts; if the dashboard ever grows past these, Plan 04-02+ can add proper
// count() actions (D-04 sanction: "listMedia().length is fine for a small team").
const MEDIA_READ_CAP = 2000;
const PENDING_REVIEW_PREVIEW = 5;

const STATUS_BADGE: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  pending_review:
    "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  published:
    "bg-success-100 text-success-700 dark:bg-success-900/30 dark:text-success-300",
};

const STAT_TILES = [
  { key: "draft", label: "Draft" },
  { key: "pending_review", label: "Pending review" },
  { key: "published", label: "Published" },
] as const;

export default async function DashboardOverview() {
  // Server-side reads. Both actions re-check RBAC (requireCan post:read /
  // media:read — Phase 2 Pitfall #1); reaching this Server Component already
  // required the (admin) AuthGate to pass, but the action-level check is the
  // authoritative boundary.
  //
  // 260827-se8 Task 4 (Rule 1 adaptation): the old read-500-and-partition
  // shape died with listPosts' pre-pagination signature. The overview's actual
  // needs — per-status COUNTS for the tiles + a 5-row pending preview — map
  // exactly onto countPosts/listPosts' new status-filter mechanics, with less
  // data transferred than the old cap-read.
  let statusCounts: Record<string, number> = {
    draft: 0,
    pending_review: 0,
    published: 0,
  };
  let pendingPreview: Array<{
    id: number;
    title: string;
    slug: string;
    status: string;
    updatedAt: Date | null;
  }> = [];
  let mediaCount = 0;
  let loadError: string | null = null;

  try {
    const [draft, pending, published, pendingRows, media] = await Promise.all([
      countPosts({ status: "draft" }),
      countPosts({ status: "pending_review" }),
      countPosts({ status: "published" }),
      listPosts({ status: "pending_review", pageSize: PENDING_REVIEW_PREVIEW }),
      listMedia({ limit: MEDIA_READ_CAP })
        .then((rows) => rows.length)
        .catch(() => 0), // media count is best-effort — don't fail the overview
    ]);
    statusCounts = { draft, pending_review: pending, published };
    pendingPreview = pendingRows;
    mediaCount = media;
  } catch (err) {
    loadError = err instanceof Error ? err.message : "Failed to load overview.";
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-xl font-bold text-gray-800 dark:text-white/90">
          Dashboard overview
        </h1>
        <Link
          href="/dashboard/posts/new"
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-medium text-white shadow-theme-xs hover:bg-brand-600"
        >
          + New post
        </Link>
      </div>

      {loadError ? (
        <div className="rounded-lg border border-error-300 bg-error-50 p-4 text-sm text-error-700 dark:border-error-700 dark:bg-error-900/20 dark:text-error-300">
          {loadError}
        </div>
      ) : (
        <>
          {/* Stat tiles — posts by status */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {STAT_TILES.map(({ key, label }) => (
              <div
                key={key}
                className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] lg:p-6"
              >
                <span
                  className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_BADGE[key]}`}
                >
                  {label}
                </span>
                <p className="mt-3 text-3xl font-semibold text-gray-800 dark:text-white/90">
                  {statusCounts[key] ?? 0}
                </p>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  posts
                </p>
              </div>
            ))}
          </div>

          {/* Media count tile + pending review list */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] lg:p-6">
              <span className="inline-block rounded-full bg-brand-100 px-2.5 py-0.5 text-xs font-medium text-brand-700 dark:bg-brand-900/30 dark:text-brand-300">
                Media library
              </span>
              <p className="mt-3 text-3xl font-semibold text-gray-800 dark:text-white/90">
                {mediaCount}
              </p>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                items
              </p>
              <Link
                href="/dashboard/media"
                className="mt-4 inline-block text-sm font-medium text-brand-500 hover:text-brand-600"
              >
                Open library →
              </Link>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] lg:col-span-2 lg:p-6">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  Pending review
                </h2>
                <Link
                  href="/dashboard/posts"
                  className="text-sm font-medium text-brand-500 hover:text-brand-600"
                >
                  All posts →
                </Link>
              </div>
              {pendingPreview.length === 0 ? (
                <p className="rounded-lg border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500 dark:border-gray-700">
                  Nothing waiting on review.
                </p>
              ) : (
                <ul className="divide-y divide-gray-100 dark:divide-gray-800">
                  {pendingPreview.map((post) => (
                    <li
                      key={post.id}
                      className="flex items-center justify-between py-3 first:pt-0 last:pb-0"
                    >
                      <div className="min-w-0 flex-1 pr-4">
                        <p className="truncate text-sm font-medium text-gray-800 dark:text-white/90">
                          {post.title}
                        </p>
                        <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                          {post.updatedAt
                            ? `Updated ${new Date(post.updatedAt).toLocaleDateString()}`
                            : "—"}
                        </p>
                      </div>
                      <Link
                        href={`/dashboard/posts/${post.id}/edit`}
                        className="shrink-0 text-sm font-medium text-brand-500 hover:text-brand-600"
                      >
                        Review →
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
