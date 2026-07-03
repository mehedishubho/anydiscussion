"use client";

import { useSidebar } from "@/context/SidebarContext";
import AppHeader from "@/layout/AppHeader";
import AppSidebar from "@/layout/AppSidebar";
import Backdrop from "@/layout/Backdrop";
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
 * This is a PURE RELOCATION — no className, structure, or import changed.
 */
export default function AdminShell({
  children,
}: {
  children: React.ReactNode;
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
      <AppSidebar />
      <Backdrop />
      {/* Main Content Area */}
      <div
        className={`flex-1 transition-all  duration-300 ease-in-out ${mainContentMargin}`}
      >
        {/* Header */}
        <AppHeader />
        {/* Page Content */}
        <div className="p-4 mx-auto max-w-(--breakpoint-2xl) md:p-6">{children}</div>
      </div>
    </div>
  );
}
