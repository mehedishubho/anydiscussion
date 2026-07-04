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
import PostForm from "../PostForm";
import PageBreadcrumb from "@/components/common/PageBreadCrumb";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "New Post | Any Discussion",
};

export default function NewPostPage() {
  return (
    <div>
      <PageBreadcrumb pageTitle="New Post" />
      <div className="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-white/[0.03] lg:p-6">
        <h3 className="mb-5 text-lg font-semibold text-gray-800 dark:text-white/90">
          Create a new post
        </h3>
        <PostForm />
      </div>
    </div>
  );
}
