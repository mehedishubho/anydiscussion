"use client";
// src/app/(admin)/dashboard/settings/seo/schema-client.ts
// [CITED: src/app/(admin)/dashboard/settings/storage/schema-client.ts — schema-bridge pattern]
// [CITED: CLAUDE.md "Code conventions" — Zod schema lives alongside the feature]
//
// Single import surface for the SEO Settings form so the client/server schema
// is provably the same module. The dashboard form imports `seoSettingsSchema`
// + `zodResolver` from here; the Server Action imports `seoSettingsSchema`
// directly from @/actions/seo-settings-schema. Both pull from the same source.
import { zodResolver } from "@hookform/resolvers/zod";
export { seoSettingsSchema, type SeoSettingsInput } from "@/actions/seo-settings-schema";
export { zodResolver };
