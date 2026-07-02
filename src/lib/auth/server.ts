// src/lib/auth/server.ts
// [CITED: PATTERNS.md — thin re-export barrel mirroring src/lib/log/index.ts convention]
// Single server-side import surface for Server Actions / RSC. Plan 02-01 Task 1b
// re-exports getSession only; Task 2 adds requireRole/requireCan/assertOwnsPost/
// getSessionOrThrow from @/lib/permissions.
//
// NO "use client" directive — server-safe. Importing this from client code is a bug.
export { getSession } from "./index";
