// src/app/(full-width-pages)/(auth)/forgot-password/page.tsx
// [CITED: 02-04-PLAN.md Task 1 — AUTH-06 forgot-password page]
//
// Thin Server Component delegation to ForgotPasswordForm. The proxy handles the
// logged-in reverse-redirect (D-20). No DB query or redirect gate needed here —
// the form is a pure client component that calls authClient.requestPasswordReset.
import ForgotPasswordForm from "@/components/auth/ForgotPasswordForm";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Forgot Password | Any Discussion",
  description:
    "Request a password reset link for your Any Discussion dashboard account.",
};

export default function ForgotPasswordPage() {
  return <ForgotPasswordForm />;
}
