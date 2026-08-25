// @vitest-environment jsdom
// src/components/editor/__tests__/tiptap-editor-surface.test.tsx
// [CITED: 05-05-PLAN.md Task 3 — jsdom smoke test of the WordPress-classic shell]
//
// Smoke test of the rebuilt TiptapEditor surface (Phase 5 UAT gap 1):
//   1. Visual + Text tab labels render
//   2. clicking Text swaps EditorContent (the .tiptap ProseMirror element) for
//      the HTML-source textarea
//   3. typing into the textarea calls onChange with a ProseMirror JSON doc —
//      proving the Text tab keeps the RHF body field live (the pipe canary)
//   4. the footer word-count text renders
//   5. WR-01: the min-height inherit chain (wrapper -> EditorContent container
//      -> contenteditable) is intact, so the surface fills the 350px area
//
// MediaPicker is mocked to a no-op stub — it pulls the server-action/db chain
// (@/actions/media -> drizzle/pg) plus react-query into the import graph, none
// of which this smoke test exercises.
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

vi.mock("@/components/dashboard/media/MediaPicker", () => ({
  default: () => null,
}));

import { TiptapEditor } from "../TiptapEditor";

afterEach(() => {
  // vitest runs without globals:true, so RTL auto-cleanup does not register —
  // unmount explicitly between tests.
  cleanup();
});

describe("05-05 — WordPress-classic editor surface (Visual/Text tabs + word count)", () => {
  it("renders Visual and Text tab labels", () => {
    render(<TiptapEditor value={null} onChange={() => {}} />);
    expect(screen.getByRole("tab", { name: "Visual" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Text" })).toBeTruthy();
  });

  it("clicking Text swaps the ProseMirror surface for an HTML-source textarea", () => {
    render(<TiptapEditor value={null} onChange={() => {}} />);
    // Visual mode first: Tiptap mounts its .tiptap ProseMirror element.
    expect(document.querySelector(".tiptap.ProseMirror")).toBeTruthy();

    fireEvent.click(screen.getByRole("tab", { name: "Text" }));

    // Text mode: the editor surface is replaced by the monospace textarea.
    expect(document.querySelector(".tiptap.ProseMirror")).toBeNull();
    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    expect(textarea.tagName).toBe("TEXTAREA");

    // Switching back restores the visual surface.
    fireEvent.click(screen.getByRole("tab", { name: "Visual" }));
    expect(document.querySelector(".tiptap.ProseMirror")).toBeTruthy();
  });

  it("typing into the textarea calls onChange with a JSON doc (Text tab keeps RHF live)", () => {
    const onChange = vi.fn();
    render(<TiptapEditor value={null} onChange={onChange} />);

    fireEvent.click(screen.getByRole("tab", { name: "Text" }));
    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "<p>hello world</p>" } });

    expect(onChange).toHaveBeenCalled();
    const doc = onChange.mock.calls[0][0] as { type: string; content?: unknown[] };
    expect(doc.type).toBe("doc");
    expect(Array.isArray(doc.content)).toBe(true);
  });

  it("renders the footer word-count text and updates it as content changes", () => {
    const { container } = render(<TiptapEditor value={null} onChange={() => {}} />);
    const footer = container.querySelector('[data-testid="editor-footer"]');
    expect(footer).toBeTruthy();
    expect(footer?.textContent).toContain("Words:");

    fireEvent.click(screen.getByRole("tab", { name: "Text" }));
    const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "<p>one two three four</p>" } });

    expect(footer?.textContent).toContain("Words: 4");
  });

  it("WR-01: the min-height chain reaches the 350px wrapper via EditorContent's container div", () => {
    render(<TiptapEditor value={null} onChange={() => {}} />);
    const surface = document.querySelector(".tiptap.ProseMirror");
    expect(surface).toBeTruthy();

    // DOM chain: wrapper > EditorContent container div > contenteditable.
    // EditorContent (@tiptap/react) renders its own bare <div> and appends the
    // ProseMirror DOM into it, so the contenteditable's grandparent — not its
    // parent — carries the min-h-[350px].
    const container = surface!.parentElement!;
    const wrapper = container.parentElement!;
    expect(container.tagName).toBe("DIV");
    expect(wrapper.className).toContain("min-h-[350px]");
    expect(wrapper.className).toContain("prose");

    // The bridge: the container must inherit the wrapper's min-height so the
    // globals.css `.tiptap.ProseMirror { min-height: inherit }` rule resolves
    // against a real 350px instead of auto. Without it the editable surface
    // stays ~1 line tall and the empty area below is not clickable into focus.
    expect(container.className).toContain("min-h-[inherit]");
  });
});
