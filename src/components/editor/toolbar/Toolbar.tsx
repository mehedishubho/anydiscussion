"use client";
// src/components/editor/toolbar/Toolbar.tsx
// [CITED: 03-01-PLAN.md Task 2 Step C — toolbar buttons via editor.chain().focus()]
// [CITED: PATTERNS.md row — Button.tsx styling analog]
// [CITED: 04-02-PLAN.md Task 3 — image button opens <MediaPicker> (D-13, replaces the old prompt)]
// [CITED: 05-05-PLAN.md Task 2 — WordPress-classic toolbar rebuild (Phase 5 UAT gap 1)]
//
// Rebuilt in the WordPress-classic-editor control order (UAT verbatim spec):
//   1. Block-type dropdown (Paragraph / H1 / H2 / H3)
//   2. Bold · 3. Italic · 4. Bulleted list · 5. Numbered list · 6. Blockquote
//   7. Align left / center / right (TextAlign — heading+paragraph only)
//   8. Insert link (D-05 manual prompt flow, unchanged)
//   9. Insert table
//   10. More("...") overflow: Strike · Code · Code block · Image (MediaPicker) · Undo · Redo
//
// Active states are derived reactively through ONE useEditorState selector
// (the Tiptap v3-recommended pattern) instead of scattered editor.isActive()
// reads across renders — the toolbar re-renders only when a selected value
// actually changes (deep-equal gate inside the hook).
//
// Align buttons TOGGLE: clicking the currently-active alignment calls
// unsetTextAlign() (aligns back to the inherited/default alignment).
import type { Editor } from "@tiptap/react";
import { useEditorState } from "@tiptap/react";
import { useState } from "react";
import MediaPicker from "@/components/dashboard/media/MediaPicker";

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

/** Block-type dropdown value (the select's option set). */
type BlockType = "paragraph" | "heading1" | "heading2" | "heading3";

/** Shape returned by the useEditorState selector below. */
interface ToolbarState {
  blockType: BlockType;
  isBold: boolean;
  isItalic: boolean;
  isBulletList: boolean;
  isOrderedList: boolean;
  isBlockquote: boolean;
  isLink: boolean;
  alignLeft: boolean;
  alignCenter: boolean;
  alignRight: boolean;
  isStrike: boolean;
  isCode: boolean;
  isCodeBlock: boolean;
  canUndo: boolean;
  canRedo: boolean;
}

/** Selector result for a null/uninitialized editor — everything off. */
const NULL_EDITOR_STATE: ToolbarState = {
  blockType: "paragraph",
  isBold: false,
  isItalic: false,
  isBulletList: false,
  isOrderedList: false,
  isBlockquote: false,
  isLink: false,
  alignLeft: false,
  alignCenter: false,
  alignRight: false,
  isStrike: false,
  isCode: false,
  isCodeBlock: false,
  canUndo: false,
  canRedo: false,
};

export function Toolbar({ editor }: ToolbarProps) {
  // useState/useEditorState MUST come before the early return to respect the
  // Rules of Hooks. The picker is mounted conditionally on `mediaPickerOpen`;
  // the image button (inside the More menu) sets it to true.
  const [mediaPickerOpen, setMediaPickerOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  const editorState = useEditorState({
    editor,
    selector: ({ editor: e }): ToolbarState => {
      // tiptap#7849 (quick 260826-5l0 / Phase 05 UAT R1): Editor.destroy() nulls
      // the internal commandManager but leaves the instance NON-null, and
      // useEditorState re-invokes this unmemoized selector with the destroyed
      // editor during React StrictMode's mount→remount cycle — a null-only
      // guard let e.can().undo() below throw. The upstream fix (PR #8015) is
      // not in @tiptap/react 3.27.1, so bail to the everything-off state here.
      if (!e || e.isDestroyed) return NULL_EDITOR_STATE;
      const blockType: BlockType = e.isActive("heading", { level: 1 })
        ? "heading1"
        : e.isActive("heading", { level: 2 })
          ? "heading2"
          : e.isActive("heading", { level: 3 })
            ? "heading3"
            : "paragraph";
      return {
        blockType,
        isBold: e.isActive("bold"),
        isItalic: e.isActive("italic"),
        isBulletList: e.isActive("bulletList"),
        isOrderedList: e.isActive("orderedList"),
        isBlockquote: e.isActive("blockquote"),
        isLink: e.isActive("link"),
        alignLeft: e.isActive({ textAlign: "left" }),
        alignCenter: e.isActive({ textAlign: "center" }),
        alignRight: e.isActive({ textAlign: "right" }),
        isStrike: e.isActive("strike"),
        isCode: e.isActive("code"),
        isCodeBlock: e.isActive("codeBlock"),
        canUndo: e.can().undo(),
        canRedo: e.can().redo(),
      };
    },
  });

  if (!editor || !editorState) return null;

  const promptLink = () => {
    // Link entry is a single-field quick action — the browser prompt API is
    // appropriate here (the picker's library/upload affordances don't apply to
    // arbitrary link URLs). Use the global `prompt` (browser-only; this is a
    // "use client" component so globalThis.prompt is available).
    const url = prompt("Link URL:");
    if (url) {
      editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
    }
  };

  const setBlockType = (next: BlockType) => {
    if (next === "paragraph") {
      editor.chain().focus().setParagraph().run();
      return;
    }
    const level = next === "heading1" ? 1 : next === "heading2" ? 2 : 3;
    editor.chain().focus().toggleHeading({ level }).run();
  };

  // Clicking the currently-active alignment UNSETS it (toggle semantics).
  const align = (dir: "left" | "center" | "right") => {
    if (editor.isActive({ textAlign: dir })) {
      editor.chain().focus().unsetTextAlign().run();
    } else {
      editor.chain().focus().setTextAlign(dir).run();
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-1 border-b border-gray-200 p-2 dark:border-gray-800">
      {/* 1. Block type — Paragraph / H1 / H2 / H3 */}
      <select
        value={editorState.blockType}
        onChange={(e) => setBlockType(e.target.value as BlockType)}
        title="Block type"
        className="rounded-md border border-gray-300 bg-white px-2 py-1 text-sm font-medium text-gray-700 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
      >
        <option value="paragraph">Paragraph</option>
        <option value="heading1">Heading 1</option>
        <option value="heading2">Heading 2</option>
        <option value="heading3">Heading 3</option>
      </select>

      {/* 2. Bold */}
      <ToolbarButton
        label="B"
        title="Bold"
        isActive={editorState.isBold}
        onClick={() => editor.chain().focus().toggleBold().run()}
      />
      {/* 3. Italic */}
      <ToolbarButton
        label="I"
        title="Italic"
        isActive={editorState.isItalic}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      />
      {/* 4. Bulleted list */}
      <ToolbarButton
        label="• List"
        title="Bullet list"
        isActive={editorState.isBulletList}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      />
      {/* 5. Numbered list */}
      <ToolbarButton
        label="1. List"
        title="Ordered list"
        isActive={editorState.isOrderedList}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
      />
      {/* 6. Blockquote */}
      <ToolbarButton
        label="❝"
        title="Blockquote"
        isActive={editorState.isBlockquote}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
      />

      {/* 7. Align left / center / right — toggle (click active dir = unset) */}
      <ToolbarButton
        label="Left"
        title="Align left"
        isActive={editorState.alignLeft}
        onClick={() => align("left")}
      />
      <ToolbarButton
        label="Center"
        title="Align center"
        isActive={editorState.alignCenter}
        onClick={() => align("center")}
      />
      <ToolbarButton
        label="Right"
        title="Align right"
        isActive={editorState.alignRight}
        onClick={() => align("right")}
      />

      {/* 8. Insert link — D-05 manual prompt flow (unchanged) */}
      <ToolbarButton
        label="🔗"
        title="Link (D-05 manual target/rel)"
        isActive={editorState.isLink}
        onClick={promptLink}
      />
      {/* 9. Insert table */}
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

      {/* 10. More("...") overflow — Strike · Code · Code block · Image · Undo · Redo */}
      <div className="relative">
        <ToolbarButton
          label="More (...)"
          title="More options (strike, code, code block, image, undo/redo)"
          isActive={moreOpen}
          onClick={() => setMoreOpen((v) => !v)}
        />
        {moreOpen && (
          <>
            {/* Invisible backdrop — closes the menu on any outside click. */}
            <div className="fixed inset-0 z-10" onClick={() => setMoreOpen(false)} />
            <div className="absolute right-0 z-20 mt-1 flex flex-col gap-1 rounded-md border border-gray-200 bg-white p-2 shadow-md dark:border-gray-700 dark:bg-gray-800">
              <ToolbarButton
                label="S"
                title="Strikethrough"
                isActive={editorState.isStrike}
                onClick={() => {
                  editor.chain().focus().toggleStrike().run();
                  setMoreOpen(false);
                }}
              />
              <ToolbarButton
                label="</>"
                title="Inline code"
                isActive={editorState.isCode}
                onClick={() => {
                  editor.chain().focus().toggleCode().run();
                  setMoreOpen(false);
                }}
              />
              <ToolbarButton
                label="Code block"
                title="Code block"
                isActive={editorState.isCodeBlock}
                onClick={() => {
                  editor.chain().focus().toggleCodeBlock().run();
                  setMoreOpen(false);
                }}
              />
              <ToolbarButton
                label="🖼"
                title="Insert image"
                onClick={() => {
                  setMoreOpen(false);
                  setMediaPickerOpen(true);
                }}
              />
              <ToolbarButton
                label="Undo"
                title="Undo"
                disabled={!editorState.canUndo}
                onClick={() => {
                  editor.chain().focus().undo().run();
                  setMoreOpen(false);
                }}
              />
              <ToolbarButton
                label="Redo"
                title="Redo"
                disabled={!editorState.canRedo}
                onClick={() => {
                  editor.chain().focus().redo().run();
                  setMoreOpen(false);
                }}
              />
            </div>
          </>
        )}
      </div>

      <MediaPicker
        isOpen={mediaPickerOpen}
        onClose={() => setMediaPickerOpen(false)}
        onSelect={(url) => {
          editor.chain().focus().setImage({ src: url }).run();
          setMediaPickerOpen(false);
        }}
      />
    </div>
  );
}

export default Toolbar;
