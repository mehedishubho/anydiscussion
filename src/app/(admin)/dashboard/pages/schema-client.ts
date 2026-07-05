"use client";
// src/app/(admin)/dashboard/pages/schema-client.ts
// [CITED: src/app/(admin)/dashboard/posts/schema-client.ts — the schema-bridge template]
// [CITED: CLAUDE.md "Code conventions" — Zod schemas live alongside their feature]
//
// Single import surface for the page editor form so the client/server schema is
// provably the same module. The PageForm imports `pageSchema` and `zodResolver`
// from here; the Server Action imports `pageSchema` directly from
// @/actions/pages-schema. Both pull from the same source module.
import { zodResolver } from "@hookform/resolvers/zod";
export { pageSchema, type PageSchemaInput, type PageSchemaOutput } from "@/actions/pages-schema";
export { zodResolver };
