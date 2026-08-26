// src/app/(admin)/dashboard/settings/newsletter/page.tsx
// [CITED: 260824-3l2-CONTEXT.md D-02 — dashboard configuration for the footer
//  newsletter column: enable toggle + heading/description/success texts]
// [CITED: src/app/(admin)/dashboard/settings/seo/page.tsx — EXACT page analog]
// [CITED: src/lib/permissions/index.ts — requireRole('admin') enforced in
//  saveNewsletterSettings (the sidebar role filter is UX-only)]
//
// The admin-only Newsletter Settings page. Calls readNewsletterSettings() (the
// cached, defaults-applied reader) in try/catch and passes the snapshot into
// <NewsletterSettingsForm> as pre-filled initial values. Saving revalidates the
// seo-settings cache tag inside the action, so the public footer picks up new
// texts/visibility on the next request without a rebuild.
//
// Server Component — NO "use client" directive. The form is the client boundary.
import { readNewsletterSettings } from "@/lib/queries/newsletter-settings";
import NewsletterSettingsForm from "./NewsletterSettingsForm";

export const metadata = {
  title: "Newsletter Settings — Dashboard",
};

// Page-scope instant-navigation opt-out (260826-oif): this page's top-level
// uncached awaits (readNewsletterSettings — a permission-checked Server Action
// calling headers() + DB IO) sit below every effective <Suspense> boundary on
// client navigations between /dashboard segments — the (admin) layout's own
// opt-out does not cover sibling navigations (installed instant-navigation.md).
// Allowed-to-block is correct for session-gated content; a static shell buys nothing.
export const instant = false;

export default async function NewsletterSettingsPage() {
  let initial: Awaited<ReturnType<typeof readNewsletterSettings>> | null = null;
  let loadError: string | null = null;
  try {
    initial = await readNewsletterSettings();
  } catch (e) {
    loadError = e instanceof Error ? e.message : String(e);
  }

  return (
    <div className="mx-auto max-w-4xl p-6">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          Newsletter Settings
        </h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Configure the newsletter column in the public site footer. Turning the
          toggle off removes the column from the footer entirely (readers see no
          disabled form). Empty text fields fall back to the built-in defaults.
          Saving refreshes the cached footer without a rebuild.
        </p>
      </header>

      {loadError ? (
        <div className="rounded-lg border border-error-300 bg-error-50 p-4 text-sm text-error-700 dark:border-error-700 dark:bg-error-900/20 dark:text-error-300">
          Failed to load newsletter settings: {loadError}
        </div>
      ) : initial ? (
        <NewsletterSettingsForm initial={initial} />
      ) : null}
    </div>
  );
}
