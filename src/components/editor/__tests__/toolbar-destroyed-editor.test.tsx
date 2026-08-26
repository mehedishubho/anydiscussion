// @vitest-environment jsdom
// src/components/editor/__tests__/toolbar-destroyed-editor.test.tsx
// [CITED: quick 260826-5l0 Task 2 — tiptap#7849 destroyed-editor regression test]
// [CITED: Phase 05 UAT R1 re-test — edit-page client crash "Cannot read properties of null (reading 'can')"]
// [CITED: src/components/editor/__tests__/tiptap-editor-surface.test.tsx — mock + cleanup idioms]
//
// Regression test for the Phase 05 UAT R1 edit-page crash (ueberdosis/tiptap#7849):
// Editor.destroy() nulls the internal commandManager but leaves the instance
// non-null, and @tiptap/react 3.27.1's useEditorState re-invokes the unmemoized
// selector with the destroyed editor during React StrictMode's mount→remount
// cycle — so the Toolbar selector's can().undo() read threw. Pre-fix, Test 1
// reproduces the exact throw; post-fix the selector bails to NULL_EDITOR_STATE.
//
// MediaPicker is mocked to a no-op stub (same as the surface test) — it pulls
// the server-action/db chain into the import graph, none of which this tests.
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { Editor } from "@tiptap/react";

vi.mock("@/components/dashboard/media/MediaPicker", () => ({
  default: () => null,
}));

import { editorExtensions } from "../extensions";
import { Toolbar } from "../toolbar/Toolbar";

// Editors constructed directly by these tests are NOT owned by React — destroy
// them after unmount so no listener leaks across test files.
const ownedEditors: Editor[] = [];

function makeEditor(): Editor {
  const editor = new Editor({ extensions: editorExtensions });
  ownedEditors.push(editor);
  return editor;
}

afterEach(() => {
  // vitest runs without globals:true, so RTL auto-cleanup does not register —
  // unmount explicitly between tests, THEN destroy the test-owned editors.
  cleanup();
  for (const e of ownedEditors.splice(0)) {
    if (!e.isDestroyed) e.destroy();
  }
});

describe("quick 260826-5l0 / tiptap#7849 — Toolbar with a DESTROYED Editor", () => {
  it("Test 1 (regression): rendering Toolbar with a destroyed Editor does not throw", () => {
    const editor = makeEditor();
    expect(editor.isDestroyed).toBe(false);

    editor.destroy();
    // The tiptap#7849 invariant: destroyed but NOT null — a null-only guard passes it.
    expect(editor.isDestroyed).toBe(true);
    expect(editor).not.toBeNull();

    // Pre-fix: the selector called e.can().undo() on the destroyed editor whose
    // commandManager is null → "Cannot read properties of null (reading 'can')".
    expect(() => render(<Toolbar editor={editor} />)).not.toThrow();
  });

  it("Test 2: destroyed editor renders an INERT toolbar (everything-off state, container present)", () => {
    const editor = makeEditor();
    editor.destroy();

    const { container } = render(<Toolbar editor={editor} />);

    // The flex border-b container wrapper IS present — the selector returned
    // the null state instead of crashing mid-derivation.
    expect(container.querySelector("div.flex.flex-wrap.border-b")).toBeTruthy();

    // The block-type dropdown rendered with the default paragraph value.
    const blockType = screen.getByTitle("Block type") as HTMLSelectElement;
    expect(blockType.value).toBe("paragraph");

    // No button reports an active state (active buttons get bg-brand-500).
    expect(container.querySelector(".bg-brand-500")).toBeNull();
  });

  it("Test 3: a LIVE editor still renders the toolbar with the Paragraph dropdown (guard did not change the live path)", () => {
    const editor = makeEditor();
    expect(editor.isDestroyed).toBe(false);

    render(<Toolbar editor={editor} />);

    const blockType = screen.getByTitle("Block type");
    expect(blockType).toBeTruthy();
    expect(screen.getByRole("option", { name: "Paragraph" })).toBeTruthy();
  });
});
