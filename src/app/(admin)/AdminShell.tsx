"use client";

import { useSidebar } from "@/context/SidebarContext";
import AppHeader from "@/layout/AppHeader";
import AppSidebar from "@/layout/AppSidebar";
import Backdrop from "@/layout/Backdrop";
import QueryProvider from "./QueryProvider";
import React from "react";

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
 * Phase 4 D-28: wraps {children} with QueryProvider so TanStack Query is
 * available across all dashboard pages. The provider is INSIDE AdminShell
 * (and thus inside `(admin)`) — never added to the root app/layout.tsx and
 * never imported from `(site)`. This keeps TanStack JS out of the public
 * bundle (PERF-02 isolation, audited in Phase 7).
 */
export default function AdminShell({
  children,
  role,
}: {
  children: React.ReactNode;
  role?: "admin" | "editor" | "author";
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
        {/* Header */}
        <AppHeader />
        {/* Page Content — QueryProvider scoped to (admin) only (D-28) */}
        <div className="p-4 mx-auto max-w-(--breakpoint-2xl) md:p-6">
          <QueryProvider>{children}</QueryProvider>
        </div>
      </div>
    </div>
  );
}
