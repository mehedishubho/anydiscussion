// src/app/(admin)/posts/new/page.tsx
// [CITED: PATTERNS.md rows — form-elements/page.tsx + profile/page.tsx analogs]
// [CITED: 03-CONTEXT.md D-24 — TailAdmin-quality post editor built into the (admin) shell]
// [CITED: RESEARCH.md L836-847 — lazy-load boundary via next/dynamic({ssr:false})]
//
// Server Component shell. Renders the TailAdmin form chrome (AppSidebar/AppHeader
// via (admin)/layout.tsx) + the PostForm client component which wires RHF+Zod
// + the lazy-loaded Tiptap editor. The editor's JS never enters the (site)
// bundle: the dynamic({ssr:false}) import is the runtime guard, ESLint
// no-restricted-imports is the static guard (PERF-02 prep).
//
// 05-06: reads the session to pass the viewer's role into PostForm for the
// UX-ONLY Publish / Submit-for-review button gating (UAT gap 1 publish half).
import PostForm from "../PostForm";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import { getSession } from "@/lib/auth/server";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "New Post | Any Discussion",
};

// Page-scope instant-navigation opt-out (260826-oif): this page's top-level
// uncached awaits (getSession — a headers() call via the auth Server Action)
// sit below every effective <Suspense> boundary on client navigations between
// /dashboard segments — the (admin) layout's own opt-out does not cover
// sibling navigations (installed instant-navigation.md). Allowed-to-block is
// correct for session-gated content; a static shell buys nothing.
export const instant = false;

export default async function NewPostPage() {
  // The (admin) layout's AuthGate already redirected unauthenticated users,
  // so the session is present here; the Server Actions re-check every
  // capability regardless (Pitfall #1 — UI gating is never authoritative).
  const session = await getSession();
  const role =
    (session?.user.role as "admin" | "editor" | "author" | null) ?? undefined;

  return (
    <div>
      <PageBreadcrumb pageTitle="New Post" />
      <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] lg:p-6">
        <h3 className="mb-5 text-lg font-semibold text-gray-800 dark:text-white/90">
          Create a new post
        </h3>
        <PostForm role={role} />
      </div>
    </div>
  );
}
