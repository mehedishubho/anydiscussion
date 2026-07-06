// src/instrumentation.ts
// [CITED: 03-RESEARCH.md Pattern 5 (L628-638) — register() body + NEXT_RUNTIME gate]
// [CITED: Next.js 16.2.9 docs — 01-app/02-guides/instrumentation.md +
//  01-app/03-api-reference/03-file-conventions/instrumentation.md]
// [CITED: 03-CONTEXT.md D-11 — node-cron lifecycle wiring in Next 16]
// [CITED: 04-CONTEXT.md D-17/D-29 — idempotent page seed (T&C / Privacy / Contact)
//  wired at boot via the existing seedStorageSettings entry point]
//
// The Next.js 16 instrumentation hook. register() is called ONCE at server init
// (Edge or Node.js). We gate on NEXT_RUNTIME === 'nodejs' to skip Edge (node-cron
// + the db client are Node.js-only — they'd break the Edge bundle).
//
// The schedule module + seed module are DYNAMIC-IMPORTED (not static-imported) so
// their deps (node-cron, drizzle-orm, pg) are NOT pulled into the Edge bundle.
// This is the documented Next.js 16 pattern for instrumentation that needs
// server-only modules.
//
// File location: src/instrumentation.ts (NOT repo root) — Next.js 16 docs specify
// src/instrumentation.ts when the src/ directory exists. PATTERNS.md row confirms.

/**
 * register — the Next.js 16 instrumentation hook, called once at server init.
 *
 * Gates on process.env.NEXT_RUNTIME === 'nodejs' (skips Edge runtime) and
 * dynamic-imports @/lib/schedule to call startScheduler(). Also dynamic-imports
 * the idempotent seed (settings + pages) — safe to re-run on every boot thanks
 * to onConflictDoNothing; admin-edited values are never overwritten.
 *
 * Plan 04-05 (DASH-09): registers the new Cloudinary + push-CDN providers at boot
 * via dynamic-import (keeps cloudinary + the S3Client-with-endpoint deps out of the
 * Edge bundle — same pattern as the schedule/seed imports). After registration, the
 * providers enter the providers map but stay UNCONFIGURED until the admin enters
 * credentials via /dashboard/settings/storage (default-safe: getActiveProvider falls
 * back to local when no creds are present).
 *
 * The dynamic imports keep node-cron + db + cloudinary + @aws-sdk/client-s3 deps
 * out of the Edge bundle.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startScheduler } = await import("@/lib/schedule");
    startScheduler();

    // Idempotent seed — settings (Phase 3) + pages (Phase 4 D-17). Fire-and-forget
    // after startScheduler; a failure here is logged inside the seeders but does
    // not block server startup (the app degrades to "no seeded rows" rather than
    // refusing to boot — the admin can still write rows by hand via the dashboard).
    const { seedStorageSettings, seedPages, seedSeoSettings } = await import(
      "@/lib/storage/seed"
    );
    await seedStorageSettings();
    await seedPages();
    // Plan 05-01 (D-11) — seed the five site-wide SEO settings keys so the
    // settings exist before any getSeoSettings() consumer reads them.
    await seedSeoSettings();

    // Plan 04-05 (DASH-09) — register the new providers at boot so the providers map
    // is populated for the admin's choice. The providers stay UNCONFIGURED (no creds)
    // until storage-settings.ts saveStorageSettings calls configureCloudinary /
    // configurePushCdn with the decrypted creds. Safe to fail — wrap in try/catch so
    // a missing dep or transient import error never blocks server startup.
    try {
      const { registerStorageProvider, getActiveProvider } = await import(
        "@/lib/storage/registry"
      );
      const { cloudinaryProvider, configureCloudinary } = await import(
        "@/lib/storage/cloudinary"
      );
      const { pushCdnProvider, configurePushCdn } = await import(
        "@/lib/storage/push-cdn"
      );
      registerStorageProvider("cloudinary", cloudinaryProvider);
      registerStorageProvider("push-cdn", pushCdnProvider);

      // Best-effort: if creds are already present in settings (a re-boot after a
      // prior save), configure the providers with the decrypted values so they work
      // immediately. Wrap in try/catch — a missing SETTINGS_ENCRYPTION_KEY or a
      // transient DB issue just means the admin re-enters creds on the Storage page.
      try {
        const { getSetting } = await import("@/actions/settings");
        const { decrypt } = await import("@/lib/crypto");
        const [cloudinaryBlob, pushCdnBlob] = await Promise.all([
          getSetting("storage.cloudinary_creds"),
          getSetting("storage.push_cdn_creds"),
        ]);
        if (cloudinaryBlob) {
          configureCloudinary(JSON.parse(decrypt(cloudinaryBlob)));
        }
        if (pushCdnBlob) {
          configurePushCdn(JSON.parse(decrypt(pushCdnBlob)));
        }
      } catch {
        // Best-effort only — provider stays unconfigured, falls back to local.
      }

      // Silence unused-import lint — the import is intentional (boot-time registration
      // makes the provider available even if the configure step above failed).
      void getActiveProvider;
    } catch {
      // Best-effort only — provider stays unregistered, getActiveProvider falls back
      // to local (default-safe). Logged but not blocking.
    }
  }
}
