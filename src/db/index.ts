// src/db/index.ts (model barrel)
// Re-exports everything from schema.ts so consumers can import from "@/db"
// or "@/db/schema" interchangeably. src/lib/db/index.ts imports via "@/db/schema"
// per RESEARCH.md Pattern 2 (D-16 alias).
export * from "./schema";
