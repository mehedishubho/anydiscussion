// src/app/(site)/layout.tsx
// [CITED: 05-CONTEXT.md D-02 — site-wide metadata on (site)/layout.tsx, NOT root layout.tsx]
// [CITED: 05-CONTEXT.md D-03 — WebSite + Organization JSON-LD injected site-wide]
// [CITED: 05-RESEARCH.md Pattern 1 (L350-378) + Pattern 4 (L572-594)]
// [CITED: 05-RESEARCH.md Pitfall 1 (L707-711) — 'use cache' REQUIRED under cacheComponents:true]
// [CITED: 05-RESEARCH.md Pitfall 2 (L713-718) — JSON-LD via real <script>, NOT metadata.other]
// [CITED: 06-02-PLAN.md Task 1 — extend with SiteHeader/SiteFooter + no-flash dark script]
// [CITED: 06-CONTEXT.md D-10 — standard chrome (header + footer) wrapping every public route]
// [CITED: 06-CONTEXT.md D-13 — no-flash script reads "site-theme" key, NOT dashboard's "theme"]
// [CITED: 06-RESEARCH.md Pattern 4 (L599-623) — the no-flash head script shape]
//
// Public blog site layout. Server Component by default (NO "use client") —
// CLAUDE.md: "public site fast/server-first". Phase 6 EXTENDS this with the real
// header/footer chrome + the route-isolated no-flash dark-mode script + analytics
// injection (Task 2).
//
// Site-wide metadata (metadataBase, title template, default OG) lives HERE, not on
// the root layout.tsx — root also wraps (admin) whose dashboard pages carry their
// own static metadata titles (D-02). Site-wide WebSite + Organization JSON-LD is
// injected via two <script type="application/ld+json" dangerouslySetInnerHTML> tags
// (the only Next.js 16-supported JSON-LD path — Pitfall 2).

import type { Metadata } from "next";
import React from "react";
import Script from "next/script";
import { getSeoSettings } from "@/lib/seo/settings";
import { buildSiteMetadata } from "@/lib/seo/metadata";
import { websiteJsonLd, organizationJsonLd } from "@/lib/seo/jsonld";
import SiteHeader from "@/components/site/SiteHeader";
import SiteFooter from "@/components/site/SiteFooter";

/**
 * Site-wide generateMetadata (D-02). Reads the cached SEO settings snapshot and
 * returns metadataBase + title template + default OG + twitter.
 *
 * 'use cache' is REQUIRED under cacheComponents:true for a generateMetadata that
 * reads external data on an otherwise-prerenderable route (Pitfall 1). Without it,
 * Next.js raises: "metadata accesses uncached data but page is otherwise fully
 * prerenderable." The cacheTag('seo-settings') inside getSeoSettings lets Plan 03's
 * saveSeoSettings action invalidate via revalidateTag('seo-settings', 'max').
 *
 * NOTE (title.template semantic — RESEARCH Anti-Patterns L687): a template defined
 * here applies only to CHILD segments, not this layout's own default. The home page
 * inherits via title.default — it becomes the literal <title> for "/".
 */
export async function generateMetadata(): Promise<Metadata> {
  "use cache";
  const s = await getSeoSettings();
  return buildSiteMetadata(s);
}

/**
 * No-flash dark-mode inline script (D-13 / RESEARCH Pattern 4).
 *
 * Runs BEFORE first paint (strategy="beforeInteractive" → hoisted into <head> by
 * Next.js). Reads the route-isolated "site-theme" localStorage key (NOT the
 * dashboard's "theme" key) and applies the `dark` class to documentElement before
 * React hydrates — preventing a flash of the wrong theme. Falls back to the OS
 * prefers-color-scheme when the user has not explicitly chosen.
 *
 * The dashboard has NO equivalent (it tolerates a flash). This is genuinely new
 * for (site). The matching ThemeToggle client component handles subsequent toggles.
 */
const NO_FLASH_SCRIPT = `(function(){try{var t=localStorage.getItem('site-theme');var m=window.matchMedia('(prefers-color-scheme: dark)').matches;if(t==='dark'||(t!=='light'&&m)){document.documentElement.classList.add('dark')}}catch(e){}})();`;

export default async function SiteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const s = await getSeoSettings();

  return (
    <div className="flex min-h-screen flex-col bg-white dark:bg-gray-900">
      {/*
        No-flash dark-mode script — beforeInteractive so it runs before hydration.
        id="site-no-flash" is the acceptance-criteria hook (06-02-PLAN.md).
      */}
      <Script id="site-no-flash" strategy="beforeInteractive">
        {NO_FLASH_SCRIPT}
      </Script>

      {/* Site-wide JSON-LD — WebSite (with SearchAction) + Organization.
          Pitfall 2: JSON-LD MUST be a real <script type="application/ld+json"> —
          the Metadata API explicitly excludes <script> tags. Rendered in the body
          (valid per Google docs). The payload is JSON.stringify'd server-side from
          trusted DB data; no script execution surface (T-05-01 mitigation). */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(
            websiteJsonLd({
              canonicalBaseUrl: s.canonicalBaseUrl,
              siteTitle: s.siteTitle,
              siteDescription: s.siteDescription,
            }),
          ),
        }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(
            organizationJsonLd({
              canonicalBaseUrl: s.canonicalBaseUrl,
              siteTitle: s.siteTitle,
              defaultOgImage: s.defaultOgImage,
            }),
          ),
        }}
      />

      <SiteHeader />
      <main className="flex-1">{children}</main>
      <SiteFooter />
    </div>
  );
}
