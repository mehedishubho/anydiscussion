// src/lib/storage/seed.ts
// [CITED: 03-CONTEXT.md D-14 (site.timezone = Asia/Dhaka), D-09 (storage.active_provider
//  = local default), D-10 (site.feature_image_default fallback)]
// [CITED: 03-RESEARCH.md Open Question 4 — settings keys confirmed]
// [CITED: 04-CONTEXT.md D-17 (seed T&C + Privacy + Contact pages at migration),
//  D-29 (seed-only — pages table already exists from Phase 1)]
//
// Idempotent settings + pages seed. Inserted once at install time (or re-run
// safely — onConflictDoNothing on each PK). The values here are the SAFE DEFAULTS;
// the Phase-4 DASH-09 Storage Settings admin page is the runtime editor for
// settings; the dashboard Pages editor is the runtime editor for page content.
//
// Settings keys (Phase-3 load-bearing):
//   - storage.active_provider — registry.ts getActiveProvider (default = "local")
//   - site.timezone           — scheduled-publish datetime-picker display (D-14)
//   - site.feature_image_default — post-card/OG fallback when no feature image (D-10)
//
// Pages rows (Phase-4 D-17 — three legal/contact pages seeded as drafts so the
// admin just edits content):
//   - /terms-and-conditions
//   - /privacy-policy
//   - /contact          (content-only — the Contact FORM is Phase 6 SITE-10 per D-19)
//
// About is NOT seeded here (PROJECT.md — About stays hard-coded TSX/MDX, not a
// pages row).
//
// Server-only — NO "use client" directive.
import { db, schema } from "@/lib/db";

/**
 * Idempotently insert the Phase-3 default settings. Safe to call multiple times —
 * onConflictDoNothing on the `settings.key` PK means re-runs are no-ops for rows
 * that already exist (a user-set value is NEVER overwritten by this seed).
 *
 * Plan 04-05 extends with DASH-09 keys: encrypted-credential slots for cloudinary +
 * push-cdn (empty blobs until the admin enters creds via Storage Settings) plus
 * `storage.encryption_key_version` (D-25 key-rotation reference — value is "1" by
 * convention; bumping it on a key rotation would prompt the admin to re-enter all
 * provider credentials, per Pitfall 2's "v1 simpler approach").
 *
 * Call from: src/instrumentation.ts at first boot (NEXT_RUNTIME === "nodejs").
 */
export async function seedStorageSettings(): Promise<void> {
  await db
    .insert(schema.settings)
    .values([
      { key: "storage.active_provider", value: "local" },
      { key: "site.timezone", value: "Asia/Dhaka" },
      { key: "site.feature_image_default", value: "" },
      // Plan 04-05 DASH-09 — empty encrypted-cred slots. The Storage Settings page
      // writes to these via saveStorageSettings; an empty value means "no creds yet"
      // and getActiveProvider falls back to local (default-safe).
      { key: "storage.r2_creds", value: "" },
      { key: "storage.cloudinary_creds", value: "" },
      { key: "storage.push_cdn_creds", value: "" },
      { key: "storage.encryption_key_version", value: "1" },
    ])
    .onConflictDoNothing();
}

/**
 * Idempotently seed the three legal/contact pages (D-17). Safe to call multiple
 * times — onConflictDoNothing on `pages.slug` (unique) means re-runs are no-ops.
 * A user-edited body is NEVER overwritten by this seed.
 *
 * Rows are seeded with status="draft" + empty body so the admin is the source of
 * truth for content. About is intentionally NOT seeded (PROJECT.md — About is
 * hard-coded TSX/MDX). The Contact row is content-only per D-19 — the contact
 * FORM behavior (SMTP/honeypot/rate-limit) lands in Phase 6 SITE-10.
 *
 * Call from: src/instrumentation.ts at first boot (NEXT_RUNTIME === "nodejs").
 */
export async function seedPages(): Promise<void> {
  await db
    .insert(schema.pages)
    .values([
      {
        title: "Terms & Conditions",
        slug: "terms-and-conditions",
        body: null,
        status: "draft",
      },
      {
        title: "Privacy Policy",
        slug: "privacy-policy",
        body: null,
        status: "draft",
      },
      {
        title: "Contact",
        slug: "contact",
        body: null,
        status: "draft",
      },
    ])
    .onConflictDoNothing({ target: schema.pages.slug });
}
