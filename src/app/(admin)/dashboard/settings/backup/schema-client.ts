"use client";
// src/app/(admin)/dashboard/settings/backup/schema-client.ts
// [CITED: src/app/(admin)/dashboard/settings/storage/schema-client.ts — the schema-bridge pattern]
// [CITED: CLAUDE.md "Code conventions" — Zod schema lives alongside the feature, reused client+server]
// [CITED: 08-04-PLAN.md Task 2 <action> — verbatim mirror of the storage schema bridge]
//
// Single import surface for the Backup Settings form so the client/server schema is provably the
// same module. The dashboard form imports `backupSettingsSchema` + `zodResolver` from here; the
// Server Action imports `backupSettingsSchema` directly from @/actions/backup-settings-schema.
// Both pull from the same source (Pitfall #1 — never trust a divergent client shape).
import { zodResolver } from "@hookform/resolvers/zod";
export {
  backupSettingsSchema,
  type BackupSettingsInput,
  type R2BackupCreds,
  hasSecrets,
} from "@/actions/backup-settings-schema";
export { zodResolver };
