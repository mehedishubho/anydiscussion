"use client";
// src/app/(admin)/dashboard/settings/storage/StorageSettingsForm.tsx
// [CITED: 04-CONTEXT.md D-23 (admin-only), D-24 (Test connection), D-25 (redact-on-read)]
// [CITED: 04-RESEARCH.md Pitfall 7 (lines 533-537) — secret fields never pre-filled]
// [CITED: src/app/(admin)/dashboard/posts/PostForm.tsx — RHF + Zod + useMutation baseline]
// [CITED: src/app/(admin)/dashboard/posts/schema-client.ts — schema-bridge pattern]
//
// The Storage Settings client form. RHF + Zod for validation; TanStack useMutation
// for the save (NOT optimistic per D-27 — credentials are high-stakes; the server
// confirms before the UI flips to "saved"). Each provider section has its own
// "Test connection" button (D-24) that runs testStorageConnection + renders inline
// ok/error feedback before Save.
//
// Pitfall 7: secret fields (api_secret, secretAccessKey, api_key) default to ''
// (NEVER pre-filled — even though getStorageSettings returns redacted values, the
// form uses placeholder text + visible empty state to make this contract visible).
// Non-secret fields (bucket, cloud_name, region, endpoint, cdnBaseUrl) ARE
// pre-filled from getStorageSettings.
//
// Each provider section is conditionally rendered — only the active provider's
// section is visible (cleaner UX than four stacked sections; the admin focuses on
// one provider at a time). Selecting a different provider flips the section.
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useMutation } from "@tanstack/react-query";
import {
  storageSettingsSchema,
  zodResolver,
  PROVIDER_NAMES,
  type StorageSettingsInput,
} from "./schema-client";
import { saveStorageSettings, testStorageConnection } from "@/actions/storage-settings";

const INPUT_CLASS =
  "h-11 w-full rounded-lg border appearance-none px-4 py-2.5 text-sm shadow-theme-xs placeholder:text-gray-400 focus:outline-hidden focus:ring-3 bg-transparent text-gray-800 border-gray-300 focus:border-brand-300 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:focus:border-brand-800";

const LABEL_CLASS =
  "mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400";

interface StorageSettingsFormProps {
  /** Initial settings from getStorageSettings (redacted). */
  initial: {
    activeProvider: string;
    cloudinary?: Record<string, unknown>;
    r2?: Record<string, unknown>;
    push_cdn?: Record<string, unknown>;
  };
}

type ProbeStatus =
  | { state: "idle" }
  | { state: "probing" }
  | { state: "ok" }
  | { state: "error"; message: string };

export default function StorageSettingsForm({ initial }: StorageSettingsFormProps) {
  const [probe, setProbe] = useState<Record<string, ProbeStatus>>({});

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    getValues,
    formState: { errors },
  } = useForm<StorageSettingsInput>({
    resolver: zodResolver(storageSettingsSchema),
    defaultValues: {
      activeProvider: (initial.activeProvider as StorageSettingsInput["activeProvider"]) ?? "local",
      // Pre-fill non-secret fields from initial; secret fields stay empty (Pitfall 7).
      cloudinary: {
        cloud_name: String(initial.cloudinary?.cloud_name ?? ""),
        api_key: "", // Pitfall 7 — never pre-filled
        api_secret: "", // Pitfall 7 — never pre-filled
      },
      r2: {
        endpoint: String(initial.r2?.endpoint ?? ""),
        region: String(initial.r2?.region ?? "auto"),
        accessKeyId: String(initial.r2?.accessKeyId ?? ""),
        secretAccessKey: "", // Pitfall 7 — never pre-filled
        bucket: String(initial.r2?.bucket ?? ""),
        forcePathStyle: Boolean(initial.r2?.forcePathStyle ?? true),
      },
      push_cdn: {
        endpoint: String(initial.push_cdn?.endpoint ?? ""),
        region: String(initial.push_cdn?.region ?? "us-east-1"),
        accessKeyId: String(initial.push_cdn?.accessKeyId ?? ""),
        secretAccessKey: "", // Pitfall 7 — never pre-filled
        bucket: String(initial.push_cdn?.bucket ?? ""),
        cdnBaseUrl: String(initial.push_cdn?.cdnBaseUrl ?? ""),
        forcePathStyle: Boolean(initial.push_cdn?.forcePathStyle ?? false),
      },
    },
  });

  const activeProvider = watch("activeProvider");

  // D-27 — NOT optimistic. High-stakes mutation (credentials); server confirms.
  const mutation = useMutation({
    mutationFn: (values: StorageSettingsInput) =>
      saveStorageSettings(values as Parameters<typeof saveStorageSettings>[0]),
  });

  const onValid = (values: StorageSettingsInput) => {
    mutation.mutate(values);
  };

  // D-24 — Test connection probe. Reads the active provider's current form values
  // + runs testStorageConnection; surfaces inline ok/error feedback.
  const handleTest = async (provider: string) => {
    setProbe((p) => ({ ...p, [provider]: { state: "probing" } }));
    try {
      const values = getValues();
      let creds: Record<string, unknown> = {};
      if (provider === "cloudinary") creds = values.cloudinary ?? {};
      if (provider === "r2") creds = values.r2 ?? {};
      if (provider === "push-cdn") creds = values.push_cdn ?? {};
      const result = await testStorageConnection(provider, creds);
      setProbe((p) => ({
        ...p,
        [provider]: result.ok
          ? { state: "ok" }
          : { state: "error", message: result.error ?? "Unknown error" },
      }));
    } catch (e) {
      setProbe((p) => ({
        ...p,
        [provider]: {
          state: "error",
          message: e instanceof Error ? e.message : String(e),
        },
      }));
    }
  };

  const submitError = mutation.error?.message ?? null;
  const isSaving = mutation.isPending;
  const isSaved = mutation.isSuccess;

  return (
    <form onSubmit={handleSubmit(onValid)} className="space-y-6">
      {/* Active provider selector */}
      <div>
        <label htmlFor="activeProvider" className={LABEL_CLASS}>
          Active image destination
        </label>
        <select
          id="activeProvider"
          {...register("activeProvider")}
          className={INPUT_CLASS}
        >
          {PROVIDER_NAMES.map((p) => (
            <option key={p} value={p}>
              {p === "local"
                ? "Local filesystem (default)"
                : p === "r2"
                  ? "Cloudflare R2"
                  : p === "cloudinary"
                    ? "Cloudinary"
                    : "Push-CDN (S3-compatible origin + CDN overlay)"}
            </option>
          ))}
        </select>
        <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
          Uploads route through the selected provider. Local is the default-safe
          fallback when other providers are unconfigured.
        </p>
      </div>

      {/* Conditional per-provider section — only the active provider is visible */}
      {activeProvider === "cloudinary" && (
        <ProviderSection
          title="Cloudinary credentials"
          help="Cloudinary owns image transforms at delivery time. The api_key + api_secret are required to upload; the cloud_name is your account identifier."
          onTest={() => handleTest("cloudinary")}
          probe={probe.cloudinary ?? { state: "idle" }}
        >
          <Field label="Cloud name" {...register("cloudinary.cloud_name")} placeholder="my-cloud" />
          <Field
            label="API key"
            type="password"
            {...register("cloudinary.api_key")}
            placeholder="•••••••• (enter new value to change)"
          />
          <Field
            label="API secret"
            type="password"
            {...register("cloudinary.api_secret")}
            placeholder="•••••••• (enter new value to change)"
          />
        </ProviderSection>
      )}

      {activeProvider === "r2" && (
        <ProviderSection
          title="Cloudflare R2 credentials"
          help="R2 is itself a CDN (Cloudflare's edge). Images served via ${NEXT_PUBLIC_CDN_URL}/<key>."
          onTest={() => handleTest("r2")}
          probe={probe.r2 ?? { state: "idle" }}
        >
          <Field label="Endpoint" {...register("r2.endpoint")} placeholder="https://<account>.r2.cloudflarestorage.com" />
          <Field label="Region" {...register("r2.region")} placeholder="auto" />
          <Field label="Access key ID" {...register("r2.accessKeyId")} placeholder="AKIA..." />
          <Field
            label="Secret access key"
            type="password"
            {...register("r2.secretAccessKey")}
            placeholder="•••••••• (enter new value to change)"
          />
          <Field label="Bucket" {...register("r2.bucket")} placeholder="anydiscussion-media" />
          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
            <input type="checkbox" {...register("r2.forcePathStyle")} />
            Force path-style addressing (MinIO: yes; R2: usually no)
          </label>
        </ProviderSection>
      )}

      {activeProvider === "push-cdn" && (
        <ProviderSection
          title="Push-CDN credentials (S3-compatible origin + CDN overlay)"
          help="Origin is any S3-compatible storage (Bunny/KeyCDN/Wasabi/DO Spaces). Images are uploaded to the origin + served via the configured cdnBaseUrl. NOTE: also add the CDN hostname to next.config.ts images.remotePatterns — next/image 400s on unknown hostnames."
          onTest={() => handleTest("push-cdn")}
          probe={probe["push-cdn"] ?? { state: "idle" }}
        >
          <Field label="Origin endpoint" {...register("push_cdn.endpoint")} placeholder="https://origin.example.com" />
          <Field label="Region" {...register("push_cdn.region")} placeholder="us-east-1" />
          <Field label="Access key ID" {...register("push_cdn.accessKeyId")} placeholder="AKIA..." />
          <Field
            label="Secret access key"
            type="password"
            {...register("push_cdn.secretAccessKey")}
            placeholder="•••••••• (enter new value to change)"
          />
          <Field label="Bucket" {...register("push_cdn.bucket")} placeholder="media-origin" />
          <Field
            label="CDN base URL"
            {...register("push_cdn.cdnBaseUrl")}
            placeholder="https://cdn.example.com"
          />
          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
            <input type="checkbox" {...register("push_cdn.forcePathStyle")} />
            Force path-style addressing
          </label>
        </ProviderSection>
      )}

      {activeProvider === "local" && (
        <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-800">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
            Local filesystem
          </h3>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Files are written to <code>storage/local/</code> and served via the{" "}
            <code>/api/media</code> Route Handler. No credentials required.
          </p>
        </div>
      )}

      {submitError && (
        <div className="rounded-lg border border-error-300 bg-error-50 p-3 text-sm text-error-700 dark:border-error-700 dark:bg-error-900/20 dark:text-error-300">
          {submitError}
        </div>
      )}
      {isSaved && (
        <div className="rounded-lg border border-success-300 bg-success-50 p-3 text-sm text-success-700 dark:border-success-700 dark:bg-success-900/20 dark:text-success-300">
          Storage settings saved.
        </div>
      )}

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={isSaving}
          className="inline-flex items-center justify-center rounded-lg bg-brand-500 px-5 py-3.5 text-sm font-medium text-white shadow-theme-xs hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isSaving ? "Saving…" : "Save storage settings"}
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
  return (
    <div>
      <label className={LABEL_CLASS}>{label}</label>
      <input
        type={type}
        placeholder={placeholder}
        className={INPUT_CLASS}
        {...(registerProps as Record<string, unknown>)}
      />
    </div>
  );
}

function ProviderSection({
  title,
  help,
  onTest,
  probe,
  children,
}: {
  title: string;
  help: string;
  onTest: () => void;
  probe: ProbeStatus;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-gray-200 p-4 dark:border-gray-800">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
            {title}
          </h3>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{help}</p>
        </div>
        <button
          type="button"
          onClick={onTest}
          disabled={probe.state === "probing"}
          className="shrink-0 rounded-lg bg-white px-3 py-2 text-xs font-medium text-gray-700 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 disabled:opacity-50 dark:bg-gray-800 dark:text-gray-400 dark:ring-gray-700"
        >
          {probe.state === "probing" ? "Testing…" : "Test connection"}
        </button>
      </div>
      <div className="space-y-4">{children}</div>
      {probe.state === "ok" && (
        <p className="mt-3 text-xs text-success-700 dark:text-success-300">
          ✓ Connection successful.
        </p>
      )}
      {probe.state === "error" && (
        <p className="mt-3 text-xs text-error-700 dark:text-error-300">
          ✗ {probe.message}
        </p>
      )}
    </div>
  );
}
