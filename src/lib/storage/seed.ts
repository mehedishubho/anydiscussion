// src/lib/storage/seed.ts
// [CITED: 03-CONTEXT.md D-14 (site.timezone = Asia/Dhaka), D-09 (storage.active_provider
//  = local default), D-10 (site.feature_image_default fallback)]
// [CITED: 03-RESEARCH.md Open Question 4 — settings keys confirmed]
//
// Idempotent settings seed for the storage + site defaults. Inserted once at
// install time (or re-run safely — onConflictDoNothing on the settings PK).
// The values here are the SAFE DEFAULTS; the Phase-4 DASH-09 Storage Settings
// admin page is the runtime editor.
//
// These three keys are the load-bearing settings Phase-3 components read:
//   - storage.active_provider — registry.ts getActiveProvider (default = "local")
//   - site.timezone           — scheduled-publish datetime-picker display (D-14)
//   - site.feature_image_default — post-card/OG fallback when no feature image (D-10)
//
// Server-only — NO "use client" directive.
import { db, schema } from "@/lib/db";

/**
 * Idempotently insert the Phase-3 default settings. Safe to call multiple times —
 * onConflictDoNothing on the `settings.key` PK means re-runs are no-ops for rows
 * that already exist (a user-set value is NEVER overwritten by this seed).
 *
 * Call from: the Phase-3 install/setup script, or instrumentation.ts at first boot.
 */
export async function seedStorageSettings(): Promise<void> {
  await db
    .insert(schema.settings)
    .values([
      { key: "storage.active_provider", value: "local" },
      { key: "site.timezone", value: "Asia/Dhaka" },
      { key: "site.feature_image_default", value: "" },
    ])
    .onConflictDoNothing();
}
