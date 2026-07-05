"use client";
// src/app/(admin)/posts/components/PreviewLink.tsx
// [CITED: 03-CONTEXT.md D-18 (author-own + editor/admin generate), D-19 (no-expiry,
//  rotates on publish, manual rotate/revoke)]
// [CITED: 03-04-PLAN.md Task 3 Step B — Generate/Regenerate/Revoke UI]
//
// Draft preview link manager. Calls rotatePreviewToken (generate/regenerate) and
// revokePreviewToken (revoke) Server Actions from posts.ts. Both actions call
// assertOwnsPost FIRST (Pitfall #1 — author-own or editor/admin).
//
// D-19 lifecycle: the token has no expiry. It rotates on publish (publishPost calls
// rotatePreviewToken automatically) and can be manually rotated or revoked here.
// The /preview/[token] route returns 404 (not 403) for missing/revoked tokens —
// no existence leak (T-03-19).
import { useState } from "react";
import { rotatePreviewToken, revokePreviewToken } from "@/actions/posts";

interface PreviewLinkProps {
  postId: number;
  previewToken: string | null;
}

export default function PreviewLink({ postId, previewToken }: PreviewLinkProps) {
  const [token, setToken] = useState<string | null>(previewToken);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleGenerate = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await rotatePreviewToken(postId);
      setToken(result.token);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to generate preview link");
    } finally {
      setBusy(false);
    }
  };

  const handleRevoke = async () => {
    setBusy(true);
    setError(null);
    try {
      await revokePreviewToken(postId);
      setToken(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to revoke preview link");
    } finally {
      setBusy(false);
    }
  };

  const handleCopy = async () => {
    if (!token) return;
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const url = `${origin}/preview/${token}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard may be blocked — the URL is still visible for manual copy.
    }
  };

  if (!token) {
    return (
      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
          Preview link
        </label>
        <button
          type="button"
          onClick={handleGenerate}
          disabled={busy}
          className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
        >
          {busy ? "Generating…" : "Generate preview link"}
        </button>
        {error && <p className="text-xs text-red-500">{error}</p>}
      </div>
    );
  }

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const previewUrl = `${origin}/preview/${token}`;

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
        Preview link
      </label>
      <div className="flex items-center gap-2">
        <input
          type="text"
          readOnly
          value={previewUrl}
          className="h-9 flex-1 rounded-lg border border-gray-300 bg-gray-50 px-3 py-1.5 text-xs text-gray-600 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400"
          onFocus={(e) => e.target.select()}
        />
        <button
          type="button"
          onClick={handleCopy}
          className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 transition hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
        >
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleGenerate}
          disabled={busy}
          className="text-xs font-medium text-brand-500 hover:text-brand-600 disabled:opacity-50"
        >
          {busy ? "Working…" : "Regenerate"}
        </button>
        <button
          type="button"
          onClick={handleRevoke}
          disabled={busy}
          className="text-xs font-medium text-red-500 hover:text-red-600 disabled:opacity-50"
        >
          Revoke
        </button>
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-400">
        Link rotates on publish.
      </p>
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}
