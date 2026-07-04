"use client";
// src/components/editor/TiptapEditor.tsx
// [CITED: RESEARCH.md Pattern 1 (L388-402) — client editor + lazy-load boundary]
// [CITED: PATTERNS.md row — DropZone.tsx "use client" shape analog]
// [CITED: .claude/CLAUDE.md — Tiptap is v3 (use @tiptap/*@3), NOT v2]
//
// The client-only Tiptap editor. ALWAYS lazy-loaded via next/dynamic({ssr:false})
// from the consuming dashboard page — this file MUST NOT be statically imported
// by any (site) route (ESLint no-restricted-imports is the static guard; the
// dynamic import is the runtime guard — PERF-02 prep).
//
// Imports `editorExtensions` from ./extensions — the SAME array the server's
// `generateHTML` uses (Pitfall #1). Never inline the array here.
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import { editorExtensions } from "./extensions";
import { Toolbar } from "./toolbar/Toolbar";

export interface TiptapEditorProps {
  /** Initial content as ProseMirror JSON (loaded from posts.body jsonb on edit). */
  value: unknown;
  /** Fired on every content change with editor.getJSON() — feeds RHF. */
  onChange: (json: unknown) => void;
  /** Optional: read-only mode (e.g. preview). */
  editable?: boolean;
}

export function TiptapEditor({ value, onChange, editable = true }: TiptapEditorProps) {
  const editor = useEditor({
    extensions: editorExtensions, // single source of truth (Pitfall #1)
    content: value as Record<string, unknown> | null,
    editable,
    onUpdate: ({ editor }: { editor: Editor }) => {
      onChange(editor.getJSON());
    },
  });

  return (
    <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
      {editor && <Toolbar editor={editor} />}
      <div className="prose prose-sm dark:prose-invert max-w-none focus:outline-none px-4 py-3 sm:px-6 sm:py-5">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}

export default TiptapEditor;
