// src/app/(admin)/dashboard/settings/seo/page.tsx
// [CITED: 05-CONTEXT.md D-11 — admin-only site-wide SEO settings page]
// [CITED: src/app/(admin)/dashboard/settings/storage/page.tsx — EXACT page analog]
// [CITED: src/lib/permissions/index.ts — requireRole('admin') enforced in saveSeoSettings]
//
// The admin-only SEO Settings page. Calls getSeoSettings() (Plan 01's cached
// reader) in try/catch — a non-admin (or unauthenticated) request gets FORBIDDEN
// via requireRole FIRST inside saveSeoSettings (D-11 — both the sidebar filter
// AND the server re-check; CLAUDE.md "never rely on UI hiding alone"). Passes the
// current settings to <SeoSettingsForm> as pre-filled initial values.
//
// Server Component — NO "use client" directive. The form is the client boundary.
import { getSeoSettings } from "@/lib/seo/settings";
import SeoSettingsForm from "./SeoSettingsForm";

export const metadata = {
  title: "SEO Settings — Dashboard",
};

export default async function SeoSettingsPage() {
  let initial: Awaited<ReturnType<typeof getSeoSettings>> | null = null;
  let loadError: string | null = null;
  try {
    initial = await getSeoSettings();
  } catch (e) {
    loadError = e instanceof Error ? e.message : String(e);
  }

  return (
    <div className="mx-auto max-w-4xl p-6">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          SEO Settings
        </h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Site-wide SEO defaults. These values feed the homepage metadata,
          JSON-LD, sitemap, robots.txt, and RSS feed. Changes take effect on the
          next request (the cached SEO snapshot is invalidated on save).
        </p>
      </header>

      {loadError ? (
        <div className="rounded-lg border border-error-300 bg-error-50 p-4 text-sm text-error-700 dark:border-error-700 dark:bg-error-900/20 dark:text-error-300">
          Failed to load SEO settings: {loadError}
        </div>
      ) : (
        <SeoSettingsForm
          initial={
            initial
              ? {
                  siteTitle: initial.siteTitle,
                  siteDescription: initial.siteDescription,
                  defaultOgImage: initial.defaultOgImage,
                  canonicalBaseUrl: initial.canonicalBaseUrl,
                  // SeoSettings.twitterHandle is string | null; the form uses "" for empty.
                  twitterHandle: initial.twitterHandle ?? "",
                }
              : {
                  siteTitle: "",
                  siteDescription: "",
                  defaultOgImage: "",
                  canonicalBaseUrl: "http://localhost:3000",
                  twitterHandle: "",
                }
          }
        />
      )}
    </div>
  );
}
