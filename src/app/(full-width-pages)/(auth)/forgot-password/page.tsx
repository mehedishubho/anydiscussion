// src/app/(full-width-pages)/(auth)/forgot-password/page.tsx
// [CITED: 02-04-PLAN.md Task 1 — AUTH-06 forgot-password page]
import ForgotPasswordForm from "@/components/auth/ForgotPasswordForm";
import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { getSession } from "@/lib/auth/server";

export const metadata: Metadata = {
  title: "Forgot Password | Any Discussion",
  description:
    "Request a password reset link for your Any Discussion dashboard account.",
};

async function ForgotPasswordGate() {
  await connection();
  const session = await getSession();
  if (session) redirect("/dashboard");
  return <ForgotPasswordForm />;
}

export default function ForgotPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ForgotPasswordGate />
    </Suspense>
  );
}
