// src/components/editor/extensions.ts
// [CITED: RESEARCH.md Pattern 1 (L352-419) — Tiptap v3 SSR round-trip single source of truth]
// [VERIFIED: @tiptap/*@3.27.1 npm registry — all extensions aligned to the same version]
// [CITED: .claude/CLAUDE.md verified version table — Tiptap is v3, NOT v2]
//
// THE single source of truth for the editor's extensions array. Imported by BOTH:
//   - src/components/editor/TiptapEditor.tsx  (client: useEditor({ extensions }))
//   - src/lib/post-render.ts                  (server: generateHTML(json, extensions))
//
// Diverging the two arrays silently drops nodes/marks on SSR (Pitfall #1 — the
// MEDIUM research flag). NEVER inline this array — always import `editorExtensions`
// from this file. The Wave-0 round-trip test
// (`src/components/editor/__tests__/round-trip.test.ts`) validates the parity
// before any rendering depends on it.
//
// Configuration notes (locked from 03-CONTEXT.md):
//   - D-01 Rich tier: StarterKit + Table (via TableKit) + Image + Link + CodeBlock
//   - D-04 CodeBlock WITHOUT lowlight (plain <pre><code>, no syntax highlighting)
//   - D-05 Manual links — autolink disabled; HTMLAttributes set target/rel defaults
//   - D-02 Embeds via raw-HTML paste — DOMPurify (lib/sanitize) gates iframe src.
//     No @tiptap/extension-youtube node — raw HTML in the doc serializes through
//     generateHTML and is then sanitized.
//
// Tiptap v3.27.1 specifics (verified at install):
//   - `@tiptap/extension-table` ships NAMED export `TableKit` (bundles Table +
//     TableRow + TableCell + TableHeader) — using TableKit avoids "tableRow
//     not found" schema-resolution errors. The default export is undefined.
//   - StarterKit bundles Link; to swap in our explicit Link config we disable
//     StarterKit's bundled link (`link: false`) and add the explicit Link below.
//     This avoids the "Duplicate extension names found: ['link']" warning.
//
// NO "use client" directive — this file MUST be importable from server code
// (generateHTML in lib/post-render.ts). All extensions here are pure ProseMirror
// schema definitions with no DOM access.
import StarterKit from "@tiptap/starter-kit";
import { TableKit } from "@tiptap/extension-table";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import CodeBlock from "@tiptap/extension-code-block";

export const editorExtensions = [
  StarterKit.configure({
    // D-04: replace StarterKit's lowlight-backed CodeBlock with the plain one below.
    codeBlock: false,
    // Disable StarterKit's bundled Link so our explicit Link.configure() below is
    // the only link extension (avoids the "Duplicate extension name: link" warning).
    link: false,
  }),
  // D-04 plain CodeBlock — no lowlight/highlighting, just <pre><code>.
  CodeBlock,
  // D-01 Rich tier — TableKit bundles Table + TableRow + TableCell + TableHeader.
  TableKit.configure({ resizable: true }),
  // D-01 Rich tier — image node (block-level, no base64 — body images are CDN/external).
  Image.configure({ inline: false, allowBase64: false }),
  // D-05 manual links — autolink disabled; target=_blank + anti-tabnabbing rel
  // are the defaults. DOMPurify preserves both attributes on render (Slice B).
  Link.configure({
    openOnClick: false,
    autolink: false,
    HTMLAttributes: { rel: "noopener noreferrer", target: "_blank" },
  }),
];
