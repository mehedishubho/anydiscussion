// src/components/site/ShareButtons.tsx
// [CITED: 06-03-PLAN.md Task 3 — ShareButtons client island (D-14 share + read-progress)]
// [CITED: 06-RESEARCH.md — minimal client JS; anchor tags with pre-built hrefs (no onClick for share)]
//
// Share buttons for the single-post meta row. Most targets are plain anchor
// tags with pre-built hrefs (progressive enhancement — work without JS). Only
// the copy-link button needs onClick (navigator.clipboard).
//
// Uses window.location.href + encodeURIComponent. Server-safe initial render:
// the hrefs are built client-side after mount to avoid SSR/client mismatch
// (window is undefined on server), and the share-target hrefs start as "#" and
// are populated by useState after mount.
//
// Route-group isolation: does NOT import from (admin) or ThemeContext (D-13).

"use client";

import { useEffect, useState } from "react";

interface ShareButtonsProps {
  /** Post slug — used to construct the share URL from window.location.origin. */
  slug: string;
  /** Post title — used in the share text/title parameter. */
  title: string;
}

/**
 * ShareButtons — X (Twitter), Facebook, LinkedIn, copy-link.
 *
 * @param slug  - the post slug (combined with origin to build the share URL)
 * @param title - the post title (used in the share text)
 *
 * Progressive enhancement: the share-target anchors are real <a> tags (work
 * with JS disabled). The copy-link button requires JS (degrades gracefully —
 * it just doesn't render its "Copied!" state).
 */
export default function ShareButtons({ slug, title }: ShareButtonsProps) {
  // Avoid SSR/client hydration mismatch — build the share hrefs after mount.
  const [shareUrl, setShareUrl] = useState<string>("");
  const [copied, setCopied] = useState<boolean>(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setShareUrl(`${window.location.origin}/blog/${slug}`);
  }, [slug]);

  // Pre-build the share URLs once shareUrl resolves.
  const encodedUrl = encodeURIComponent(shareUrl);
  const encodedTitle = encodeURIComponent(title);
  const twitterHref = shareUrl
    ? `https://twitter.com/intent/tweet?url=${encodedUrl}&text=${encodedTitle}`
    : "#";
  const facebookHref = shareUrl
    ? `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`
    : "#";
  const linkedInHref = shareUrl
    ? `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`
    : "#";

  const handleCopy = async () => {
    if (typeof navigator === "undefined" || !navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      // Brief visual feedback; reset after 2 seconds.
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Silent fail — clipboard may be unavailable (permissions, non-secure context).
    }
  };

  const linkClass =
    "inline-flex items-center justify-center rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 shadow-sm transition hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700";

  return (
    <div className="flex items-center gap-2" aria-label="Share this post">
      <a
        href={twitterHref}
        target="_blank"
        rel="noopener noreferrer"
        className={linkClass}
        aria-label="Share on X (Twitter)"
      >
        X
      </a>
      <a
        href={facebookHref}
        target="_blank"
        rel="noopener noreferrer"
        className={linkClass}
        aria-label="Share on Facebook"
      >
        Facebook
      </a>
      <a
        href={linkedInHref}
        target="_blank"
        rel="noopener noreferrer"
        className={linkClass}
        aria-label="Share on LinkedIn"
      >
        LinkedIn
      </a>
      <button
        type="button"
        onClick={handleCopy}
        className={linkClass}
        aria-label="Copy link to clipboard"
      >
        {copied ? "Copied!" : "Copy link"}
      </button>
    </div>
  );
}
