"use client";
// src/app/(admin)/posts/schema-client.ts
// [CITED: CLAUDE.md "Code conventions" — Zod schemas live alongside their feature]
// [CITED: 03-01-PLAN.md Task 2 Step G — RHF resolver bridge]
//
// Single import surface for the post editor form so the client/server schema
// is provably the same module. The dashboard form imports `postSchema` and
// `zodResolver` from here; the Server Action imports `postSchema` directly from
// `@/actions/posts-schema`. Both pull from the same source module.
import { zodResolver } from "@hookform/resolvers/zod";
export { postSchema, type PostSchemaInput, type PostSchemaOutput } from "@/actions/posts-schema";
export { zodResolver };
