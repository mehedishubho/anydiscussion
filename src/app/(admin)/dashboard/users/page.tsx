// src/app/(admin)/dashboard/users/page.tsx
// [CITED: 04-03-PLAN.md Task 2 — admin-only users table]
// [CITED: 04-CONTEXT.md D-07 (table + drawer UX), D-08 (REVISED — owner decision
//  2026-08-24: guarded delete now allowed, see below), D-10 (revoke-only),
//  D-11 (role dropdown + requireCan re-check)]
// [CITED: 260824-ptx-PLAN.md Task 2 — emailVerified badge + guarded Delete UI]
// [CITED: src/app/(admin)/dashboard/posts/page.tsx — the dashboard list-page shell template]
//
// Server Component — the admin-only users management surface. Calls listUsers()
// (whose requireCan({user:["read"]}) fires FIRST — Phase 2 Pitfall #1) and passes
// the rows + the session user's id to the client UsersTable which owns
// ban/role-change/revoke/delete mutations.
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
import { listUsers } from "@/actions/users";
import { getSessionOrThrow } from "@/lib/permissions";
import { Metadata } from "next";
import UsersTable from "./UsersTable";

export const metadata: Metadata = {
  title: "Users | Any Discussion",
  description: "Manage dashboard users and roles",
};

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

export default async function UsersListPage() {
  let users: UserRow[] = [];
  let loadError: string | null = null;
  try {
    users = await listUsers();
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

  return (
    <div>
      <PageBreadcrumb pageTitle="Users" />
      <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] lg:p-6">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
              Team Members
            </h3>
            <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
              Admin-only. Delete is guarded (self, last-admin, and post-count checks) — ban is still preferred for authors with posts.
            </p>
          </div>
        </div>

        {loadError ? (
          <div className="rounded-lg border border-error-300 bg-error-50 p-4 text-sm text-error-700 dark:border-error-700 dark:bg-error-900/20 dark:text-error-300">
            {loadError}
          </div>
        ) : (
          <UsersTable initialUsers={users} sessionUserId={sessionUserId} />
        )}
      </div>
    </div>
  );
}
