import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/server";
import AdminShell from "./AdminShell";

/**
 * Server-Component layout for the (admin) route group.
 *
 * AUTHORITATIVE auth boundary (Plan 02-05, AUTH-03 gap closure). This is the
 * real RBAC gate, independent of the proxy/middleware UX layer.
 *
 * PPR/cacheComponents compatibility (Rule 3 deviation): Under cacheComponents:
 * true, `export const dynamic = "force-dynamic"` is NOT allowed (incompatible),
 * and a bare `headers()`/`connection()` call in the layout triggers
 * "Uncached data was accessed outside of <Suspense>" because the dynamic
 * content flows through the root layout's client context providers
 * (SidebarProvider/ThemeProvider with useState). The PPR-compatible fix is to
 * wrap the dynamic auth-gate in a <Suspense> boundary. PPR then prerenders the
 * root layout shell (html/body/providers — NO dashboard content) as the static
 * fallback, while the per-request auth check streams inside Suspense: either
 * redirect("/signin") for logged-out users or <AdminShell> for authenticated
 * users. An unauthenticated visitor NEVER sees dashboard content — only the
 * bare root layout skeleton before the redirect fires.
 *
 * The proxy/middleware layer (Pitfall #4) is intentionally UX-only and was
 * never authoritative. This server-side gate is the boundary the project
 * CLAUDE.md mandates ("Permission checks are never optional").
 */

async function AuthGate({ children }: { children: React.ReactNode }) {
  // getSession() calls headers() — a Next.js dynamic API. Inside <Suspense>,
  // this opts the auth check into per-request (dynamic) rendering without
  // triggering the PPR "uncached data outside Suspense" build error.
  const session = await getSession();
  if (!session) {
    redirect("/signin");
  }
  // Phase 4 D-05: pass the viewer's role to AdminShell → AppSidebar for the
  // UX-only nav filter. session.user.role is the Better Auth admin-plugin
  // field (Phase 2); the value is one of "admin" | "editor" | "author" (or
  // null for legacy rows). Coerce to undefined when absent so the sidebar's
  // hasRole() helper hides role-restricted items rather than showing everything.
  const role = (session.user.role as "admin" | "editor" | "author" | null) ?? undefined;
  return <AdminShell role={role}>{children}</AdminShell>;
}

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Suspense fallback={null}>
      <AuthGate>{children}</AuthGate>
    </Suspense>
  );
}
