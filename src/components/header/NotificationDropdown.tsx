"use client";
// src/components/header/NotificationDropdown.tsx
// [CITED: 260827-se8-PLAN.md Task 8 <action> step 3 — the self-contained bell island]
// [CITED: research Finding 6 — do NOT thread the unread count through the
//  AuthGate prop chain: the layout does not re-render on sibling page
//  navigations, so a prop-fed count would go stale. This island owns its
//  queries on the shell's existing QueryProvider.]
//
// Full rewrite of the TailAdmin demo dropdown (kept the export name — AppHeader
// imports it). Live data only:
//   - badge count: useQuery ["notifications-unread"] → countUnreadNotifications
//     with refetchOnWindowFocus + a 60s refetchInterval (discretion); badge
//     hidden at 0.
//   - opening the bell: useQuery ["notifications"] → listNotifications(1) plus
//     a useMutation calling markNotificationsRead(), then invalidates BOTH keys
//     (the badge drops to 0 once the feed is seen).
//   - rows: a type → friendly-copy map local to this component, with
//     payload.postTitle / payload.subscriberEmail + relative createdAt; rows
//     carrying payload.postId link to the post's edit page.
// The demo "View All Notifications" footer link is GONE — no such page exists
// (research OQ2). All hardcoded demo user content replaced entirely.
import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  countUnreadNotifications,
  listNotifications,
  markNotificationsRead,
} from "@/actions/notifications";
import { Dropdown } from "../ui/dropdown/Dropdown";

/** Poll cadence for the badge count (discretion — light count(*) query). */
const UNREAD_REFETCH_INTERVAL_MS = 60_000;

/** Type → friendly copy. Payload keys per type (lib/notifications.ts header). */
const COPY_BY_TYPE: Record<string, (payload: Record<string, unknown>) => string> = {
  post_submitted: (p) =>
    p.postTitle ? `${p.postTitle} was submitted for review` : "A post was submitted for review",
  post_published: (p) =>
    p.postTitle ? `${p.postTitle} was published` : "Your post was published",
  post_returned: (p) =>
    p.postTitle ? `${p.postTitle} was returned for revision` : "Your post was returned for revision",
  new_subscriber: (p) =>
    p.subscriberEmail ? `New subscriber: ${p.subscriberEmail}` : "New subscriber",
};

function copyFor(type: string, payload: Record<string, unknown> | null): string {
  const build = COPY_BY_TYPE[type];
  if (build) return build(payload ?? {});
  return type.replaceAll("_", " ");
}

/** Compact relative time ("3m", "2h", "5d") — display-only, no deps. */
function relativeTime(date: Date | string | null): string {
  if (!date) return "";
  const then = new Date(date).getTime();
  if (Number.isNaN(then)) return "";
  const seconds = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(then).toLocaleDateString();
}

type NotificationRow = {
  id: number;
  type: string;
  payload: Record<string, unknown> | null;
  readAt: Date | string | null;
  createdAt: Date | string | null;
};

export default function NotificationDropdown() {
  const [isOpen, setIsOpen] = useState(false);
  const queryClient = useQueryClient();

  const unreadQuery = useQuery<number>({
    queryKey: ["notifications-unread"],
    queryFn: () => countUnreadNotifications(),
    refetchOnWindowFocus: true,
    refetchInterval: UNREAD_REFETCH_INTERVAL_MS,
  });

  const listQuery = useQuery<NotificationRow[]>({
    queryKey: ["notifications"],
    // The drizzle jsonb column surfaces as `unknown`; the display layer owns
    // the payload shape (type → copy map below) — a boundary cast, not a guess.
    queryFn: async () => (await listNotifications(1)) as NotificationRow[],
    enabled: isOpen, // fetch the feed only when the bell is open
  });

  const markRead = useMutation({
    mutationFn: () => markNotificationsRead(),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["notifications-unread"] });
      await queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  // Mark-read fires when the dropdown OPENS (the feed is deemed seen).
  useEffect(() => {
    if (isOpen && (unreadQuery.data ?? 0) > 0) {
      markRead.mutate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const unread = unreadQuery.data ?? 0;
  const rows = listQuery.data ?? [];

  return (
    <div className="relative">
      <button
        className="relative dropdown-toggle flex items-center justify-center text-gray-500 transition-colors bg-white border border-gray-200 rounded-full hover:text-gray-700 h-11 w-11 hover:bg-gray-100 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white"
        onClick={() => setIsOpen((v) => !v)}
        aria-label={`Notifications${unread > 0 ? ` (${unread} unread)` : ""}`}
      >
        {/* Unread badge — hidden at 0 (live count, not demo state). */}
        {unread > 0 && (
          <span className="absolute right-0 top-0.5 z-10 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-orange-400 px-1 text-[11px] font-medium text-white">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
        <svg
          className="fill-current"
          width="20"
          height="20"
          viewBox="0 0 20 20"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            fillRule="evenodd"
            clipRule="evenodd"
            d="M10.75 2.29248C10.75 1.87827 10.4143 1.54248 10 1.54248C9.58583 1.54248 9.25004 1.87827 9.25004 2.29248V2.83613C6.08266 3.20733 3.62504 5.9004 3.62504 9.16748V14.4591H3.33337C2.91916 14.4591 2.58337 14.7949 2.58337 15.2091C2.58337 15.6234 2.91916 15.9591 3.33337 15.9591H4.37504H15.625H16.6667C17.0809 15.9591 17.4167 15.6234 17.4167 15.2091C17.4167 14.7949 17.0809 14.4591 16.6667 14.4591H16.375V9.16748C16.375 5.9004 13.9174 3.20733 10.75 2.83613V2.29248ZM14.875 14.4591V9.16748C14.875 6.47509 12.6924 4.29248 10 4.29248C7.30765 4.29248 5.12504 6.47509 5.12504 9.16748V14.4591H14.875ZM8.00004 17.7085C8.00004 18.1228 8.33583 18.4585 8.75004 18.4585H11.25C11.6643 18.4585 12 18.1228 12 17.7085C12 17.2943 11.6643 16.9585 11.25 16.9585H8.75004C8.33583 16.9585 8.00004 17.2943 8.00004 17.7085Z"
            fill="currentColor"
          />
        </svg>
      </button>
      <Dropdown
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        className="absolute -right-[240px] mt-[17px] flex h-[480px] w-[350px] flex-col rounded-2xl border border-gray-200 bg-white p-3 shadow-theme-lg dark:border-gray-800 dark:bg-gray-dark sm:w-[361px] lg:right-0"
      >
        <div className="flex items-center justify-between pb-3 mb-3 border-b border-gray-100 dark:border-gray-700">
          <h5 className="text-lg font-semibold text-gray-800 dark:text-gray-200">
            Notification
          </h5>
          {unreadQuery.isLoading ? (
            <span className="text-xs text-gray-400 dark:text-gray-500">…</span>
          ) : (
            <span className="text-xs text-gray-400 dark:text-gray-500">
              {unread > 0 ? `${unread} unread` : "all caught up"}
            </span>
          )}
        </div>

        <div className="grow overflow-y-auto">
          {listQuery.isLoading && rows.length === 0 ? (
            <p className="px-2 py-6 text-center text-sm text-gray-500 dark:text-gray-400">
              Loading…
            </p>
          ) : rows.length === 0 ? (
            <p className="px-2 py-6 text-center text-sm text-gray-500 dark:text-gray-400">
              No notifications yet.
            </p>
          ) : (
            rows.map((n) => {
              const postId = typeof n.payload?.postId === "number" ? n.payload.postId : undefined;
              const content = (
                <>
                  <span
                    className={`text-sm leading-snug ${
                      n.readAt
                        ? "text-gray-600 dark:text-gray-400"
                        : "font-medium text-gray-800 dark:text-gray-200"
                    }`}
                  >
                    {copyFor(n.type, n.payload)}
                  </span>
                  <span className="mt-0.5 block text-xs text-gray-400 dark:text-gray-500">
                    {relativeTime(n.createdAt)}
                  </span>
                </>
              );
              return postId !== undefined ? (
                <Link
                  key={n.id}
                  href={`/dashboard/posts/${postId}/edit`}
                  onClick={() => setIsOpen(false)}
                  className="block rounded-lg px-2 py-2.5 hover:bg-gray-50 dark:hover:bg-white/5"
                >
                  {content}
                </Link>
              ) : (
                <div key={n.id} className="px-2 py-2.5">
                  {content}
                </div>
              );
            })
          )}
        </div>
      </Dropdown>
    </div>
  );
}
