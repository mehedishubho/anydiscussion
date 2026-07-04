// src/lib/storage/registry.ts
// [CITED: 03-CONTEXT.md D-09 — settings-driven provider selection]
// [CITED: 03-RESEARCH.md Pattern 3 (L521-545) — registry body]
// [CITED: src/lib/permissions/index.ts L84-88 — Drizzle select-where-limit pattern]
//
// THE provider selector. actions/media.ts + deleteMedia call `getActiveProvider()`
// to resolve which backend handles a given upload — never imports local/r2
// directly. Provider selection is server-side from the `settings` table; the
// client cannot influence which provider handles a given upload.
//
// The settings key is `storage.active_provider` (D-09). Missing or unknown
// values default to "local" (the default-safe fallback — proven by registry.test.ts).
//
// Phase-4 DASH-09 will call `registerStorageProvider("cloudinary", cloudProvider)`
// at boot (from instrumentation.ts or a settings-driven module loader) to extend
// the map without touching this file. Phase-4 DASH-09 ships the Storage Settings
// admin page that flips the setting.
//
// Server-only — NO "use client" directive.
import { db, schema } from "@/lib/db";
import { eq } from "drizzle-orm";
import { localProvider } from "./local";
import { r2Provider } from "./r2";
import type { StorageProvider } from "./types";

/**
 * The provider map. Seeded with the two shipping providers; extensible at runtime
 * via registerStorageProvider (Phase-4 DASH-09 — Cloudinary, push-CDN).
 *
 * `local` is always present as the default-safe fallback.
 */
const providers: Record<string, StorageProvider> = {
  local: localProvider,
  r2: r2Provider,
};

/**
 * Register a storage provider at runtime (Phase-4 DASH-09 extension hook).
 *
 * Called from instrumentation.ts (or a future settings-driven loader) to add
 * Cloudinary / push-CDN providers without modifying this file. A provider
 * registered under an existing name OVERWRITES the previous entry — this is
 * intentional for the Phase-4 "swap provider implementation" use case.
 *
 * @param name     The settings.storage.active_provider value that selects this provider.
 * @param provider The StorageProvider implementation.
 */
export function registerStorageProvider(
  name: string,
  provider: StorageProvider,
): void {
  providers[name] = provider;
}

/**
 * Read the active storage provider from settings.storage.active_provider.
 *
 * Resolution order:
 *   1. settings row exists + value matches a registered provider → that provider.
 *   2. settings row exists + value is unknown/typo'd → localProvider (default-safe).
 *   3. settings row missing (DB unseeded, fresh install) → localProvider (default).
 *
 * The default-safe fallback to local is CRITICAL: a misconfigured `settings` value
 * must never break uploads. Proven by registry.test.ts "falls back to localProvider
 * for unknown values".
 *
 * @returns The active StorageProvider singleton.
 */
export async function getActiveProvider(): Promise<StorageProvider> {
  const [row] = await db
    .select()
    .from(schema.settings)
    .where(eq(schema.settings.key, "storage.active_provider"))
    .limit(1);

  const name = (row?.value as string | null | undefined) ?? "local";
  return providers[name] ?? providers.local;
}
