// src/app/api/auth/[...all]/route.ts
// [CITED: better-auth/docs/integrations/next.mdx — Create API Route; RESEARCH.md Code Examples lines 903-909]
// Mounts the Better Auth route handler. This is the project's first API route —
// Server Actions remain the default mutation path (CLAUDE.md); this route exists
// only because Better Auth's signin/signup/verify/reset endpoints are
// externally-addressable HTTP handlers.
//
// Server-only — thin delegation, no logic in the route file itself.
import { auth } from "@/lib/auth";
import { toNextJsHandler } from "better-auth/next-js";

export const { GET, POST } = toNextJsHandler(auth);
