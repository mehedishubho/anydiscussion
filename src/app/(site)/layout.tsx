import React from "react";

/**
 * Public blog site layout (D-17).
 * Server Component by default (NO "use client") — CLAUDE.md: "public site fast/server-first".
 * Phase 6 extends this with a real header/footer — keep it skeletal now.
 */
export default function SiteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-white dark:bg-gray-900">
      <main>{children}</main>
    </div>
  );
}
