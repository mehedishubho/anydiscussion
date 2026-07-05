"use client";
// src/components/dashboard/media/MediaPicker.tsx
// [CITED: 04-02-PLAN.md Task 3 — D-13 one reusable picker, 3 consumers]
// [CITED: .planning/todos/pending/2026-07-04-media-library-picker-ui.md — wiring points]
// [CITED: src/components/ui/modal/index.tsx — Modal shell (Escape + body-overflow lock)]
// [CITED: CLAUDE.md hard rule — all image previews via next/image, NEVER raw <img>]
//
// Reusable media picker modal consumed by:
//   (a) PostForm feature-image field — setValue('featureImage', url)
//   (b) editor Toolbar image button — editor.chain().focus().setImage({ src: url }).run()
//   (c) avatar field (Plan 04-03) — same component, no modifications needed
//
// Three tabs preserve Phase 3 D-10's external-URL path alongside the library
// browser and the upload-in-place flow:
//   1. Library — browse existing media (listMedia), click to select
//   2. Upload  — embed MediaUploader; auto-select on upload success
//   3. External URL — paste any URL (D-10 passthrough — server validates on use)
//
// State is local and self-contained. The picker does NOT close itself on
// select — the consumer's onSelect callback decides (close-on-select is the
// typical pattern, but the Toolbar leaves the picker open if needed).
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { listMedia } from "@/actions/media";
import { Modal } from "@/components/ui/modal";
import MediaUploader from "@/app/(admin)/dashboard/media/MediaUploader";
import Image from "next/image";

export interface MediaPickerProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (url: string) => void;
  /**
   * Restrict to a specific media category. Currently the schema only stores
   * images via the media table (any mime), so "image" and "any" behave the
   * same — but the prop is reserved for Plan 04-03's avatar field which may
   * want to filter by mime type.
   */
  accept?: "image" | "any";
}

type Tab = "library" | "upload" | "external";

const INPUT_CLASS =
  "h-11 w-full rounded-lg border appearance-none px-4 py-2.5 text-sm shadow-theme-xs placeholder:text-gray-400 focus:outline-hidden focus:ring-3 bg-transparent text-gray-800 border-gray-300 focus:border-brand-300 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:focus:border-brand-800";

interface MediaRow {
  id: number;
  providerKey: string;
  provider?: string | null;
  altText?: string | null;
  mimeType?: string | null;
}

// Resolve a row's public URL — mirrors MediaGrid's resolvePublicUrl.
function resolvePublicUrl(row: MediaRow): string {
  // The local provider convention: /api/media/<providerKey>. R2 rows would have
  // their CDN URL stored upstream; the picker uses the same convention as the
  // grid for consistency.
  return `/api/media/${row.providerKey}`;
}

export default function MediaPicker({
  isOpen,
  onClose,
  onSelect,
  accept = "image",
}: MediaPickerProps) {
  const [tab, setTab] = useState<Tab>("library");
  const [externalUrl, setExternalUrl] = useState("");
  const [externalError, setExternalError] = useState<string | null>(null);

  // Library list — fetched when the picker opens. Cached via the standard
  // ["media"] query key so it shares state with the /dashboard/media page.
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["media"],
    queryFn: async () => (await listMedia({ limit: 100 })) as MediaRow[],
    enabled: isOpen,
    staleTime: 30_000,
  });

  const pickRow = (row: MediaRow) => {
    onSelect(resolvePublicUrl(row));
  };

  const submitExternal = () => {
    const trimmed = externalUrl.trim();
    if (!trimmed) {
      setExternalError("URL is required");
      return;
    }
    // Basic URL shape validation — no fetch (the server validates on actual use,
    // e.g. next/image remotePatterns allows the hostname OR the URL is consumed
    // as-is in the editor body). T-04-07 disposition: accept (low severity).
    try {
      // eslint-disable-next-line no-new
      new URL(trimmed);
    } catch {
      setExternalError("Enter a valid http(s):// URL");
      return;
    }
    setExternalError(null);
    onSelect(trimmed);
  };

  const tabs: { id: Tab; label: string }[] = [
    { id: "library", label: "Library" },
    { id: "upload", label: "Upload" },
    { id: "external", label: "External URL" },
  ];

  return (
    <Modal isOpen={isOpen} onClose={onClose} className="max-w-3xl p-6">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">
            Select media
          </h3>
          <span className="text-xs text-gray-500">
            {accept === "image" ? "Images only" : "Any media"}
          </span>
        </div>

        <div className="inline-flex overflow-hidden rounded-lg border border-gray-200 dark:border-gray-800">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`px-4 py-2 text-sm font-medium ${
                tab === t.id
                  ? "bg-brand-500 text-white"
                  : "bg-white text-gray-700 hover:bg-gray-50 dark:bg-gray-900 dark:text-gray-300"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === "library" && (
          <div>
            {isLoading ? (
              <p className="rounded-lg border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500 dark:border-gray-700">
                Loading library…
              </p>
            ) : rows.length === 0 ? (
              <p className="rounded-lg border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500 dark:border-gray-700">
                No media yet. Switch to <span className="font-medium">Upload</span> to add some.
              </p>
            ) : (
              <div className="grid max-h-[60vh] grid-cols-2 gap-3 overflow-y-auto sm:grid-cols-3 md:grid-cols-4">
                {rows.map((row) => (
                  <button
                    key={row.id}
                    type="button"
                    onClick={() => pickRow(row)}
                    className="group overflow-hidden rounded-lg border border-gray-200 bg-white text-left transition hover:border-brand-300 hover:shadow-theme-xs dark:border-gray-800 dark:bg-gray-900"
                  >
                    <div className="relative aspect-square w-full overflow-hidden bg-gray-100 dark:bg-gray-800">
                      <Image
                        src={resolvePublicUrl(row)}
                        alt={row.altText || "media"}
                        fill
                        sizes="(max-width: 640px) 50vw, 25vw"
                        className="object-cover transition group-hover:scale-105"
                      />
                    </div>
                    <div className="p-2">
                      <p className="truncate text-xs font-medium text-gray-700 dark:text-gray-300">
                        {row.altText || `#${row.id}`}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === "upload" && (
          <MediaUploader
            compact
            onUploaded={(media) => {
              // Auto-select on upload success — the consumer's onSelect handles
              // closing (typical pattern) or leaves the picker open (Toolbar).
              onSelect(media.publicUrl);
            }}
          />
        )}

        {tab === "external" && (
          <div className="space-y-3">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Paste any image URL (CDN, external site). The URL is stored as-is and
              validated on use (D-10 — library-OR-external).
            </p>
            <div className="flex items-center gap-2">
              <input
                type="url"
                value={externalUrl}
                onChange={(e) => setExternalUrl(e.target.value)}
                placeholder="https://example.com/image.png"
                className={INPUT_CLASS}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    submitExternal();
                  }
                }}
              />
              <button
                type="button"
                onClick={submitExternal}
                className="inline-flex shrink-0 items-center justify-center rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-600"
              >
                Use this URL
              </button>
            </div>
            {externalError && (
              <p className="text-xs text-error-500">{externalError}</p>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
