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
 * The dynamic imports keep node-cron + db deps out of the Edge bundle.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startScheduler } = await import("@/lib/schedule");
    startScheduler();

    // Idempotent seed — settings (Phase 3) + pages (Phase 4 D-17). Fire-and-forget
    // after startScheduler; a failure here is logged inside the seeders but does
    // not block server startup (the app degrades to "no seeded rows" rather than
    // refusing to boot — the admin can still write rows by hand via the dashboard).
    const { seedStorageSettings, seedPages } = await import("@/lib/storage/seed");
    await seedStorageSettings();
    await seedPages();
  }
}
