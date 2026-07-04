// src/actions/settings.ts
// [CITED: src/actions/users.ts — the established Server Action template (PATTERNS.md row)]
// [CITED: 03-CONTEXT.md D-14 — the READ path for site.timezone (settings key-value table)]
// [CITED: 03-03 seed.ts — seedStorageSettings populates storage.active_provider +
//  site.timezone + site.feature_image_default into the settings table]
//
// Thin Server Action for reading the settings key-value table. This is the D-14 read
// path for site.timezone (consumed by SchedulePicker) AND the Phase-4 DASH-09
// admin-configurability surface (the Storage Settings UI will read/write the same table).
//
// GENERIC by design — reads ANY key by name, free of business logic. The seed from
// 03-03 already populates site.timezone; this action reads it back so Phase-4 DASH-09
// can reconfigure the value from the admin UI without a code change.
//
// Server-only — top directive mandatory for Server Actions.
"use server";
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";

/**
 * getSetting — read a single key from the settings key-value table.
 *
 * @param key The settings key (e.g. "site.timezone", "storage.active_provider").
 * @returns The stored value, or null if the key does not exist.
 */
export async function getSetting(key: string): Promise<string | null> {
  const [row] = await db
    .select()
    .from(schema.settings)
    .where(eq(schema.settings.key, key))
    .limit(1);
  return row?.value ?? null;
}
