"use client";
// src/app/(admin)/dashboard/media/MediaGrid.tsx
// [CITED: 04-02-PLAN.md Task 2 — D-12 grid + list toggle, D-15 warn don't block, D-27 optimistic delete]
// [CITED: 04-CONTEXT.md D-27 — media DELETE = optimistic; media UPLOAD = NOT optimistic]
// [CITED: CLAUDE.md hard rule — all image previews via next/image, NEVER raw <img>]
//
// Client component — owns the grid/list view toggle, the details drawer, the
// delete-confirm flow (warn-but-don't-block per D-15 via findMediaReferences),
// and embeds <MediaUploader> for drag-drop uploads. SSR-hydrated cache via
// initialData (TanStack Query SSR pattern — no refetch on mount).
//
// D-27: media delete IS optimistic (onMutate removes the row; onError rolls
// back; onSuccess invalidates ["media"]). Media upload is NOT optimistic
// (handled in MediaUploader — progress indicator communicates state).
//
// D-15: when findMediaReferences returns matches, the delete-confirm dialog
// shows "This image appears in N posts — deleting may orphan the CDN URL" but
// does NOT block the delete. The user can confirm anyway.
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { deleteMedia, findMediaReferences, listMedia } from "@/actions/media";
import Image from "next/image";
import MediaUploader from "./MediaUploader";
import { Modal } from "@/components/ui/modal";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableCell,
} from "@/components/ui/table";

export interface MediaRow {
  id: number;
  providerKey: string;
  provider?: string | null;
  altText?: string | null;
  mimeType?: string | null;
  width?: number | null;
  height?: number | null;
  sizeBytes?: number | null;
  createdAt?: Date | string | null;
  // The public URL is derived from the provider at upload time but not stored
  // as a column — the Server Component page.tsx doesn't pre-compute it. The
  // grid uses the provider's public-URL convention: /api/media/<providerKey>
  // for local, https://cdn.../... for R2. To stay loader-friendly and avoid
  // re-deriving here, we accept it as an optional precomputed field; if absent,
  // we fall back to the local /api/media/<key> path which the cdnImageLoader
  // resolves.
  publicUrl?: string;
}

interface MediaGridProps {
  initialMedia: MediaRow[];
}

type View = "grid" | "list";

// Resolve a row's preview URL. If the page.tsx pre-computed publicUrl, use it;
// otherwise fall back to the local provider's /api/media/<key> convention.
function resolvePublicUrl(row: MediaRow): string {
  if (row.publicUrl) return row.publicUrl;
  return `/api/media/${row.providerKey}`;
}

export default function MediaGrid({ initialMedia }: MediaGridProps) {
  const queryClient = useQueryClient();
  const queryKey = ["media"] as const;
  const [view, setView] = useState<View>("grid");
  const [selected, setSelected] = useState<MediaRow | null>(null);

  const { data: rows = initialMedia } = useQuery({
    queryKey,
    queryFn: async () => {
      const fresh = (await listMedia({ limit: 100 })) as MediaRow[];
      return fresh;
    },
    initialData: initialMedia,
    staleTime: 30_000,
  });

  // D-27 — media delete IS optimistic. onMutate removes the row from the cache
  // before the server confirms; onError rolls back; onSuccess invalidates.
  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteMedia(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<MediaRow[]>(queryKey);
      queryClient.setQueryData<MediaRow[]>(queryKey, (old = []) =>
        old.filter((row) => row.id !== id),
      );
      // Optimistically close the details drawer if it's showing this row.
      setSelected((sel) => (sel?.id === id ? null : sel));
      return { previous };
    },
    onError: (err, _id, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKey, context.previous);
      }
      // Surface the failure so the user understands why the row reappeared.
      window.alert(
        err instanceof Error
          ? `Delete failed: ${err.message}`
          : "Delete failed — row restored",
      );
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey });
    },
  });

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex overflow-hidden rounded-lg border border-gray-200 dark:border-gray-800">
          <button
            type="button"
            onClick={() => setView("grid")}
            className={`px-3 py-2 text-sm font-medium ${
              view === "grid"
                ? "bg-brand-500 text-white"
                : "bg-white text-gray-700 hover:bg-gray-50 dark:bg-gray-900 dark:text-gray-300"
            }`}
          >
            Grid
          </button>
          <button
            type="button"
            onClick={() => setView("list")}
            className={`px-3 py-2 text-sm font-medium ${
              view === "list"
                ? "bg-brand-500 text-white"
                : "bg-white text-gray-700 hover:bg-gray-50 dark:bg-gray-900 dark:text-gray-300"
            }`}
          >
            List
          </button>
        </div>
      </div>

      <div className="mb-6">
        <MediaUploader />
      </div>

      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500 dark:border-gray-700">
          No media uploaded yet. Drag files into the upload zone above to add your first media.
        </div>
      ) : view === "grid" ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {rows.map((row) => (
            <button
              key={row.id}
              type="button"
              onClick={() => setSelected(row)}
              className="group overflow-hidden rounded-lg border border-gray-200 bg-white text-left transition hover:border-brand-300 hover:shadow-theme-xs dark:border-gray-800 dark:bg-gray-900"
            >
              <div className="relative aspect-square w-full overflow-hidden bg-gray-100 dark:bg-gray-800">
                <Image
                  src={resolvePublicUrl(row)}
                  alt={row.altText || "media"}
                  fill
                  sizes="(max-width: 640px) 50vw, (max-width: 1024px) 25vw, 20vw"
                  className="object-cover transition group-hover:scale-105"
                />
              </div>
              <div className="p-2">
                <p className="truncate text-xs font-medium text-gray-700 dark:text-gray-300">
                  {row.altText || `#${row.id}`}
                </p>
                <p className="text-[10px] text-gray-500">{row.provider ?? "local"}</p>
              </div>
            </button>
          ))}
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-800">
          <Table>
            <TableHeader>
              <TableRow className="border-b border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-900/50">
                <TableCell isHeader className="px-3 py-3 text-left text-xs font-semibold uppercase text-gray-500">Preview</TableCell>
                <TableCell isHeader className="px-3 py-3 text-left text-xs font-semibold uppercase text-gray-500">Alt text</TableCell>
                <TableCell isHeader className="px-3 py-3 text-left text-xs font-semibold uppercase text-gray-500">Provider</TableCell>
                <TableCell isHeader className="px-3 py-3 text-left text-xs font-semibold uppercase text-gray-500">Uploaded</TableCell>
                <TableCell isHeader className="px-3 py-3 text-right text-xs font-semibold uppercase text-gray-500">Actions</TableCell>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id} className="border-b border-gray-100 last:border-0 dark:border-gray-800">
                  <TableCell className="px-3 py-3">
                    <div className="relative h-12 w-12 overflow-hidden rounded-md bg-gray-100 dark:bg-gray-800">
                      <Image
                        src={resolvePublicUrl(row)}
                        alt={row.altText || "media"}
                        fill
                        sizes="48px"
                        className="object-cover"
                      />
                    </div>
                  </TableCell>
                  <TableCell className="px-3 py-3 text-sm text-gray-800 dark:text-white/90">
                    {row.altText || <span className="italic text-gray-400">(no alt text)</span>}
                  </TableCell>
                  <TableCell className="px-3 py-3 text-sm text-gray-500">
                    {row.provider ?? "local"}
                  </TableCell>
                  <TableCell className="px-3 py-3 text-sm text-gray-500">
                    {row.createdAt
                      ? new Date(row.createdAt as string).toLocaleDateString()
                      : "—"}
                  </TableCell>
                  <TableCell className="px-3 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => setSelected(row)}
                      className="mr-3 text-sm font-medium text-brand-500 hover:text-brand-600"
                    >
                      Details
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelected(row)}
                      className="text-sm font-medium text-error-500 hover:text-error-600"
                    >
                      Delete
                    </button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {selected && (
        <MediaDetailsModal
          row={selected}
          onClose={() => setSelected(null)}
          onDelete={async (id) => {
            // D-15 — warn but don't block. findMediaReferences runs FIRST; if
            // matches exist, show a warning in the confirm dialog. The user can
            // still proceed.
            try {
              const refs = await findMediaReferences(id);
              const message =
                refs.posts.length > 0
                  ? `This image appears in ${refs.posts.length} post${
                      refs.posts.length === 1 ? "" : "s"
                    } (${refs.featureImageMatches} as feature image). Deleting may orphan the CDN URL. Proceed anyway?`
                  : `Delete this media item? This is a soft-delete (D-08).`;
              if (!window.confirm(message)) return;
            } catch {
              // If findMediaReferences fails (e.g. permissions), fall back to a
              // plain confirm — never block the delete on a warn-helper failure.
              if (!window.confirm("Delete this media item? (Reference check unavailable.)")) return;
            }
            deleteMutation.mutate(id);
            setSelected(null);
          }}
        />
      )}
    </div>
  );
}

interface MediaDetailsModalProps {
  row: MediaRow;
  onClose: () => void;
  onDelete: (id: number) => void | Promise<void>;
}

function MediaDetailsModal({ row, onClose, onDelete }: MediaDetailsModalProps) {
  return (
    <Modal isOpen onClose={onClose} className="max-w-xl p-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="relative aspect-square w-full overflow-hidden rounded-lg bg-gray-100 dark:bg-gray-800">
          <Image
            src={resolvePublicUrl(row)}
            alt={row.altText || "media"}
            fill
            sizes="(max-width: 640px) 100vw, 50vw"
            className="object-contain"
          />
        </div>
        <div className="space-y-2">
          <h4 className="text-sm font-semibold text-gray-800 dark:text-white/90">
            Media details
          </h4>
          <DetailRow label="ID" value={`#${row.id}`} />
          <DetailRow label="Provider" value={row.provider ?? "local"} />
          <DetailRow label="Provider key" value={row.providerKey} mono />
          <DetailRow label="Alt text" value={row.altText || "—"} />
          <DetailRow
            label="Dimensions"
            value={
              row.width && row.height ? `${row.width} × ${row.height}` : "—"
            }
          />
          <DetailRow
            label="Size"
            value={row.sizeBytes ? `${(row.sizeBytes / 1024).toFixed(1)} KB` : "—"}
          />
          <DetailRow
            label="MIME type"
            value={row.mimeType ?? "—"}
          />
          <DetailRow
            label="Uploaded"
            value={
              row.createdAt
                ? new Date(row.createdAt as string).toLocaleString()
                : "—"
            }
          />
          <div className="flex justify-end gap-3 pt-3">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center justify-center rounded-lg bg-white px-4 py-2 text-sm font-medium text-gray-700 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-400 dark:ring-gray-700"
            >
              Close
            </button>
            <button
              type="button"
              onClick={() => void onDelete(row.id)}
              className="inline-flex items-center justify-center rounded-lg bg-error-500 px-4 py-2 text-sm font-medium text-white hover:bg-error-600"
            >
              Delete
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

function DetailRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex justify-between gap-3 text-xs">
      <span className="font-medium text-gray-500">{label}</span>
      <span
        className={`text-right text-gray-800 dark:text-gray-200 ${
          mono ? "font-mono" : ""
        } truncate`}
        title={value}
      >
        {value}
      </span>
    </div>
  );
}
