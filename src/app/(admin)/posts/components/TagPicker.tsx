"use client";
// src/app/(admin)/posts/components/TagPicker.tsx
// [CITED: 03-02-PLAN.md Task 3 Step B — multi-select tag picker capped at 8]
// [CITED: 03-CONTEXT.md D-22 (picker now), D-23 (tags capped ~8, server-enforced)]
//
// Multi-select tag picker wired to the listTags Server Action. Uses a checkbox
// list (native inputs, consistent with PostForm's native-input pattern from 03-01).
// Enforces the D-23 tag cap CLIENT-SIDE: if the user tries to select a 9th tag,
// a hint message appears and the selection is prevented. The hard enforcement
// is server-side in postSchema.tagIds.max(8) — the client hint is UX, not security.
import { useState, useEffect } from "react";
import { Controller, type Control, type FieldErrors } from "react-hook-form";
import { listTags } from "@/actions/tags";
import type { PostSchemaInput } from "@/actions/posts-schema";

interface TagPickerProps {
  name: string;
  control: Control<PostSchemaInput>;
  errors?: FieldErrors<PostSchemaInput>;
}

const MAX_TAGS = 8; // D-23

interface TagRow {
  id: number;
  name: string;
  slug: string;
}

export default function TagPicker({ name, control, errors }: TagPickerProps) {
  const [tags, setTags] = useState<TagRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [capHint, setCapHint] = useState(false);

  useEffect(() => {
    let cancelled = false;
    listTags()
      .then((rows) => {
        if (!cancelled) {
          setTags(rows as TagRow[]);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const errorMessage = errors?.[name as keyof PostSchemaInput]?.message as string | undefined;

  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400">
        Tags
      </label>
      <Controller
        name={name as keyof PostSchemaInput & "tagIds"}
        control={control}
        render={({ field }) => {
          const selected: number[] = Array.isArray(field.value) ? (field.value as number[]) : [];
          return (
            <>
              <div className="flex flex-wrap gap-2 rounded-lg border border-gray-300 p-3 dark:border-gray-700 dark:bg-gray-900">
                {loading && (
                  <span className="text-sm text-gray-400">Loading tags…</span>
                )}
                {!loading && tags.length === 0 && (
                  <span className="text-sm text-gray-400">
                    No tags available — ask an admin to create some.
                  </span>
                )}
                {tags.map((tag) => {
                  const isSelected = selected.includes(tag.id);
                  return (
                    <button
                      key={tag.id}
                      type="button"
                      onClick={() => {
                        if (isSelected) {
                          setCapHint(false);
                          field.onChange(selected.filter((id) => id !== tag.id));
                        } else {
                          if (selected.length >= MAX_TAGS) {
                            setCapHint(true); // D-23 UX hint
                            return;
                          }
                          setCapHint(false);
                          field.onChange([...selected, tag.id]);
                        }
                      }}
                      className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                        isSelected
                          ? "bg-brand-500 text-white"
                          : "bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
                      }`}
                    >
                      {tag.name}
                    </button>
                  );
                })}
              </div>
              <p className="mt-1 text-xs text-gray-500">
                {selected.length}/{MAX_TAGS} tags selected (D-23 cap).
              </p>
              {capHint && (
                <p className="mt-1 text-xs text-error-500">
                  Maximum {MAX_TAGS} tags — remove one to add another (D-23).
                </p>
              )}
              {errorMessage && <p className="mt-1 text-xs text-error-500">{errorMessage}</p>}
            </>
          );
        }}
      />
    </div>
  );
}
