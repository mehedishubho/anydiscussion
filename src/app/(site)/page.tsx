// src/app/(site)/page.tsx
// [CITED: 05-CONTEXT.md D-01 — wire generateMetadata into EXISTING (site) routes only]
// [CITED: 05-RESEARCH.md Pitfall 1 (L707-711) — 'use cache' for settings-driven home route]
//
// Home route. Replaced the static `export const metadata` with an async
// generateMetadata sourced from getSeoSettings() (the cached snapshot). The home
// route is settings-driven and near-static — 'use cache' is the verified resolution
// under cacheComponents:true (Pitfall 1). The layout's title.default becomes the
// literal <title> for "/" (title.template applies only to child segments —
// RESEARCH Anti-Patterns L687).

import type { Metadata } from "next";
import React from "react";
import { getSeoSettings } from "@/lib/seo/settings";
import { buildSiteMetadata } from "@/lib/seo/metadata";

export async function generateMetadata(): Promise<Metadata> {
  "use cache";
  const s = await getSeoSettings();
  return buildSiteMetadata(s);
}

export default function HomePage() {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-20">
      <h1 className="mb-4 text-3xl font-bold text-gray-800 dark:text-white/90 sm:text-4xl">
        Any Discussion
      </h1>
      <p className="max-w-xl text-center text-base text-gray-600 dark:text-gray-400">
        Public blog content coming soon.
      </p>
    </div>
  );
}
