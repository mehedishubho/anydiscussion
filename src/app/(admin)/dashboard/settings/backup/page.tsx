// src/app/(admin)/dashboard/settings/backup/page.tsx
// [CITED: 08-CONTEXT.md D-01 (multi-select), D-05 (Restore confirmation), BACKUP-05 (admin-only)]
// [CITED: src/app/(admin)/dashboard/settings/storage/page.tsx — the verbatim page-shell analog]
// [CITED: src/lib/permissions/index.ts — requireRole('admin') enforced inside the actions]
//
// The admin-only Backup Settings page. Server Component (NO "use client"). Calls getBackupSettings()
// + listBackups() in try/catch — a non-admin (or unauthenticated) request gets FORBIDDEN via
// requireRole FIRST inside each action (BACKUP-05 — both the sidebar filter AND the server re-check;
// CLAUDE.md "never rely on UI hiding alone"). Passes the redacted initial + backups + the DB-name
// confirmation phrase to <BackupSettingsForm>.
//
// NOTE: getGoogleConsentUrl is NOT called here. Next 16 forbids cookies().set during Server Component
// render, and that action must bind a signed httpOnly CSRF state cookie at consent time. The form
// invokes it client-side when the admin clicks "Connect Drive" (the correct Server Action context).
export const metadata = {
  title: "Backup Settings — Dashboard",
};

export default async function BackupSettingsPage() {
  // Dynamic import avoids pulling the "use server" actions into the client bundle boundary at build
  // and keeps the page module light. Each call is admin-gated inside the action (requireRole FIRST).
  const [{ getBackupSettings, listBackups }] = await Promise.all([
    import("@/actions/backup-settings"),
  ]);

  let initial: Awaited<ReturnType<typeof getBackupSettings>> | null = null;
  let backups: Awaited<ReturnType<typeof listBackups>>["backups"] = [];
  let loadError: string | null = null;
  try {
    [initial, backups] = await Promise.all([getBackupSettings(), listBackups().then((r) => r.backups)]);
  } catch (e) {
    loadError = e instanceof Error ? e.message : String(e);
  }

  // D-05 confirmation phrase: the live database name parsed from DATABASE_URL (the data that would be
  // overwritten). The admin must type this verbatim to enable Restore. Falls back to a stable literal
  // when DATABASE_URL is unset so the gate is always meaningful.
  const confirmationPhrase = parseDbName(process.env.DATABASE_URL) ?? "anydiscussion";

  return (
    <div className="mx-auto max-w-4xl p-6">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          Backup Settings
        </h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Configure multi-destination backups (local default / R2 / Google Drive), schedule,
          retention, and restore. R2 + Google Drive credentials are AES-256-GCM encrypted at rest
          (D-03); secret fields are never sent back to the client — re-enter to change.
        </p>
      </header>

      {loadError ? (
        <div className="rounded-lg border border-error-300 bg-error-50 p-4 text-sm text-error-700 dark:border-error-700 dark:bg-error-900/20 dark:text-error-300">
          Failed to load backup settings: {loadError}
        </div>
      ) : (
        <BackupSettingsForm
          initial={
            initial ?? {
              destinations: { local: true, r2: false, gdrive: false },
              scheduleCron: "0 3 * * *",
              retentionDays: 30,
              drillEnabled: true,
              drillCron: "0 4 * * 0",
              alertEmail: "",
              gdriveConnected: false,
            }
          }
          backups={backups}
          confirmationPhrase={confirmationPhrase}
        />
      )}
    </div>
  );
}

// Local import keeps the Server Component + its client boundary decoupled at build time.
import BackupSettingsForm from "./BackupSettingsForm";

/**
 * Parse the database name out of a Postgres DATABASE_URL (the last path segment). Used to derive
 * the D-05 Restore confirmation phrase (the admin types the name of the DB they would overwrite).
 * Returns null when the URL is missing or has no path.
 */
function parseDbName(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    const pathname = u.pathname.replace(/^\/+/, "");
    return pathname || null;
  } catch {
    return null;
  }
}
