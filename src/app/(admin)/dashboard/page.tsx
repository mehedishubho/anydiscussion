import type { Metadata } from "next";
import React from "react";

export const metadata: Metadata = {
  title: "Dashboard | Any Discussion",
  description: "Admin dashboard overview",
};

export default function DashboardOverview() {
  return (
    <div className="grid grid-cols-12 gap-4 md:gap-6">
      <div className="col-span-12">
        <div className="rounded-2xl border border-gray-200 bg-white p-8 dark:border-gray-800 dark:bg-white/[0.03]">
          <h2 className="mb-2 text-xl font-bold text-gray-800 dark:text-white/90">
            Dashboard
          </h2>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Dashboard content will be wired to real data in Phase 4.
          </p>
        </div>
      </div>
    </div>
  );
}
