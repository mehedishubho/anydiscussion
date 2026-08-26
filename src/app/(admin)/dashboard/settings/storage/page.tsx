// src/app/(admin)/dashboard/settings/storage/page.tsx
// [CITED: 04-CONTEXT.md D-23 (admin-only Storage Settings), D-24 (Test connection)]
// [CITED: src/app/(admin)/dashboard/categories/page.tsx — the dashboard list-page shell]
// [CITED: src/lib/permissions/index.ts — requireRole('admin') enforced in the action]
//
// The admin-only Storage Settings page. Calls getStorageSettings() in try/catch —
// a non-admin (or unauthenticated) request gets FORBIDDEN via requireRole FIRST
// (D-23 — both the sidebar filter AND the server re-check; CLAUDE.md "never rely on
// UI hiding alone"). Passes the (redacted) initial settings to <StorageSettingsForm>.
//
// Server Component — NO "use client" directive. The form is the client boundary.
import { getStorageSettings } from "@/actions/storage-settings";
import StorageSettingsForm from "./StorageSettingsForm";

export const metadata = {
  title: "Storage Settings — Dashboard",
};

// Page-scope instant-navigation opt-out (260826-oif): this page's top-level
// uncached awaits (getStorageSettings — a permission-checked Server Action
// calling headers() + DB IO) sit below every effective <Suspense> boundary on
// client navigations between /dashboard segments — the (admin) layout's own
// opt-out does not cover sibling navigations (installed instant-navigation.md).
// Allowed-to-block is correct for session-gated content; a static shell buys nothing.
export const instant = false;

export default async function StorageSettingsPage() {
  let initial: Awaited<ReturnType<typeof getStorageSettings>> | null = null;
  let loadError: string | null = null;
  try {
    initial = await getStorageSettings();
  } catch (e) {
    loadError = e instanceof Error ? e.message : String(e);
  }

  return (
    <div className="mx-auto max-w-4xl p-6">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          Storage Settings
        </h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Choose where uploaded images are stored. Provider credentials are
          AES-256-GCM encrypted at rest (D-25); secret fields are never sent
          back to the client — re-enter to change.
        </p>
      </header>

      {loadError ? (
        <div className="rounded-lg border border-error-300 bg-error-50 p-4 text-sm text-error-700 dark:border-error-700 dark:bg-error-900/20 dark:text-error-300">
          Failed to load storage settings: {loadError}
        </div>
      ) : (
        <StorageSettingsForm initial={initial ?? { activeProvider: "local" }} />
      )}
    </div>
  );
}
