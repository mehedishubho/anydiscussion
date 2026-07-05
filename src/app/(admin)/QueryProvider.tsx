"use client";
// src/app/(admin)/QueryProvider.tsx
// [CITED: 04-RESEARCH.md Pattern 3 — TanStack QueryClientProvider shape]
// [CITED: 04-CONTEXT.md D-28 — QueryClient scoped to (admin) only]
//
// The single QueryClient for the (admin) route group. Created ONCE per mount
// via useState's lazy initializer (avoids re-creating on every render, which
// would also discard the cache). Wraps children with QueryClientProvider so
// every dashboard page/components can useMutation/useQuery without
// prop-drilling. React Query devtools render ONLY in development.
//
// Scope boundary (D-28 — PERF-02 bundle isolation):
//   This component is imported ONLY by `(admin)/AdminShell.tsx`. It MUST NOT
//   be imported from `src/app/layout.tsx` (root) or from any `(site)` route —
//   doing so leaks TanStack JS into the public bundle. ESLint
//   `no-restricted-imports` is the static guard; Phase 7 PERF-02 audits the
//   dynamic boundary.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { useState, type ReactNode } from "react";

export default function QueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // 30s — short enough that dashboard edits from another tab/page
            // surface quickly, long enough to avoid hammering Server Actions
            // on every focus/scroll. refetchOnWindowFocus=false keeps the
            // dashboard calm (D-27 — mutations are user-initiated, not
            // focus-triggered).
            staleTime: 30_000,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={client}>
      {children}
      {process.env.NODE_ENV === "development" && <ReactQueryDevtools />}
    </QueryClientProvider>
  );
}
