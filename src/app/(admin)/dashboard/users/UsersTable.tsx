"use client";
// src/app/(admin)/dashboard/users/UsersTable.tsx
// [CITED: 04-03-PLAN.md Task 2 — client table with ban/role-change optimistic UI]
// [CITED: 04-CONTEXT.md D-07 (drawer), D-08 (disable-only), D-10 (revoke-only), D-11 (role dropdown)]
// [CITED: 04-CONTEXT.md D-27 — ban/role-change = optimistic (high-frequency small mutations)]
//
// Client component. Owns the row-action mutations (ban/unban/revoke-sessions) which
// surface the Phase 2 primitives via TanStack useMutation. Optimistic UI is applied
// to ban/unban (D-27 — small, high-frequency, low-risk-of-conflict); the row flips
// to the new state immediately and rolls back on error. Create/edit launches the
// UserDrawer (NOT optimistic — server confirms credentials before the drawer closes).
//
// RBAC re-statement: every action wired here (createUser / updateUser / banUser /
// unbanUser / revokeSessions) re-checks requireCan server-side. UI hiding is a
// courtesy; the server is the authoritative gate (Phase 2 Pitfall #1).
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Table, TableHeader, TableBody, TableRow, TableCell } from "@/components/ui/table";
import { banUser, unbanUser, revokeSessions } from "@/actions/users";
import UserDrawer from "./UserDrawer";
import type { UserRow } from "./page";

const ROLE_BADGE: Record<string, string> = {
  admin: "bg-brand-100 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300",
  editor: "bg-success-100 text-success-700 dark:bg-success-900/30 dark:text-success-300",
  author: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
};

// Initials avatar — avoids next/image remote-pattern configuration for the table
// thumbnail (CDN remote pattern ships with Plan 04-05 storage settings). Renders
// a clean colored circle with the user's initials; CLAUDE.md's "never raw <img>"
// rule is satisfied because we render NO <img> here.
function AvatarInitials({ name }: { name: string }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
  return (
    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700 dark:bg-brand-900/40 dark:text-brand-300">
      {initials || "?"}
    </div>
  );
}

export default function UsersTable({ initialUsers }: { initialUsers: UserRow[] }) {
  const queryClient = useQueryClient();
  const [users, setUsers] = useState<UserRow[]>(initialUsers);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserRow | null>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);

  const openCreate = () => {
    setEditingUser(null);
    setDrawerOpen(true);
  };
  const openEdit = (user: UserRow) => {
    setEditingUser(user);
    setDrawerOpen(true);
  };

  // ---- D-27 optimistic mutations (ban/unban/revoke) ----
  // Ban: flip banned=true optimistically; rollback on error.
  const banMutation = useMutation({
    mutationFn: (userId: string) => banUser(userId),
    onMutate: async (userId) => {
      setPendingAction(`Banning ${userId}…`);
      const snapshot = users;
      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, banned: true } : u)),
      );
      return { snapshot };
    },
    onError: (_err, _userId, context) => {
      if (context?.snapshot) setUsers(context.snapshot);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["users"] });
    },
    onSettled: () => setPendingAction(null),
  });

  const unbanMutation = useMutation({
    mutationFn: (userId: string) => unbanUser(userId),
    onMutate: async (userId) => {
      setPendingAction(`Unbanning ${userId}…`);
      const snapshot = users;
      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, banned: false } : u)),
      );
      return { snapshot };
    },
    onError: (_err, _userId, context) => {
      if (context?.snapshot) setUsers(context.snapshot);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["users"] });
    },
    onSettled: () => setPendingAction(null),
  });

  const revokeMutation = useMutation({
    // NOT optimistic — revoking sessions doesn't have a visible row-state flip
    // (banned stays the same); a success toast is sufficient feedback. D-27 lists
    // ban/role-change as the optimistic cases; revoke is a one-shot action.
    mutationFn: (userId: string) => revokeSessions({ userId }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["users"] });
    },
  });

  // After drawer create/edit succeeds, refresh local state from the server list.
  // The drawer calls these callbacks; the actual mutation lives in the drawer
  // (createUser / updateUser via useMutation, non-optimistic per D-27).
  const onDrawerSuccess = async (refreshedList?: UserRow[]) => {
    setDrawerOpen(false);
    setEditingUser(null);
    // Optimistic refresh: if the drawer returned a refreshed list, use it;
    // otherwise re-fetch via listUsers invalidation. We can't call listUsers
    // from the client (it's a server action requiring user:read) but the
    // invalidateQueries triggers the next render to re-read.
    if (refreshedList) setUsers(refreshedList);
    void queryClient.invalidateQueries({ queryKey: ["users"] });
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-medium text-white shadow-theme-xs hover:bg-brand-600"
        >
          + New User
        </button>
      </div>

      {users.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500 dark:border-gray-700">
          No team members yet. Click <span className="font-medium">+ New User</span> to add the first one.
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-800">
          <Table>
            <TableHeader>
              <TableRow className="border-b border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-900/50">
                <TableCell isHeader className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500">Name</TableCell>
                <TableCell isHeader className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500">Email</TableCell>
                <TableCell isHeader className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500">Role</TableCell>
                <TableCell isHeader className="px-4 py-3 text-left text-xs font-semibold uppercase text-gray-500">Status</TableCell>
                <TableCell isHeader className="px-4 py-3 text-right text-xs font-semibold uppercase text-gray-500">Actions</TableCell>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => {
                const isBanned = !!user.banned;
                return (
                  <TableRow key={user.id} className="border-b border-gray-100 last:border-0 dark:border-gray-800">
                    <TableCell className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <AvatarInitials name={user.name} />
                        <span className="text-sm font-medium text-gray-800 dark:text-white/90">
                          {user.name}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300">
                      {user.email}
                    </TableCell>
                    <TableCell className="px-4 py-3">
                      <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${ROLE_BADGE[user.role ?? "author"] ?? ROLE_BADGE.author}`}>
                        {user.role ?? "author"}
                      </span>
                    </TableCell>
                    <TableCell className="px-4 py-3">
                      {isBanned ? (
                        <span className="inline-block rounded-full bg-error-100 px-2.5 py-0.5 text-xs font-medium text-error-700 dark:bg-error-900/30 dark:text-error-300">
                          Banned
                        </span>
                      ) : (
                        <span className="inline-block rounded-full bg-success-100 px-2.5 py-0.5 text-xs font-medium text-success-700 dark:bg-success-900/30 dark:text-success-300">
                          Active
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="px-4 py-3">
                      <div className="flex flex-wrap justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => openEdit(user)}
                          className="rounded-md bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
                        >
                          Edit
                        </button>
                        {isBanned ? (
                          <button
                            type="button"
                            onClick={() => {
                              if (window.confirm(`Unban ${user.name}? They will be able to sign in again.`)) {
                                void unbanMutation.mutate(user.id);
                              }
                            }}
                            disabled={unbanMutation.isPending}
                            className="rounded-md bg-success-100 px-2.5 py-1 text-xs font-medium text-success-700 hover:bg-success-200 disabled:opacity-50 dark:bg-success-900/30 dark:text-success-300"
                          >
                            Unban
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              if (window.confirm(`Ban ${user.name}? They will be signed out and cannot sign in until unbanned.`)) {
                                void banMutation.mutate(user.id);
                              }
                            }}
                            disabled={banMutation.isPending}
                            className="rounded-md bg-error-100 px-2.5 py-1 text-xs font-medium text-error-700 hover:bg-error-200 disabled:opacity-50 dark:bg-error-900/30 dark:text-error-300"
                          >
                            Ban
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            if (window.confirm(`Revoke all sessions for ${user.name}? They will be signed out of every device.`)) {
                              void revokeMutation.mutate(user.id);
                            }
                          }}
                          disabled={revokeMutation.isPending}
                          className="rounded-md bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-200 disabled:opacity-50 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
                        >
                          Revoke sessions
                        </button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {(banMutation.error || unbanMutation.error || revokeMutation.error) && (
        <div className="rounded-lg border border-error-300 bg-error-50 p-3 text-sm text-error-700 dark:border-error-700 dark:bg-error-900/20 dark:text-error-300">
          {banMutation.error?.message || unbanMutation.error?.message || revokeMutation.error?.message || "Action failed"}
        </div>
      )}
      {pendingAction && (
        <div className="text-xs text-gray-500">{pendingAction}</div>
      )}

      {/* UserDrawer (create/edit). The drawer's own useMutation calls createUser /
          updateUser — non-optimistic per D-27 (server confirms credentials). */}
      <UserDrawer
        isOpen={drawerOpen}
        onClose={() => {
          setDrawerOpen(false);
          setEditingUser(null);
        }}
        onSuccess={onDrawerSuccess}
        editingUser={editingUser}
      />
    </div>
  );
}
