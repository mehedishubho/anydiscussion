"use client";
// src/app/(admin)/dashboard/media/MediaUploader.tsx
// [CITED: 04-02-PLAN.md Task 2 — D-14 drag-drop + multi-file + progress + alt-text + 10MB cap]
// [CITED: 04-CONTEXT.md D-27 — media upload is NOT optimistic; progress indicator communicates state]
// [CITED: src/actions/media-schema.ts — MEDIA_MAX_SIZE_BYTES = 10MB (D-08)]
// [CITED: CLAUDE.md hard rule — never raw <img>; previews via next/image]
//
// Drag-drop multi-file uploader. react-dropzone@14.3.8 already installed (Plan
// 04-01 — no new dep). Each file gets its own useMutation (per-file state —
// pending/success/error — IS the progress indicator). Alt-text is prompted via
// an inline input on each file row BEFORE the upload commit (cleaner than a
// modal-after-upload because the user can set it per file in batch).
//
// D-27 explicit: NOT optimistic. The progress bar (per-file isPending) IS the
// state communication — adding optimistic on top would race with upload progress.
//
// D-08 cap: enforced BOTH client-side (dropzone maxSize) AND server-side
// (mediaUploadSchema in actions/media.ts) — defense in depth (T-04-06).
import { useState, useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useDropzone, type FileRejection } from "react-dropzone";
import { uploadMedia } from "@/actions/media";
import { MEDIA_MAX_SIZE_BYTES } from "@/actions/media-schema";
import Image from "next/image";

interface MediaUploaderProps {
  /** Optional callback — used by <MediaPicker>'s "Upload" tab to auto-select. */
  onUploaded?: (media: { id: number; publicUrl: string }) => void;
  /** When true, hides the surrounding card chrome (used inside the picker modal). */
  compact?: boolean;
}

type FileStatus = "ready" | "uploading" | "success" | "error";

interface FileItem {
  id: string; // stable React key
  file: File;
  altText: string;
  status: FileStatus;
  errorMessage?: string;
  result?: { id: number; publicUrl: string };
  previewUrl?: string;
}

const INPUT_CLASS =
  "h-9 w-full rounded-lg border appearance-none px-3 py-2 text-sm shadow-theme-xs placeholder:text-gray-400 focus:outline-hidden focus:ring-3 bg-transparent text-gray-800 border-gray-300 focus:border-brand-300 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:focus:border-brand-800";

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export default function MediaUploader({ onUploaded, compact }: MediaUploaderProps) {
  const queryClient = useQueryClient();
  const [items, setItems] = useState<FileItem[]>([]);

  // Single mutation reused per file. mutationFn captures the FileItem via the
  // `vars` so we can drive per-file status updates from the surrounding setItems.
  const uploadMutation = useMutation({
    mutationFn: async (vars: { id: string; file: File; altText: string }) => {
      return uploadMedia({ file: vars.file, altText: vars.altText });
    },
    onSuccess: (data, vars) => {
      setItems((prev) =>
        prev.map((it) =>
          it.id === vars.id
            ? {
                ...it,
                status: "success",
                result: { id: data.id, publicUrl: data.publicUrl },
              }
            : it,
        ),
      );
      // Invalidate ["media"] so the library grid/list refreshes.
      void queryClient.invalidateQueries({ queryKey: ["media"] });
      if (onUploaded) onUploaded({ id: data.id, publicUrl: data.publicUrl });
    },
    onError: (err, vars) => {
      setItems((prev) =>
        prev.map((it) =>
          it.id === vars.id
            ? {
                ...it,
                status: "error",
                errorMessage:
                  err instanceof Error ? err.message : "Upload failed",
              }
            : it,
        ),
      );
    },
  });

  const onDrop = useCallback(
    (accepted: File[], rejected: FileRejection[]) => {
      const newItems: FileItem[] = accepted.map((file) => ({
        id: `${file.name}-${file.size}-${file.lastModified}-${Math.random()
          .toString(36)
          .slice(2, 8)}`,
        file,
        altText: "",
        status: "ready" as const,
        previewUrl: file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined,
      }));
      const rejectedItems: FileItem[] = rejected.map((r) => ({
        id: `${r.file.name}-${r.file.size}-${r.file.lastModified}-rej-${Math.random()
          .toString(36)
          .slice(2, 8)}`,
        file: r.file,
        altText: "",
        status: "error" as const,
        errorMessage:
          r.errors[0]?.code === "file-too-large"
            ? `File exceeds ${formatBytes(MEDIA_MAX_SIZE_BYTES)} (D-08)`
            : r.errors[0]?.message ?? "Rejected",
      }));
      setItems((prev) => [...prev, ...newItems, ...rejectedItems]);
    },
    [],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: { "image/*": [] },
    maxSize: MEDIA_MAX_SIZE_BYTES,
    multiple: true,
    onDrop,
  });

  const setAltText = (id: string, altText: string) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, altText } : it)));
  };

  const startUpload = (id: string) => {
    const item = items.find((it) => it.id === id);
    if (!item) return;
    setItems((prev) =>
      prev.map((it) => (it.id === id ? { ...it, status: "uploading" } : it)),
    );
    uploadMutation.mutate({ id, file: item.file, altText: item.altText });
  };

  const removeItem = (id: string) => {
    setItems((prev) => {
      const item = prev.find((it) => it.id === id);
      if (item?.previewUrl) URL.revokeObjectURL(item.previewUrl);
      return prev.filter((it) => it.id !== id);
    });
  };

  return (
    <div className={compact ? "" : "rounded-xl border border-gray-200 p-4 dark:border-gray-800"}>
      {!compact && (
        <h4 className="mb-3 text-sm font-semibold text-gray-800 dark:text-white/90">Upload</h4>
      )}

      <div
        {...getRootProps()}
        className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-6 text-center transition ${
          isDragActive
            ? "border-brand-400 bg-brand-50 dark:bg-brand-900/20"
            : "border-gray-300 hover:border-brand-300 dark:border-gray-700 dark:hover:border-brand-700"
        }`}
      >
        <input {...getInputProps()} />
        <svg
          className="mb-2 h-8 w-8 text-gray-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M7 16a4 4 0 01-.88-7.9A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
          />
        </svg>
        <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
          {isDragActive ? "Drop files to upload" : "Drag & drop images here, or click to select"}
        </p>
        <p className="mt-1 text-xs text-gray-500">
          Images only · max {formatBytes(MEDIA_MAX_SIZE_BYTES)} per file (D-08)
        </p>
      </div>

      {items.length > 0 && (
        <ul className="mt-4 space-y-3">
          {items.map((item) => (
            <li
              key={item.id}
              className="rounded-lg border border-gray-200 p-3 dark:border-gray-800"
            >
              <div className="flex items-start gap-3">
                {item.previewUrl ? (
                  <Image
                    src={item.previewUrl}
                    alt={item.altText || "preview"}
                    width={48}
                    height={48}
                    unoptimized
                    className="h-12 w-12 rounded-md object-cover"
                  />
                ) : (
                  <div className="flex h-12 w-12 items-center justify-center rounded-md bg-gray-100 text-gray-400 dark:bg-gray-800">
                    {item.file.type.split("/")[0] === "image" ? "🖼" : "📄"}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-gray-800 dark:text-white/90">
                    {item.file.name}
                  </p>
                  <p className="text-xs text-gray-500">{formatBytes(item.file.size)}</p>
                </div>
                <button
                  type="button"
                  onClick={() => removeItem(item.id)}
                  className="text-xs text-gray-400 hover:text-error-500"
                  aria-label="Remove"
                >
                  ✕
                </button>
              </div>

              {item.status === "ready" && (
                <div className="mt-3 flex items-center gap-2">
                  <input
                    type="text"
                    value={item.altText}
                    onChange={(e) => setAltText(item.id, e.target.value)}
                    placeholder="Alt text (recommended for accessibility)"
                    className={INPUT_CLASS}
                  />
                  <button
                    type="button"
                    onClick={() => startUpload(item.id)}
                    className="inline-flex shrink-0 items-center justify-center rounded-lg bg-brand-500 px-3 py-2 text-sm font-medium text-white hover:bg-brand-600"
                  >
                    Upload
                  </button>
                </div>
              )}

              {item.status === "uploading" && (
                <div className="mt-3">
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-800">
                    <div className="h-full w-1/2 animate-pulse rounded-full bg-brand-500" />
                  </div>
                  <p className="mt-1 text-xs text-gray-500">Uploading…</p>
                </div>
              )}

              {item.status === "success" && (
                <p className="mt-2 text-xs font-medium text-success-600 dark:text-success-400">
                  ✓ Uploaded
                </p>
              )}

              {item.status === "error" && (
                <p className="mt-2 text-xs font-medium text-error-500">
                  ✕ {item.errorMessage}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
