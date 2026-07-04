"use client";
// src/components/editor/EditorProvider.tsx
// [CITED: PATTERNS.md row — AdminShell.tsx client wrapper shape analog]
// [CITED: 03-01-PLAN.md Task 2 Step B — RHF ↔ Tiptap bridge]
//
// The react-hook-form wiring wrapper for the lazy-loaded TiptapEditor. Renders
// a Controller whose onChange passes the editor's getJSON() output to the RHF
// field, and whose value feeds the editor. This is the bridge between the
// RHF-controlled <form> state and the uncontrolled Tiptap editor instance.
//
// Client-only — `"use client"` mandatory (uses RHF Controller + the dynamic
// TiptapEditor import below).
import { Controller, type Control, type FieldPath, type FieldValues } from "react-hook-form";
import dynamic from "next/dynamic";

// Lazy-load: keeps Tiptap (and ProseMirror) out of the server bundle + public
// bundle. ssr:false — the editor is client-only (DOM-dependent). PERF-02 prep.
const TiptapEditor = dynamic(() => import("./TiptapEditor").then((m) => m.TiptapEditor), {
  ssr: false,
  loading: () => <div className="text-gray-500">Loading editor…</div>,
});

export interface EditorProviderProps<T extends FieldValues> {
  /** RHF field name (e.g. "body"). */
  name: FieldPath<T>;
  /** RHF control from useForm({ resolver }). */
  control: Control<T>;
}

export function EditorProvider<T extends FieldValues>({ name, control }: EditorProviderProps<T>) {
  return (
    <Controller
      name={name}
      control={control}
      defaultValue={null as unknown as undefined}
      render={({ field }) => (
        <TiptapEditor
          value={field.value}
          onChange={(json) => field.onChange(json)}
        />
      )}
    />
  );
}

export default EditorProvider;
