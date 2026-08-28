"use client";

import { useSidebar } from "@/context/SidebarContext";
import AppHeader from "@/layout/AppHeader";
import AppSidebar from "@/layout/AppSidebar";
import Backdrop from "@/layout/Backdrop";
import QueryProvider from "./QueryProvider";
import { Toaster } from "sonner";
import React from "react";
import type { HeaderUser } from "@/components/header/UserDropdown";

/**
 * Client shell for the (admin) route group.
 *
 * Extracted from the former client layout so the layout itself can become a
 * Server Component with an authoritative getSession() auth gate (Plan 02-05).
 * The SidebarProvider lives in the root layout (src/app/layout.tsx), above
 * this route group, so useSidebar() inside AdminShell still resolves correctly
 * when AdminShell is rendered as a child of the new server layout.
 *
 * Phase 4 D-05: forwards the viewer's `role` (passed from the server-side
 * AuthGate) into AppSidebar for the UX-only nav filter. The authoritative RBAC
 * still fires server-side in every mutating Server Action (Phase 2 Pitfall #1).
 *
 * Quick task 260827-869 Task 2: also forwards the viewer's session identity
 * (`user` — name/email/avatar, derived in the AuthGate exactly like the
 * profile page does) into AppHeader → UserDropdown, replacing the TailAdmin
 * demo identity. Both the header and the profile page read from the same
 * session source of truth; ProfileForm calls router.refresh() on save so the
 * server-rendered layout re-fetches and the header updates immediately.
 *
 * Phase 4 D-28, updated by quick task 260828-g2h: QueryProvider wraps the
 * header AND the page content so the 260827-se8 header islands (GlobalSearch,
 * NotificationDropdown) get the QueryClient during SSR — their prior
 * outside-the-provider placement threw "No QueryClient set" at server render
 * and forced the client-render fallback with a recoverable-error banner on
 * every dashboard page. The D-28 guarantee itself is unchanged: the provider
 * is INSIDE AdminShell (and thus inside `(admin)`) — never added to the root
 * app/layout.tsx and never imported from `(site)`. This keeps TanStack JS
 * out of the public bundle (PERF-02 isolation, audited in Phase 7).
 *
 * Phase 5 gap closure (Plan 05-06, UAT test 3 — silent saves): sonner's
 * <Toaster> mounted here, NEXT TO QueryProvider, with the same D-28-style
 * isolation — inside the (admin) shell only, never in the root layout, so
 * toast JS stays out of the (site) public bundle (PERF-02). richColors for
 * unambiguous success/error semantics, top-right per the TailAdmin dashboard
 * convention. Forms import { toast } from "sonner" directly — no wrapper.
 */
export default function AdminShell({
  children,
  role,
  user,
}: {
  children: React.ReactNode;
  role?: "admin" | "editor" | "author";
  user: HeaderUser;
}) {
  const { isExpanded, isHovered, isMobileOpen } = useSidebar();

  // Dynamic class for main content margin based on sidebar state
  const mainContentMargin = isMobileOpen
    ? "ml-0"
    : isExpanded || isHovered
    ? "lg:ml-[290px]"
    : "lg:ml-[90px]";

  return (
    <div className="min-h-screen xl:flex">
      {/* Sidebar and Backdrop */}
      <AppSidebar role={role} />
      <Backdrop />
      {/* Main Content Area */}
      <div
        className={`flex-1 transition-all  duration-300 ease-in-out ${mainContentMargin}`}
      >
        {/* QueryProvider wraps the header AND page content (260828-g2h) so
            the header islands (GlobalSearch, NotificationDropdown) get the
            QueryClient during SSR. (admin)-scoped only (D-28). */}
        <QueryProvider>
          {/* Header */}
          <AppHeader user={user} />
          {/* Page Content */}
          <div className="p-4 mx-auto max-w-(--breakpoint-2xl) md:p-6">
            {children}
          </div>
        </QueryProvider>
      </div>
      {/* sonner Toaster — (admin)-scoped only (05-06 gap closure, D-28-style
          isolation). richColors + top-right per the plan; theme left default. */}
      <Toaster richColors position="top-right" />
    </div>
  );
}
