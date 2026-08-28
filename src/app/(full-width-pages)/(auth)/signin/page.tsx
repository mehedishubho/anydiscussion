import SignInForm from "@/components/auth/SignInForm";
import { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { connection } from "next/server";
import { getSession } from "@/lib/auth/server";

export const metadata: Metadata = {
  title: "Sign In | Any Discussion",
  description: "Sign in to the anydiscussion dashboard.",
};

async function SignInGate({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  await connection();
  const session = await getSession();
  if (session) {
    const params = searchParams ? await searchParams : {};
    const raw = params.next;
    const next = typeof raw === "string" ? raw : Array.isArray(raw) ? raw[0] : undefined;
    if (next && next.startsWith("/") && !next.startsWith("//")) {
      redirect(next);
    }
    redirect("/dashboard");
  }
  return <SignInForm />;
}

export default function SignIn({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <Suspense fallback={null}>
      <SignInGate searchParams={searchParams} />
    </Suspense>
  );
}
