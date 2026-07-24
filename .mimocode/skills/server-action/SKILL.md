---
name: server-action
description: Create a Server Action with shared Zod schema, permission gate, and revalidation
---

# Server Action Skill

Create a Server Action following the project's established pattern: `"use server"` directive, shared Zod schema (client+server), permission check, and cache revalidation.

## When to Use

- Creating a new mutation endpoint (CRUD operation)
- Adding a new form submission handler
- Creating an API-like endpoint that mutates data

## Prerequisites

- Feature name (e.g., `posts`, `categories`, `media`)
- Operation type (create, update, delete, list)
- Permission level required (admin, editor, author, or public)
- Database tables involved

## Template

### 1. Schema File (`actions/<feature>-schema.ts`)

```typescript
import { z } from "zod";

// Define the input schema for the action
export const <feature>Schema = z.object({
  // Fields matching the database columns
  id: z.number().int().positive().optional(),
  name: z.string().min(1, "Name is required").max(255),
  // ... additional fields
});

// Export the type for client-side form usage
export type <Feature>Input = z.infer<typeof <feature>Schema>;

// Re-export zodResolver for form integration
export { zodResolver } from "@hookform/resolvers/zod";
```

**Key rules:**
- Schema file is a pure module (no `"use server"` directive)
- Re-export `zodResolver` for client forms
- Export both the schema and the inferred type

### 2. Action File (`actions/<feature>.ts`)

```typescript
"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { db, schema } from "@/lib/db";
import { eq, and, isNull } from "drizzle-orm";
import { log } from "@/lib/log";
import { requireCan, requireRole } from "@/lib/permissions";
import { <feature>Schema } from "./<feature>-schema";

// Permission gate - choose ONE based on operation:
// For admin-only operations:
// await requireRole("admin");

// For role-based operations:
// await requireCan("<feature>", "<operation>");

// For public operations (no gate):
// (skip permission check)

export async function create<Feature>(input: unknown): Promise<{ id: number }> {
  // 1. Validate input
  const data = <feature>Schema.parse(input);
  
  // 2. Permission check (FIRST line after validation)
  await requireCan("<feature>", "create");
  // OR: await requireRole("admin");
  
  // 3. Database operation
  const [row] = await db
    .insert(schema.<table>)
    .values({
      name: data.name,
      // ... map schema fields to database columns
    })
    .returning({ id: schema.<table>.id });
  
  if (!row) {
    log.error("Failed to create <feature>", { data });
    throw new Error("CREATE_FAILED");
  }
  
  // 4. Revalidation (for cached routes)
  revalidatePath("/<admin-route>");
  revalidateTag("<feature>-list", "max");
  
  return { id: row.id };
}

export async function update<Feature>(input: unknown): Promise<{ ok: true }> {
  const data = <feature>Schema.parse(input);
  
  if (!data.id) {
    throw new Error("ID_REQUIRED");
  }
  
  // Permission check
  await requireCan("<feature>", "update");
  // OR for ownership-based:
  // await assertOwnsPost(data.id);
  
  // Database operation
  await db
    .update(schema.<table>)
    .set({
      name: data.name,
      updatedAt: new Date(),
    })
    .where(eq(schema.<table>.id, data.id));
  
  // Revalidation
  revalidatePath("/<admin-route>");
  revalidateTag("<feature>-list", "max");
  revalidateTag(`<feature>-${data.id}`, "max");
  
  return { ok: true };
}

export async function delete<Feature>(id: number): Promise<{ ok: true }> {
  // Permission check
  await requireCan("<feature>", "delete");
  
  // Soft delete (preferred) or hard delete
  await db
    .update(schema.<table>)
    .set({ deletedAt: new Date() })
    .where(eq(schema.<table>.id, id));
  
  // Revalidation
  revalidatePath("/<admin-route>");
  revalidateTag("<feature>-list", "max");
  
  return { ok: true };
}
```

**Key rules:**
- `"use server"` directive is MANDATORY at top of file
- Permission check is FIRST line after validation
- Use `revalidateTag(name, "max")` (2-arg form, NOT single-arg)
- Use concrete paths in `revalidatePath`, NOT template strings
- Throw short uppercase error codes (e.g., `"FORBIDDEN"`, `"NOT_FOUND"`)

### 3. Client-Side Integration

```typescript
// In your form component:
import { <feature>Schema, type <Feature>Input } from "./<feature>-schema";
import { create<Feature>, update<Feature> } from "./<feature>";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

const form = useForm<Feature>({
  resolver: zodResolver(<feature>Schema),
  defaultValues: { /* ... */ },
});

// For mutations with TanStack Query:
import { useMutation, useQueryClient } from "@tanstack/react-query";

const queryClient = useQueryClient();
const mutation = useMutation({
  mutationFn: (data: <Feature>Input) => create<Feature>(data),
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ["<feature>-list"] });
  },
});
```

## Checklist

- [ ] Schema file created with `zodResolver` re-export
- [ ] Action file has `"use server"` directive
- [ ] Permission check is FIRST line after validation
- [ ] Using `revalidateTag(name, "max")` (2-arg form)
- [ ] Using concrete paths in `revalidatePath`
- [ ] Error codes are short uppercase strings
- [ ] Client form uses `zodResolver` with shared schema
- [ ] TanStack Query invalidation configured (if using mutations)

## Examples in Codebase

- `src/actions/posts.ts` + `src/actions/posts-schema.ts`
- `src/actions/pages.ts` + `src/actions/pages-schema.ts`
- `src/actions/categories.ts` + `src/actions/categories-schema.ts` (if exists)
- `src/actions/media.ts` + `src/actions/media-schema.ts`
- `src/actions/settings.ts` + `src/actions/seo-settings-schema.ts`
- `src/actions/contact.ts` + `src/actions/contact-schema.ts`
