"use client";
// src/app/(admin)/dashboard/settings/storage/schema-client.ts
// [CITED: src/app/(admin)/dashboard/posts/schema-client.ts — schema-bridge pattern]
// [CITED: CLAUDE.md "Code conventions" — Zod schema lives alongside the feature]
//
// Single import surface for the Storage Settings form so the client/server schema
// is provably the same module. The dashboard form imports `storageSettingsSchema`
// + `zodResolver` from here; the Server Action imports `storageSettingsSchema`
// directly from @/actions/storage-settings-schema. Both pull from the same source.
import { zodResolver } from "@hookform/resolvers/zod";
export {
  storageSettingsSchema,
  type StorageSettingsInput,
  type CloudinaryCreds,
  type R2Creds,
  type PushCdnCreds,
  type ProviderName,
  PROVIDER_NAMES,
} from "@/actions/storage-settings-schema";
export { zodResolver };
