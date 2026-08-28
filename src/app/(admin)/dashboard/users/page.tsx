// src/app/(admin)/dashboard/users/page.tsx
// [CITED: 04-03-PLAN.md Task 2 — admin-only users table]
// [CITED: 04-CONTEXT.md D-07 (table + drawer UX), D-08 (REVISED — owner decision
//  2026-08-24: guarded delete now allowed, see below), D-10 (revoke-only),
//  D-11 (role dropdown + requireCan re-check)]
// [CITED: 260824-ptx-PLAN.md Task 2 — emailVerified badge + guarded Delete UI]
// [CITED: src/app/(admin)/dashboard/posts/page.tsx — the dashboard list-page shell template]
// [CITED: 260827-se8-PLAN.md Task 5 step 3 — URL-driven list mechanics]
//
// Server Component — the admin-only users management surface. URL-driven:
// every filter (q / role / banned / verified) and the page number live in
// searchParams (deep-linkable, back/forward-correct). Calls listUsers() +
// countUsers() (whose requireCan({user:["read"]}) fires FIRST — Phase 2
// Pitfall #1) and passes the page of rows + the session user's id to the
// client UsersTable which owns ban/role-change/revoke/delete mutations — its
// optimistic mutations + ["users"]-style invalidations are unaffected (rows
// just arrive pre-filtered).
//
// D-08 REVISION (owner decision 2026-08-24): delete is no longer disable-only.
// The deleteUser action (src/actions/users.ts) is guarded — self, last-admin,
// and post-count checks — so the authorship-integrity rationale is preserved
// structurally rather than by prohibition.
//
// RBAC NOTE: the sidebar (Plan 04-01) hides this route's nav entry for non-admins,
// but that is UX-only. If an editor/author hits /dashboard/users via direct URL,
// listUsers() throws FORBIDDEN at the action layer (T-04-10) — the catch block
// surfaces the message. Every mutating action from UsersTable re-checks permissions
// server-side (createUser/banUser/unbanUser/revokeSessions from Phase 2; updateUser
// from Plan 04-03 Task 1; deleteUser from quick task 260824-ptx).
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import { countUsers, listUsers } from "@/actions/users";
import { getSessionOrThrow } from "@/lib/permissions";
import { bounded, clampPage, firstValue, DASHBOARD_PAGE_SIZE } from "@/lib/list-filters";
import ListFilterBar from "@/components/dashboard/lists/ListFilterBar";
import Pagination from "@/components/site/Pagination";
import { Metadata } from "next";
import UsersTable from "./UsersTable";

export const metadata: Metadata = {
  title: "Users | Any Discussion",
  description: "Manage dashboard users and roles",
};

// Page-scope instant-navigation opt-out (260826-oif): this page's top-level
// uncached awaits (listUsers/countUsers via requireCan — permission-checked
// Server Actions calling headers() + DB IO, plus the awaited searchParams —
// itself the dynamic access, no connection() needed) sit below every effective
// <Suspense> boundary on client navigations between /dashboard segments — the
// (admin) layout's own opt-out does not cover sibling navigations (installed
// instant-navigation.md). Allowed-to-block is correct for session-gated content.
export const instant = false;

// Row shape returned by listUsers() — kept in sync with the select() projection
// in src/actions/users.ts. bio/avatar/banReason/banExpires are nullable on the
// Drizzle user table; the table renders them defensively. emailVerified is
// notNull with default false (src/db/schema.ts) — drives the three-state badge.
export type UserRow = {
  id: string;
  name: string;
  email: string;
  role: string | null;
  bio: string | null;
  avatar: string | null;
  banned: boolean | null;
  banReason: string | null;
  banExpires: Date | null;
  emailVerified: boolean;
};

/** Raw Next.js 16 searchParams shape (Promise — awaited in the component). */
type RawSearchParams = Record<string, string | string[] | undefined>;

const isRole = (v: string): v is "admin" | "editor" | "author" =>
  v === "admin" || v === "editor" || v === "author";
const isTriState = (v: string): v is "true" | "false" =>
  v === "true" || v === "false";

/**
 * parseUsersFilters — the shared 260827-se8 list-filters idiom: flatten
 * tampered string[] params, trim + length-bound, clamp the page. banned/
 * verified stay "true"/"false" strings (the URL-layer contract; the action
 * coerces to booleans after its permission gate).
 */
function parseUsersFilters(sp: RawSearchParams) {
  const role = bounded(firstValue(sp.role), 10);
  const banned = bounded(firstValue(sp.banned), 5);
  const verified = bounded(firstValue(sp.verified), 5);
  return {
    q: bounded(firstValue(sp.q), 200),
    role: isRole(role) ? role : undefined,
    banned: isTriState(banned) ? banned : undefined,
    verified: isTriState(verified) ? verified : undefined,
    page: clampPage(firstValue(sp.page)),
  };
}

export default async function UsersListPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const sp = await searchParams;
  const filters = parseUsersFilters(sp);

  let users: UserRow[] = [];
  let total = 0;
  let loadError: string | null = null;
  try {
    [users, total] = await Promise.all([
      listUsers({
        q: filters.q || undefined,
        role: filters.role,
        banned: filters.banned,
        verified: filters.verified,
        page: filters.page,
        pageSize: DASHBOARD_PAGE_SIZE,
      }),
      countUsers({
        q: filters.q || undefined,
        role: filters.role,
        banned: filters.banned,
        verified: filters.verified,
      }),
    ]);
  } catch (err) {
    // Permission denied (non-admin hitting direct URL — T-04-10) or DB error.
    // The proxy.ts + (admin)/layout.tsx AuthGate already redirect unauthenticated
    // viewers; reaching this catch means the session lacks user:read.
    loadError = err instanceof Error ? err.message : "Failed to load users";
  }

  // Session user id for the own-row Delete suppression (defense in depth — the
  // proxy/AuthGate already redirect unauthenticated viewers; on throw we render
  // the table with sessionUserId:null and deleteUser's server-side self guard
  // remains the authoritative protection).
  let sessionUserId: string | null = null;
  try {
    const session = await getSessionOrThrow();
    sessionUserId = session.user.id;
  } catch {
    sessionUserId = null;
  }

  const totalPages = Math.max(1, Math.ceil(total / DASHBOARD_PAGE_SIZE));

  return (
    <div>
      <PageBreadcrumb pageTitle="Users" />
      <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] lg:p-6">
        <div className="mb-5">
          <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
            Team Members
          </h3>
          <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
            Admin-only. Delete is guarded (self, last-admin, and post-count checks) — ban is still preferred for authors with posts.
          </p>
        </div>

        {/* 260827-se8 — URL-writing filter bar: q + Role + Status + Verified.
            Client island ONLY writes URLs; the Server Component re-queries. */}
        <div className="mb-5">
          <ListFilterBar
            basePath="/dashboard/users"
            q={filters.q}
            selects={[
              {
                name: "role",
                label: "Role",
                value: filters.role ?? "",
                options: [
                  { value: "", label: "All roles" },
                  { value: "admin", label: "Admin" },
                  { value: "editor", label: "Editor" },
                  { value: "author", label: "Author" },
                ],
              },
              {
                name: "banned",
                label: "Status",
                value: filters.banned ?? "",
                options: [
                  { value: "", label: "Any status" },
                  { value: "true", label: "Banned" },
                  { value: "false", label: "Active" },
                ],
              },
              {
                name: "verified",
                label: "Verified",
                value: filters.verified ?? "",
                options: [
                  { value: "", label: "Any" },
                  { value: "true", label: "Verified" },
                  { value: "false", label: "Unverified" },
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
          <UsersTable initialUsers={users} sessionUserId={sessionUserId} />
        )}

        {/* Server-rendered Link pagination — preserves filter params in ?page=N. */}
        <Pagination
          currentPage={filters.page}
          totalPages={totalPages}
          basePath="/dashboard/users"
          searchParams={sp}
        />
      </div>
    </div>
  );
}
