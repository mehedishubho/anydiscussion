// src/app/(full-width-pages)/(auth)/signup/page.tsx
// [CITED: 02-02-PLAN.md Task 1 Step C — repurpose as first-run admin-creation screen]
// [CITED: 02-CONTEXT.md D-06/D-07/D-08 — setup wizard self-closes once an admin exists]
// [CITED: RESEARCH.md Pattern 5 + PATTERNS.md signup/page.tsx section lines 401-425]
//
// Server Component. Queries count(admins) server-side and:
//   - if count > 0 → redirect("/signin") (setup is closed — D-08 self-disable at the route level)
//   - if count===0 → render the SignUpForm (bound to createFirstAdmin)
//
// This is the ONLY bootstrap path — no seed script, no CLI (D-06). The action layer
// (src/actions/users.ts createFirstAdmin) re-checks count===0 defensively, so even a
// direct call to the action after the first admin exists is refused (D-08 HARD security).
//
// The count query runs inside an async child wrapped in <Suspense> — Next 16 cacheComponents
// (PPR) requires uncached data access to be inside a Suspense boundary so the page shell
// can be statically prerendered.
import SignUpForm from "@/components/auth/SignUpForm";
import { db, schema } from "@/lib/db";
import { eq, count } from "drizzle-orm";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Create Admin Account | Any Discussion",
  description:
    "First-run setup: create the initial administrator account for the dashboard.",
};

/** Inner async component — reads count(admins) and redirects or renders the form. */
async function SetupGate() {
  // D-06/D-07/D-08 — count(admins) server-side. If an admin already exists, the
  // setup route self-closes (redirect to /signin). The createFirstAdmin action
  // re-checks this defensively (Pitfall #1 — no layer trusts the one above it).
  const [row] = await db
    .select({ n: count() })
    .from(schema.user)
    .where(eq(schema.user.role, "admin"));

  if (Number(row?.n ?? 0) > 0) {
    redirect("/signin");
  }

  return <SignUpForm />;
}

export default function SignUpPage() {
  return (
    <Suspense fallback={null}>
      <SetupGate />
    </Suspense>
  );
}
