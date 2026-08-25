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
//   - UAT 05 gap 1 (05-05): TextAlign limited to heading + paragraph (the toolbar
//     align surface) — alignment renders as an inline text-align style that must
//     survive generateHTML AND sanitizeBeforeRender (round-trip tests pin this).
//   - UAT 05 gap 1 (05-05): CharacterCount — storage-only extension powering the
//     editor footer's live word/character count. Contributes NO schema output, so
//     server-side generateHTML is unaffected.
//   - UAT re-run R1 (05-07): Placeholder — decoration-only extension painting
//     data-placeholder + is-empty on empty textblocks so the empty surface shows
//     guidance text. Same server-safety class as CharacterCount: NO schema
//     output, so server-side generateHTML is unaffected (round-trip parity gate).
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
import TextAlign from "@tiptap/extension-text-align";
import CharacterCount from "@tiptap/extension-character-count";
// UAT re-run R1 (05-07): Placeholder comes from @tiptap/extensions (the
// monorepo packages/extension bundle) — NOT @tiptap/extension-placeholder,
// which at 3.27.1 lives in tiptap's packages-deprecated folder and is a
// re-export shim that peers on this exact package anyway. Root named export,
// same 3.27.1 version line, one fewer (deprecated) package.
import { Placeholder } from "@tiptap/extensions";

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
  // Per @tiptap/extension-table 3.27.1 TableKitOptions shape: `table:` carries the
  // Table extension's options (resizable, HTMLAttributes, etc.).
  TableKit.configure({ table: { resizable: true } }),
  // D-01 Rich tier — image node (block-level, no base64 — body images are CDN/external).
  Image.configure({ inline: false, allowBase64: false }),
  // D-05 manual links — autolink disabled; target=_blank + anti-tabnabbing rel
  // are the defaults. DOMPurify preserves both attributes on render (Slice B).
  Link.configure({
    openOnClick: false,
    autolink: false,
    HTMLAttributes: { rel: "noopener noreferrer", target: "_blank" },
  }),
  // UAT 05 gap 1 (05-05) — alignment on body-level blocks ONLY (heading +
  // paragraph, matching the toolbar align buttons). Alignment serializes as an
  // inline text-align style; the round-trip test pins that it survives BOTH
  // generateHTML and sanitizeBeforeRender.
  TextAlign.configure({ types: ["heading", "paragraph"] }),
  // UAT 05 gap 1 (05-05) — word/character count storage for the editor footer.
  // Default config: no schema output, so server-side generateHTML is unaffected
  // (the shared-array parity this file exists to protect stays intact).
  CharacterCount,
  // UAT re-run R1 (05-07) — placeholder text on the empty surface. Decoration-
  // only: paints is-empty + data-placeholder on empty textblocks (styled in
  // globals.css); zero schema output, so server generateHTML is unaffected.
  // showOnlyCurrent:false so the placeholder is visible on FIRST load WITHOUT
  // the editor being focused (the UAT screenshot's empty unstyled surface);
  // the CSS :first-child restriction keeps it to a single placeholder.
  Placeholder.configure({
    placeholder: "Write something…",
    showOnlyCurrent: false,
  }),
];
