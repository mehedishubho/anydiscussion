---
name: dashboard-form
description: Create a dashboard form with React Hook Form, Zod validation, and TanStack Query
---

# Dashboard Form Skill

Create a dashboard form following the project's established pattern: React Hook Form + Zod schema (shared with server), TanStack Query for mutations, and TailAdmin Field helper components.

## When to Use

- Creating a new settings page form
- Building a CRUD form for dashboard resources
- Adding a form that submits to a Server Action

## Prerequisites

- Server Action created (see `server-action` skill)
- Zod schema defined (shared between client and server)
- Understanding of the data model

## Template

### 1. Schema Client Bridge (`<feature>/schema-client.ts`)

```typescript
"use client";

import { zodResolver } from "@hookform/resolvers/zod";

// Re-export from the server schema file
export {
  <feature>Schema,
  type <Feature>Input,
  // ... other types
} from "@/actions/<feature>-schema";

export { zodResolver };
```

**Key rules:**
- `"use client"` directive is MANDATORY
- Re-export schema and types from the server schema file
- Re-export `zodResolver` for form integration

### 2. Form Component (`<feature>/<Feature>Form.tsx`)

```typescript
"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  <feature>Schema,
  type <Feature>Input,
  zodResolver,
} from "./schema-client";
import { create<Feature>, update<Feature> } from "@/actions/<feature>";

// TailAdmin Field helper (copy from existing forms)
const INPUT_CLASS =
  "w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-800 placeholder:text-gray-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 dark:border-gray-600 dark:bg-gray-800 dark:text-white dark:placeholder:text-gray-500";

const LABEL_CLASS =
  "mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300";

// Field helper component (copy from existing forms)
function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className={LABEL_CLASS}>{label}</label>
      {children}
      {error && (
        <p className="mt-1 text-xs text-red-500">{error}</p>
      )}
    </div>
  );
}

interface <Feature>FormProps {
  initial?: <Feature>Input;
  mode: "create" | "edit";
}

export default function <Feature>Form({ initial, mode }: <Feature>FormProps) {
  const queryClient = useQueryClient();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<<Feature>Input>({
    resolver: zodResolver(<feature>Schema),
    defaultValues: initial ?? {
      // Default values for create mode
      name: "",
      // ... other fields
    },
  });

  const mutation = useMutation({
    mutationFn: (data: <Feature>Input) => {
      if (mode === "edit" && initial?.id) {
        return update<Feature>({ ...data, id: initial.id });
      }
      return create<Feature>(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["<feature>-list"] });
      setSaved(true);
      setError(null);
      setTimeout(() => setSaved(false), 3000);
    },
    onError: (err) => {
      setError(err.message || "Something went wrong");
      setSaved(false);
    },
  });

  const onSubmit = (data: <Feature>Input) => {
    mutation.mutate(data);
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      {/* Success banner */}
      {saved && (
        <div className="rounded-lg border border-success-300 bg-success-50 p-4 text-success-700 dark:border-success-600 dark:bg-success-900/20 dark:text-success-400">
          Saved successfully!
        </div>
      )}

      {/* Error banner */}
      {error && (
        <div className="rounded-lg border border-error-300 bg-error-50 p-4 text-error-700 dark:border-error-600 dark:bg-error-900/20 dark:text-error-400">
          {error}
        </div>
      )}

      {/* Form fields */}
      <Field label="Name" error={errors.name?.message}>
        <input
          {...register("name")}
          placeholder="Enter name"
          className={INPUT_CLASS}
        />
      </Field>

      {/* Additional fields... */}

      {/* Submit button */}
      <div className="flex justify-end">
        <button
          type="submit"
          disabled={isSubmitting}
          className="rounded-lg bg-brand-500 px-6 py-2.5 text-sm font-medium text-white hover:bg-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-500/20 disabled:opacity-50"
        >
          {isSubmitting ? "Saving..." : mode === "edit" ? "Update" : "Create"}
        </button>
      </div>
    </form>
  );
}
```

**Key rules:**
- `"use client"` directive is MANDATORY
- Use `zodResolver` from the schema-client bridge
- Use TanStack Query's `useMutation` for server calls
- Invalidate relevant queries on success
- Show success/error banners
- Disable submit button while submitting
- Copy `INPUT_CLASS`, `LABEL_CLASS`, and `Field` helper from existing forms

### 3. Page Component (`<feature>/page.tsx`)

```typescript
import { get<Feature>List } from "@/actions/<feature>";
import <Feature>Form from "./<Feature>Form";

export const metadata = {
  title: "<Feature> — Dashboard",
};

export default async function <Feature>Page() {
  let initial: Awaited<ReturnType<typeof get<Feature>List>> | null = null;
  let loadError: string | null = null;

  try {
    initial = await get<Feature>List();
  } catch (e) {
    loadError = e instanceof Error ? e.message : String(e);
  }

  return (
    <div className="mx-auto max-w-4xl p-6">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          <Feature> Management
        </h1>
      </header>

      {loadError ? (
        <div className="rounded-lg border border-error-300 bg-error-50 p-4 text-error-700">
          Failed to load: {loadError}
        </div>
      ) : (
        <div className="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
          <<Feature>Form initial={initial} mode="edit" />
        </div>
      )}
    </div>
  );
}
```

**Key rules:**
- Server Component (NO `"use client"`)
- Fetch initial data in the server component
- Pass data to the client form component
- Handle loading errors gracefully

## Checklist

- [ ] Schema client bridge created with `"use client"`
- [ ] Form component has `"use client"` directive
- [ ] Using `zodResolver` from schema-client bridge
- [ ] Using TanStack Query `useMutation`
- [ ] Query invalidation configured on success
- [ ] Success/error banners implemented
- [ ] Submit button disabled while submitting
- [ ] `INPUT_CLASS`, `LABEL_CLASS`, `Field` helper copied from existing forms
- [ ] Page component is Server Component
- [ ] Initial data fetched in server component
- [ ] Error handling for data fetching

## Examples in Codebase

- `src/app/(admin)/dashboard/settings/storage/StorageSettingsForm.tsx`
- `src/app/(admin)/dashboard/settings/seo/SeoSettingsForm.tsx`
- `src/app/(admin)/dashboard/posts/PostForm.tsx`
- `src/app/(admin)/dashboard/pages/PageForm.tsx`
- `src/components/site/ContactForm.tsx` (note: no TanStack Query in `(site)`)
