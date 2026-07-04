"use client";
// src/components/editor/toolbar/Toolbar.tsx
// [CITED: 03-01-PLAN.md Task 2 Step C — toolbar buttons via editor.chain().focus()]
// [CITED: PATTERNS.md row — Button.tsx styling analog]
// [CITED: .claude/CLAUDE.md — D-01 Rich tier toolbar surface]
//
// The editor toolbar. Each button uses the editor.chain().focus().toggleX().run()
// pattern (NO direct DOM mutation — the editor commands are the single mutation
// path). Active state is read via editor.isActive() so toggle buttons reflect
// the cursor's current marks/blocks.
//
// The image button triggers an external-URL prompt for v1 (media-library UI is
// Phase 4 DASH-03 — for now authors paste a CDN/external URL). D-03 allows
// external URLs; cdnImageLoader passes them through.
import type { Editor } from "@tiptap/react";

export interface ToolbarProps {
  editor: Editor | null;
}

interface ToolbarButtonProps {
  label: string;
  isActive?: boolean;
  disabled?: boolean;
  onClick: () => void;
  title: string;
}

function ToolbarButton({ label, isActive, disabled, onClick, title }: ToolbarButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`min-w-[2rem] rounded-md px-2 py-1 text-sm font-medium transition ${
        isActive
          ? "bg-brand-500 text-white"
          : "text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
      } ${disabled ? "cursor-not-allowed opacity-50" : ""}`}
    >
      {label}
    </button>
  );
}

export function Toolbar({ editor }: ToolbarProps) {
  if (!editor) return null;

  const promptImage = () => {
    const url = window.prompt("Image URL (CDN or external):");
    if (url) {
      editor.chain().focus().setImage({ src: url }).run();
    }
  };

  const promptLink = () => {
    const url = window.prompt("Link URL:");
    if (url) {
      editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
    }
  };

  return (
    <div className="flex flex-wrap gap-1 border-b border-gray-200 p-2 dark:border-gray-800">
      <ToolbarButton
        label="B"
        title="Bold"
        isActive={editor.isActive("bold")}
        onClick={() => editor.chain().focus().toggleBold().run()}
      />
      <ToolbarButton
        label="I"
        title="Italic"
        isActive={editor.isActive("italic")}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      />
      <ToolbarButton
        label="S"
        title="Strikethrough"
        isActive={editor.isActive("strike")}
        onClick={() => editor.chain().focus().toggleStrike().run()}
      />
      <ToolbarButton
        label="H1"
        title="Heading 1"
        isActive={editor.isActive("heading", { level: 1 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
      />
      <ToolbarButton
        label="H2"
        title="Heading 2"
        isActive={editor.isActive("heading", { level: 2 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
      />
      <ToolbarButton
        label="• List"
        title="Bullet list"
        isActive={editor.isActive("bulletList")}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      />
      <ToolbarButton
        label="1. List"
        title="Ordered list"
        isActive={editor.isActive("orderedList")}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
      />
      <ToolbarButton
        label="❝"
        title="Blockquote"
        isActive={editor.isActive("blockquote")}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
      />
      <ToolbarButton
        label="</>"
        title="Inline code"
        isActive={editor.isActive("code")}
        onClick={() => editor.chain().focus().toggleCode().run()}
      />
      <ToolbarButton
        label="Code block"
        title="Code block"
        isActive={editor.isActive("codeBlock")}
        onClick={() => editor.chain().focus().toggleCodeBlock().run()}
      />
      <ToolbarButton
        label="🔗"
        title="Link (D-05 manual target/rel)"
        isActive={editor.isActive("link")}
        onClick={promptLink}
      />
      <ToolbarButton
        label="🖼"
        title="Image (external URL — Phase 4 DASH-03 wires the library picker)"
        onClick={promptImage}
      />
      <ToolbarButton
        label="Table"
        title="Insert table"
        onClick={() =>
          editor
            .chain()
            .focus()
            .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
            .run()
        }
      />
    </div>
  );
}

export default Toolbar;
