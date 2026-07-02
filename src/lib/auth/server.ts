// src/lib/auth/server.ts
// [CITED: PATTERNS.md — thin re-export barrel mirroring src/lib/log/index.ts convention]
// Single server-side import surface for Server Actions / RSC.
//   import { getSession, requireCan } from "@/lib/auth/server";
// Re-exports getSession from the auth instance + the permission helpers from
// @/lib/permissions (Pitfall #1 + #4 enforcement layer).
//
// NO "use client" directive — server-safe. Importing this from client code is a bug.
export { getSession } from "./index";
export { requireRole, requireCan, assertOwnsPost, getSessionOrThrow } from "@/lib/permissions";
