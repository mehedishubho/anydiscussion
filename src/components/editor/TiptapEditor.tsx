"use client";
// src/components/editor/TiptapEditor.tsx
// [CITED: RESEARCH.md Pattern 1 (L388-402) — client editor + lazy-load boundary]
// [CITED: PATTERNS.md row — DropZone.tsx "use client" shape analog]
// [CITED: .claude/CLAUDE.md — Tiptap is v3 (use @tiptap/*@3), NOT v2]
// [CITED: 05-05-PLAN.md Task 3 — WordPress-classic editor shell (Phase 5 UAT gap 1)]
//
// The client-only Tiptap editor. ALWAYS lazy-loaded via next/dynamic({ssr:false})
// from the consuming dashboard page — this file MUST NOT be statically imported
// by any (site) route (ESLint no-restricted-imports is the static guard; the
// dynamic import is the runtime guard — PERF-02 prep).
//
// Imports `editorExtensions` from ./extensions — the SAME array the server's
// `generateHTML` uses (Pitfall #1). Never inline the array here.
//
// WordPress-classic shell (UAT 05 gap 1, 05-05):
//   - Visual/Text tab header; Text = editable HTML source view
//   - large min-height writing area (white in light mode)
//   - footer with live word/character count from CharacterCount storage —
//     the count moving while typing is the visible proof that
//     onUpdate -> onChange -> RHF body field is LIVE (the "body box not
//     working" UAT symptom's canary).
//
// Styled surface (05-07 / UAT re-run R1, cause A): the writing surface's
// styling comes from THREE pieces working together — the typography plugin
// (@plugin "@tailwindcss/typography" in globals.css makes the prose classes
// below generate CSS), the authored .tiptap.ProseMirror rules in globals.css
// (outline:none kills the browser-default black focus ring; min-height:inherit
// fills this wrapper's min-h-[350px]), and the Placeholder extension in
// extensions.ts (empty-surface guidance text via a decoration, styled by the
// p.is-empty::before rule). Tiptap v3 ships no CSS of its own — every visual
// property on the surface is owned by globals.css + these utility classes.
//
// Text-tab safety (threat T-05-11): textarea edits go through
// editor.commands.setContent(html, { emitUpdate: true }) — ProseMirror parses
// the HTML against the schema (non-schema nodes/marks are dropped), and the
// existing double-sanitize contract (sanitizeBeforeStore in savePost,
// sanitizeBeforeRender in renderPostBody) is unchanged.
import { useEditor, EditorContent, useEditorState, type Editor } from "@tiptap/react";
import { useState } from "react";
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

/** Which editor surface is showing (WordPress-classic Visual/Text tabs). */
type EditorMode = "visual" | "text";

export function TiptapEditor({ value, onChange, editable = true }: TiptapEditorProps) {
  const [mode, setMode] = useState<EditorMode>("visual");
  // HTML source shown in the Text tab. Initialized from editor.getHTML() when
  // switching Visual -> Text; afterwards the textarea owns the string (stable
  // caret) while every change is pushed live into the ProseMirror doc.
  const [html, setHtml] = useState("");

  const editor = useEditor({
    extensions: editorExtensions, // single source of truth (Pitfall #1)
    content: value as Record<string, unknown> | null,
    editable,
    // 05-07 (UAT re-run R1) — create the editor synchronously. This component
    // is client-only behind EditorProvider's next/dynamic({ssr:false}), so
    // there is NO SSR/hydration surface — immediatelyRender:true just
    // eliminates the transient null-editor first frame under Next.js (the
    // surface smoke test's immediate .tiptap.ProseMirror query pins this).
    immediatelyRender: true,
    onUpdate: ({ editor }: { editor: Editor }) => {
      onChange(editor.getJSON());
    },
  });

  // Live word/character counts for the footer (CharacterCount storage, derived
  // reactively through ONE useEditorState selector — the v3 pattern).
  const counts = useEditorState({
    editor,
    selector: ({ editor: e }) => {
      if (!e) return { words: 0, characters: 0 };
      const storage = e.storage.characterCount;
      return {
        words: storage ? storage.words() : 0,
        characters: storage ? storage.characters() : 0,
      };
    },
  });

  const switchMode = (next: EditorMode) => {
    if (next === "text" && editor && mode === "visual") {
      // Snapshot the current doc so the textarea starts from what the user sees.
      setHtml(editor.getHTML());
    }
    setMode(next);
  };

  const handleTextChange = (next: string) => {
    setHtml(next);
    if (!editor) return;
    // Parse the raw HTML against the schema (non-schema nodes are dropped) and
    // emit the update so onChange(editor.getJSON()) reaches the RHF body field
    // even if the user never switches back to Visual.
    editor.commands.setContent(next, { emitUpdate: true });
  };

  return (
    <div className="rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]">
      {/* Tab header — WordPress-classic placement (top of the editor frame). */}
      <div className="flex items-center gap-1 border-b border-gray-200 px-2 pt-2 dark:border-gray-800">
        <button
          type="button"
          role="tab"
          aria-selected={mode === "visual"}
          onClick={() => switchMode("visual")}
          className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
            mode === "visual"
              ? "bg-brand-500 text-white"
              : "text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
          }`}
        >
          Visual
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "text"}
          onClick={() => switchMode("text")}
          className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
            mode === "text"
              ? "bg-brand-500 text-white"
              : "text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
          }`}
        >
          Text
        </button>
      </div>

      {/* Visual surface: toolbar + large min-height white writing area. */}
      {mode === "visual" && editor && <Toolbar editor={editor} />}
      {mode === "visual" ? (
        /* 05-07 (UAT re-run R1): prose classes are LIVE now that the typography
           plugin is wired in globals.css (@plugin "@tailwindcss/typography").
           The old focus:outline-none utility is deliberately REMOVED — focus
           lands on the child .ProseMirror contenteditable, never on this
           wrapper, so it was dead; the authored .tiptap.ProseMirror
           { outline: none; min-height: inherit } rule in globals.css owns both
           the focus ring and the surface fill instead. */
        <div className="prose prose-sm dark:prose-invert max-w-none min-h-[350px] px-4 py-3 sm:px-6 sm:py-5">
          <EditorContent editor={editor} />
        </div>
      ) : (
        <textarea
          value={html}
          onChange={(e) => handleTextChange(e.target.value)}
          spellCheck={false}
          aria-label="HTML source"
          className="min-h-[350px] w-full resize-y bg-transparent px-4 py-3 font-mono text-sm text-gray-800 focus:outline-none dark:text-gray-200 sm:px-6 sm:py-5"
        />
      )}

      {/* Footer — live counts double as the onUpdate -> RHF pipe canary. */}
      <div
        data-testid="editor-footer"
        className="flex items-center justify-between border-t border-gray-200 px-4 py-2 text-xs text-gray-500 dark:border-gray-800 dark:text-gray-400"
      >
        <span>Words: {counts ? counts.words : 0}</span>
        <span>{counts ? counts.characters : 0} characters</span>
      </div>
    </div>
  );
}

export default TiptapEditor;
