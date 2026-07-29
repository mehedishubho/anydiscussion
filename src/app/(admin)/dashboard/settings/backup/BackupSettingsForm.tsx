"use client";
// src/app/(admin)/dashboard/settings/backup/BackupSettingsForm.tsx
// [CITED: 08-CONTEXT.md D-01 (multi-select), D-03 (encrypted + redact-on-read), D-05 (Restore gate), D-09 (defaults)]
// [CITED: 08-RESEARCH.md Pitfall 7 (lines 533-537) — secret fields never pre-filled]
// [CITED: 08-PATTERNS.md row BackupSettingsForm.tsx — mirror storage/StorageSettingsForm.tsx with ONE delta]
// [CITED: src/app/(admin)/dashboard/settings/storage/StorageSettingsForm.tsx — the verbatim analog (lines 56-132)]
// [CITED: BACKUP-05, T-08-04c (Restore confirmation), D-27 (NOT optimistic — high-stakes)]
//
// The Backup Settings client form. RHF + Zod for validation; TanStack useMutation for the SAVE
// (NOT optimistic per D-27 — credentials are high-stakes; the server confirms before the UI flips).
//
// THE D-01 DELTA vs Storage Settings: instead of a single active-provider <select>, this renders
// THREE destination checkboxes (Local / R2 / Google Drive) — all toggleable simultaneously
// (multi-select). Each enabled destination reveals its credential section.
//
// Pitfall 7: the r2 secret field (secretAccessKey) defaults to '' and is NEVER pre-filled — even
// though getBackupSettings returns a redacted (empty) value, the form uses placeholder text to make
// the "enter to change" contract visible. Non-secret r2 fields (endpoint/region/accessKeyId/bucket/
// forcePathStyle) ARE pre-filled.
//
// Restore (D-05): a destructive-overwrite gate. The admin must TYPE the database name into a text
// input to enable the Restore button; only then does clicking it call restoreBackup. This is the
// T-08-04c mitigation — high-stakes overwrite is operator-witnessed. restoreBackup still re-checks
// admin server-side.
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useMutation } from "@tanstack/react-query";
import {
  backupSettingsSchema,
  zodResolver,
  type BackupSettingsInput,
} from "./schema-client";
import {
  saveBackupSettings,
  testBackupConnection,
  triggerBackupNow,
  restoreBackup,
  getGoogleConsentUrl,
  disconnectGoogleDrive,
} from "@/actions/backup-settings";

const INPUT_CLASS =
  "h-11 w-full rounded-lg border appearance-none px-4 py-2.5 text-sm shadow-theme-xs placeholder:text-gray-400 focus:outline-hidden focus:ring-3 bg-transparent text-gray-800 border-gray-300 focus:border-brand-300 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:focus:border-brand-800";
const LABEL_CLASS =
  "mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400";

export interface BackupSettingsFormProps {
  /** Initial settings from getBackupSettings (redacted — secret fields empty, Pitfall 7). */
  initial: {
    destinations: { local: boolean; r2: boolean; gdrive: boolean };
    scheduleCron: string;
    retentionDays: number;
    drillEnabled: boolean;
    drillCron: string;
    alertEmail: string;
    r2?: Record<string, unknown>;
    gdriveConnected: boolean;
  };
  /** Past backups for the Restore picker (server-fetched via listBackups in page.tsx). */
  backups: { destination: string; key: string }[];
  /** The database name the admin must type to enable Restore (D-05 destructive-overwrite gate). */
  confirmationPhrase: string;
}

type ProbeStatus =
  | { state: "idle" }
  | { state: "probing" }
  | { state: "ok" }
  | { state: "error"; message: string };

export default function BackupSettingsForm({
  initial,
  backups,
  confirmationPhrase,
}: BackupSettingsFormProps) {
  const [probe, setProbe] = useState<Record<string, ProbeStatus>>({});
  const [backupNow, setBackupNow] = useState<{
    state: "idle" | "running" | "ok" | "error";
    message?: string;
  }>({ state: "idle" });
  const [restoreState, setRestoreState] = useState<{
    state: "idle" | "running" | "ok" | "error";
    message?: string;
  }>({ state: "idle" });
  const [confirmText, setConfirmText] = useState("");
  const [gdriveConnected, setGdriveConnected] = useState(initial.gdriveConnected);
  const [connectingDrive, setConnectingDrive] = useState(false);

  const { register, handleSubmit, watch, getValues } = useForm<BackupSettingsInput>({
    resolver: zodResolver(backupSettingsSchema),
    defaultValues: {
      destinations: initial.destinations,
      scheduleCron: initial.scheduleCron,
      retentionDays: initial.retentionDays,
      drillEnabled: initial.drillEnabled,
      drillCron: initial.drillCron,
      alertEmail: initial.alertEmail,
      r2: {
        endpoint: String(initial.r2?.endpoint ?? ""),
        region: String(initial.r2?.region ?? "auto"),
        accessKeyId: String(initial.r2?.accessKeyId ?? ""),
        secretAccessKey: "", // Pitfall 7 — never pre-filled
        bucket: String(initial.r2?.bucket ?? ""),
        forcePathStyle: Boolean(initial.r2?.forcePathStyle ?? true),
      },
    },
  });

  const destLocal = watch("destinations.local");
  const destR2 = watch("destinations.r2");
  const destGdrive = watch("destinations.gdrive");

  // D-27 — NOT optimistic. High-stakes mutation (credentials + schedule); server confirms.
  const mutation = useMutation({
    mutationFn: (values: BackupSettingsInput) =>
      saveBackupSettings(values as Parameters<typeof saveBackupSettings>[0]),
  });

  const onValid = (values: BackupSettingsInput) => {
    mutation.mutate(values);
  };

  // Test connection probe (D-24 analog) — per destination. Never throws (action wraps in try/catch).
  const handleTest = async (destination: string) => {
    setProbe((p) => ({ ...p, [destination]: { state: "probing" } }));
    try {
      const result = await testBackupConnection(destination, getValues() as never);
      setProbe((p) => ({
        ...p,
        [destination]: result.ok
          ? { state: "ok" }
          : { state: "error", message: result.error ?? "Unknown error" },
      }));
    } catch (e) {
      setProbe((p) => ({
        ...p,
        [destination]: {
          state: "error",
          message: e instanceof Error ? e.message : String(e),
        },
      }));
    }
  };

  const handleBackupNow = async () => {
    setBackupNow({ state: "running" });
    try {
      const result = await triggerBackupNow();
      setBackupNow(
        result.ok
          ? { state: "ok" }
          : { state: "error", message: result.error ?? "Backup failed" },
      );
    } catch (e) {
      setBackupNow({
        state: "error",
        message: e instanceof Error ? e.message : String(e),
      });
    }
  };

  const handleRestore = async (key?: string) => {
    setRestoreState({ state: "running" });
    try {
      const result = await restoreBackup(key);
      setRestoreState(
        result.ok
          ? { state: "ok" }
          : { state: "error", message: result.error ?? "Restore failed" },
      );
    } catch (e) {
      setRestoreState({
        state: "error",
        message: e instanceof Error ? e.message : String(e),
      });
    }
  };

  const handleDisconnect = async () => {
    if (!confirm("Disconnect Google Drive? Stored refresh token will be revoked.")) return;
    await disconnectGoogleDrive();
    setGdriveConnected(false);
  };

  // Connect Drive: invoke the getGoogleConsentUrl Server Action CLIENT-SIDE (not in page render).
  // Next 16 forbids cookies().set during Server Component render, so the CSRF state cookie can only
  // be bound at the moment the admin actually initiates the consent flow. The action sets the signed
  // httpOnly gdrive_oauth_state cookie + returns the consent URL; we then redirect the browser.
  const handleConnectDrive = async () => {
    setConnectingDrive(true);
    try {
      const url = await getGoogleConsentUrl();
      if (url) {
        window.location.href = url;
      }
    } catch (e) {
      // Surface a non-blocking error; the admin can retry. No redirect on failure.
      // eslint-disable-next-line no-console
      console.error("Connect Drive failed", e);
      setConnectingDrive(false);
    }
  };

  const submitError = mutation.error?.message ?? null;
  const isSaving = mutation.isPending;
  const isSaved = mutation.isSuccess;
  // D-05 gate: Restore is enabled only when the typed text exactly matches the DB name.
  const restoreEnabled = confirmText.trim() === confirmationPhrase;

  return (
    <form onSubmit={handleSubmit(onValid)} className="space-y-6">
      {/* ─── D-01 multi-select destinations (THREE checkboxes — the delta vs Storage Settings) ─── */}
      <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-800">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
          Backup destinations
        </h3>
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          Enable any combination. Dumps are written to every enabled destination (multi-select).
          Local is the default-safe fallback.
        </p>
        <div className="mt-3 space-y-2">
          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
            <input
              id="dest-local"
              type="checkbox"
              {...register("destinations.local")}
            />
            Local filesystem
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
            <input
              id="dest-r2"
              type="checkbox"
              {...register("destinations.r2")}
            />
            Cloudflare R2
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
            <input
              id="dest-gdrive"
              type="checkbox"
              {...register("destinations.gdrive")}
            />
            Google Drive
          </label>
        </div>
      </div>

      {/* ─── Local destination (no credentials) ─── */}
      {destLocal && (
        <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-800">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                Local filesystem
              </h3>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Dumps written to <code>storage/backups/</code> (override via BACKUP_LOCAL_ROOT).
                No credentials required.
              </p>
            </div>
            <button
              type="button"
              onClick={() => handleTest("local")}
              disabled={probe.local?.state === "probing"}
              className="shrink-0 rounded-lg bg-white px-3 py-2 text-xs font-medium text-gray-700 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 disabled:opacity-50 dark:bg-gray-800 dark:text-gray-400 dark:ring-gray-700"
            >
              {probe.local?.state === "probing" ? "Testing…" : "Test connection"}
            </button>
          </div>
          {probe.local?.state === "ok" && (
            <p className="text-xs text-success-700 dark:text-success-300">✓ Connection successful.</p>
          )}
          {probe.local?.state === "error" && (
            <p className="text-xs text-error-700 dark:text-error-300">✗ {probe.local.message}</p>
          )}
        </div>
      )}

      {/* ─── R2 credentials (revealed when r2 is enabled) ─── */}
      {destR2 && (
        <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-800">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                Cloudflare R2 credentials
              </h3>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Dedicated backup bucket (separate from the media bucket). Encrypted at rest (D-03).
                Re-enter the secret access key to change it.
              </p>
            </div>
            <button
              type="button"
              onClick={() => handleTest("r2")}
              disabled={probe.r2?.state === "probing"}
              className="shrink-0 rounded-lg bg-white px-3 py-2 text-xs font-medium text-gray-700 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 disabled:opacity-50 dark:bg-gray-800 dark:text-gray-400 dark:ring-gray-700"
            >
              {probe.r2?.state === "probing" ? "Testing…" : "Test connection"}
            </button>
          </div>
          <div className="space-y-4">
            <Field label="R2 endpoint" {...register("r2.endpoint")} placeholder="https://<account>.r2.cloudflarestorage.com" />
            <Field label="R2 region" {...register("r2.region")} placeholder="auto" />
            <Field label="R2 access key ID" {...register("r2.accessKeyId")} placeholder="AKIA..." />
            <Field
              label="R2 secret access key"
              type="password"
              {...register("r2.secretAccessKey")}
              placeholder="•••••••• (enter new value to change)"
            />
            <Field label="R2 bucket" {...register("r2.bucket")} placeholder="anydiscussion-backups" />
            <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
              <input type="checkbox" {...register("r2.forcePathStyle")} />
              Force path-style addressing
            </label>
          </div>
          {probe.r2?.state === "ok" && (
            <p className="mt-3 text-xs text-success-700 dark:text-success-300">✓ Connection successful.</p>
          )}
          {probe.r2?.state === "error" && (
            <p className="mt-3 text-xs text-error-700 dark:text-error-300">✗ {probe.r2.message}</p>
          )}
        </div>
      )}

      {/* ─── Google Drive (OAuth — Connect/Disconnect, no cred fields) ─── */}
      {destGdrive && (
        <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-800">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
            Google Drive
          </h3>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Connected via OAuth (drive.file scope). Refresh token encrypted at rest (D-02/D-03).
          </p>
          <div className="mt-3 flex items-center gap-3">
            {gdriveConnected ? (
              <>
                <span className="text-xs text-success-700 dark:text-success-300">
                  ✓ Connected
                </span>
                <button
                  type="button"
                  onClick={handleDisconnect}
                  className="rounded-lg bg-white px-3 py-2 text-xs font-medium text-error-700 ring-1 ring-inset ring-error-300 hover:bg-error-50 dark:bg-gray-800 dark:text-error-300 dark:ring-error-700"
                >
                  Disconnect Drive
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={handleConnectDrive}
                disabled={connectingDrive}
                className="inline-flex items-center justify-center rounded-lg bg-brand-500 px-4 py-2 text-xs font-medium text-white hover:bg-brand-600 disabled:opacity-50"
              >
                {connectingDrive ? "Connecting…" : "Connect Drive"}
              </button>
            )}
          </div>
        </div>
      )}

      {/* ─── Schedule + retention + drill + alertEmail (D-09 defaults via initial) ─── */}
      <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-800">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Schedule &amp; retention</h3>
        <div className="mt-3 space-y-4">
          <Field label="Schedule (cron)" {...register("scheduleCron")} placeholder="0 3 * * *" />
          <div>
            <label className={LABEL_CLASS} htmlFor="retentionDays">
              Retention (days, 1–365)
            </label>
            <input
              id="retentionDays"
              type="number"
              min={1}
              max={365}
              className={INPUT_CLASS}
              {...register("retentionDays", { valueAsNumber: true })}
            />
          </div>
          <Field label="Alert email" type="email" {...register("alertEmail")} placeholder="ops@example.com" />
          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
            <input type="checkbox" {...register("drillEnabled")} />
            Enable automated restore-drill
          </label>
          <Field label="Drill schedule (cron)" {...register("drillCron")} placeholder="0 4 * * 0" />
        </div>
      </div>

      {/* ─── Backup now (manual trigger) ─── */}
      <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-800">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Backup now</h3>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Run a one-off backup immediately (dump → upload to every enabled destination).
            </p>
          </div>
          <button
            type="button"
            onClick={handleBackupNow}
            disabled={backupNow.state === "running"}
            className="shrink-0 rounded-lg bg-brand-500 px-4 py-2 text-xs font-medium text-white hover:bg-brand-600 disabled:opacity-50"
          >
            {backupNow.state === "running" ? "Running…" : "Backup now"}
          </button>
        </div>
        {backupNow.state === "ok" && (
          <p className="mt-3 text-xs text-success-700 dark:text-success-300">✓ Backup completed.</p>
        )}
        {backupNow.state === "error" && (
          <p className="mt-3 text-xs text-error-700 dark:text-error-300">✗ {backupNow.message}</p>
        )}
      </div>

      {/* ─── Restore (D-05 — destructive gate: type the DB name) ─── */}
      <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-800">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Restore</h3>
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
          Destructive — overwrites live data. Type the database name{" "}
          <code>{confirmationPhrase}</code> to enable Restore.
        </p>
        <div className="mt-3 space-y-3">
          {backups.length === 0 ? (
            <p className="text-xs text-gray-500 dark:text-gray-400">No past backups found.</p>
          ) : (
            <ul className="space-y-1">
              {backups.map((b) => (
                <li
                  key={b.key + b.destination}
                  className="flex items-center justify-between gap-2 text-xs text-gray-700 dark:text-gray-300"
                >
                  <code>{b.key}</code>
                  <span className="text-gray-400">[{b.destination}]</span>
                </li>
              ))}
            </ul>
          )}
          <div>
            <label className={LABEL_CLASS} htmlFor="restore-confirm">
              Type the database name to confirm restore
            </label>
            <input
              id="restore-confirm"
              type="text"
              autoComplete="off"
              className={INPUT_CLASS}
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={confirmationPhrase}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => handleRestore()}
              disabled={!restoreEnabled || restoreState.state === "running"}
              className="inline-flex items-center justify-center rounded-lg bg-error-500 px-4 py-2 text-xs font-medium text-white hover:bg-error-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {restoreState.state === "running" ? "Restoring…" : "Restore latest"}
            </button>
          </div>
          {restoreState.state === "ok" && (
            <p className="text-xs text-success-700 dark:text-success-300">✓ Restore completed.</p>
          )}
          {restoreState.state === "error" && (
            <p className="text-xs text-error-700 dark:text-error-300">✗ {restoreState.message}</p>
          )}
        </div>
      </div>

      {submitError && (
        <div className="rounded-lg border border-error-300 bg-error-50 p-3 text-sm text-error-700 dark:border-error-700 dark:bg-error-900/20 dark:text-error-300">
          {submitError}
        </div>
      )}
      {isSaved && (
        <div className="rounded-lg border border-success-300 bg-success-50 p-3 text-sm text-success-700 dark:border-success-700 dark:bg-success-900/20 dark:text-success-300">
          Backup settings saved.
        </div>
      )}

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={isSaving}
          className="inline-flex items-center justify-center rounded-lg bg-brand-500 px-5 py-3.5 text-sm font-medium text-white shadow-theme-xs hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isSaving ? "Saving…" : "Save backup settings"}
        </button>
      </div>
    </form>
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function Field({
  label,
  type = "text",
  placeholder,
  ...registerProps
}: {
  label: string;
  type?: string;
  placeholder?: string;
} & Record<string, unknown>) {
  // Associate label ↔ input via the RHF-registered name so getByLabelText resolves the field
  // (the label text alone is not enough without htmlFor/id — testing-library label association).
  const id = String(registerProps.name ?? label);
  return (
    <div>
      <label className={LABEL_CLASS} htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        type={type}
        placeholder={placeholder}
        className={INPUT_CLASS}
        {...(registerProps as Record<string, unknown>)}
      />
    </div>
  );
}
