// src/app/(site)/blog/[slug]/page.tsx
//
// 260828-blog-url: STUB. The single-post route moved to
// /blog/[category]/[slug]/page.tsx. This file remains ONLY so that the legacy
// /blog/{slug} URL shape doesn't accidentally resolve to a broken page in
// environments where the redirects table is empty (e.g. a fresh dev DB before
// the backfill script runs). src/proxy.ts fires the redirects-table lookup
// BEFORE routing, so a populated redirects table will return a real HTTP 308
// for /blog/{slug} -> /blog/{category}/{slug} and this stub never executes. If
// the redirects table IS empty AND a request reaches this route, it 404s
// cleanly (the proxy falls through and the legacy segment never matches
// /blog/[category]/[slug]).
import { notFound } from "next/navigation";

export default function LegacyBlogPostPage(): never {
  notFound();
}